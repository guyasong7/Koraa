"""Checkout over Fapshi direct-pay: create the order, charge, poll.

What changed and why these tests exist
--------------------------------------

Checkout used to create the order and immediately call ``initiate-pay``, then
hand the browser a hosted-page URL to redirect to. Three things were wrong with
that, and all three are what this file pins down:

1. **A failed initiation returned 201.** The client cleared the cart and rendered
   "Order Placed!" off a response whose ``payment_link`` was null. The shopper
   believed they had bought something. So: a refused charge is a 4xx, and the one
   outcome that is neither success nor failure — Fapshi never answered — has its
   own status code and its own flag, and must never read as either.

2. **The charge and the pricing happened in one request.** The browser's cart sums
   ``base_price``; the server prices the default variant's ``effective_price``.
   They can legitimately differ, and the shopper could only ever find out after
   their money had gone. Creating an order no longer charges: the shopper is shown
   the authoritative total, and ``/pay/`` is a second, deliberate request.

3. **Nothing stopped a second charge.** With no guard, a shopper who pressed the
   button twice — or retried after a slow response — paid twice for one basket.
   ``_existing_payment_conflict`` is that guard and ``TestSecondCharge`` is the
   reason it is written the way it is.

The polling endpoint is public and unauthenticated, so it is tested for what it
*refuses* to do as much as what it returns: no customer data in the response, and
no unbounded path from "poll faster" to "call Fapshi again" — Fapshi allows six
status calls a minute per transaction and answers a seventh with 429.
"""

import uuid
from decimal import Decimal

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.orders.models import Order
from apps.orders.views import UNCONFIRMED_CHARGE
from apps.payments import fapshi
from apps.products.models import Product, ProductVariant
from apps.stores.models import Store

from .factories import SUCCESS, make_order

PAY_URL = "/api/v1/public/storefront/orders/{}/pay/"
STATUS_URL = "/api/v1/public/storefront/orders/{}/status/"
CREATE_URL = "/api/v1/public/storefront/{}/orders/"

#: A number Fapshi's own sandbox documents as always succeeding, so the fixtures
#: read as a real charge rather than a made-up string.
PHONE = "670000001"

#: Distinct from ``factories.make_order``'s buyer, so "did this request create an
#: order?" can be asked by counting rather than by diffing.
SHOPPER = "shopper@example.test"


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture(autouse=True)
def clean_cache():
    """Throttle counters and the Fapshi status gate both live in the cache.

    LocMem persists for the life of the process, so without this a test that
    polls would inherit the previous test's gate key and silently skip its Fapshi
    call — and the twelfth charge in the file would start getting 429s.
    """
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def charged(monkeypatch):
    """``direct_pay`` succeeds. Returns the list of calls made to it."""
    calls = []

    def fake_direct_pay(**kwargs):
        calls.append(kwargs)
        return f"tx-charge-{len(calls)}"

    monkeypatch.setattr(fapshi, "direct_pay", fake_direct_pay)
    return calls


@pytest.fixture
def settles(monkeypatch):
    """Fapshi confirms the payment and accepts payouts, without a network call."""
    monkeypatch.setattr(fapshi, "payment_details", lambda trans_id: dict(SUCCESS))
    monkeypatch.setattr(fapshi, "payout", lambda **kw: "payout-1")


def published_store_with_product(*, price=Decimal("2500.00"), stock=5):
    """A published shop with one stocked, active product ready to buy."""
    suffix = uuid.uuid4().hex[:8]
    order = make_order()  # reuse the merchant/store/payout scaffolding
    store = order.store
    Store.objects.filter(pk=store.pk).update(status=Store.Status.PUBLISHED)
    store.refresh_from_db()

    product = Product.objects.create(
        store=store,
        name="A Kettle",
        slug=f"kettle-{suffix}",
        product_type=Product.ProductType.SIMPLE,
        base_price=price,
        status=Product.Status.ACTIVE,
    )
    ProductVariant.objects.create(
        product=product, price=price, stock_quantity=stock, is_default=True
    )
    return store, product


def cart_payload(product, *, quantity=1):
    return {
        "customer_name": "A Buyer",
        "customer_email": SHOPPER,
        "shipping_address": "1 Rue de la Paix",
        "city": "Douala",
        "items": [{"product_id": str(product.id), "quantity": quantity}],
    }


# ── Creating an order does not charge ─────────────────────────────────────────


@pytest.mark.django_db
class TestCreateOrder:
    """The split that lets a shopper see the real total before paying."""

    def test_creates_a_pending_order_without_charging(self, client, charged):
        store, product = published_store_with_product()

        response = client.post(
            CREATE_URL.format(f"{store.slug}.localhost:3000"),
            cart_payload(product),
            format="json",
        )

        assert response.status_code == 201
        order = Order.objects.get(pk=response.data["id"])
        assert order.payment_status == Order.PaymentStatus.PENDING
        assert not order.fapshi_trans_id
        # The whole point: no money was asked for by creating an order.
        assert charged == []

    def test_returns_the_server_priced_total(self, client, charged):
        """What the review step shows. The cart's own sum is only an estimate."""
        store, product = published_store_with_product(price=Decimal("2500.00"))

        response = client.post(
            CREATE_URL.format(f"{store.slug}.localhost:3000"),
            cart_payload(product, quantity=3),
            format="json",
        )

        assert Decimal(response.data["total_amount"]) == Decimal("7500.00")

    def test_a_variant_price_beats_the_base_price(self, client, charged):
        """The disagreement this split exists to surface.

        The browser sums ``base_price``; the charge is built from the variant's
        ``effective_price``. A shopper must be shown the second one.
        """
        store, product = published_store_with_product(price=Decimal("2500.00"))
        product.variants.update(price=Decimal("3000.00"))

        response = client.post(
            CREATE_URL.format(f"{store.slug}.localhost:3000"),
            cart_payload(product),
            format="json",
        )

        assert Decimal(response.data["total_amount"]) == Decimal("3000.00")

    def test_a_draft_shop_cannot_take_an_order(self, client, charged):
        """It charged real customers on shops the merchant had not launched."""
        store, product = published_store_with_product()
        Store.objects.filter(pk=store.pk).update(status=Store.Status.DRAFT)

        response = client.post(
            CREATE_URL.format(f"{store.slug}.localhost:3000"),
            cart_payload(product),
            format="json",
        )

        assert response.status_code == 404
        assert Order.objects.filter(customer_email=SHOPPER).count() == 0

    def test_an_unavailable_product_is_refused_and_creates_nothing(self, client, charged):
        store, product = published_store_with_product(stock=1)

        response = client.post(
            CREATE_URL.format(f"{store.slug}.localhost:3000"),
            cart_payload(product, quantity=5),
            format="json",
        )

        assert response.status_code == 400
        assert Order.objects.filter(customer_email=SHOPPER).count() == 0


# ── Charging ──────────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestCharge:
    def test_accepts_a_charge_and_stores_the_transaction(self, client, charged):
        order = make_order(trans_id=None)

        response = client.post(
            PAY_URL.format(order.id), {"phone": PHONE}, format="json"
        )

        assert response.status_code == 201
        assert response.data["charge_accepted"] is True
        order.refresh_from_db()
        assert order.fapshi_trans_id == "tx-charge-1"
        assert order.payment_status == Order.PaymentStatus.PENDING

    def test_charges_the_order_total_not_a_client_figure(self, client, charged):
        """The amount is read off the order, so a tampered request cannot lower it."""
        order = make_order(total=Decimal("7500.00"), trans_id=None)

        client.post(
            PAY_URL.format(order.id),
            {"phone": PHONE, "amount": 1, "total_amount": 1},
            format="json",
        )

        assert charged[0]["amount"] == Decimal("7500.00")

    def test_carries_the_order_id_as_the_reconciliation_reference(self, client, charged):
        order = make_order(trans_id=None)

        client.post(PAY_URL.format(order.id), {"phone": PHONE}, format="json")

        assert charged[0]["external_id"] == str(order.id)

    def test_a_normalised_number_reaches_fapshi(self, client, charged):
        order = make_order(trans_id=None)

        client.post(
            PAY_URL.format(order.id), {"phone": "+237 6 70 00 00 01"}, format="json"
        )

        assert charged[0]["phone"] == "670000001"

    def test_a_bad_number_is_a_field_error_and_never_reaches_fapshi(self, client, charged):
        order = make_order(trans_id=None)

        response = client.post(
            PAY_URL.format(order.id), {"phone": "12345"}, format="json"
        )

        assert response.status_code == 400
        assert "phone" in response.data
        assert charged == []

    def test_no_medium_is_sent_when_none_was_chosen(self, client, charged):
        """Fapshi's own instruction is to omit it and let it auto-detect, which
        beats a prefix table of ours."""
        order = make_order(trans_id=None)

        client.post(PAY_URL.format(order.id), {"phone": PHONE}, format="json")

        assert not charged[0]["medium"]

    def test_an_explicit_medium_is_honoured(self, client, charged):
        order = make_order(trans_id=None)

        client.post(
            PAY_URL.format(order.id),
            {"phone": PHONE, "medium": fapshi.MEDIUM_ORANGE},
            format="json",
        )

        assert charged[0]["medium"] == fapshi.MEDIUM_ORANGE

    def test_an_invented_medium_is_refused(self, client, charged):
        order = make_order(trans_id=None)

        response = client.post(
            PAY_URL.format(order.id),
            {"phone": PHONE, "medium": "bitcoin"},
            format="json",
        )

        assert response.status_code == 400
        assert charged == []

    def test_an_unknown_order_is_a_404(self, client, charged):
        response = client.post(
            PAY_URL.format(uuid.uuid4()), {"phone": PHONE}, format="json"
        )

        assert response.status_code == 404
        assert charged == []


@pytest.mark.django_db
class TestChargeRefused:
    """Fapshi declined. Nothing was charged, and the order stays chargeable."""

    @pytest.fixture(autouse=True)
    def refuses(self, monkeypatch):
        monkeypatch.setattr(
            fapshi,
            "direct_pay",
            lambda **kw: (_ for _ in ()).throw(
                fapshi.FapshiRejected("The number you entered is not registered.")
            ),
        )

    def test_answers_with_an_error_not_a_created_order(self, client):
        """The fake-success bug: this used to be a 201 the client read as done."""
        order = make_order(trans_id=None)

        response = client.post(
            PAY_URL.format(order.id), {"phone": PHONE}, format="json"
        )

        assert response.status_code == 400
        assert response.data["charge_accepted"] is False
        assert "not registered" in response.data["error"]

    def test_the_order_can_still_be_paid(self, client, monkeypatch):
        """A refusal is usually a mistyped number, so the shopper must be able to
        correct it against the same order rather than restart the basket."""
        order = make_order(trans_id=None)

        client.post(PAY_URL.format(order.id), {"phone": PHONE}, format="json")

        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PENDING
        assert order.settled_at is None
        assert not order.fapshi_trans_id

        monkeypatch.setattr(fapshi, "direct_pay", lambda **kw: "tx-second-try")
        retry = client.post(
            PAY_URL.format(order.id), {"phone": "677777777"}, format="json"
        )

        assert retry.status_code == 201
        order.refresh_from_db()
        assert order.fapshi_trans_id == "tx-second-try"


@pytest.mark.django_db
class TestChargeUnanswered:
    """Fapshi never answered. The charge may or may not exist.

    The single most delicate branch in checkout. Reporting failure would tell a
    shopper whose money did move that it did not; retrying automatically would
    take it twice. So it reports neither, and marks the order for a human.
    """

    @pytest.fixture(autouse=True)
    def times_out(self, monkeypatch):
        monkeypatch.setattr(
            fapshi,
            "direct_pay",
            lambda **kw: (_ for _ in ()).throw(fapshi.FapshiUnavailable("timed out")),
        )

    def test_is_not_reported_as_a_failure(self, client):
        order = make_order(trans_id=None)

        response = client.post(
            PAY_URL.format(order.id), {"phone": PHONE}, format="json"
        )

        assert response.status_code == 202
        assert response.data["charge_accepted"] is False
        assert response.data["payment_status"] == Order.PaymentStatus.PENDING

    def test_marks_the_order_for_a_human(self, client):
        """There is no transId, so no sweep can resolve this one. Someone has to
        read the Fapshi dashboard, and this is how they find the order."""
        order = make_order(trans_id=None)

        client.post(PAY_URL.format(order.id), {"phone": PHONE}, format="json")

        order.refresh_from_db()
        assert order.fapshi_status == UNCONFIRMED_CHARGE
        assert order.settled_at is None

    def test_does_not_invent_a_transaction(self, client):
        order = make_order(trans_id=None)

        client.post(PAY_URL.format(order.id), {"phone": PHONE}, format="json")

        order.refresh_from_db()
        assert not order.fapshi_trans_id


@pytest.mark.django_db(transaction=True)
class TestSecondCharge:
    """What stops one basket being paid for twice.

    Every branch here is a 409 or a 503 rather than a second charge, except the
    one where Fapshi has confirmed the first attempt is dead.
    """

    def test_a_settled_order_is_refused(self, client, charged, settles):
        order = make_order()
        from apps.orders import settlement

        settlement.settle_order(order.id)
        charged.clear()

        response = client.post(
            PAY_URL.format(order.id), {"phone": PHONE}, format="json"
        )

        assert response.status_code == 409
        assert charged == []

    def test_a_charge_still_awaiting_approval_is_not_stacked(
        self, client, charged, monkeypatch
    ):
        """The double-tap. The shopper has a prompt open on their handset."""
        order = make_order(trans_id="tx-in-flight")
        monkeypatch.setattr(
            fapshi,
            "payment_details",
            lambda trans_id: {"status": fapshi.STATUS_PENDING},
        )

        response = client.post(
            PAY_URL.format(order.id), {"phone": PHONE}, format="json"
        )

        assert response.status_code == 409
        assert "waiting for your approval" in response.data["error"]
        assert charged == []

    def test_a_payment_that_has_since_succeeded_is_refused_and_settled(
        self, client, charged, settles
    ):
        """The re-check is not just a guard — it settles an order whose webhook
        was lost, so the shopper pressing "pay" again gets their receipt."""
        order = make_order(trans_id="tx-already-paid")

        response = client.post(
            PAY_URL.format(order.id), {"phone": PHONE}, format="json"
        )

        assert response.status_code == 409
        assert charged == []
        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PAID

    def test_a_confirmed_dead_charge_may_be_retried(self, client, charged, monkeypatch):
        """Fapshi says the first attempt failed, so a new one cannot double-charge.

        The order is given a clean slate rather than left settled-and-failed:
        this is a second attempt at one basket, not an un-settling of a payment.
        """
        order = make_order(trans_id="tx-dead")
        monkeypatch.setattr(
            fapshi, "payment_details", lambda trans_id: {"status": fapshi.STATUS_FAILED}
        )

        response = client.post(
            PAY_URL.format(order.id), {"phone": PHONE}, format="json"
        )

        assert response.status_code == 201
        assert len(charged) == 1
        order.refresh_from_db()
        assert order.fapshi_trans_id == "tx-charge-1"
        assert order.payment_status == Order.PaymentStatus.PENDING
        assert order.settled_at is None

    def test_an_unreachable_fapshi_refuses_rather_than_risk_it(
        self, client, charged, monkeypatch
    ):
        """Whether the first charge is live is unknown, so a second one could take
        the money twice. Refused, and retryable in a moment."""
        order = make_order(trans_id="tx-unclear")
        monkeypatch.setattr(
            fapshi,
            "payment_details",
            lambda trans_id: (_ for _ in ()).throw(fapshi.FapshiUnavailable("down")),
        )

        response = client.post(
            PAY_URL.format(order.id), {"phone": PHONE}, format="json"
        )

        assert response.status_code == 503
        assert charged == []
        order.refresh_from_db()
        assert order.payment_status == Order.PaymentStatus.PENDING


# ── Polling ───────────────────────────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
class TestStatus:
    def test_reports_a_pending_payment(self, client, monkeypatch):
        order = make_order()
        monkeypatch.setattr(
            fapshi, "payment_details", lambda trans_id: {"status": fapshi.STATUS_PENDING}
        )

        response = client.get(STATUS_URL.format(order.id))

        assert response.status_code == 200
        assert response.data["payment_status"] == Order.PaymentStatus.PENDING
        assert response.data["settled"] is False

    def test_settles_a_payment_whose_webhook_never_arrived(self, client, settles):
        """Polling is not only a read. Fapshi delivers each webhook once and never
        retries, so the browser asking is often the first Koraa hears of it."""
        order = make_order()

        response = client.get(STATUS_URL.format(order.id))

        assert response.data["payment_status"] == Order.PaymentStatus.PAID
        assert response.data["settled"] is True

    def test_a_failed_payment_reads_as_settled(self, client, monkeypatch):
        """``settled`` rather than "is it paid": a browser polling until PAID would
        poll a failed order until its timeout for no reason."""
        order = make_order()
        monkeypatch.setattr(
            fapshi, "payment_details", lambda trans_id: {"status": fapshi.STATUS_FAILED}
        )

        response = client.get(STATUS_URL.format(order.id))

        assert response.data["payment_status"] == Order.PaymentStatus.FAILED
        assert response.data["settled"] is True

    def test_an_unknown_order_is_a_404(self, client):
        assert client.get(STATUS_URL.format(uuid.uuid4())).status_code == 404

    def test_carries_the_total_and_currency_for_the_receipt(self, client, settles):
        order = make_order(total=Decimal("7500.00"))

        response = client.get(STATUS_URL.format(order.id))

        assert Decimal(response.data["total_amount"]) == Decimal("7500.00")
        assert response.data["currency"] == "XAF"
        assert response.data["reference"]


@pytest.mark.django_db(transaction=True)
class TestStatusLeaksNothing:
    """The endpoint is public and the id is the only thing guarding it.

    A uuid4 is not enumerable, but the response still carries only what a shopper
    watching their own payment needs — so a leaked link is not also a leak of the
    buyer's address and email.
    """

    def test_no_customer_details_in_the_response(self, client, settles):
        order = make_order()

        body = client.get(STATUS_URL.format(order.id)).data

        for field in ("customer_email", "customer_name", "customer_phone",
                      "shipping_address", "city", "items"):
            assert field not in body

    def test_no_fapshi_vocabulary_in_the_response(self, client, settles):
        """Fapshi's status strings stay inside the backend, which is what keeps
        the gateway replaceable without changing the frontend."""
        order = make_order()

        body = client.get(STATUS_URL.format(order.id)).data

        assert "fapshi_status" not in body
        assert "fapshi_trans_id" not in body
        assert fapshi.STATUS_SUCCESSFUL not in str(body)


@pytest.mark.django_db(transaction=True)
class TestStatusPacesFapshi:
    """Fapshi allows six status calls a minute per transaction, then 429s.

    The browser polls Koraa every two seconds. Nothing about that may reach
    Fapshi at the same rate.
    """

    def test_repeated_polling_asks_fapshi_once_per_interval(self, client, monkeypatch):
        order = make_order()
        calls = []

        def counted(trans_id):
            calls.append(trans_id)
            return {"status": fapshi.STATUS_PENDING}

        monkeypatch.setattr(fapshi, "payment_details", counted)

        for _ in range(6):
            assert client.get(STATUS_URL.format(order.id)).status_code == 200

        assert len(calls) == 1

    def test_the_gate_opens_again_after_the_interval(self, client, monkeypatch):
        order = make_order()
        calls = []
        monkeypatch.setattr(
            fapshi,
            "payment_details",
            lambda trans_id: (calls.append(trans_id), {"status": fapshi.STATUS_PENDING})[1],
        )

        client.get(STATUS_URL.format(order.id))
        # Rather than sleeping ten seconds: drop the gate the way its expiry would.
        cache.delete(f"fapshi:status-gate:{order.fapshi_trans_id}")
        client.get(STATUS_URL.format(order.id))

        assert len(calls) == 2

    def test_a_settled_order_never_asks_fapshi(self, client, monkeypatch, settles):
        """The state is final, so there is nothing to ask — and this is what stops
        a guessed order id being a way to spend someone's rate limit."""
        order = make_order()
        client.get(STATUS_URL.format(order.id))  # settles it
        cache.clear()

        def boom(trans_id):
            raise AssertionError("asked Fapshi about a settled order")

        monkeypatch.setattr(fapshi, "payment_details", boom)

        response = client.get(STATUS_URL.format(order.id))

        assert response.data["settled"] is True

    def test_an_order_with_no_charge_never_asks_fapshi(self, client, monkeypatch):
        order = make_order(trans_id=None)
        monkeypatch.setattr(
            fapshi,
            "payment_details",
            lambda trans_id: (_ for _ in ()).throw(
                AssertionError("asked Fapshi about an uncharged order")
            ),
        )

        response = client.get(STATUS_URL.format(order.id))

        assert response.data["payment_status"] == Order.PaymentStatus.PENDING
        assert response.data["settled"] is False


@pytest.mark.django_db
class TestHostedPageIsGone:
    """direct-pay replaced the redirect, and the redirect must not come back.

    ``/checkout/success`` never existed as a page, so every shopper Fapshi
    redirected landed on a 404 with their money gone. Removing the redirect is
    what makes that unreachable rather than a page still to be written.
    """

    def test_creating_an_order_asks_for_no_hosted_page(self, client, monkeypatch):
        store, product = published_store_with_product()
        monkeypatch.setattr(
            fapshi,
            "initiate_pay",
            lambda **kw: (_ for _ in ()).throw(
                AssertionError("checkout called initiate-pay")
            ),
        )

        response = client.post(
            CREATE_URL.format(f"{store.slug}.localhost:3000"),
            cart_payload(product),
            format="json",
        )

        assert response.status_code == 201

    def test_no_payment_link_is_handed_to_the_browser(self, client, charged):
        order = make_order(trans_id=None)

        client.post(PAY_URL.format(order.id), {"phone": PHONE}, format="json")

        order.refresh_from_db()
        assert not order.payment_link
