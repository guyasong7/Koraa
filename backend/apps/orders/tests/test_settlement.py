"""Settling a storefront order — once, and only once.

The bugs these tests exist to keep dead, in the order they cost money:

1. **Double payout.** The old guard was ``if order.payment_status == PAID`` read
   outside any transaction and with no row lock. Fapshi sends a webhook *and* the
   buyer's browser polls, so two callers reading "pending" at the same time was
   the normal case — and both paid the merchant.
2. **An outage read as a failed payment.** The old status helper answered
   ``"FAILED"`` whenever Fapshi did not reply with a 200, and the caller wrote
   that to the order. A momentary Fapshi wobble marked paid orders failed, losing
   the fact that money had moved.
3. **EXPIRED ignored.** Only ``== "FAILED"`` was tested, so expired payments sat
   pending forever.
4. **A webhook that could not find a storefront order.** The payments webhook
   looked only at ``PaymentTransaction`` and answered 200/ignored for everything
   else, which told Fapshi never to redeliver. No storefront order had ever been
   settled.

On not using threads for the race
---------------------------------

The plan asked for a two-thread test asserting ``select_for_update`` serialises
concurrent settles. It is not written that way, deliberately: this suite runs on
sqlite, where ``select_for_update`` is accepted and has no effect, so a threaded
test would either pass for the wrong reason or flake on lock timeouts — it would
be testing the harness, not the code.

``TestConcurrentSettle`` reproduces the *actual* interleaving instead, and does it
deterministically: both callers fetch the payment from Fapshi first (which is
what happens outside the lock in real life), and only then does each try to
settle. That is precisely the window the old code left open, and it is closed
here by reading ``settled_at`` inside the transaction rather than before it.

Why every class is ``django_db(transaction=True)``
-------------------------------------------------

Settlement schedules the payout, the emails and the download grants with
``transaction.on_commit``. Plain ``@pytest.mark.django_db`` wraps each test in a
transaction it rolls back, so nothing ever commits and **none of those callbacks
run** — the assertions all passed vacuously the first time, reporting zero payouts
for the happy path. ``transaction=True`` commits for real. It costs a table flush
per test; asserting on side effects that only exist after a commit is worth it.
"""

import uuid
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core import mail

from apps.merchants.models import Merchant, MerchantPayoutAccount
from apps.notifications.models import Notification
from apps.orders import settlement
from apps.orders.models import DownloadGrant, Order, OrderItem
from apps.payments import fapshi
from apps.products.models import Product
from apps.stores.models import Store

User = get_user_model()

#: A SUCCESSFUL payment-details body in the shape ``fapshi.payment_details``
#: returns. ``revenue`` is deliberately below ``amount``: Fapshi takes its fee
#: before Koraa sees the money, and the merchant's share is computed from what
#: actually arrived.
SUCCESS = {
    "status": fapshi.STATUS_SUCCESSFUL,
    "transId": "tx-success",
    "amount": 10000,
    "revenue": 9800,
    "financialTransId": "MP240101.1234.A56789",
    "dateConfirmed": "2026-08-28T10:30:00Z",
}


def make_order(*, total=Decimal("10000.00"), trans_id="tx-success", with_payout_account=True, digital=False):
    """A store, its merchant, and one pending order ready to settle."""
    suffix = uuid.uuid4().hex[:8]
    user = User.objects.create_user(
        email=f"merchant-{suffix}@koraa.test", full_name="Shop Owner", password="Koraa@2024!"
    )
    merchant = Merchant.objects.create(user=user, business_name="Shop", country="CM")
    if with_payout_account:
        MerchantPayoutAccount.objects.create(
            merchant=merchant, provider="MTN", name="Shop Owner", phone="670000001", is_default=True
        )
    store = Store.objects.create(
        merchant=merchant, name="Shop", slug=f"shop-{suffix}", currency="XAF"
    )
    order = Order.objects.create(
        store=store,
        customer_name="Buyer",
        customer_email="buyer@example.test",
        shipping_address="1 Rue",
        city="Douala",
        total_amount=total,
        fapshi_trans_id=trans_id,
    )
    if digital:
        product = Product.objects.create(
            store=store,
            name="An Ebook",
            slug=f"ebook-{suffix}",
            product_type=Product.ProductType.DIGITAL,
            base_price=total,
            status=Product.Status.ACTIVE,
        )
        OrderItem.objects.create(
            order=order, product=product, product_name=product.name, quantity=1, price=total
        )
    return order


@pytest.fixture
def paid(monkeypatch):
    """Fapshi answers SUCCESSFUL, and payouts are accepted.

    Returns the list every payout call appends to, so a test can count them —
    which is the whole point: "exactly one payout" is not a state you can read
    off the database, only off the calls made.
    """
    calls = []

    monkeypatch.setattr(fapshi, "payment_details", lambda trans_id: dict(SUCCESS))

    def fake_payout(*, phone, amount, external_id):
        calls.append({"phone": phone, "amount": amount, "external_id": external_id})
        return f"payout-{len(calls)}"

    monkeypatch.setattr(fapshi, "payout", fake_payout)
    # settlement.py holds its own module reference to fapshi, so patching the
    # module's attributes (rather than settlement's) is what both see.
    return calls


@pytest.mark.django_db(transaction=True)
class TestSettleOnce:
    """One payment produces one of everything."""

    def test_marks_the_order_paid(self, paid):
        order = make_order()

        assert settlement.settle_order(order.id) == settlement.PAID

        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PAID
        assert order.settled_at is not None
        assert order.fapshi_status == "SUCCESSFUL"

    def test_records_what_fapshi_actually_said(self, paid):
        """The audit trail, without which a disputed payment has no evidence."""
        order = make_order()
        settlement.settle_order(order.id)

        order.refresh_from_db()
        assert order.financial_trans_id == "MP240101.1234.A56789"
        assert order.fapshi_revenue == Decimal("9800")
        assert order.paid_at is not None
        # dateConfirmed, not "when we got round to it".
        assert order.paid_at.year == 2026 and order.paid_at.month == 8

    def test_pays_the_merchant_their_share(self, paid):
        order = make_order()
        settlement.settle_order(order.id)

        assert len(paid) == 1
        # 5% commission on the 9800 that arrived, not on the 10000 charged.
        assert paid[0]["amount"] == Decimal("9310")
        assert paid[0]["phone"] == "670000001"
        # The payout carries the order id, so a merchant asking "which sale is
        # this?" has an answer. The old signature had nowhere to put one.
        assert paid[0]["external_id"] == str(order.id)

    def test_payout_is_computed_from_revenue_not_the_gross(self, paid):
        """Paying a share of the gross can exceed what Koraa received.

        Fapshi deducts its fee before remitting. A payout of ``total × 0.95``
        therefore loses money on every sale where Fapshi's fee is over 5% — this
        asserts the basis is ``revenue``.
        """
        order = make_order(total=Decimal("10000.00"))
        settlement.settle_order(order.id)

        gross_based = Decimal("10000") * Decimal("0.95")
        assert paid[0]["amount"] < gross_based
        assert paid[0]["amount"] <= Decimal(SUCCESS["revenue"])

    def test_records_the_payout_outcome(self, paid):
        order = make_order()
        settlement.settle_order(order.id)

        order.refresh_from_db()
        assert order.payout_status == Order.PayoutStatus.SENT
        assert order.payout_reference == "payout-1"
        assert order.payout_amount == Decimal("9310")
        assert order.payout_at is not None

    def test_notifies_and_emails_the_merchant(self, paid):
        order = make_order()
        settlement.settle_order(order.id)

        assert Notification.objects.filter(
            type=Notification.Type.ORDER_PLACED
        ).count() == 1
        assert len(mail.outbox) >= 1

    def test_mints_download_grants_for_digital_lines(self, paid):
        order = make_order(digital=True)
        settlement.settle_order(order.id)

        assert DownloadGrant.objects.filter(order=order).count() == 1


@pytest.mark.django_db(transaction=True)
class TestSettleTwice:
    """The double-payout regression. Calling twice must cost the merchant once."""

    def test_second_call_reports_already(self, paid):
        order = make_order()

        assert settlement.settle_order(order.id) == settlement.PAID
        assert settlement.settle_order(order.id) == settlement.ALREADY

    def test_pays_out_exactly_once(self, paid):
        order = make_order()

        settlement.settle_order(order.id)
        settlement.settle_order(order.id)
        settlement.settle_order(order.id)

        assert len(paid) == 1

    def test_notifies_exactly_once(self, paid):
        order = make_order()

        settlement.settle_order(order.id)
        settlement.settle_order(order.id)

        assert Notification.objects.count() == 1

    def test_grants_exactly_one_download(self, paid):
        """A replayed webhook must not reset the buyer's download count."""
        order = make_order(digital=True)

        settlement.settle_order(order.id)
        grant = DownloadGrant.objects.get(order=order)
        grant.download_count = 3
        grant.save(update_fields=["download_count"])

        settlement.settle_order(order.id)

        assert DownloadGrant.objects.filter(order=order).count() == 1
        grant.refresh_from_db()
        assert grant.download_count == 3

    def test_settled_at_is_not_moved_by_a_replay(self, paid):
        order = make_order()
        settlement.settle_order(order.id)
        order.refresh_from_db()
        first = order.settled_at

        settlement.settle_order(order.id)
        order.refresh_from_db()
        assert order.settled_at == first


@pytest.mark.django_db(transaction=True)
class TestConcurrentSettle:
    """Both callers get past the pre-check, then race for the lock.

    This is the interleaving the old code lost money on: the guard was read
    before the Fapshi call, so two callers who both looked at a pending order
    both went on to pay. Here each has already fetched the payment and calls the
    locked writer directly — the only thing standing between them is the
    ``settled_at`` read inside the transaction.
    """

    def test_only_one_of_two_racing_callers_pays(self, paid):
        order = make_order()
        details = dict(SUCCESS)

        first = settlement._settle_paid(order.id, details)
        second = settlement._settle_paid(order.id, details)

        assert first == settlement.PAID
        assert second == settlement.ALREADY
        assert len(paid) == 1

    def test_a_failure_verdict_cannot_overwrite_a_settled_payment(self, paid):
        """A late FAILED webhook must not un-pay an order.

        Fapshi can deliver notifications out of order. Without the lock check in
        the failure path, a stale FAILED would mark a paid order failed — after
        the merchant had already been paid.
        """
        order = make_order()
        settlement._settle_paid(order.id, dict(SUCCESS))

        result = settlement._settle_failed(
            order.id, {"status": fapshi.STATUS_FAILED}
        )

        assert result == settlement.ALREADY
        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PAID


@pytest.mark.django_db(transaction=True)
class TestOutageLeavesStateAlone:
    """Regression: an outage is not a failed payment.

    The single most expensive line in the old code returned ``"FAILED"`` for any
    non-200 from Fapshi, and the caller wrote it to the order. A pending order can
    be settled later; an order wrongly marked failed has lost the fact that money
    moved.
    """

    def test_returns_unknown_and_changes_nothing(self, monkeypatch):
        order = make_order()

        def boom(trans_id):
            raise fapshi.FapshiUnavailable("Fapshi timed out")

        monkeypatch.setattr(fapshi, "payment_details", boom)

        assert settlement.settle_order(order.id) == settlement.UNKNOWN

        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PENDING
        assert order.settled_at is None
        assert order.payout_status == Order.PayoutStatus.PENDING

    def test_the_order_can_still_be_settled_afterwards(self, monkeypatch, paid):
        """An outage must leave the order recoverable, which is the whole point."""
        order = make_order()

        monkeypatch.setattr(
            fapshi,
            "payment_details",
            lambda trans_id: (_ for _ in ()).throw(fapshi.FapshiUnavailable("down")),
        )
        assert settlement.settle_order(order.id) == settlement.UNKNOWN

        monkeypatch.setattr(fapshi, "payment_details", lambda trans_id: dict(SUCCESS))
        assert settlement.settle_order(order.id) == settlement.PAID

    def test_a_rejected_status_check_also_leaves_it_pending(self, monkeypatch):
        order = make_order()
        monkeypatch.setattr(
            fapshi,
            "payment_details",
            lambda trans_id: (_ for _ in ()).throw(fapshi.FapshiRejected("no such transaction")),
        )

        assert settlement.settle_order(order.id) == settlement.UNKNOWN
        order.refresh_from_db()
        assert order.settled_at is None


@pytest.mark.django_db(transaction=True)
class TestUnsuccessfulPayments:
    """FAILED and EXPIRED both settle the order. EXPIRED used to be ignored."""

    @pytest.mark.parametrize("raw", [fapshi.STATUS_FAILED, fapshi.STATUS_EXPIRED])
    def test_marks_the_order_failed(self, monkeypatch, raw):
        order = make_order()
        monkeypatch.setattr(fapshi, "payment_details", lambda trans_id: {"status": raw})

        assert settlement.settle_order(order.id) == settlement.FAILED

        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.FAILED
        assert order.settled_at is not None
        # The raw distinction survives even though PaymentStatus collapses it.
        assert order.fapshi_status == raw

    def test_owes_the_merchant_nothing(self, monkeypatch):
        order = make_order()
        monkeypatch.setattr(
            fapshi, "payment_details", lambda trans_id: {"status": fapshi.STATUS_FAILED}
        )
        settlement.settle_order(order.id)

        order.refresh_from_db()
        assert order.payout_status == Order.PayoutStatus.NOT_APPLICABLE

    @pytest.mark.parametrize("raw", [fapshi.STATUS_PENDING, fapshi.STATUS_CREATED])
    def test_an_unfinished_payment_stays_settleable(self, monkeypatch, raw):
        """The buyer has not approved on their handset yet."""
        order = make_order()
        monkeypatch.setattr(fapshi, "payment_details", lambda trans_id: {"status": raw})

        assert settlement.settle_order(order.id) == settlement.PENDING

        order.refresh_from_db()
        assert order.settled_at is None
        assert order.payment_status == Order.PaymentStatus.PENDING
        # Recorded so the admin can see how far the payment got.
        assert order.fapshi_status == raw


@pytest.mark.django_db(transaction=True)
class TestPayoutFailures:
    """A merchant who was not paid must be findable and retryable.

    The old code logged and moved on, so there was no field to query: nobody
    could answer "who is owed money" without grepping the application log.
    """

    def test_a_refused_payout_is_recorded_as_failed(self, monkeypatch):
        order = make_order()
        monkeypatch.setattr(fapshi, "payment_details", lambda trans_id: dict(SUCCESS))
        monkeypatch.setattr(
            fapshi,
            "payout",
            lambda **kw: (_ for _ in ()).throw(fapshi.FapshiRejected("invalid number")),
        )

        assert settlement.settle_order(order.id) == settlement.PAID

        order.refresh_from_db()
        # The buyer's payment stands regardless — their money did arrive.
        assert order.payment_status == Order.PaymentStatus.PAID
        assert order.payout_status == Order.PayoutStatus.FAILED
        assert "invalid number" in order.payout_error

    def test_an_unreachable_fapshi_leaves_the_payout_unknown(self, monkeypatch):
        """Not FAILED: the request may have landed before the connection died.

        UNKNOWN keeps the order out of the automatic retry query, because the
        cost of retrying a payout that did go through is paying twice.
        """
        order = make_order()
        monkeypatch.setattr(fapshi, "payment_details", lambda trans_id: dict(SUCCESS))
        monkeypatch.setattr(
            fapshi,
            "payout",
            lambda **kw: (_ for _ in ()).throw(fapshi.FapshiUnavailable("timeout")),
        )

        settlement.settle_order(order.id)

        order.refresh_from_db()
        assert order.payout_status == Order.PayoutStatus.UNKNOWN

    def test_a_merchant_with_no_payout_account_is_flagged(self, monkeypatch, paid):
        order = make_order(with_payout_account=False)

        assert settlement.settle_order(order.id) == settlement.PAID

        order.refresh_from_db()
        assert order.payout_status == Order.PayoutStatus.FAILED
        assert "payout account" in order.payout_error
        assert len(paid) == 0

    def test_a_share_below_the_fapshi_floor_is_not_attempted(self, monkeypatch, paid):
        """Fapshi will not move less than its minimum, so calling only errors."""
        order = make_order(total=Decimal("100.00"))
        monkeypatch.setattr(
            fapshi,
            "payment_details",
            lambda trans_id: {**SUCCESS, "amount": 100, "revenue": 90},
        )

        settlement.settle_order(order.id)

        order.refresh_from_db()
        assert order.payout_status == Order.PayoutStatus.NOT_APPLICABLE
        assert len(paid) == 0


@pytest.mark.django_db(transaction=True)
class TestSettleGuards:
    """Inputs that must not blow up a payment path."""

    def test_an_unknown_order_is_reported_not_raised(self, paid):
        assert settlement.settle_order(uuid.uuid4()) == settlement.UNKNOWN

    def test_an_order_with_no_payment_stays_pending(self, paid):
        """Nothing was ever initiated, so there is nothing to ask Fapshi about."""
        order = make_order(trans_id=None)

        assert settlement.settle_order(order.id) == settlement.PENDING

        order.refresh_from_db()
        assert order.settled_at is None

    def test_a_side_effect_failure_does_not_unpay_the_order(self, monkeypatch, paid):
        """The buyer's money arrived; an SMTP outage must not undo that.

        This also protects the webhook: raising here would give Fapshi a 500, and
        Fapshi reads a 500 as "deliver it again" — so the steps that had already
        run would run a second time.
        """
        order = make_order(digital=True)
        monkeypatch.setattr(
            settlement.invoices,
            "send_invoice",
            lambda o: (_ for _ in ()).throw(RuntimeError("SMTP down")),
        )

        assert settlement.settle_order(order.id) == settlement.PAID

        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PAID
        # And the step after the failing one still ran.
        assert DownloadGrant.objects.filter(order=order).count() == 1


@pytest.mark.django_db(transaction=True)
class TestFapshiExtrasParsing:
    """A surprise in the audit fields must not cost a settlement."""

    def test_a_missing_revenue_falls_back_to_the_order_total(self, monkeypatch, paid):
        order = make_order(total=Decimal("10000.00"))
        monkeypatch.setattr(
            fapshi,
            "payment_details",
            lambda trans_id: {"status": fapshi.STATUS_SUCCESSFUL},
        )

        assert settlement.settle_order(order.id) == settlement.PAID
        assert paid[0]["amount"] == Decimal("9500")

    def test_an_unparseable_date_does_not_stop_the_settlement(self, monkeypatch, paid):
        order = make_order()
        monkeypatch.setattr(
            fapshi,
            "payment_details",
            lambda trans_id: {**SUCCESS, "dateConfirmed": "not a date"},
        )

        assert settlement.settle_order(order.id) == settlement.PAID

        order.refresh_from_db()
        # Falls back to now rather than being left null.
        assert order.paid_at is not None

    def test_an_unparseable_revenue_does_not_stop_the_settlement(self, monkeypatch, paid):
        order = make_order()
        monkeypatch.setattr(
            fapshi, "payment_details", lambda trans_id: {**SUCCESS, "revenue": "n/a"}
        )

        assert settlement.settle_order(order.id) == settlement.PAID

        order.refresh_from_db()
        assert order.fapshi_revenue is None
