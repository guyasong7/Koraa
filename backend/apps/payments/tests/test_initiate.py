"""Buying a plan over Fapshi direct-pay: charge, guard, poll.

What changed and why these tests exist
--------------------------------------

A plan purchase used to call ``initiate-pay`` and hand the dashboard a hosted-page
URL. The merchant left Koraa, paid on Fapshi's page, and came back to
``/dashboard/billing/success`` — and *that return trip* triggered the only status
check Koraa ever made. Three consequences, and they are what this file pins down:

1. **The browser was the backstop.** A merchant who paid and closed the tab was
   charged and never got their plan, because Fapshi delivers its webhook once and
   never retries. Direct-pay removes the redirect, so ``PaymentCallbackView`` and
   ``payments.reconcile_pending`` have to close that gap between them — see
   ``test_reconcile`` for the other half.

2. **An outage read as a failure.** The old status check answered ``"FAILED"`` for
   any non-200, and callers believed it, so a bad minute at Fapshi cancelled live
   subscriptions for payments that had gone through. Every "unreachable" assertion
   below exists to keep that from coming back: ``unknown`` must surface as
   *pending and unsettled*, never as failed.

3. **Nothing stopped a second charge.** A merchant who did not see the prompt on
   their handset and clicked the plan again was charged twice for one year — and
   because activation extends from the current expiry rather than from today, the
   second payment silently bought a *second* year instead of failing visibly.
   ``_charge_already_in_flight`` is that guard and ``TestSecondCharge`` is why it
   is written the way it is.

The three-way outcome of a charge is the shape to keep in view: accepted (201),
refused (400, nothing was charged), and *no answer* (202, *the charge may or may
not exist*). The last one is not a failure and must never be retried
automatically — resending is the one way to take a merchant's money twice.
"""

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.merchants.models import Merchant
from apps.merchants import plans as plan_catalogue
from apps.payments import fapshi, views
from apps.payments.models import PaymentTransaction, Plan, Subscription

from .factories import PHONE, make_pending_transaction, make_subscriber

INITIATE_URL = "/api/v1/payments/initiate/"
CALLBACK_URL = "/api/v1/payments/callback/"

#: A paid tier that is definitely purchasable, taken from the catalogue rather
#: than hardcoded: prices live in ``merchants.plans`` and a test asserting its own
#: number would pass while the real price moved.
PLAN = Plan.STARTER
PRICE = views.PLAN_PRICES[PLAN]
#: The same tier on the other cycle. ``test_plans`` pins the ÷10 relationship
#: between the two; here they only have to be told apart.
MONTHLY_PRICE = plan_catalogue.price_monthly(PLAN)


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture(autouse=True)
def clean_cache():
    """Throttle counters and the Fapshi status gate both live in the cache.

    LocMem persists for the life of the process, so without this a test that polls
    would inherit the previous test's gate key and silently skip its Fapshi call.
    """
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def buyer():
    return make_subscriber()


@pytest.fixture
def auth(client, buyer):
    """The dashboard, logged in as a merchant on the free tier."""
    client.force_authenticate(user=buyer)
    return client


@pytest.fixture
def charged(monkeypatch):
    """``direct_pay`` succeeds. Returns the list of calls made to it."""
    calls = []

    def fake_direct_pay(**kwargs):
        calls.append(kwargs)
        return f"tx-charge-{len(calls)}"

    monkeypatch.setattr(fapshi, "direct_pay", fake_direct_pay)
    return calls


def says(monkeypatch, status_str):
    """Fapshi answers ``status_str`` for any transaction."""
    monkeypatch.setattr(fapshi, "payment_status", lambda trans_id: status_str)


def unreachable(monkeypatch):
    """Fapshi cannot be reached. Not a verdict about the money."""

    def boom(trans_id):
        raise fapshi.FapshiUnavailable("connection reset")

    monkeypatch.setattr(fapshi, "payment_status", boom)


def buy(client, **overrides):
    """POST a well-formed plan purchase, with fields overridable per test."""
    payload = {"plan": PLAN, "billing_cycle": "yearly", "phone": PHONE}
    payload.update(overrides)
    return client.post(INITIATE_URL, payload, format="json")


# ── The free plan: not a purchase ─────────────────────────────────────────────


@pytest.mark.django_db
class TestFreePlan:
    """Switching to Free takes none of the charge path.

    It is the one branch that settles inside the request, and it must not touch
    Fapshi at all — a merchant cancelling a subscription should not need a working
    payment gateway, let alone a phone number.
    """

    def test_activates_without_a_phone_number(self, auth):
        response = auth.post(INITIATE_URL, {"plan": "free"}, format="json")

        assert response.status_code == 200
        assert response.data["settled"] is True

    def test_never_calls_fapshi(self, auth, monkeypatch):
        def boom(**kwargs):
            raise AssertionError("charged Fapshi for the free plan")

        monkeypatch.setattr(fapshi, "direct_pay", boom)

        assert auth.post(INITIATE_URL, {"plan": "free"}, format="json").status_code == 200

    def test_supersedes_a_paid_plan_and_clears_the_tier(self, auth, buyer):
        """The destructive part. The dashboard gates this behind a confirmation
        dialog; the API stays willing because that answer is the authorisation."""
        paid = Subscription.objects.create(
            user=buyer,
            plan=PLAN,
            status=Subscription.Status.ACTIVE,
            billing_cycle="yearly",
            amount_paid=PRICE,
        )

        auth.post(INITIATE_URL, {"plan": "free"}, format="json")

        paid.refresh_from_db()
        merchant = Merchant.objects.get(user=buyer)
        assert paid.status == Subscription.Status.CANCELLED
        assert merchant.tier == Plan.FREE
        assert merchant.tier_expires_at is None
        assert Subscription.objects.filter(
            user=buyer, plan=Plan.FREE, status=Subscription.Status.ACTIVE
        ).exists()


# ── What is refused before any money is involved ──────────────────────────────


@pytest.mark.django_db
class TestValidation:
    """Every 400 here happens before Fapshi is called, so nothing is charged."""

    def test_an_unknown_plan_is_refused(self, auth, charged):
        assert buy(auth, plan="platinum").status_code == 400
        assert charged == []

    def test_an_unknown_billing_cycle_is_refused_rather_than_defaulted(
        self, auth, charged
    ):
        """Both cycles sell now, so this is the guard that carries the weight the
        blanket monthly refusal used to. Quietly falling back to a default would
        take one cycle's price for the other cycle's term."""
        response = buy(auth, billing_cycle="weekly")

        assert response.status_code == 400
        assert charged == []

    def test_a_missing_phone_number_is_refused(self, auth, charged):
        response = auth.post(
            INITIATE_URL, {"plan": PLAN, "billing_cycle": "yearly"}, format="json"
        )

        assert response.status_code == 400
        assert "phone" in response.data
        assert charged == []

    def test_a_landline_is_refused_with_a_readable_reason(self, auth, charged):
        """It parses as a valid Cameroonian number but cannot hold a wallet, so
        the message has to say so rather than repeating Fapshi's refusal."""
        response = buy(auth, phone="233421234")

        assert response.status_code == 400
        assert "mobile" in str(response.data["phone"]).lower()
        assert charged == []

    def test_a_foreign_number_is_refused(self, auth, charged):
        assert buy(auth, phone="+33612345678").status_code == 400
        assert charged == []

    def test_a_medium_fapshi_does_not_accept_is_refused(self, auth, charged):
        assert buy(auth, medium="bitcoin").status_code == 400
        assert charged == []

    def test_anonymous_callers_cannot_buy(self, client, charged):
        assert buy(client).status_code in (401, 403)
        assert charged == []


# ── The two cycles ────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestBillingCycle:
    """Both cycles are sold, and each must charge its own price for its own term.

    Monthly was withdrawn for a while and ``initiate`` refused it outright with a
    400. The refusal was the safe move at the time precisely because of the
    failure this class now guards instead: a cycle and an amount that disagree,
    charging a year's price for a 30-day term or the reverse. The amount lands on
    the subscription and the cycle drives ``settlement.CYCLE_DAYS``, so the two
    are only ever correct together.
    """

    def test_monthly_charges_the_monthly_price(self, auth, charged):
        response = buy(auth, billing_cycle="monthly")

        assert response.status_code == 201
        assert response.data["amount"] == MONTHLY_PRICE
        assert charged[0]["amount"] == MONTHLY_PRICE

    def test_yearly_charges_the_yearly_price(self, auth, charged):
        response = buy(auth, billing_cycle="yearly")

        assert response.status_code == 201
        assert response.data["amount"] == PRICE
        assert charged[0]["amount"] == PRICE

    def test_the_two_prices_are_not_the_same_number(self):
        """Guards the tests above from passing vacuously: were the catalogue to
        return one figure for both cycles, every assertion here would hold."""
        assert MONTHLY_PRICE != PRICE

    def test_the_cycle_is_stored_with_the_amount_it_was_priced_at(
        self, auth, charged, buyer
    ):
        """``settlement`` reads the cycle off this row to set the expiry, so a
        charge taken on one cycle and stored as the other grants the wrong term
        for money that has already moved."""
        buy(auth, billing_cycle="monthly")

        sub = Subscription.objects.get(user=buyer)
        assert sub.billing_cycle == "monthly"
        assert sub.amount_paid == MONTHLY_PRICE

    def test_a_cycle_left_out_entirely_is_billed_yearly(self, auth, charged):
        """A client that posts no cycle at all predates monthly being sold, so
        yearly is what it meant — and it is the figure it will have shown."""
        response = auth.post(
            INITIATE_URL, {"plan": PLAN, "phone": PHONE}, format="json"
        )

        assert response.status_code == 201
        assert response.data["amount"] == PRICE

    def test_the_handset_prompt_names_the_term(self, auth, charged):
        """The prompt is the last thing standing between the merchant and the
        charge, and an amount on its own does not say whether it buys a month or
        a year."""
        buy(auth, billing_cycle="monthly")

        assert "1 month" in charged[0]["message"]


# ── The accepted charge ───────────────────────────────────────────────────────


@pytest.mark.django_db
class TestAcceptedCharge:
    """201: Fapshi took the request and the merchant now has a prompt to approve."""

    def test_returns_the_transaction_to_poll(self, auth, charged):
        response = buy(auth)

        assert response.status_code == 201
        assert response.data["charge_accepted"] is True
        assert response.data["trans_id"] == "tx-charge-1"
        assert response.data["settled"] is False
        assert response.data["payment_status"] == "pending"
        assert response.data["amount"] == PRICE

    def test_records_a_pending_subscription_and_transaction(self, auth, buyer, charged):
        response = buy(auth)

        sub = Subscription.objects.get(pk=response.data["subscription_id"])
        tx = PaymentTransaction.objects.get(fapshi_trans_id="tx-charge-1")
        assert sub.status == Subscription.Status.PENDING
        assert sub.amount_paid == PRICE
        assert tx.subscription_id == sub.pk
        assert tx.user_id == buyer.pk
        assert tx.settled_at is None

    def test_the_transaction_is_marked_never_polled(self, auth, charged):
        """Distinct from Fapshi's own strings, so a row that has genuinely never
        been asked about is visible as such in the admin."""
        buy(auth)

        tx = PaymentTransaction.objects.get(fapshi_trans_id="tx-charge-1")
        assert tx.fapshi_status == views.CHARGE_REQUESTED

    def test_the_charge_carries_the_subscription_id(self, auth, charged):
        """It is what a webhook resolves back to a row. Getting this wrong makes
        a notification unmatchable and the payment invisible until the sweep."""
        response = buy(auth)

        assert charged[0]["external_id"] == str(response.data["subscription_id"])

    def test_the_charge_carries_the_normalised_number(self, auth, charged):
        buy(auth, phone="+237 6 70 00 00 01")

        assert charged[0]["phone"] == PHONE

    def test_the_medium_is_omitted_unless_the_merchant_picked_one(self, auth, charged):
        """Fapshi's own instruction for the field is "omit to auto-detect", and its
        detection beats a prefix table of ours."""
        buy(auth)

        assert charged[0]["medium"] is None

    def test_a_chosen_medium_is_passed_through(self, auth, charged):
        buy(auth, medium=fapshi.MEDIUM_ORANGE)

        assert charged[0]["medium"] == fapshi.MEDIUM_ORANGE

    def test_the_plan_is_not_granted_yet(self, auth, buyer, charged):
        """The whole point of the PENDING row: accepted is not paid. Only
        ``settlement.activate_subscription`` may write the tier."""
        buy(auth)

        assert Merchant.objects.get(user=buyer).tier == Plan.FREE


# ── Refused, and the one outcome that is neither ──────────────────────────────


@pytest.mark.django_db
class TestRefusedCharge:
    """400: Fapshi declined, so nothing was charged and nothing will be."""

    @pytest.fixture
    def refuses(self, monkeypatch):
        def refuse(**kwargs):
            raise fapshi.FapshiRejected("Sorry, this number is not valid")

        monkeypatch.setattr(fapshi, "direct_pay", refuse)

    def test_reports_the_refusal_as_a_failure_to_charge(self, auth, refuses):
        response = buy(auth)

        assert response.status_code == 400
        assert response.data["charge_accepted"] is False

    def test_leaves_no_dead_subscription_behind(self, auth, buyer, refuses):
        """Provably no money to reconcile against it — unlike the 202 below. A
        merchant correcting a typo would otherwise accumulate one dead row per
        attempt, and every one of them would show up in the sweep's unfollowable
        count as a charge that might exist."""
        buy(auth)
        buy(auth)

        assert Subscription.objects.filter(user=buyer).count() == 0
        assert PaymentTransaction.objects.filter(user=buyer).count() == 0

    def test_the_merchant_can_retry_with_a_corrected_number(
        self, auth, monkeypatch, refuses
    ):
        buy(auth)
        monkeypatch.setattr(fapshi, "direct_pay", lambda **kw: "tx-second-try")

        assert buy(auth).status_code == 201


@pytest.mark.django_db
class TestUnconfirmedCharge:
    """202: Fapshi never answered. **The charge may or may not exist.**

    The dangerous branch, and the reason it has its own status code and its own
    flag rather than being folded into either of the others.
    """

    @pytest.fixture
    def times_out(self, monkeypatch):
        def timeout(**kwargs):
            raise fapshi.FapshiUnavailable("read timed out")

        monkeypatch.setattr(fapshi, "direct_pay", timeout)

    def test_is_not_reported_as_a_failure(self, auth, times_out):
        response = buy(auth)

        assert response.status_code == 202
        assert response.data["charge_accepted"] is False
        assert response.data["payment_status"] == "pending"
        assert response.data["settled"] is False

    def test_keeps_the_subscription_as_the_only_record_of_a_possible_debit(
        self, auth, buyer, times_out
    ):
        """There is no transId, so nothing can follow this up automatically. The
        PENDING row is what a human works from against the Fapshi dashboard — and
        what the sweep counts as unfollowable."""
        response = buy(auth)

        sub = Subscription.objects.get(pk=response.data["subscription_id"])
        assert sub.status == Subscription.Status.PENDING
        assert not sub.fapshi_trans_id
        assert not PaymentTransaction.objects.filter(user=buyer).exists()

    def test_grants_nothing(self, auth, buyer, times_out):
        buy(auth)

        assert Merchant.objects.get(user=buyer).tier == Plan.FREE


# ── The second charge ─────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestSecondCharge:
    """A merchant who clicks the plan twice must not pay for two years.

    Activation extends from the current expiry rather than from today, so an
    unguarded second charge does not fail visibly — it silently buys another year.
    The guard settles the earlier attempt first rather than blocking outright, so a
    payment the merchant has already approved activates here instead of locking
    them out of their own dashboard.
    """

    def test_a_charge_awaiting_approval_blocks_another(self, client, monkeypatch, charged):
        tx = make_pending_transaction()
        client.force_authenticate(user=tx.user)
        says(monkeypatch, fapshi.STATUS_PENDING)

        response = buy(client)

        assert response.status_code == 409
        assert response.data["payment_status"] == "pending"
        assert response.data["trans_id"] == tx.fapshi_trans_id
        assert charged == [], "charged a second time while one was in flight"

    def test_an_approved_charge_activates_instead_of_blocking(
        self, client, monkeypatch, charged
    ):
        """The merchant approved on their handset and clicked again before the poll
        caught up. Their plan is live, and the response says so."""
        tx = make_pending_transaction()
        client.force_authenticate(user=tx.user)
        says(monkeypatch, fapshi.STATUS_SUCCESSFUL)

        response = buy(client)

        tx.refresh_from_db()
        assert response.status_code == 409
        assert response.data["settled"] is True
        assert response.data["payment_status"] == "paid"
        assert tx.status == PaymentTransaction.Status.SUCCESSFUL
        assert Merchant.objects.get(user=tx.user).tier == tx.plan
        assert charged == []

    def test_an_unreachable_gateway_refuses_rather_than_risking_a_double_charge(
        self, client, monkeypatch, charged
    ):
        """We cannot tell whether the earlier charge is live. A merchant delayed by
        a minute is recoverable; a merchant charged twice is not."""
        tx = make_pending_transaction()
        client.force_authenticate(user=tx.user)
        unreachable(monkeypatch)

        response = buy(client)

        assert response.status_code == 503
        assert response.data["settled"] is False
        assert charged == []

    def test_a_dead_attempt_does_not_block_a_new_one(self, client, monkeypatch, charged):
        """Fapshi confirmed the money did not move, so that row is settled and
        charging again is safe. Blocking here would leave a merchant unable to buy
        a plan after one refused payment."""
        tx = make_pending_transaction()
        client.force_authenticate(user=tx.user)
        says(monkeypatch, fapshi.STATUS_FAILED)

        response = buy(client)

        tx.refresh_from_db()
        assert response.status_code == 201
        assert tx.status == PaymentTransaction.Status.FAILED
        assert len(charged) == 1

    def test_another_merchants_pending_charge_is_irrelevant(
        self, auth, monkeypatch, charged
    ):
        """The guard is scoped to the requesting user. A shared block would let one
        merchant's unapproved prompt stop every other merchant from buying."""
        make_pending_transaction()  # someone else, still pending
        says(monkeypatch, fapshi.STATUS_PENDING)

        assert buy(auth).status_code == 201


# ── Polling ───────────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestPolling:
    """The dashboard's only way to find out: direct-pay has no redirect.

    The response speaks the same contract as the storefront's order-status
    endpoint — ``settled`` plus a ``payment_status`` — because one frontend hook
    polls both. Clients branch on ``settled``, not on ``payment_status == "paid"``:
    a failed payment is also settled and also final.
    """

    def test_a_missing_transaction_id_is_a_400(self, auth):
        assert auth.get(CALLBACK_URL).status_code == 400

    def test_an_unknown_transaction_is_a_404(self, auth):
        assert auth.get(CALLBACK_URL, {"transId": "tx-nope"}).status_code == 404

    def test_one_merchant_cannot_read_anothers_payment(self, auth, monkeypatch):
        """Scoped to the requesting user, so a guessed transId leaks nothing — and
        cannot be used to spend someone else's Fapshi rate limit."""
        other = make_pending_transaction()
        says(monkeypatch, fapshi.STATUS_SUCCESSFUL)

        response = auth.get(CALLBACK_URL, {"transId": other.fapshi_trans_id})

        other.refresh_from_db()
        assert response.status_code == 404
        assert other.settled_at is None, "settled a payment for the wrong user"

    def test_awaiting_approval_reads_as_unsettled(self, client, monkeypatch):
        tx = make_pending_transaction()
        client.force_authenticate(user=tx.user)
        says(monkeypatch, fapshi.STATUS_PENDING)

        response = client.get(CALLBACK_URL, {"transId": tx.fapshi_trans_id})

        assert response.data["settled"] is False
        assert response.data["payment_status"] == "pending"

    def test_an_approved_payment_activates_the_plan(self, client, monkeypatch):
        tx = make_pending_transaction()
        client.force_authenticate(user=tx.user)
        says(monkeypatch, fapshi.STATUS_SUCCESSFUL)

        response = client.get(CALLBACK_URL, {"transId": tx.fapshi_trans_id})

        tx.subscription.refresh_from_db()
        assert response.data["settled"] is True
        assert response.data["payment_status"] == "paid"
        assert response.data["plan"] == tx.plan
        assert tx.subscription.status == Subscription.Status.ACTIVE
        assert Merchant.objects.get(user=tx.user).tier == tx.plan

    def test_a_refused_payment_is_settled_too(self, client, monkeypatch):
        """Final, and the client must stop polling — hence ``settled: true`` on a
        payment that failed."""
        tx = make_pending_transaction()
        client.force_authenticate(user=tx.user)
        says(monkeypatch, fapshi.STATUS_FAILED)

        response = client.get(CALLBACK_URL, {"transId": tx.fapshi_trans_id})

        tx.subscription.refresh_from_db()
        assert response.data["settled"] is True
        assert response.data["payment_status"] == "failed"
        assert tx.subscription.status == Subscription.Status.CANCELLED

    def test_an_outage_reads_as_pending_and_never_as_failed(self, client, monkeypatch):
        """The bug this whole rewrite exists to remove. Answering "failed" here
        cancelled live subscriptions for payments that had gone through."""
        tx = make_pending_transaction()
        client.force_authenticate(user=tx.user)
        unreachable(monkeypatch)

        response = client.get(CALLBACK_URL, {"transId": tx.fapshi_trans_id})

        tx.refresh_from_db()
        assert response.data["settled"] is False
        assert response.data["payment_status"] == "pending"
        assert tx.settled_at is None, "settled a transaction Fapshi never answered for"
        assert tx.subscription.status == Subscription.Status.PENDING

    def test_polling_faster_than_the_gate_does_not_reach_fapshi(
        self, client, monkeypatch
    ):
        """Fapshi allows six status calls a minute per transaction and answers a
        seventh with 429. The dashboard polls every two seconds, which is thirty —
        so without the gate the frontend's own schedule would rate-limit the
        payment it is watching."""
        tx = make_pending_transaction()
        client.force_authenticate(user=tx.user)
        calls = []

        def counted(trans_id):
            calls.append(trans_id)
            return fapshi.STATUS_PENDING

        monkeypatch.setattr(fapshi, "payment_status", counted)

        for _ in range(5):
            client.get(CALLBACK_URL, {"transId": tx.fapshi_trans_id})

        assert len(calls) == 1

    def test_a_poll_inside_the_gate_still_answers_from_the_stored_row(
        self, client, monkeypatch
    ):
        """Gated does not mean unknown: the second caller is answered with what the
        first one learned, which is what makes a two-second client schedule safe."""
        tx = make_pending_transaction()
        client.force_authenticate(user=tx.user)
        says(monkeypatch, fapshi.STATUS_PENDING)

        client.get(CALLBACK_URL, {"transId": tx.fapshi_trans_id})
        response = client.get(CALLBACK_URL, {"transId": tx.fapshi_trans_id})

        assert response.status_code == 200
        assert response.data["payment_status"] == "pending"

    def test_the_gate_lets_the_next_interval_through(self, client, monkeypatch):
        tx = make_pending_transaction()
        client.force_authenticate(user=tx.user)
        calls = []

        def counted(trans_id):
            calls.append(trans_id)
            return fapshi.STATUS_PENDING

        monkeypatch.setattr(fapshi, "payment_status", counted)

        client.get(CALLBACK_URL, {"transId": tx.fapshi_trans_id})
        # Rather than sleeping ten seconds: drop the gate the way its expiry would.
        cache.delete(f"fapshi:status-gate:{tx.fapshi_trans_id}")
        client.get(CALLBACK_URL, {"transId": tx.fapshi_trans_id})

        assert len(calls) == 2

    def test_a_settled_payment_never_asks_fapshi(self, client, monkeypatch):
        """The answer cannot change, so there is nothing to ask — and a dashboard
        left open on a finished purchase costs Fapshi nothing."""
        tx = make_pending_transaction()
        client.force_authenticate(user=tx.user)
        says(monkeypatch, fapshi.STATUS_SUCCESSFUL)
        client.get(CALLBACK_URL, {"transId": tx.fapshi_trans_id})  # settles it
        cache.clear()

        def boom(trans_id):
            raise AssertionError("asked Fapshi about a settled transaction")

        monkeypatch.setattr(fapshi, "payment_status", boom)

        response = client.get(CALLBACK_URL, {"transId": tx.fapshi_trans_id})

        assert response.data["settled"] is True
        assert response.data["payment_status"] == "paid"

    def test_repeated_polls_grant_only_one_term(self, client, monkeypatch):
        """The idempotency that ``settled_at`` under a row lock buys. Two callers
        both activating added two years to a term for one payment."""
        tx = make_pending_transaction()
        client.force_authenticate(user=tx.user)
        says(monkeypatch, fapshi.STATUS_SUCCESSFUL)

        client.get(CALLBACK_URL, {"transId": tx.fapshi_trans_id})
        first_expiry = Merchant.objects.get(user=tx.user).tier_expires_at
        cache.clear()
        client.get(CALLBACK_URL, {"transId": tx.fapshi_trans_id})

        assert Merchant.objects.get(user=tx.user).tier_expires_at == first_expiry

    def test_anonymous_callers_cannot_poll(self, client):
        tx = make_pending_transaction()

        response = client.get(CALLBACK_URL, {"transId": tx.fapshi_trans_id})

        assert response.status_code in (401, 403)
