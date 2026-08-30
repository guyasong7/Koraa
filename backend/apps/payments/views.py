import logging

from django.core.cache import cache
from django.db import transaction as db_transaction
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.throttling import ScopedRateThrottle
from rest_framework import status
from .models import Subscription, PaymentTransaction, Plan
from .serializers import SubscriptionChargeRequestSerializer
from . import fapshi, lifecycle, settlement
from apps.merchants import plans as plan_catalogue

logger = logging.getLogger(__name__)

#: Derived, never hand-maintained. ``apps.merchants.plans`` is the only
#: place a price is written down.
PLAN_PRICES = {
    key: plan_catalogue.price_yearly(key) for key in plan_catalogue.PAID_TIERS
}

PURCHASABLE_CYCLES = ("yearly",)

# ──────────────────────────────────────────────────────────────────────────────
# Settlement moved out. `_settle_transaction`, `_activate_subscription`,
# `_fail_transaction`, `_check_fapshi_status` and `CYCLE_DAYS` are
# `apps.payments.settlement` now, and the views below call it like every other
# caller does.
#
# The move was forced by `reconcile.py`: a background sweep that had to import a
# DRF view in order to settle a payment would have inverted the layering, and the
# invariant that matters here — one place activates a subscription — is easier to
# hold when that place is not also an HTTP handler. It mirrors
# `apps.orders.settlement`, which the storefront's money path already uses.
#
# `_initiate_fapshi_payment` went with the hosted-page redirect, and
# `_initiate_fapshi_payout` with it — the latter was explicitly kept for one
# commit so a since-deleted call site in `apps/orders/views.py` would keep
# importing; nothing has called it since. `fapshi` still exposes `initiate_pay`,
# because it is a real Fapshi endpoint and that module is the client for all of
# them, but nothing in Koraa calls it any more.
# ──────────────────────────────────────────────────────────────────────────────

#: Written to ``PaymentTransaction.fapshi_status`` when a charge was accepted but
#: we have not asked about it yet. Distinct from Fapshi's own strings so a row
#: that has genuinely never been polled is visible as such.
CHARGE_REQUESTED = "REQUESTED"


class InitiatePaymentView(APIView):
    """
    POST /payments/initiate/  {"plan": ..., "billing_cycle": "yearly",
                               "phone": ..., "medium": ...}

    Buys a plan by charging a mobile money number in place. The merchant approves
    the prompt on their handset and the dashboard stays where it is and polls
    ``/payments/callback/``.

    There is no hosted page and no redirect any more. That matters here for a
    reason beyond symmetry with the storefront: the old flow sent the merchant to
    Fapshi and relied on the return trip to ``/dashboard/billing/success`` to
    trigger the only status check Koraa ever made. A merchant who paid and then
    closed the tab was charged and never got their plan, because Fapshi delivers
    its webhook once and never retries. Direct-pay removes the redirect entirely,
    so the poll below plus ``payments.reconcile_pending`` are what close that gap.

    Three outcomes on the paid path, and the distinction between the last two is
    the point:

    * **Accepted** — 201. A ``trans_id`` is stored and the browser polls.
    * **Refused** — 400. Fapshi declined the request, so nothing was charged and
      nothing will be. The usual cause is a number the merchant can correct.
    * **No answer** — 202 with ``charge_accepted: false``. Fapshi never
      confirmed, so **the charge may or may not exist**. Never shown as a
      failure, and never retried automatically — resending is the one way to
      take a merchant's money twice.

    ``plan: "free"`` is not a purchase and takes none of this path; see
    ``_activate_free``.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        plan_key = request.data.get("plan", "").lower()
        # Annual only. The field is still read so an older dashboard build
        # posting billing_cycle=monthly gets a clear 400 rather than being
        # silently charged the yearly amount for a 30-day cycle.
        billing = request.data.get("billing_cycle", "yearly")

        if plan_key == "free":
            return self._activate_free(request)

        if plan_key not in PLAN_PRICES:
            return Response({"error": "Invalid plan."}, status=status.HTTP_400_BAD_REQUEST)
        if billing not in PURCHASABLE_CYCLES:
            return Response(
                {"error": "Koraa plans are billed yearly. Send billing_cycle='yearly'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = SubscriptionChargeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data["phone"]
        medium = serializer.validated_data.get("medium") or None

        in_flight = self._charge_already_in_flight(request.user)
        if in_flight is not None:
            return in_flight

        amount = PLAN_PRICES[plan_key]

        # The subscription row exists before the charge so that a charge whose
        # outcome we never learn still leaves a trace. It is PENDING and gives
        # the merchant nothing until ``settlement.activate_subscription`` runs.
        sub = Subscription.objects.create(
            user=request.user,
            plan=plan_key,
            status=Subscription.Status.PENDING,
            billing_cycle=billing,
            amount_paid=amount,
        )

        try:
            trans_id = fapshi.direct_pay(
                amount=amount,
                phone=phone,
                # The subscription id, so a webhook resolves back to this row.
                external_id=str(sub.pk),
                # Koraa's User has no `get_full_name()` — `full_name` is the field,
                # and it is `blank=True`, so this is "" for a merchant who never
                # gave one. `direct_pay` omits the field entirely when it is empty.
                name=request.user.full_name,
                email=request.user.email,
                message=f"Koraa {plan_key.title()} Plan — 1 year",
                medium=medium,
            )
        except fapshi.FapshiRejected as exc:
            # Nothing was charged. The pending subscription is deleted rather
            # than left lying about: unlike the unknown branch below there is
            # provably no money to reconcile against it, and a merchant
            # correcting their number would otherwise accumulate one dead row
            # per typo.
            logger.warning(
                "Fapshi refused the charge for subscription %s: %s", sub.pk, exc
            )
            sub.delete()
            return Response(
                {"error": str(exc), "charge_accepted": False},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except fapshi.FapshiUnavailable:
            # The dangerous branch. Fapshi may have taken the charge before the
            # connection died, so this is neither a success nor a failure. There
            # is no transId, so nothing can follow it up automatically — which is
            # why the subscription is *kept*: a PENDING row with no transaction
            # is the only record that a charge may exist, and it is what a human
            # has to work from against the Fapshi dashboard.
            logger.exception(
                "Fapshi gave no answer charging subscription %s for %s — "
                "the charge may exist",
                sub.pk, request.user.email,
            )
            return Response(
                {
                    "charge_accepted": False,
                    "subscription_id": sub.pk,
                    "plan": plan_key,
                    "amount": amount,
                    "settled": False,
                    "payment_status": "pending",
                },
                status=status.HTTP_202_ACCEPTED,
            )

        Subscription.objects.filter(pk=sub.pk).update(fapshi_trans_id=trans_id)
        PaymentTransaction.objects.create(
            subscription=sub,
            user=request.user,
            fapshi_trans_id=trans_id,
            amount=amount,
            plan=plan_key,
            billing_cycle=billing,
            fapshi_status=CHARGE_REQUESTED,
        )

        return Response(
            {
                "charge_accepted": True,
                "trans_id": trans_id,
                "subscription_id": sub.pk,
                "plan": plan_key,
                "amount": amount,
                "settled": False,
                "payment_status": "pending",
            },
            status=status.HTTP_201_CREATED,
        )

    def _activate_free(self, request):
        """Switch to Free immediately. Not a purchase — no charge, no polling.

        This destroys whatever is left of a paid term, which is why the dashboard
        will not reach it without a confirmation dialog. The API stays willing
        because the merchant's answer to that dialog is the authorisation.
        """
        with db_transaction.atomic():
            Subscription.objects.filter(
                user=request.user, status=Subscription.Status.ACTIVE
            ).update(status=Subscription.Status.CANCELLED)
            Subscription.objects.create(
                user=request.user,
                plan=Plan.FREE,
                status=Subscription.Status.ACTIVE,
                billing_cycle="yearly",
                amount_paid=0,
                starts_at=timezone.now(),
                expires_at=None,
            )
            merchant = getattr(request.user, "merchant", None)
            if merchant is not None:
                merchant.tier = Plan.FREE
                merchant.tier_expires_at = None
                merchant.save(update_fields=["tier", "tier_expires_at"])
        return Response({"message": "Free plan activated.", "settled": True})

    def _charge_already_in_flight(self, user):
        """Refuse a second plan charge while one is still awaiting approval.

        Returns a response to send, or None when charging is safe.

        Without this, a merchant who does not see the prompt on their handset and
        clicks the plan again is charged twice for one year — and because
        ``settlement.activate_subscription`` extends from the current expiry
        rather than from today, the second payment would silently buy a *second*
        year rather than failing visibly.

        Costs one Fapshi status call, and only when there is something to ask
        about. Settling first rather than blocking outright means a transaction
        the merchant has already approved activates here instead of locking them
        out of their own dashboard.
        """
        tx = (
            PaymentTransaction.objects.select_related("subscription")
            .filter(user=user, settled_at__isnull=True)
            .exclude(fapshi_trans_id="")
            .order_by("-created_at")
            .first()
        )
        if tx is None:
            return None

        result = settlement.settle_transaction(tx)

        if result == settlement.ACTIVATED:
            return Response(
                {
                    "error": "That payment has already gone through — your plan is active.",
                    "plan": tx.plan,
                    "settled": True,
                    "payment_status": "paid",
                },
                status=status.HTTP_409_CONFLICT,
            )

        if result == settlement.PENDING:
            return Response(
                {
                    "error": (
                        "A payment for a plan is already waiting for your approval. "
                        "Check your phone for the prompt — please do not start another one."
                    ),
                    "trans_id": tx.fapshi_trans_id,
                    "plan": tx.plan,
                    "settled": False,
                    "payment_status": "pending",
                },
                status=status.HTTP_409_CONFLICT,
            )

        if result == settlement.UNKNOWN:
            # Fapshi is unreachable, so we cannot tell whether the earlier charge
            # is live. Refusing is the safe side of that: a merchant delayed by a
            # minute is recoverable, a merchant charged twice is not.
            return Response(
                {
                    "error": (
                        "We can't reach the payment provider to check your last "
                        "attempt. Please wait a moment and try again."
                    ),
                    "settled": False,
                    "payment_status": "pending",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # FAILED — that attempt is dead and settled, so charging again is safe.
        return None


class PaymentCallbackView(APIView):
    """
    GET /payments/callback/?transId=...

    Polled by the dashboard while a plan charge is awaiting approval on the
    merchant's handset. Direct-pay has no redirect, so this is the browser's only
    way to find out — and the ``settled`` flag below is what tells it when to stop
    asking.

    Scoped to the requesting user so one merchant cannot read another's
    transactions. The webhook and ``payments.reconcile_pending`` are what
    guarantee activation when the merchant never comes back to the browser.

    The response speaks the same contract as the storefront's order-status
    endpoint — ``settled`` plus a ``payment_status`` of ``paid``/``failed``/
    ``pending`` — because one frontend hook polls both. ``status`` is kept
    alongside it for the older dashboard build, which reads ``"activated"``.

    Note what ``unknown`` becomes here: ``settled: false`` with a pending status,
    never a failure. It means Fapshi could not be reached and nothing was
    changed, so the right behaviour is to keep waiting.

    Fapshi is asked at most once every ``STATUS_MIN_INTERVAL_SECONDS`` per
    transaction, across all callers, through a cache gate — the same one
    ``StorefrontOrderStatusView`` uses, and for the same reason. Fapshi allows six
    status calls a minute per transaction and answers a seventh with 429; the
    dashboard polls every two seconds while the merchant is still looking at their
    phone, which is thirty. Without the gate the frontend's own schedule would
    rate-limit the payment it is watching. A settled transaction answers from the
    stored row and asks nothing at all.

    The gate is per-process on LocMem and shared on Redis. Production requires
    Redis, so the shared case is the real one — and a 429 slipping through anyway
    is harmless: it surfaces as ``FapshiRateLimited``, a ``FapshiUnavailable``,
    which settles nothing and reads as pending.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    #: Generously rated. A dashboard makes roughly two dozen calls over the three
    #: minutes it waits, and the cache gate above is what actually protects
    #: Fapshi; this only stops a script from spinning. Authenticated, so it counts
    #: per user rather than per IP and merchants behind one office NAT cannot
    #: exhaust each other's budget.
    throttle_scope = "plan-status"

    #: ``settlement.settle_transaction``'s verdicts, mapped onto the polling
    #: contract. ``unknown`` deliberately reads as pending-and-unsettled: an
    #: outage is not a failed payment, and presenting it as one is the mistake
    #: this whole settlement rewrite exists to remove.
    _POLLING_STATE = {
        settlement.ACTIVATED: (True, "paid"),
        settlement.FAILED: (True, "failed"),
        settlement.PENDING: (False, "pending"),
        settlement.UNKNOWN: (False, "pending"),
    }

    def get(self, request):
        trans_id = request.query_params.get("transId") or request.query_params.get("trans_id")
        if not trans_id:
            return Response({"error": "transId is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            tx = PaymentTransaction.objects.select_related("subscription", "user").get(
                fapshi_trans_id=trans_id, user=request.user
            )
        except PaymentTransaction.DoesNotExist:
            return Response({"error": "Transaction not found."}, status=status.HTTP_404_NOT_FOUND)

        result = self._current_state(tx)
        settled, payment_status = self._POLLING_STATE[result]

        return Response({
            "status": result,
            "settled": settled,
            "payment_status": payment_status,
            "plan": tx.subscription.plan if tx.subscription else tx.plan,
            "amount": tx.amount,
            "reference": tx.fapshi_trans_id,
        })

    def _current_state(self, tx) -> str:
        """Where ``tx`` stands, asking Fapshi only when that is allowed and useful.

        Reports the stored row rather than pretending nothing is known: a poll
        that arrives inside the gate window is answered from what the last one
        learned, which is what makes a two-second client schedule safe.
        """
        if tx.settled_at:
            # Final. Nothing to ask, and the answer cannot change.
            return (
                settlement.ACTIVATED
                if tx.status == PaymentTransaction.Status.SUCCESSFUL
                else settlement.FAILED
            )

        gate = f"fapshi:status-gate:{tx.fapshi_trans_id}"
        # `add` writes only when the key is absent, and atomically — so exactly
        # one caller per interval gets through, however many are polling.
        if cache.add(gate, 1, timeout=fapshi.STATUS_MIN_INTERVAL_SECONDS):
            return settlement.settle_transaction(tx)

        return settlement.PENDING


class FapshiWebhookView(APIView):
    """
    Server-to-server notification from Fapshi.

    Unauthenticated by necessity — Fapshi has no Koraa credentials. That is
    safe because the payload is treated as a hint only: the transaction is
    looked up by its Fapshi id and the outcome is then fetched from Fapshi
    directly, so a forged POST can at worst make us re-ask Fapshi about a
    payment that already exists.

    Without this endpoint a buyer who closes the tab after paying is charged
    and never gets their plan.

    Resolves **both** record types. It used to look only at
    ``PaymentTransaction``, but storefront orders keep their ``fapshi_trans_id``
    on ``Order`` — so every shopper's webhook fell through to "ignored" with a
    200 that told Fapshi never to send it again. That single mismatch is why no
    storefront order had ever been settled.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        trans_id = (
            request.data.get("transId")
            or request.data.get("trans_id")
            or request.query_params.get("transId")
        )
        if not trans_id:
            return Response({"error": "transId is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Fapshi can be configured with a shared secret sent as `x-wh-secret`.
        # Checked when one is set, but it is not what makes this endpoint safe —
        # the outbound re-fetch is. Returns True when unconfigured so enabling
        # the secret is a deploy-time choice, not a prerequisite.
        if not fapshi.webhook_secret_ok(request.headers.get("x-wh-secret")):
            logger.warning("Fapshi webhook for %s had a bad secret", trans_id)
            return Response({"error": "Invalid signature."}, status=status.HTTP_403_FORBIDDEN)

        tx = (
            PaymentTransaction.objects.select_related("subscription", "user")
            .filter(fapshi_trans_id=trans_id)
            .first()
        )
        if tx is not None:
            result = settlement.settle_transaction(tx)
            logger.info("Fapshi webhook settled subscription %s as %s", trans_id, result)
            return Response({"status": result})

        # Not a subscription, so try a storefront order. Imported here rather
        # than at module scope: `apps.orders` imports `apps.payments.fapshi`, and
        # a top-level import back into orders would close that loop.
        #
        # Aliased because this module has a `settlement` of its own. Plain
        # `from apps.orders import settlement` makes the name local to this
        # method, so the subscription branch above — which runs *before* the
        # import — raises UnboundLocalError instead of settling the payment.
        from apps.orders.models import Order
        from apps.orders import settlement as order_settlement

        order = (
            Order.objects.filter(fapshi_trans_id=trans_id).order_by("created_at").first()
        )
        if order is not None:
            result = order_settlement.settle_order(order.id)
            logger.info("Fapshi webhook settled order %s as %s", trans_id, result)
            return Response({"status": result})

        # Acknowledge anyway: retrying will never make an unknown id known,
        # and a non-2xx would have Fapshi redeliver forever.
        logger.warning("Fapshi webhook for unknown transaction %s", trans_id)
        return Response({"status": "ignored"})


class ActiveSubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # One place computes plan state — see ``lifecycle.subscription_state``
        # — so the billing screen, the expiry emails and the nightly sweeps
        # cannot disagree about whether a plan counts as expired.
        return Response(lifecycle.subscription_state(request.user))


class PlanCatalogueView(APIView):
    """The plan table, served from ``apps.merchants.plans``.

    Public on purpose: the marketing pricing page renders from this, which
    is the whole point of having one catalogue. Nothing here is
    user-specific, so there is nothing to leak.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({
            "currency": "XAF",
            "billing_cycle": "yearly",
            "plans": plan_catalogue.public_catalogue(),
        })


