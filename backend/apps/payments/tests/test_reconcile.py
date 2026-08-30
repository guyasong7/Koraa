"""The sweep that finds plan payments nobody settled, and finishes them.

Why this file matters more than its size suggests: **Fapshi delivers each webhook
once and never retries.** A notification lost to a deploy, a restart or a network
blip is lost for good, and the merchant has paid for a year and holds a PENDING
subscription — permanently, unless something goes looking.

Direct-pay makes that a certainty rather than a risk. The old hosted-page flow
bounced the merchant back to ``/dashboard/billing/success``, and that return trip
triggered the only status check Koraa ever made, so the browser was the backstop by
accident. There is no return trip now: the merchant approves a prompt on their
handset and the tab they started from is the only thing watching. Close it before
approving and this sweep is the only remaining path to the plan they paid for.

So the selection query is not a detail. **A transaction this query misses is a
merchant who paid and got nothing.** ``TestSelection`` is the largest class here
for that reason.

The sweep is tested for two properties the scheduled job depends on:

* **Safe to run repeatedly and unattended.** Every write goes through
  ``settlement.settle_transaction``, so the tests assert it inherits that
  idempotency rather than re-implementing a guard of its own — running it twice
  must not extend a term twice or pay a referral bonus twice.
* **Loud about what it cannot fix.** A charge Fapshi never confirmed has no
  ``transId``, so nothing can follow it up automatically. Those are counted and
  reported, never touched, because the alternative — quiet — means real money
  sitting unresolved with nobody aware of it.
"""

from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.accounts.models import Referral
from apps.merchants.models import Merchant
from apps.payments import fapshi, reconcile, settlement, tasks
from apps.payments.models import PaymentTransaction, Plan, Subscription

from .factories import (
    age,
    make_pending_transaction,
    make_subscriber,
    make_unfollowable_subscription,
)

#: Older than ``DEFAULT_OLDER_THAN_MINUTES``, so a default-configured sweep sees it.
STALE_MINUTES = reconcile.DEFAULT_OLDER_THAN_MINUTES + 5


@pytest.fixture
def says_paid(monkeypatch):
    """Fapshi confirms the payment."""
    monkeypatch.setattr(fapshi, "payment_status", lambda trans_id: fapshi.STATUS_SUCCESSFUL)


@pytest.fixture
def says_failed(monkeypatch):
    monkeypatch.setattr(fapshi, "payment_status", lambda trans_id: fapshi.STATUS_FAILED)


@pytest.fixture
def says_pending(monkeypatch):
    monkeypatch.setattr(fapshi, "payment_status", lambda trans_id: fapshi.STATUS_PENDING)


@pytest.fixture
def unreachable(monkeypatch):
    """Fapshi cannot be reached. Never a verdict about the money."""

    def boom(trans_id):
        raise fapshi.FapshiUnavailable("connection reset")

    monkeypatch.setattr(fapshi, "payment_status", boom)


def stale(**kwargs):
    """A pending plan payment old enough for the default sweep to pick up."""
    return age(make_pending_transaction(**kwargs), minutes=STALE_MINUTES)


# ── Which payments a sweep looks at ───────────────────────────────────────────


@pytest.mark.django_db
class TestSelection:
    """A transaction this query misses is a merchant who paid and got nothing."""

    def test_finds_a_stale_pending_payment(self):
        tx = stale()

        assert tx in list(reconcile.pending_transactions())

    def test_ignores_a_payment_too_recent_to_be_stuck(self):
        """The merchant may still be approving on their handset, and their browser
        is polling — which shares Fapshi's six-per-minute-per-transaction budget.
        Fifteen minutes puts the sweep clear of the frontend's three-minute stop."""
        tx = make_pending_transaction()  # created just now

        assert tx not in list(reconcile.pending_transactions())

    def test_a_narrower_cutoff_reaches_a_recent_payment(self):
        """What ``--older-than 1`` is for when clearing a known backlog."""
        tx = age(make_pending_transaction(), minutes=2)

        assert tx in list(reconcile.pending_transactions(older_than_minutes=1))

    def test_ignores_an_already_settled_payment(self, says_paid):
        tx = stale()
        settlement.settle_transaction(tx)

        assert tx not in list(reconcile.pending_transactions())

    def test_selects_on_settled_at_not_on_status(self):
        """``settled_at`` is the marker activation honours.

        A sweep that trusted ``status`` alone could re-enter a transaction whose
        side effects had already run — extending the term twice and paying the
        referral bonus twice.
        """
        tx = stale()
        PaymentTransaction.objects.filter(pk=tx.pk).update(
            settled_at=tx.created_at, status=PaymentTransaction.Status.INITIATED
        )

        assert tx not in list(reconcile.pending_transactions())

    def test_oldest_first(self):
        """So a backlog bigger than ``--limit`` drains instead of starving."""
        older = age(make_pending_transaction(trans_id="tx-older"), minutes=STALE_MINUTES + 60)
        newer = stale(trans_id="tx-newer")

        found = list(reconcile.pending_transactions())
        assert found.index(older) < found.index(newer)

    def test_limit_is_honoured(self):
        for i in range(3):
            stale(trans_id=f"tx-{i}")

        assert len(list(reconcile.pending_transactions(limit=2))) == 2


@pytest.mark.django_db
class TestUnfollowable:
    """PENDING subscriptions with no ``transId``: possibly a debit, no way to ask.

    The residue of a charge Fapshi accepted without confirming. Nothing here can be
    settled automatically, so the only useful thing the sweep can do is count them
    accurately — an inflated number sends someone hunting through the Fapshi
    dashboard for charges that were never made.
    """

    def test_counts_a_subscription_with_no_transaction_id(self):
        sub = age(make_unfollowable_subscription(), minutes=STALE_MINUTES)

        assert sub in list(reconcile.unfollowable_subscriptions())

    def test_counts_a_subscription_whose_transaction_id_is_null(self):
        """Null and empty both occur: the column is ``blank=True, null=True`` and
        has been written both ways over its life."""
        sub = age(make_unfollowable_subscription(), minutes=STALE_MINUTES)
        Subscription.objects.filter(pk=sub.pk).update(fapshi_trans_id=None)

        assert sub in list(reconcile.unfollowable_subscriptions())

    def test_ignores_a_subscription_that_has_a_payment_to_ask_about(self):
        """That one is followable, and the other half of the sweep handles it.
        Counting it here would double-report one stuck payment."""
        tx = stale()

        assert tx.subscription not in list(reconcile.unfollowable_subscriptions())

    def test_ignores_a_subscription_that_is_no_longer_pending(self):
        sub = age(make_unfollowable_subscription(), minutes=STALE_MINUTES)
        Subscription.objects.filter(pk=sub.pk).update(
            status=Subscription.Status.CANCELLED
        )

        assert sub not in list(reconcile.unfollowable_subscriptions())

    def test_ignores_one_created_moments_ago(self):
        """The merchant may be mid-request. Their own retry is the better fix."""
        sub = make_unfollowable_subscription()

        assert sub not in list(reconcile.unfollowable_subscriptions())


# ── The sweep itself ──────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestSweep:
    """What one pass does, and what it refuses to conclude."""

    def test_activates_a_payment_fapshi_confirms(self, says_paid):
        tx = stale()

        report = reconcile.reconcile_pending()

        tx.refresh_from_db()
        tx.subscription.refresh_from_db()
        assert report.activated == 1
        assert report.examined == 1
        assert tx.status == PaymentTransaction.Status.SUCCESSFUL
        assert tx.subscription.status == Subscription.Status.ACTIVE

    def test_grants_the_tier_the_merchant_paid_for(self, says_paid):
        """The whole point. Everything else in this module is bookkeeping around
        this one write."""
        tx = stale(plan=Plan.PRO)

        reconcile.reconcile_pending()

        merchant = Merchant.objects.get(user=tx.user)
        assert merchant.tier == Plan.PRO
        assert merchant.tier_expires_at is not None

    def test_settles_a_payment_fapshi_says_did_not_happen(self, says_failed):
        tx = stale()

        report = reconcile.reconcile_pending()

        tx.refresh_from_db()
        tx.subscription.refresh_from_db()
        assert report.failed == 1
        assert tx.status == PaymentTransaction.Status.FAILED
        assert tx.subscription.status == Subscription.Status.CANCELLED

    def test_leaves_an_unapproved_payment_alone(self, says_pending):
        """Expected, not a problem: the merchant has not touched the prompt yet.
        The next pass asks again."""
        tx = stale()

        report = reconcile.reconcile_pending()

        tx.refresh_from_db()
        assert report.still_pending == 1
        assert report.settled == 0
        assert tx.settled_at is None

    def test_an_outage_changes_nothing_and_is_reported(self, unreachable):
        """Never a failure. The predecessor of this code answered "FAILED" on any
        non-200 and cancelled live subscriptions for payments that had gone
        through."""
        tx = stale()

        report = reconcile.reconcile_pending()

        tx.refresh_from_db()
        tx.subscription.refresh_from_db()
        assert report.unreachable == 1
        assert report.settled == 0
        assert tx.settled_at is None
        assert tx.status == PaymentTransaction.Status.INITIATED
        assert tx.subscription.status == Subscription.Status.PENDING

    def test_a_transaction_fapshi_has_never_heard_of_is_not_settled(self, monkeypatch):
        """A Koraa row pointing at a payment that does not exist. Not a statement
        about the money, so it may not settle the row — but it is reported, because
        it means our records and Fapshi's disagree."""

        def rejected(trans_id):
            raise fapshi.FapshiRejected("Transaction not found")

        monkeypatch.setattr(fapshi, "payment_status", rejected)
        tx = stale()

        report = reconcile.reconcile_pending()

        tx.refresh_from_db()
        assert report.unreachable == 1
        assert tx.settled_at is None

    def test_one_unreachable_payment_does_not_abandon_the_rest(self, monkeypatch):
        """A pass that stopped at the first outage would leave the backlog behind
        it unexamined for another half hour."""
        bad = stale(trans_id="tx-bad")
        good = stale(trans_id="tx-good")

        def selective(trans_id):
            if trans_id == "tx-bad":
                raise fapshi.FapshiUnavailable("connection reset")
            return fapshi.STATUS_SUCCESSFUL

        monkeypatch.setattr(fapshi, "payment_status", selective)

        report = reconcile.reconcile_pending()

        good.refresh_from_db()
        bad.refresh_from_db()
        assert report.examined == 2
        assert report.activated == 1
        assert report.unreachable == 1
        assert good.status == PaymentTransaction.Status.SUCCESSFUL
        assert bad.settled_at is None

    def test_counts_what_it_cannot_follow_up(self, says_paid):
        """Reported even when nothing else was examined: these rows are invisible
        to the sweep by definition, so the count is the only place they surface."""
        age(make_unfollowable_subscription(), minutes=STALE_MINUTES)

        report = reconcile.reconcile_pending()

        assert report.examined == 0
        assert report.unfollowable == 1

    def test_never_touches_what_it_cannot_follow_up(self, says_paid):
        """It has no ``transId``, so there is nothing to ask Fapshi — and guessing
        would mean granting a plan on no evidence of payment."""
        sub = age(make_unfollowable_subscription(), minutes=STALE_MINUTES)

        reconcile.reconcile_pending()

        sub.refresh_from_db()
        assert sub.status == Subscription.Status.PENDING
        assert Merchant.objects.get(user=sub.user).tier == Plan.FREE

    def test_the_summary_names_every_bucket(self):
        """It is what an operator reads in the Celery logs; a total that does not
        break down is not actionable."""
        summary = reconcile.ReconcileReport(
            examined=4, activated=1, failed=1, still_pending=1, unreachable=1,
            unfollowable=2,
        ).summary()

        for fragment in ("examined 4", "activated 1", "failed 1", "unreachable 1",
                         "unfollowable 2"):
            assert fragment in summary


@pytest.mark.django_db
class TestIdempotency:
    """Safe to run twice, and safe to run against a webhook or a browser poll.

    The sweep enforces none of this itself — it writes only through
    ``settlement.settle_transaction``, whose ``settled_at`` guard under
    ``select_for_update`` is the real mechanism. These tests assert it actually
    inherits that rather than working around it.
    """

    def test_a_second_pass_grants_nothing_further(self, says_paid):
        tx = stale()

        reconcile.reconcile_pending()
        first_expiry = Merchant.objects.get(user=tx.user).tier_expires_at
        second = reconcile.reconcile_pending()

        assert second.examined == 0, "re-selected a settled transaction"
        assert Merchant.objects.get(user=tx.user).tier_expires_at == first_expiry

    def test_the_referral_bonus_is_paid_once(self, says_paid):
        """It was paid twice when two callers could both activate. The bonus is 2%
        of a real payment, so a duplicate is money out of Koraa's float."""
        tx = stale()
        referrer = make_subscriber()
        referral = Referral.objects.create(referrer=referrer, referred_user=tx.user)

        reconcile.reconcile_pending()
        reconcile.reconcile_pending()

        referral.refresh_from_db()
        assert referral.status == Referral.Status.COMPLETED
        assert referral.reward_amount == int(tx.amount * 0.02)

    def test_a_sweep_after_a_browser_poll_adds_no_second_term(self, says_paid):
        """The race the ``settled_at`` lock exists for: the merchant's dashboard
        settles the payment while a sweep is mid-pass. Two activations added two
        years to a term for one payment."""
        tx = stale()
        settlement.settle_transaction(tx)  # the browser got there first
        expiry = Merchant.objects.get(user=tx.user).tier_expires_at

        # A sweep holding a stale row object, selected before the poll landed.
        report = reconcile.reconcile_pending()
        settlement.settle_transaction(tx)

        assert report.activated == 0
        assert Merchant.objects.get(user=tx.user).tier_expires_at == expiry


@pytest.mark.django_db
class TestDryRun:
    """Reports what a real pass would do, and writes nothing.

    It still calls Fapshi, because that is the only way to know — and a status
    check moves no money, which is what makes that safe.
    """

    def test_reports_the_activation_without_performing_it(self, says_paid):
        tx = stale()

        report = reconcile.reconcile_pending(dry_run=True)

        tx.refresh_from_db()
        tx.subscription.refresh_from_db()
        assert report.activated == 1
        assert tx.settled_at is None
        assert tx.subscription.status == Subscription.Status.PENDING
        assert Merchant.objects.get(user=tx.user).tier == Plan.FREE

    def test_reports_a_failure_without_cancelling(self, says_failed):
        tx = stale()

        report = reconcile.reconcile_pending(dry_run=True)

        tx.refresh_from_db()
        assert report.failed == 1
        assert tx.settled_at is None

    def test_reports_an_outage(self, unreachable):
        stale()

        assert reconcile.reconcile_pending(dry_run=True).unreachable == 1

    def test_agrees_with_a_real_pass(self, says_paid):
        """A dry run whose numbers differ from the real thing is worse than none —
        it is what someone decides to run the real pass on."""
        stale(trans_id="tx-a")
        stale(trans_id="tx-b")

        dry = reconcile.reconcile_pending(dry_run=True)
        wet = reconcile.reconcile_pending()

        assert (dry.examined, dry.activated) == (wet.examined, wet.activated)


# ── The command and the task ──────────────────────────────────────────────────


@pytest.mark.django_db
class TestCommand:
    """``manage.py reconcile_subscriptions``: the hand-run and local-dev entry point.

    Beat runs the Celery task in production, but this is how a backlog gets
    cleared by a human and the only way local development (no Redis) exercises the
    sweep at all.
    """

    def run(self, *args):
        out = StringIO()
        call_command("reconcile_subscriptions", *args, stdout=out, stderr=StringIO())
        return out.getvalue()

    def test_reports_an_activation(self, says_paid):
        stale()

        output = self.run()

        assert "Settled" in output
        assert "now active" in output

    def test_says_so_when_there_is_nothing_to_do(self, says_paid):
        assert "No plan payments are stuck pending." in self.run()

    def test_dry_run_says_it_only_would_have(self, says_paid):
        tx = stale()

        output = self.run("--dry-run")

        tx.refresh_from_db()
        assert "Would settle" in output
        assert tx.settled_at is None

    def test_older_than_widens_the_net(self, says_paid):
        tx = age(make_pending_transaction(), minutes=2)

        self.run("--older-than", "1")

        tx.refresh_from_db()
        assert tx.status == PaymentTransaction.Status.SUCCESSFUL

    def test_limit_caps_one_pass(self, says_paid):
        stale(trans_id="tx-1")
        stale(trans_id="tx-2")

        self.run("--limit", "1")

        assert PaymentTransaction.objects.filter(settled_at__isnull=True).count() == 1

    def test_warns_about_payments_it_cannot_follow_up(self, says_paid):
        age(make_unfollowable_subscription(), minutes=STALE_MINUTES)

        output = self.run()

        assert "cannot be settled automatically" in output
        assert "Fapshi dashboard" in output

    def test_exits_non_zero_when_fapshi_could_not_be_reached(self, unreachable):
        """So a cron that swallows output still surfaces it. A "look at me", not a
        rollback: nothing was changed and the rows stay queued for the next pass."""
        tx = stale()

        with pytest.raises(CommandError, match="could not be reached"):
            self.run()

        tx.refresh_from_db()
        assert tx.settled_at is None

    def test_an_outage_does_not_undo_the_work_that_succeeded(self, monkeypatch):
        """The CommandError is raised after the pass, so an activation earlier in
        the batch stands. Losing it would mean a paid merchant waiting another
        half-hour because a *different* transaction timed out."""
        good = stale(trans_id="tx-good")
        stale(trans_id="tx-bad")

        def selective(trans_id):
            if trans_id == "tx-bad":
                raise fapshi.FapshiUnavailable("connection reset")
            return fapshi.STATUS_SUCCESSFUL

        monkeypatch.setattr(fapshi, "payment_status", selective)

        with pytest.raises(CommandError):
            self.run()

        good.refresh_from_db()
        assert good.status == PaymentTransaction.Status.SUCCESSFUL


@pytest.mark.django_db
class TestTask:
    """The beat entry point. A thin wrapper, but its return value is serialised."""

    def test_returns_a_json_serialisable_summary(self, says_paid):
        """A dataclass would not survive the result backend, and the summary is
        what an operator reads in Flower."""
        stale()

        result = tasks.reconcile_pending()

        assert result == {
            "examined": 1,
            "activated": 1,
            "failed": 0,
            "still_pending": 0,
            "unreachable": 0,
            "unfollowable": 0,
        }

    def test_settles_the_payment(self, says_paid):
        tx = stale()

        tasks.reconcile_pending()

        tx.refresh_from_db()
        assert tx.status == PaymentTransaction.Status.SUCCESSFUL

    def test_an_outage_is_reported_without_raising(self, unreachable):
        """Unlike the command, the task must not raise: beat would log a traceback
        for a condition that is expected and self-healing. The count carries it,
        and the module logs a warning."""
        stale()

        assert tasks.reconcile_pending()["unreachable"] == 1
