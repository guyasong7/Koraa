"""The reconcile sweep and the payout retry — the recovery path for real money.

Why this file matters more than its size suggests: **Fapshi delivers each webhook
once and never retries.** A notification lost to a deploy means a buyer has paid
and has nothing, permanently, unless something goes looking. That something is
``reconcile_pending``, so its selection query is not a detail — an order the query
misses is an order nobody is ever paid for.

The two halves are tested for opposite properties:

* ``reconcile_pending`` must be **safe to run repeatedly and unattended**. It
  writes only through ``settlement.settle_order``, so the tests assert it inherits
  that idempotency rather than re-implementing a guard of its own.
* ``retry_failed_payouts`` **moves money**, so the tests assert what it *refuses*
  to touch. The important one is ``payout_status=unknown``: Fapshi took the payout
  and never answered, so a retry may pay a merchant twice out of Koraa's float.
  There is no idempotency key on Fapshi's payout endpoint, so that exclusion is
  the only thing standing in the way.

``transaction=True`` throughout, for the reason recorded in ``test_settlement``:
settlement schedules payouts and grants with ``on_commit``, which never fires
under the rolled-back default marker.
"""

from decimal import Decimal
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.orders import reconcile, settlement
from apps.orders.models import Order
from apps.payments import fapshi

from .factories import SUCCESS, age_order, make_order

#: Older than ``DEFAULT_OLDER_THAN_MINUTES``, so a default-configured sweep sees it.
STALE_MINUTES = reconcile.DEFAULT_OLDER_THAN_MINUTES + 5


@pytest.fixture
def fapshi_says_paid(monkeypatch):
    """Fapshi confirms the payment; payouts are accepted. Returns the payout calls."""
    calls = []

    def fake_payout(*, phone, amount, external_id):
        calls.append({"phone": phone, "amount": amount, "external_id": external_id})
        return f"payout-{len(calls)}"

    monkeypatch.setattr(fapshi, "payment_details", lambda trans_id: dict(SUCCESS))
    monkeypatch.setattr(fapshi, "payment_status", lambda trans_id: fapshi.STATUS_SUCCESSFUL)
    monkeypatch.setattr(fapshi, "payout", fake_payout)
    return calls


def stale_order(**kwargs):
    """A pending order old enough for the default sweep to pick up."""
    return age_order(make_order(**kwargs), minutes=STALE_MINUTES)


# ── Which orders a sweep looks at ─────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
class TestSelection:
    """An order this query misses is an order nobody ever gets paid for."""

    def test_finds_a_stale_pending_order(self, fapshi_says_paid):
        order = stale_order()
        assert order in list(reconcile.pending_orders())

    def test_ignores_an_order_too_recent_to_be_stuck(self, fapshi_says_paid):
        """The buyer may still be approving on their handset, and their browser is
        polling — which shares Fapshi's six-per-minute-per-transaction budget."""
        order = make_order()  # created just now
        assert order not in list(reconcile.pending_orders())

    def test_ignores_an_order_that_never_started_a_payment(self, fapshi_says_paid):
        """An abandoned basket, not a lost payment. There is nothing to ask about."""
        order = stale_order(trans_id="")
        assert order not in list(reconcile.pending_orders())

    def test_ignores_an_already_settled_order(self, fapshi_says_paid):
        order = stale_order()
        settlement.settle_order(order.id)

        assert order not in list(reconcile.pending_orders())

    def test_selects_on_settled_at_not_just_payment_status(self, fapshi_says_paid):
        """``settled_at`` is the marker settlement honours.

        A sweep that trusted ``payment_status`` alone could re-enter an order whose
        side effects had already run — paying the merchant a second time.
        """
        order = stale_order()
        Order.objects.filter(pk=order.pk).update(
            settled_at=order.created_at, payment_status=Order.PaymentStatus.PENDING
        )

        assert order not in list(reconcile.pending_orders())

    def test_oldest_first(self, fapshi_says_paid):
        """So a backlog bigger than ``--limit`` drains instead of starving."""
        older = age_order(make_order(trans_id="tx-older"), minutes=STALE_MINUTES + 60)
        newer = stale_order(trans_id="tx-newer")

        found = list(reconcile.pending_orders())
        assert found.index(older) < found.index(newer)

    def test_limit_is_honoured(self, fapshi_says_paid):
        for i in range(3):
            stale_order(trans_id=f"tx-{i}")

        assert len(list(reconcile.pending_orders(limit=2))) == 2


# ── The sweep itself ──────────────────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
class TestReconcilePending:
    def test_settles_a_payment_whose_webhook_was_lost(self, fapshi_says_paid):
        """The whole reason this exists."""
        order = stale_order()

        report = reconcile.reconcile_pending()

        assert report.paid == 1
        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PAID
        assert order.settled_at is not None

    def test_a_settled_order_gets_its_downloads_and_payout(self, fapshi_says_paid):
        """A reconcile pass must deliver everything a webhook would have."""
        order = stale_order(digital=True)

        reconcile.reconcile_pending()

        order.refresh_from_db()
        assert order.download_grants.count() == 1
        assert order.payout_status == Order.PayoutStatus.SENT
        assert len(fapshi_says_paid) == 1

    def test_records_a_failure_fapshi_confirms(self, monkeypatch, fapshi_says_paid):
        order = stale_order()
        monkeypatch.setattr(
            fapshi, "payment_details", lambda trans_id: {"status": fapshi.STATUS_FAILED}
        )

        report = reconcile.reconcile_pending()

        assert report.failed == 1
        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.FAILED

    def test_an_unfinished_payment_is_left_pending(self, monkeypatch, fapshi_says_paid):
        order = stale_order()
        monkeypatch.setattr(
            fapshi, "payment_details", lambda trans_id: {"status": fapshi.STATUS_PENDING}
        )

        report = reconcile.reconcile_pending()

        assert report.still_pending == 1
        order.refresh_from_db()
        assert order.settled_at is None

    def test_an_outage_changes_nothing_and_is_counted(self, monkeypatch, fapshi_says_paid):
        """Not a failure. Money may have moved, so the order stays settleable."""
        order = stale_order()
        monkeypatch.setattr(
            fapshi,
            "payment_details",
            lambda trans_id: (_ for _ in ()).throw(fapshi.FapshiUnavailable("down")),
        )

        report = reconcile.reconcile_pending()

        assert report.unreachable == 1
        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PENDING
        assert order.settled_at is None

    def test_running_twice_pays_the_merchant_once(self, fapshi_says_paid):
        """It inherits ``settled_at``'s guard rather than adding one of its own —
        which is exactly what a scheduled sweep needs to be safe."""
        stale_order()

        reconcile.reconcile_pending()
        second = reconcile.reconcile_pending()

        assert len(fapshi_says_paid) == 1
        # The second pass does not even see it: it is no longer pending.
        assert second.examined == 0

    def test_one_bad_order_does_not_abandon_the_rest(self, monkeypatch, fapshi_says_paid):
        """A sweep that stopped at the first unreachable order would leave the
        newer, healthy payments unsettled indefinitely."""
        age_order(make_order(trans_id="tx-broken"), minutes=STALE_MINUTES + 60)
        good = stale_order(trans_id="tx-good")

        def selective(trans_id):
            if trans_id == "tx-broken":
                raise fapshi.FapshiUnavailable("down")
            return dict(SUCCESS)

        monkeypatch.setattr(fapshi, "payment_details", selective)

        report = reconcile.reconcile_pending()

        assert report.unreachable == 1
        assert report.paid == 1
        good.refresh_from_db()
        assert good.payment_status == Order.PaymentStatus.PAID

    def test_a_rejected_status_check_is_counted_not_raised(self, monkeypatch, fapshi_says_paid):
        """Fapshi has never heard of the transId — a Koraa record pointing at a
        payment that does not exist. Surfaced, never invented into a failure."""
        order = stale_order()
        monkeypatch.setattr(
            fapshi,
            "payment_details",
            lambda trans_id: (_ for _ in ()).throw(fapshi.FapshiRejected("no such tx")),
        )

        report = reconcile.reconcile_pending()

        assert report.unreachable == 1
        order.refresh_from_db()
        assert order.settled_at is None


@pytest.mark.django_db(transaction=True)
class TestDryRun:
    def test_reports_what_would_happen_without_writing(self, fapshi_says_paid):
        order = stale_order()

        report = reconcile.reconcile_pending(dry_run=True)

        assert report.paid == 1
        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PENDING
        assert order.settled_at is None

    def test_pays_nobody(self, fapshi_says_paid):
        stale_order()

        reconcile.reconcile_pending(dry_run=True)

        assert fapshi_says_paid == []

    def test_an_outage_during_a_dry_run_is_still_reported(self, monkeypatch, fapshi_says_paid):
        stale_order()
        monkeypatch.setattr(
            fapshi,
            "payment_status",
            lambda trans_id: (_ for _ in ()).throw(fapshi.FapshiUnavailable("down")),
        )

        assert reconcile.reconcile_pending(dry_run=True).unreachable == 1


# ── Payout retries: what they refuse to touch ─────────────────────────────────


def settled_order_with_payout(status, *, fapshi_says_paid, **kwargs):
    """A paid, fully settled order forced into a given ``payout_status``."""
    order = stale_order(**kwargs)
    settlement.settle_order(order.id)
    Order.objects.filter(pk=order.pk).update(payout_status=status)
    fapshi_says_paid.clear()  # ignore the payout the settle itself made
    order.refresh_from_db()
    return order


@pytest.mark.django_db(transaction=True)
class TestPayoutBacklog:
    """Exclusions here are the only thing preventing a double payout."""

    def test_a_failed_payout_is_retryable(self, fapshi_says_paid):
        order = settled_order_with_payout(
            Order.PayoutStatus.FAILED, fapshi_says_paid=fapshi_says_paid
        )
        assert order in list(reconcile.payout_backlog())

    def test_a_payout_that_never_ran_is_retryable(self, fapshi_says_paid):
        """``pending`` on a settled order means the ``on_commit`` side effects
        never ran — a process killed mid-settle. Nobody was paid."""
        order = settled_order_with_payout(
            Order.PayoutStatus.PENDING, fapshi_says_paid=fapshi_says_paid
        )
        assert order in list(reconcile.payout_backlog())

    def test_an_unknown_payout_is_never_retried(self, fapshi_says_paid):
        """The load-bearing exclusion.

        ``unknown`` means Fapshi accepted the payout and the connection then died,
        so the merchant may already have the money. Fapshi's payout endpoint has no
        idempotency key, so retrying could pay twice out of Koraa's own float. A
        human checks the dashboard instead.
        """
        order = settled_order_with_payout(
            Order.PayoutStatus.UNKNOWN, fapshi_says_paid=fapshi_says_paid
        )
        assert order not in list(reconcile.payout_backlog())

    def test_an_already_sent_payout_is_not_retried(self, fapshi_says_paid):
        order = settled_order_with_payout(
            Order.PayoutStatus.SENT, fapshi_says_paid=fapshi_says_paid
        )
        assert order not in list(reconcile.payout_backlog())

    def test_a_not_applicable_payout_is_not_retried(self, fapshi_says_paid):
        order = settled_order_with_payout(
            Order.PayoutStatus.NOT_APPLICABLE, fapshi_says_paid=fapshi_says_paid
        )
        assert order not in list(reconcile.payout_backlog())

    def test_an_unpaid_order_is_never_paid_out(self, fapshi_says_paid):
        """No money came in, so there is no share to send. Belt and braces: a
        pending order also has no ``settled_at``."""
        order = stale_order()
        assert order not in list(reconcile.payout_backlog())


@pytest.mark.django_db(transaction=True)
class TestRetryFailedPayouts:
    def test_sends_the_outstanding_payout(self, fapshi_says_paid):
        order = settled_order_with_payout(
            Order.PayoutStatus.FAILED, fapshi_says_paid=fapshi_says_paid
        )

        report = reconcile.retry_failed_payouts()

        assert report.sent == 1
        assert len(fapshi_says_paid) == 1
        order.refresh_from_db()
        assert order.payout_status == Order.PayoutStatus.SENT
        assert order.payout_reference != ""

    def test_the_amount_is_the_share_of_revenue_not_the_gross(self, fapshi_says_paid):
        """Same arithmetic as the settle path, because it is the same function.
        9800 revenue less the 5% commission, not 10000 less 5%."""
        settled_order_with_payout(
            Order.PayoutStatus.FAILED, fapshi_says_paid=fapshi_says_paid
        )

        reconcile.retry_failed_payouts()

        assert fapshi_says_paid[0]["amount"] == Decimal("9310")

    def test_an_outage_marks_it_unknown_and_stops_retrying_it(self, monkeypatch, fapshi_says_paid):
        """The dangerous branch: the payout may have gone out. One retry is a
        decision; a loop is how a merchant gets paid five times."""
        order = settled_order_with_payout(
            Order.PayoutStatus.FAILED, fapshi_says_paid=fapshi_says_paid
        )
        monkeypatch.setattr(
            fapshi,
            "payout",
            lambda **kw: (_ for _ in ()).throw(fapshi.FapshiUnavailable("dropped")),
        )

        report = reconcile.retry_failed_payouts()

        assert report.unresolved == 1
        order.refresh_from_db()
        assert order.payout_status == Order.PayoutStatus.UNKNOWN
        # And it is now out of scope for good.
        assert order not in list(reconcile.payout_backlog())

    def test_a_refusal_stays_retryable(self, monkeypatch, fapshi_says_paid):
        """Fapshi refused, so no money moved — usually a bad payout number, which
        is fixable and then worth retrying."""
        order = settled_order_with_payout(
            Order.PayoutStatus.FAILED, fapshi_says_paid=fapshi_says_paid
        )
        monkeypatch.setattr(
            fapshi,
            "payout",
            lambda **kw: (_ for _ in ()).throw(fapshi.FapshiRejected("bad number")),
        )

        report = reconcile.retry_failed_payouts()

        assert report.failed == 1
        order.refresh_from_db()
        assert order.payout_status == Order.PayoutStatus.FAILED
        assert order in list(reconcile.payout_backlog())

    def test_dry_run_moves_no_money(self, fapshi_says_paid):
        settled_order_with_payout(
            Order.PayoutStatus.FAILED, fapshi_says_paid=fapshi_says_paid
        )

        reconcile.retry_failed_payouts(dry_run=True)

        assert fapshi_says_paid == []


# ── The command ───────────────────────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
class TestCommand:
    def test_settles_a_stuck_order(self, fapshi_says_paid):
        order = stale_order()
        out = StringIO()

        call_command("reconcile_orders", stdout=out)

        assert "confirmed paid" in out.getvalue()
        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PAID

    def test_says_so_when_there_is_nothing_to_do(self, fapshi_says_paid):
        out = StringIO()
        call_command("reconcile_orders", stdout=out)
        assert "No orders are stuck pending" in out.getvalue()

    def test_dry_run_writes_nothing(self, fapshi_says_paid):
        order = stale_order()
        out = StringIO()

        call_command("reconcile_orders", "--dry-run", stdout=out)

        assert "Would settle" in out.getvalue()
        order.refresh_from_db()
        assert order.settled_at is None

    def test_older_than_zero_reaches_a_fresh_order(self, fapshi_says_paid):
        """How a backlog gets cleared by hand."""
        order = make_order()  # created just now
        out = StringIO()

        call_command("reconcile_orders", "--older-than", "0", stdout=out)

        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PAID

    def test_exits_non_zero_when_fapshi_is_unreachable(self, monkeypatch, fapshi_says_paid):
        """A cron that swallows stdout must still notice. Exiting 0 on a sweep
        that gave up on real money is how the present backlog went unseen."""
        stale_order()
        monkeypatch.setattr(
            fapshi,
            "payment_details",
            lambda trans_id: (_ for _ in ()).throw(fapshi.FapshiUnavailable("down")),
        )

        with pytest.raises(CommandError, match="could not be reached"):
            call_command("reconcile_orders", stdout=StringIO())

    def test_retry_payouts_is_a_separate_flag(self, fapshi_says_paid):
        """A plain run must never move money, whatever is in the payout backlog."""
        settled_order_with_payout(
            Order.PayoutStatus.FAILED, fapshi_says_paid=fapshi_says_paid
        )

        call_command("reconcile_orders", stdout=StringIO())

        assert fapshi_says_paid == []

    def test_retry_payouts_sends_them(self, fapshi_says_paid):
        settled_order_with_payout(
            Order.PayoutStatus.FAILED, fapshi_says_paid=fapshi_says_paid
        )
        out = StringIO()

        call_command("reconcile_orders", "--retry-payouts", stdout=out)

        assert len(fapshi_says_paid) == 1
        assert "sent 1" in out.getvalue()

    def test_retry_payouts_dry_run_lists_without_paying(self, fapshi_says_paid):
        order = settled_order_with_payout(
            Order.PayoutStatus.FAILED, fapshi_says_paid=fapshi_says_paid
        )
        out = StringIO()

        call_command("reconcile_orders", "--retry-payouts", "--dry-run", stdout=out)

        assert str(order.id) in out.getvalue()
        assert fapshi_says_paid == []


@pytest.mark.django_db(transaction=True)
class TestTask:
    """The beat entry point. Returns JSON-serialisable counts, never a report object."""

    def test_returns_counts_celery_can_serialise(self, fapshi_says_paid):
        from apps.orders import tasks

        stale_order()
        result = tasks.reconcile_pending()

        assert result == {
            "examined": 1,
            "paid": 1,
            "failed": 0,
            "still_pending": 0,
            "unreachable": 0,
        }

    def test_an_outage_does_not_raise_out_of_the_task(self, monkeypatch, fapshi_says_paid):
        """A raise would make Celery retry the whole batch, re-asking Fapshi about
        orders that answered fine — and status checks are rate-limited per
        transaction. The orders are untouched and already queued for next pass.
        """
        from apps.orders import tasks

        stale_order()
        monkeypatch.setattr(
            fapshi,
            "payment_details",
            lambda trans_id: (_ for _ in ()).throw(fapshi.FapshiUnavailable("down")),
        )

        assert tasks.reconcile_pending()["unreachable"] == 1
