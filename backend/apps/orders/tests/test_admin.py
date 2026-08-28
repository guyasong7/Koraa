"""The orders admin — specifically, what its actions refuse to do.

There was no admin for orders at all, so a payment that went wrong could only be
touched from a Django shell. That is why the pending backlog sat there: not
because nobody noticed, but because noticing led nowhere.

These tests cover the two properties that make the actions safe to hand to a
support operator:

* **"Re-check payment with Fapshi" cannot fabricate a payment.** It is the
  replacement for the obvious-and-wrong "mark as paid" button, and it settles only
  what Fapshi confirms.
* **"Retry merchant payout" refuses ``payout_status=unknown``.** That guard is
  written out again in the action rather than delegating wholesale to
  ``reconcile``, so it gets its own test — a duplicated guard that drifts is worse
  than no guard, because it looks covered.

Plus the credential property: ``DownloadGrant.token`` is a bearer token, and it
must not appear in any admin list, field, or search term, because all three end up
in logs that outlive the grant.
"""

import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.messages.storage.fallback import FallbackStorage
from django.test import RequestFactory

from apps.orders.admin import DownloadGrantAdmin, OrderAdmin
from apps.orders.models import DownloadGrant, Order
from apps.payments import fapshi

from .factories import SUCCESS, make_order


@pytest.fixture
def order_admin():
    return OrderAdmin(Order, AdminSite())


@pytest.fixture
def grant_admin():
    return DownloadGrantAdmin(DownloadGrant, AdminSite())


@pytest.fixture
def request_with_messages(db, django_user_model):
    """An admin request that can collect ``message_user`` calls."""
    request = RequestFactory().post("/admin/orders/order/")
    request.user = django_user_model.objects.create_superuser(
        email="admin@koraa.test", full_name="Admin", password="Koraa@2024!"
    )
    request.session = {}
    request._messages = FallbackStorage(request)
    return request


@pytest.fixture
def paid(monkeypatch):
    calls = []

    def fake_payout(*, phone, amount, external_id):
        calls.append({"phone": phone, "amount": amount, "external_id": external_id})
        return f"payout-{len(calls)}"

    monkeypatch.setattr(fapshi, "payment_details", lambda trans_id: dict(SUCCESS))
    monkeypatch.setattr(fapshi, "payout", fake_payout)
    return calls


@pytest.mark.django_db(transaction=True)
class TestRecheckPayment:
    def test_settles_a_payment_fapshi_confirms(self, order_admin, request_with_messages, paid):
        order = make_order()

        order_admin.recheck_payment(
            request_with_messages, Order.objects.filter(pk=order.pk)
        )

        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PAID

    def test_cannot_fabricate_a_payment(self, order_admin, request_with_messages, monkeypatch):
        """The reason there is no "mark as paid" action. Fapshi says pending, so
        the order stays pending however many times the button is pressed."""
        order = make_order()
        monkeypatch.setattr(
            fapshi, "payment_details", lambda trans_id: {"status": fapshi.STATUS_PENDING}
        )

        order_admin.recheck_payment(
            request_with_messages, Order.objects.filter(pk=order.pk)
        )

        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PENDING
        assert order.settled_at is None

    def test_is_safe_to_run_on_an_already_settled_order(
        self, order_admin, request_with_messages, paid
    ):
        """Support will press it twice. It must not pay the merchant twice."""
        order = make_order()

        for _ in range(2):
            order_admin.recheck_payment(
                request_with_messages, Order.objects.filter(pk=order.pk)
            )

        assert len(paid) == 1

    def test_an_outage_leaves_the_order_alone(
        self, order_admin, request_with_messages, monkeypatch
    ):
        order = make_order()
        monkeypatch.setattr(
            fapshi,
            "payment_details",
            lambda trans_id: (_ for _ in ()).throw(fapshi.FapshiUnavailable("down")),
        )

        order_admin.recheck_payment(
            request_with_messages, Order.objects.filter(pk=order.pk)
        )

        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PENDING


@pytest.mark.django_db(transaction=True)
class TestRetryPayout:
    """The action that moves money, and the four selections it must refuse."""

    def _settled(self, payout_status, paid):
        from apps.orders import settlement

        order = make_order()
        settlement.settle_order(order.id)
        Order.objects.filter(pk=order.pk).update(payout_status=payout_status)
        paid.clear()
        order.refresh_from_db()
        return order

    def test_retries_a_failed_payout(self, order_admin, request_with_messages, paid):
        order = self._settled(Order.PayoutStatus.FAILED, paid)

        order_admin.retry_payout(request_with_messages, Order.objects.filter(pk=order.pk))

        assert len(paid) == 1
        order.refresh_from_db()
        assert order.payout_status == Order.PayoutStatus.SENT

    def test_refuses_an_unknown_payout(self, order_admin, request_with_messages, paid):
        """The one that would pay a merchant twice. Fapshi accepted the payout and
        never answered, and its payout endpoint has no idempotency key."""
        order = self._settled(Order.PayoutStatus.UNKNOWN, paid)

        order_admin.retry_payout(request_with_messages, Order.objects.filter(pk=order.pk))

        assert paid == []
        order.refresh_from_db()
        assert order.payout_status == Order.PayoutStatus.UNKNOWN

    def test_refuses_an_already_sent_payout(self, order_admin, request_with_messages, paid):
        order = self._settled(Order.PayoutStatus.SENT, paid)

        order_admin.retry_payout(request_with_messages, Order.objects.filter(pk=order.pk))

        assert paid == []

    def test_refuses_an_unpaid_order(self, order_admin, request_with_messages, paid):
        """No money came in, so there is no share to send out."""
        order = make_order()

        order_admin.retry_payout(request_with_messages, Order.objects.filter(pk=order.pk))

        assert paid == []

    def test_pays_the_eligible_and_skips_the_rest_in_one_selection(
        self, order_admin, request_with_messages, paid
    ):
        """Support selects a page of rows, not a curated set."""
        eligible = self._settled(Order.PayoutStatus.FAILED, paid)
        refused = self._settled(Order.PayoutStatus.UNKNOWN, paid)

        order_admin.retry_payout(
            request_with_messages,
            Order.objects.filter(pk__in=[eligible.pk, refused.pk]),
        )

        assert len(paid) == 1
        assert paid[0]["external_id"] == str(eligible.id)


@pytest.mark.django_db
class TestNoHandMadeRecords:
    """Orders come from checkout and grants from settlement, never from a form.

    A hand-made order has no payment behind it, and every downstream step —
    invoice, download grant, payout — assumes one exists.
    """

    def test_orders_cannot_be_added(self, order_admin, rf):
        assert order_admin.has_add_permission(rf.get("/")) is False

    def test_grants_cannot_be_added(self, grant_admin, rf):
        assert grant_admin.has_add_permission(rf.get("/")) is False


@pytest.mark.django_db
class TestTokenIsNeverExposed:
    """``DownloadGrant.token`` is a bearer credential.

    Anyone holding it can download the file. Admin list columns, form fields and
    search terms all reach the server log, and a token in a log outlives the grant
    it belongs to.
    """

    def test_not_in_the_list_columns(self, grant_admin):
        assert "token" not in grant_admin.list_display

    def test_not_in_the_form_fields(self, grant_admin):
        assert "token" not in grant_admin.fields

    def test_not_searchable(self, grant_admin):
        assert not any("token" in field for field in grant_admin.search_fields)

    def test_the_status_column_reports_presence_only(self, grant_admin):
        order = make_order(digital=True)
        Order.objects.filter(pk=order.pk).update(
            payment_status=Order.PaymentStatus.PAID, settled_at=order.created_at
        )
        order.refresh_from_db()
        from apps.orders import downloads

        downloads.send_downloads(order)
        grant = DownloadGrant.objects.get(order=order)

        rendered = str(grant_admin.token_status(grant))

        assert grant.token not in rendered
        assert "hidden" in rendered

    def test_the_token_is_not_in_the_grant_repr(self):
        """``__str__`` reaches log lines and the admin history table."""
        order = make_order(digital=True)
        grant = DownloadGrant.objects.create(
            order=order, product_name="An Ebook", max_downloads=5
        )

        assert grant.token not in str(grant)
