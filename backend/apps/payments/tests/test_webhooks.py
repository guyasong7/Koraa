"""The two webhook endpoints, and what they must resolve.

The bug at the centre of this file: ``FapshiWebhookView`` looked up
``PaymentTransaction`` and nothing else. Storefront orders keep their
``fapshi_trans_id`` on ``Order``, so every shopper's webhook fell through to
``{"status": "ignored"}`` — with a 200, which tells Fapshi the notification was
accepted and never to send it again. Combined with
``StorefrontOrderCallbackView`` being GET-only (Fapshi POSTs, so it 405'd) there
was no path at all by which a storefront order could be marked paid. That is the
whole reason no sale had ever settled.

Both endpoints are unauthenticated, and the tests below assert that stays safe:
the ``transId`` in the request is only ever used to *find* a record, and the
verdict is fetched from Fapshi outbound. A forged POST claiming success must not
be able to settle anything.
"""

import uuid
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

from apps.merchants.models import Merchant
from apps.orders.models import Order
from apps.payments import fapshi
from apps.payments.models import PaymentTransaction, Plan, Subscription
from apps.stores.models import Store

User = get_user_model()

WEBHOOK_URL = "/api/v1/payments/webhook/fapshi/"
STOREFRONT_URL = "/api/v1/public/storefront/orders/callback/"

SUCCESS = {
    "status": fapshi.STATUS_SUCCESSFUL,
    "amount": 10000,
    "revenue": 9800,
    "financialTransId": "MP240101.1234.A56789",
    "dateConfirmed": "2026-08-28T10:30:00Z",
}


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def no_network(monkeypatch):
    """Fapshi says SUCCESSFUL, and payouts are accepted without a network call."""
    monkeypatch.setattr(fapshi, "payment_details", lambda trans_id: dict(SUCCESS))
    monkeypatch.setattr(fapshi, "payment_status", lambda trans_id: fapshi.STATUS_SUCCESSFUL)
    monkeypatch.setattr(fapshi, "payout", lambda **kw: "payout-1")


def make_order(trans_id="order-tx-1"):
    suffix = uuid.uuid4().hex[:8]
    user = User.objects.create_user(
        email=f"m-{suffix}@koraa.test", full_name="Owner", password="Koraa@2024!"
    )
    merchant = Merchant.objects.create(user=user, business_name="Shop", country="CM")
    store = Store.objects.create(
        merchant=merchant, name="Shop", slug=f"shop-{suffix}", currency="XAF"
    )
    return Order.objects.create(
        store=store,
        customer_name="Buyer",
        customer_email="buyer@example.test",
        shipping_address="1 Rue",
        city="Douala",
        total_amount=Decimal("10000.00"),
        fapshi_trans_id=trans_id,
    )


def make_transaction(trans_id="sub-tx-1"):
    suffix = uuid.uuid4().hex[:8]
    user = User.objects.create_user(
        email=f"s-{suffix}@koraa.test", full_name="Subscriber", password="Koraa@2024!"
    )
    Merchant.objects.create(user=user, business_name="Sub Shop", country="CM")
    sub = Subscription.objects.create(
        user=user,
        plan=Plan.STARTER,
        status=Subscription.Status.PENDING,
        billing_cycle="yearly",
        amount_paid=50000,
        fapshi_trans_id=trans_id,
    )
    return PaymentTransaction.objects.create(
        subscription=sub,
        user=user,
        fapshi_trans_id=trans_id,
        amount=50000,
        plan=Plan.STARTER,
        billing_cycle="yearly",
    )


@pytest.mark.django_db(transaction=True)
class TestWebhookResolvesBothRecordTypes:
    """The regression: one endpoint, two kinds of payment."""

    def test_settles_a_subscription_transaction(self, client, no_network):
        tx = make_transaction()

        response = client.post(WEBHOOK_URL, {"transId": tx.fapshi_trans_id}, format="json")

        assert response.status_code == 200
        assert response.data["status"] == "activated"
        tx.refresh_from_db()
        assert tx.status == PaymentTransaction.Status.SUCCESSFUL
        assert tx.settled_at is not None

    def test_settles_a_storefront_order(self, client, no_network):
        """This is the case that used to answer "ignored" and drop the sale."""
        order = make_order()

        response = client.post(WEBHOOK_URL, {"transId": order.fapshi_trans_id}, format="json")

        assert response.status_code == 200
        assert response.data["status"] == "paid"
        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PAID

    def test_an_unknown_trans_id_is_acknowledged_not_rejected(self, client, no_network):
        """200, deliberately. A non-2xx makes Fapshi redeliver forever, and no
        amount of redelivery will make an unknown id known."""
        response = client.post(WEBHOOK_URL, {"transId": "nothing-here"}, format="json")

        assert response.status_code == 200
        assert response.data["status"] == "ignored"

    def test_a_missing_trans_id_is_a_400(self, client, no_network):
        response = client.post(WEBHOOK_URL, {}, format="json")
        assert response.status_code == 400

    def test_a_replayed_webhook_changes_nothing_the_second_time(self, client, no_network):
        order = make_order()

        first = client.post(WEBHOOK_URL, {"transId": order.fapshi_trans_id}, format="json")
        second = client.post(WEBHOOK_URL, {"transId": order.fapshi_trans_id}, format="json")

        assert first.data["status"] == "paid"
        assert second.data["status"] == "already"


@pytest.mark.django_db(transaction=True)
class TestStorefrontCallbackAcceptsPost:
    """It was GET-only, so the one caller that mattered got a 405."""

    def test_post_settles_the_order(self, client, no_network):
        order = make_order()

        response = client.post(
            STOREFRONT_URL, {"transId": order.fapshi_trans_id}, format="json"
        )

        assert response.status_code == 200
        assert response.data["status"] == "paid"

    def test_get_still_settles_the_order(self, client, no_network):
        """Kept working: a browser returning from a hosted page uses GET."""
        order = make_order()

        response = client.get(STOREFRONT_URL, {"transId": order.fapshi_trans_id})

        assert response.status_code == 200
        assert response.data["status"] == "paid"

    def test_an_unknown_order_is_acknowledged(self, client, no_network):
        response = client.post(STOREFRONT_URL, {"transId": "nothing-here"}, format="json")

        assert response.status_code == 200
        assert response.data["status"] == "ignored"


@pytest.mark.django_db(transaction=True)
class TestWebhookAuthenticityComesFromFapshi:
    """A forged POST must not be able to declare a payment successful.

    This is the property that makes an unauthenticated endpoint acceptable, so it
    is asserted rather than assumed.
    """

    def test_a_payload_claiming_success_is_ignored(self, client, monkeypatch):
        order = make_order()
        # Fapshi's actual answer: still pending.
        monkeypatch.setattr(
            fapshi, "payment_details", lambda trans_id: {"status": fapshi.STATUS_PENDING}
        )

        response = client.post(
            WEBHOOK_URL,
            {"transId": order.fapshi_trans_id, "status": "SUCCESSFUL", "amount": 999999},
            format="json",
        )

        assert response.data["status"] == "pending"
        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PENDING

    def test_an_outage_leaves_the_order_alone(self, client, monkeypatch):
        """A 200/unknown, not a failure. Money may have moved."""
        order = make_order()
        monkeypatch.setattr(
            fapshi,
            "payment_details",
            lambda trans_id: (_ for _ in ()).throw(fapshi.FapshiUnavailable("down")),
        )

        response = client.post(
            WEBHOOK_URL, {"transId": order.fapshi_trans_id}, format="json"
        )

        assert response.status_code == 200
        assert response.data["status"] == "unknown"
        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PENDING
        assert order.settled_at is None


@pytest.mark.django_db(transaction=True)
class TestWebhookSecret:
    """``x-wh-secret``, when Fapshi is configured to send one.

    Belt and braces over the outbound re-fetch, not a replacement for it — hence
    the unset case still being accepted.
    """

    @override_settings(FAPSHI_WEBHOOK_SECRET="s3cret")
    def test_a_wrong_secret_is_refused(self, client, no_network):
        order = make_order()

        response = client.post(
            WEBHOOK_URL,
            {"transId": order.fapshi_trans_id},
            format="json",
            headers={"x-wh-secret": "wrong"},
        )

        assert response.status_code == 403
        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PENDING

    @override_settings(FAPSHI_WEBHOOK_SECRET="s3cret")
    def test_the_right_secret_settles(self, client, no_network):
        order = make_order()

        response = client.post(
            WEBHOOK_URL,
            {"transId": order.fapshi_trans_id},
            format="json",
            headers={"x-wh-secret": "s3cret"},
        )

        assert response.status_code == 200
        assert response.data["status"] == "paid"

    @override_settings(FAPSHI_WEBHOOK_SECRET="s3cret")
    def test_the_storefront_callback_checks_it_too(self, client, no_network):
        order = make_order()

        response = client.post(
            STOREFRONT_URL,
            {"transId": order.fapshi_trans_id},
            format="json",
            headers={"x-wh-secret": "wrong"},
        )

        assert response.status_code == 403

    def test_no_secret_configured_still_accepts_the_webhook(self, client, no_network):
        """Enabling the secret is a deploy-time choice, not a prerequisite."""
        order = make_order()

        response = client.post(
            WEBHOOK_URL, {"transId": order.fapshi_trans_id}, format="json"
        )

        assert response.status_code == 200
