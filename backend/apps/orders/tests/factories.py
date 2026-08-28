"""Object factories shared by the orders test modules.

Not collected as tests: ``pytest.ini`` sets ``python_files = tests/test_*.py``, so
this file is importable but never scanned for test functions.

It exists because ``test_settlement`` and ``test_reconcile`` both need a store, a
merchant with a payout account, and a pending order — and a payout account that
drifts between the two would make one of the suites quietly stop testing the
payout path at all.
"""

import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model

from apps.merchants.models import Merchant, MerchantPayoutAccount
from apps.orders.models import Order, OrderItem
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


def make_order(
    *,
    total=Decimal("10000.00"),
    trans_id="tx-success",
    with_payout_account=True,
    digital=False,
):
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


def age_order(order, *, minutes: int):
    """Backdate ``created_at`` past a reconcile cutoff.

    ``auto_now_add`` cannot be assigned through ``save()``, so this goes through
    ``update()`` — which also avoids touching ``updated_at``.
    """
    from django.utils import timezone
    from datetime import timedelta

    Order.objects.filter(pk=order.pk).update(
        created_at=timezone.now() - timedelta(minutes=minutes)
    )
    order.refresh_from_db()
    return order
