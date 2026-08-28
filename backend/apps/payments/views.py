import logging

from django.conf import settings
from django.db import transaction as db_transaction
from django.utils import timezone
from datetime import timedelta
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status
from .models import Subscription, PaymentTransaction, Plan
from . import fapshi, lifecycle
from apps.merchants import plans as plan_catalogue

logger = logging.getLogger(__name__)

#: Derived, never hand-maintained. ``apps.merchants.plans`` is the only
#: place a price is written down.
PLAN_PRICES = {
    key: plan_catalogue.price_yearly(key) for key in plan_catalogue.PAID_TIERS
}

#: Koraa sells annual plans only. Monthly was a straight 1/12 of yearly,
#: which gave buyers no reason to commit and Koraa no working capital.
#:
#: "monthly" is still accepted for reading historic rows — subscriptions
#: bought before the change keep their 30-day cycle and settle correctly —
#: but it is no longer offered for new purchases. Do not re-add it to
#: PURCHASABLE_CYCLES without also restoring a monthly price.
CYCLE_DAYS = {"monthly": 30, "yearly": 365}
PURCHASABLE_CYCLES = ("yearly",)

# ──────────────────────────────────────────────────────────────────────────────
# Fapshi — shims over apps.payments.fapshi
#
# The three functions below used to build their own requests here, and
# `apps/orders/views.py` imported them across the app boundary. Everything about
# the wire format now lives in `fapshi.py`; these are signature-compatible
# wrappers so the settle paths keep working while they are rewritten to call
# `fapshi` directly. They are deliberately thin and are not the long-term API.
#
# One behaviour deliberately does NOT survive the move: `_check_fapshi_status`
# answered "FAILED" whenever Fapshi did not answer with a 200. Callers believed
# it, so an outage marked paid orders failed and cancelled live subscriptions.
# The shim lets `FapshiUnavailable` propagate instead. An uncaught exception in a
# webhook is not pretty, but it leaves the row pending and recoverable, and a
# pending row is something `reconcile_orders` can settle later — whereas a row
# wrongly marked failed has lost the fact that money moved.
# ──────────────────────────────────────────────────────────────────────────────


def _initiate_fapshi_payment(amount: int, email: str, redirect_url: str, external_id: str, message: str):
    """Call Fapshi initiate-pay and return (link, trans_id) or raise on failure."""
    return fapshi.initiate_pay(
        amount=amount,
        email=email,
        redirect_url=redirect_url,
        external_id=external_id,
        message=message,
    )


def _check_fapshi_status(trans_id: str) -> str:
    """Fapshi's status for a transaction.

    Raises ``FapshiUnavailable`` rather than returning ``"FAILED"`` when Fapshi
    cannot be reached — see the note above. Callers must not treat an exception
    here as a failed payment.
    """
    return fapshi.payment_status(trans_id)


def _initiate_fapshi_payout(phone: str, amount: int) -> bool:
    """Trigger Fapshi Payout API. True if Fapshi accepted it.

    The bool is the old contract and it is a poor one: it cannot distinguish
    "refused" from "we never found out", and the caller only logs it, so a
    merchant who was never paid leaves no queryable trace. Kept for one commit so
    the call site keeps compiling; the payout fields on ``Order`` replace it.
    """
    try:
        # No external_id: the old signature has nowhere to carry one. That is
        # precisely why a failed payout cannot be traced back to an order today.
        fapshi.payout(phone=phone, amount=amount, external_id="legacy")
        return True
    except fapshi.FapshiError:
        logger.exception("Fapshi payout failed for %s", phone[-3:] if phone else "?")
    return False


def _settle_transaction(tx: PaymentTransaction) -> str:
    """
    Ask Fapshi what happened to ``tx`` and bring our records in line.

    This is the single place a subscription becomes active, so both the
    browser redirect and the server-to-server webhook end up identical.
    The Fapshi status is always fetched from Fapshi — never taken from the
    caller — which is why the webhook can safely be unauthenticated.

    Returns "activated", "failed" or "pending".
    """
    fapshi_status_str = _check_fapshi_status(tx.fapshi_trans_id)

    if fapshi_status_str in ("SUCCESSFUL", "SUCCESS"):
        # Fapshi may deliver the webhook and the redirect for the same
        # payment. Activating twice would extend the expiry twice over and
        # pay the referral bonus twice, so already-settled rows short-circuit.
        if tx.status == PaymentTransaction.Status.SUCCESSFUL:
            return "activated"

        with db_transaction.atomic():
            tx.status = PaymentTransaction.Status.SUCCESSFUL
            tx.save(update_fields=["status"])

            sub = tx.subscription
            now = timezone.now()
            merchant = getattr(tx.user, "merchant", None)

            # Renewing before the current term ends adds a year to what is
            # left rather than throwing it away. The expiry warning goes out a
            # week early precisely to invite this, so charging for a year and
            # handing back 365 days minus the unused remainder would be theft.
            current_expiry = getattr(merchant, "tier_expires_at", None)
            base = (
                current_expiry
                if current_expiry and current_expiry > now
                else now
            )

            sub.status = Subscription.Status.ACTIVE
            sub.starts_at = now
            sub.expires_at = base + timedelta(
                days=CYCLE_DAYS.get(sub.billing_cycle, 30)
            )
            # A fresh term has not been warned about yet.
            sub.expiry_notice_sent_at = None
            sub.save()

            # Any earlier paid plan is superseded by the one just bought.
            Subscription.objects.filter(
                user=tx.user, status=Subscription.Status.ACTIVE
            ).exclude(pk=sub.pk).update(status=Subscription.Status.CANCELLED)

            if merchant is not None:
                merchant.tier = sub.plan
                merchant.tier_expires_at = sub.expires_at
                merchant.save(update_fields=["tier", "tier_expires_at"])
            else:
                logger.warning(
                    "Payment %s settled for user %s with no merchant profile",
                    tx.fapshi_trans_id, tx.user_id,
                )

            # Referral payout: 2% of the first plan payment the referred
            # user makes.
            from apps.accounts.models import Referral
            pending_ref = Referral.objects.filter(
                referred_user=tx.user, status=Referral.Status.PENDING
            ).first()
            if pending_ref:
                pending_ref.reward_amount = int(tx.amount * 0.02)
                pending_ref.status = Referral.Status.COMPLETED
                pending_ref.save(update_fields=["reward_amount", "status"])

        return "activated"

    if fapshi_status_str in ("FAILED", "EXPIRED"):
        tx.status = PaymentTransaction.Status.FAILED
        tx.save(update_fields=["status"])
        if tx.subscription and tx.subscription.status == Subscription.Status.PENDING:
            tx.subscription.status = Subscription.Status.CANCELLED
            tx.subscription.save(update_fields=["status"])
        return "failed"

    return "pending"


class InitiatePaymentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        plan_key = request.data.get("plan", "").lower()
        # Annual only. The field is still read so an older dashboard build
        # posting billing_cycle=monthly gets a clear 400 rather than being
        # silently charged the yearly amount for a 30-day cycle.
        billing = request.data.get("billing_cycle", "yearly")

        if plan_key == "free":
            # Downgrade / activate free plan immediately.
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
            return Response({"message": "Free plan activated."})

        if plan_key not in PLAN_PRICES:
            return Response({"error": "Invalid plan."}, status=status.HTTP_400_BAD_REQUEST)
        if billing not in PURCHASABLE_CYCLES:
            return Response(
                {"error": "Koraa plans are billed yearly. Send billing_cycle='yearly'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        amount = PLAN_PRICES[plan_key]
        redirect_url = f"{settings.KORAA_DASHBOARD_URL}/dashboard/billing/success"
        message = f"Koraa {plan_key.title()} Plan — 1 year"

        try:
            link, trans_id = _initiate_fapshi_payment(
                amount=amount,
                email=request.user.email,
                redirect_url=redirect_url,
                external_id=f"{request.user.id}_{plan_key}_{billing}",
                message=message,
            )
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

        # Create a pending subscription + transaction record
        sub = Subscription.objects.create(
            user=request.user,
            plan=plan_key,
            status=Subscription.Status.PENDING,
            billing_cycle=billing,
            amount_paid=amount,
            fapshi_trans_id=trans_id,
        )
        PaymentTransaction.objects.create(
            subscription=sub,
            user=request.user,
            fapshi_trans_id=trans_id,
            payment_link=link,
            amount=amount,
            plan=plan_key,
            billing_cycle=billing,
        )

        return Response({"payment_url": link, "trans_id": trans_id})


class PaymentCallbackView(APIView):
    """
    Polled by the dashboard after Fapshi redirects the buyer back.

    Scoped to the requesting user so one merchant cannot read another's
    transactions. The webhook below is what guarantees activation when the
    buyer never makes it back to the browser.
    """
    permission_classes = [IsAuthenticated]

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

        result = _settle_transaction(tx)
        if result == "activated":
            return Response({"status": "activated", "plan": tx.subscription.plan})
        return Response({"status": result})


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

        try:
            tx = PaymentTransaction.objects.select_related("subscription", "user").get(
                fapshi_trans_id=trans_id
            )
        except PaymentTransaction.DoesNotExist:
            # Acknowledge anyway: retrying will never make an unknown id known,
            # and a 404 would have Fapshi redeliver forever.
            logger.warning("Fapshi webhook for unknown transaction %s", trans_id)
            return Response({"status": "ignored"})

        result = _settle_transaction(tx)
        logger.info("Fapshi webhook settled %s as %s", trans_id, result)
        return Response({"status": result})


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


