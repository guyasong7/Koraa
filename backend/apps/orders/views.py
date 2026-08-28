import csv
import logging

from rest_framework import generics, permissions, status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from django.core.cache import cache
from django.db import transaction
from django.db.models import Sum
from django.http import FileResponse, StreamingHttpResponse
from django.utils import timezone
from . import downloads, invoices, settlement
from .models import DownloadGrant, Order, OrderItem
from .serializers import (
    MerchantOrderDetailSerializer,
    MerchantOrderListSerializer,
    OrderChargeRequestSerializer,
    OrderChargeSerializer,
    OrderCreateSerializer,
    OrderSerializer,
    OrderStatusSerializer,
)
from apps.stores.access import accessible_stores
from apps.stores.models import Store
from apps.products.models import Product, ProductVariant
# `_initiate_fapshi_payment`, `_check_fapshi_status` and `_initiate_fapshi_payout`
# used to be imported from `apps.payments.views` — three private functions
# reached across an app boundary. `apps.payments.fapshi` is the public seam now,
# and settlement lives in this app's own `settlement` module.
#
# `MerchantPayoutAccount`, `Notification`, `send_mail` and PLATFORM_COMMISSION_RATE
# left with it: paying and notifying the merchant is settlement's job, not a
# view's, which is what stops the webhook and the browser doing it twice.
from apps.payments import fapshi
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.views import APIView

logger = logging.getLogger(__name__)

#: Stored in ``Order.fapshi_status`` when a charge request got no answer at all.
#:
#: Not one of Fapshi's strings — every other value in that column is. It marks
#: the one state nothing can resolve automatically: Fapshi may have taken the
#: charge, but returned no ``transId``, so there is no transaction to ask about
#: and the reconcile sweep has nothing to work with. Someone has to look at the
#: Fapshi dashboard, and this is how they find the order that needs it.
UNCONFIRMED_CHARGE = "UNCONFIRMED"


class CheckoutError(Exception):
    """A cart that cannot be fulfilled — message is safe to show a shopper."""


def _price_and_reserve(store, items):
    """
    Price a cart against live product data and hold the stock.

    ``Product.in_stock`` is a Python property, not a column, so the previous
    ``Product.objects.get(..., in_stock=True)`` raised FieldError — which
    ``Product.DoesNotExist`` does not catch, making every checkout a 500.
    Availability is therefore computed from the variant rows instead.

    Rows are locked with select_for_update so two shoppers racing for the last
    unit cannot both succeed. Must be called inside a transaction.

    Digital products and services are priced but never reserved: a file can be
    sold to a thousand people and a consultation is not held in a warehouse.
    They also have no variant rows, so the "out of stock" branch below would
    have refused every one of them.

    Returns [{"product": Product, "quantity": int, "price": Decimal}].
    """
    product_ids = [i["product_id"] for i in items]

    products = {
        p.id: p
        for p in Product.objects.filter(
            id__in=product_ids, store=store, status=Product.Status.ACTIVE
        )
    }

    priced = []
    for item in items:
        product = products.get(item["product_id"])
        if product is None:
            raise CheckoutError(
                f"Product {item['product_id']} is not available in this shop."
            )

        quantity = item["quantity"]

        if not product.is_stocked:
            if product.is_service:
                # A service is quoted through the enquiry form, not bought from
                # a basket. Letting one through checkout would take money for
                # work whose scope nobody has agreed.
                raise CheckoutError(
                    f"“{product.name}” is a service — please send an enquiry instead."
                )
            # A digital product with no files is not yet sellable: the buyer
            # would pay and receive a download page with nothing on it.
            if not product.files.exists():
                raise CheckoutError(f"“{product.name}” is not available yet.")
            priced.append({
                "product": product,
                "quantity": quantity,
                "price": product.base_price,
            })
            continue

        variants = list(
            ProductVariant.objects.select_for_update()
            .filter(product=product)
            .order_by("-is_default", "created_at")
        )

        # A product with no variants has nothing to draw stock from.
        if not variants:
            raise CheckoutError(f"“{product.name}” is out of stock.")

        unlimited = any(
            (not v.track_inventory) or v.allow_backorder for v in variants
        )
        available = sum(
            v.stock_quantity for v in variants if v.track_inventory
        )

        if not unlimited and available < quantity:
            raise CheckoutError(
                f"“{product.name}” only has {max(available, 0)} left."
                if available > 0
                else f"“{product.name}” is out of stock."
            )

        if not unlimited:
            # Draw down the tracked variants in order until the line is filled.
            remaining = quantity
            for v in variants:
                if remaining <= 0:
                    break
                if not v.track_inventory:
                    continue
                take = min(v.stock_quantity, remaining)
                if take > 0:
                    v.stock_quantity -= take
                    v.save(update_fields=["stock_quantity"])
                    remaining -= take

        default_variant = next((v for v in variants if v.is_default), variants[0])
        priced.append({
            "product": product,
            "quantity": quantity,
            "price": default_variant.effective_price,
        })

    return priced

class StorefrontOrderCreateView(generics.CreateAPIView):
    """
    POST /public/storefront/{domain}/orders/

    Prices a cart against live product data, holds the stock, and records the
    order. **It does not charge anything** — that is ``StorefrontOrderChargeView``.

    Splitting the two is what lets the checkout show an authoritative total
    before the shopper approves a payment. The cart in the browser sums
    ``base_price``; the server prices the default variant's ``effective_price``,
    so the two can legitimately disagree. When the charge was part of this
    request, that disagreement could only ever surface *after* the money had
    gone. Now the shopper sees the real figure, and only then pays.

    It also makes a refused charge retryable: the shopper fixes their number and
    posts to ``/pay/`` again against the same order, instead of leaving a dead
    order behind — and another stock reservation with it — on every attempt.
    """
    permission_classes = [permissions.AllowAny]
    serializer_class = OrderCreateSerializer

    @extend_schema(responses={201: OrderSerializer})
    def create(self, request, domain, *args, **kwargs):
        store = _resolve_store(domain)
        if store is None:
            return Response({"error": "No store found for this domain."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Price, reserve stock and record the order as one unit. A CheckoutError
        # propagates out of atomic() so the rollback undoes both the order and
        # the stock it had drawn down. The previous version returned early from
        # inside atomic() — which commits — leaving an empty order behind.
        try:
            with transaction.atomic():
                priced_items = _price_and_reserve(store, data["items"])
                total_amount = sum(
                    li["price"] * li["quantity"] for li in priced_items
                )

                order = Order.objects.create(
                    store=store,
                    customer_name=data["customer_name"],
                    customer_email=data["customer_email"],
                    customer_phone=data.get("customer_phone", ""),
                    shipping_address=data["shipping_address"],
                    city=data["city"],
                    postal_code=data.get("postal_code", ""),
                    total_amount=total_amount,
                )

                OrderItem.objects.bulk_create([
                    OrderItem(
                        order=order,
                        product=li["product"],
                        product_name=li["product"].name,
                        quantity=li["quantity"],
                        price=li["price"],
                    )
                    for li in priced_items
                ])
        except CheckoutError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


class StorefrontOrderChargeView(APIView):
    """
    POST /public/storefront/orders/{order_id}/pay/  {"phone": ..., "medium": ...}

    Charges a mobile money number for an order that already exists. The shopper
    approves the charge on their handset and this browser stays where it is and
    polls ``/status/`` — there is no redirect and no hosted page, which is the
    whole reason for direct-pay in a market where the buyer is already on their
    phone.

    Unauthenticated, like the rest of checkout: a Koraa storefront has no shopper
    accounts. The order id is a ``uuid4`` and the only thing this endpoint can do
    with one is *send money to Koraa*, so a guessed id is not a way to take
    anything. It is rate-limited all the same, because each call can reach Fapshi.

    Three outcomes, and the distinction between the last two is the point:

    * **Accepted** — 201, a ``transId`` is stored, the shopper approves on their
      handset and the browser polls.
    * **Refused** — 400. Fapshi declined the request, so nothing was charged and
      nothing will be. The order stays pending and chargeable, because the usual
      cause is a number the shopper can correct.
    * **No answer** — 202 with ``charge_accepted: false``. Fapshi never confirmed,
      so **the charge may or may not exist**. This must not be shown as a failure
      and must not be retried automatically: resending would be the one way to
      take a shopper's money twice.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "checkout-pay"

    @extend_schema(
        request=OrderChargeRequestSerializer,
        responses={201: OrderChargeSerializer, 202: OrderChargeSerializer},
    )
    def post(self, request, order_id):
        try:
            order = Order.objects.select_related("store").get(pk=order_id)
        except Order.DoesNotExist:
            raise NotFound("No such order.")

        serializer = OrderChargeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data["phone"]
        medium = serializer.validated_data.get("medium") or None

        conflict = self._existing_payment_conflict(order)
        if conflict is not None:
            return conflict

        message = f"Order #{str(order.id)[:8]} at {order.store.name}"
        try:
            trans_id = fapshi.direct_pay(
                amount=order.total_amount,
                phone=phone,
                # `external_ref` requires [a-zA-Z0-9-_], and a bare uuid satisfies
                # it. The old `order_{id}` prefix bought nothing and cost the
                # webhook a string-slicing step to undo.
                external_id=str(order.id),
                name=order.customer_name,
                email=order.customer_email,
                message=message,
                medium=medium,
            )
        except fapshi.FapshiRejected as exc:
            # Nothing was charged. Left pending and chargeable so the shopper can
            # correct their number and try again on this same order.
            logger.warning("Fapshi refused the charge for order %s: %s", order.id, exc)
            return Response(
                {
                    "error": str(exc),
                    "order_id": str(order.id),
                    "charge_accepted": False,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except fapshi.FapshiUnavailable:
            # The dangerous branch. Fapshi may have taken the charge before the
            # connection died, so this is neither a success nor a failure. There
            # is no transId, so nothing can follow it up automatically — which is
            # exactly why it is recorded loudly and marked for a human.
            logger.exception(
                "Fapshi gave no answer charging order %s — the charge may exist", order.id
            )
            Order.objects.filter(pk=order.pk, settled_at__isnull=True).update(
                fapshi_status=UNCONFIRMED_CHARGE
            )
            order.refresh_from_db(fields=["fapshi_status"])
            return Response(
                OrderChargeSerializer(order).data, status=status.HTTP_202_ACCEPTED
            )

        Order.objects.filter(pk=order.pk).update(fapshi_trans_id=trans_id)
        order.refresh_from_db(fields=["fapshi_trans_id"])
        return Response(
            OrderChargeSerializer(order).data, status=status.HTTP_201_CREATED
        )

    def _existing_payment_conflict(self, order):
        """Refuse a second charge on an order that already has one in flight.

        Returns a 409 response, or None when charging is safe.

        The check costs a Fapshi status call, and only on a retry — a first
        charge has no ``fapshi_trans_id`` to ask about. Worth it: the alternative
        is deciding from a possibly-stale local row whether a shopper is about to
        be charged twice for one basket.
        """
        if order.settled_at:
            return Response(
                {
                    "error": "This order has already been settled.",
                    "order_id": str(order.id),
                    "payment_status": order.payment_status,
                },
                status=status.HTTP_409_CONFLICT,
            )

        if not order.fapshi_trans_id:
            return None

        result = settlement.settle_order(order.id)

        if result in (settlement.PAID, settlement.ALREADY):
            return Response(
                {
                    "error": "This order has already been paid.",
                    "order_id": str(order.id),
                    "payment_status": Order.PaymentStatus.PAID,
                },
                status=status.HTTP_409_CONFLICT,
            )

        if result == settlement.PENDING:
            return Response(
                {
                    "error": (
                        "A payment for this order is already waiting for your "
                        "approval. Check your phone for the prompt — please do "
                        "not start another one."
                    ),
                    "order_id": str(order.id),
                    "payment_status": order.payment_status,
                },
                status=status.HTTP_409_CONFLICT,
            )

        if result == settlement.UNKNOWN:
            # Fapshi could not be reached, so whether the previous attempt is
            # live is unknown. Charging again could take the money twice.
            return Response(
                {
                    "error": (
                        "We cannot reach the payment provider to check your "
                        "previous attempt. Please wait a moment and try again."
                    ),
                    "order_id": str(order.id),
                    "payment_status": order.payment_status,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # settlement.FAILED: the previous charge is dead and a new one is safe.
        # `settled_at` is now set, so clear it along with the spent transId —
        # this order is being given a second attempt, not un-settled.
        Order.objects.filter(pk=order.pk).update(
            settled_at=None,
            fapshi_trans_id=None,
            fapshi_status="",
            payment_status=Order.PaymentStatus.PENDING,
            payout_status=Order.PayoutStatus.PENDING,
        )
        order.refresh_from_db()
        return None


class StorefrontOrderStatusView(APIView):
    """
    GET /public/storefront/orders/{order_id}/status/

    What the checkout polls while the shopper approves the charge on their
    handset. Returns Koraa's own ``payment_status``, never Fapshi's.

    Unauthenticated, and safe on the same grounds as the charge endpoint: the id
    is a ``uuid4``, and the response carries no address, no email and no line
    items — only what a shopper watching their own payment needs.

    Two things keep this from becoming a way to hammer Fapshi with a guessed id:

    * A settled order answers from the stored row. The state is final, so there
      is nothing to ask about.
    * An unsettled one asks Fapshi at most once every
      ``STATUS_MIN_INTERVAL_SECONDS``, across all callers, through a cache gate.
      Fapshi allows six status calls a minute *per transaction* and answers a
      seventh with 429. The browser may poll Koraa as often as it likes; this is
      what stops that reaching Fapshi.

    The gate is per-process on LocMem and shared on Redis. Production requires
    Redis (``production.py`` refuses to boot without it), so the shared case is
    the real one — and a 429 slipping through anyway is harmless: Fapshi's rate
    limit surfaces as ``FapshiRateLimited``, a ``FapshiUnavailable``, which every
    settle path treats as "change nothing and ask again later".
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    #: Generously rated on purpose. A shopper's browser makes roughly two dozen
    #: calls over the three minutes it waits, and the default `anon` scope
    #: (100/hour, counted per IP) would cut off a handful of shoppers sharing a
    #: mobile carrier's NAT mid-payment. The Fapshi gate above is the real limit;
    #: this one only stops a script from spinning.
    throttle_scope = "order-status"

    @extend_schema(responses={200: OrderStatusSerializer})
    def get(self, request, order_id):
        try:
            order = Order.objects.select_related("store").get(pk=order_id)
        except Order.DoesNotExist:
            raise NotFound("No such order.")

        if not order.settled_at and order.fapshi_trans_id:
            gate = f"fapshi:status-gate:{order.fapshi_trans_id}"
            # `add` writes only when the key is absent, and does so atomically —
            # so exactly one caller per interval gets through, however many are
            # polling this order at once.
            if cache.add(gate, 1, timeout=fapshi.STATUS_MIN_INTERVAL_SECONDS):
                settlement.settle_order(order.id)
                order.refresh_from_db()

        return Response(OrderStatusSerializer(order).data, status=status.HTTP_200_OK)


def _resolve_store(domain: str):
    """The storefront a checkout request is for, or None.

    A custom verified domain first, then a Koraa subdomain's slug. Only a
    published store is returned: accepting orders against a draft store charged
    real customers on shops the merchant had not launched.
    """
    domain = (domain or "").strip().lower()

    from apps.domains.models import StoreDomain

    store_domain = (
        StoreDomain.objects.filter(domain=domain, is_verified=True, status="active")
        .select_related("store")
        .first()
    )
    if store_domain:
        return store_domain.store

    # e.g. my-store.koraa.africa, or my-store.localhost:3000 in development.
    slug = domain.split(":")[0].split(".")[0]
    return Store.objects.filter(slug=slug, status=Store.Status.PUBLISHED).first()


class StorefrontOrderCallbackView(APIView):
    """Fapshi's word on a storefront order, however it reaches us.

    Accepts **GET and POST**. It was GET-only, which mattered more than it looks:
    Fapshi's webhook POSTs, so the one caller that would have settled orders
    without a browser present got a 405 — and since nothing else called this view
    at all, no storefront order had ever been marked paid.

    Unauthenticated on purpose, and safe for the same reason
    ``FapshiWebhookView`` is: the ``transId`` in the request is a hint used only
    to find the order, and the outcome is then fetched from Fapshi directly. A
    forged request cannot declare a payment successful; at worst it makes Koraa
    re-ask Fapshi about a payment that already exists.

    All the real work — the lock, the payout, the emails, the download grants —
    is in ``apps.orders.settlement``, so this view and the webhook and the
    reconcile command cannot drift apart in how they settle.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        return self._settle(request)

    def post(self, request):
        return self._settle(request)

    def _settle(self, request):
        trans_id = (
            request.data.get("transId")
            or request.data.get("trans_id")
            or request.query_params.get("transId")
            or request.query_params.get("trans_id")
        )
        if not trans_id:
            return Response({"error": "transId is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Fapshi's webhook secret, when one is configured. Belt and braces only —
        # the outbound re-fetch is what makes this endpoint trustworthy, so a
        # missing secret is not treated as an attack.
        if not fapshi.webhook_secret_ok(request.headers.get("x-wh-secret")):
            logger.warning("Storefront callback for %s had a bad webhook secret", trans_id)
            return Response({"error": "Invalid signature."}, status=status.HTTP_403_FORBIDDEN)

        order = Order.objects.filter(fapshi_trans_id=trans_id).order_by("created_at").first()
        if order is None:
            # 200, not 404. Fapshi redelivers on a non-2xx and no amount of
            # retrying will make an unknown transId known — but it may belong to
            # a *subscription*, which the payments webhook handles, so this is
            # logged at info rather than raised as an alarm.
            logger.info("Storefront callback for unknown order transId %s", trans_id)
            return Response({"status": "ignored"}, status=status.HTTP_200_OK)

        result = settlement.settle_order(order.id)
        return Response(
            {"status": result, "order_id": str(order.id)}, status=status.HTTP_200_OK
        )


# ── Merchant-facing ───────────────────────────────────────────────────────────
#
# Everything above is the shopper's side of an order. Nothing existed for the
# merchant's side: the dashboard's Orders page had no endpoint to call, and the
# only way to see a sale was the Django admin. These views are that endpoint,
# plus the CSV the merchant takes to their accountant and a way to re-send an
# invoice a shopper says never arrived.
#
# Scoping goes through ``accessible_stores`` — the same helper products and
# storefront design use — so a teammate invited to one shop sees that shop's
# orders and nothing else.


class MerchantOrderQuerysetMixin:
    """Orders belonging to shops the caller may open.

    Shared by the list and the export so a filtered list and the CSV of that
    same filtered list can never disagree about what is in scope.
    """

    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = {
        "store": ["exact"],
        "payment_status": ["exact"],
        "created_at": ["gte", "lte", "date"],
    }
    search_fields = ["customer_name", "customer_email", "customer_phone", "city"]
    ordering_fields = ["created_at", "total_amount", "payment_status"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return (
            Order.objects.filter(store__in=accessible_stores(self.request.user))
            .select_related("store")
            .prefetch_related("items")
            .annotate(item_count=Sum("items__quantity"))
        )


class MerchantOrderListView(MerchantOrderQuerysetMixin, generics.ListAPIView):
    """GET /orders/ — the merchant's orders across every shop they can reach."""

    serializer_class = MerchantOrderListSerializer


class MerchantOrderDetailView(MerchantOrderQuerysetMixin, generics.RetrieveAPIView):
    """GET /orders/{id}/ — one order with its lines and delivery address."""

    serializer_class = MerchantOrderDetailSerializer


class _Echo:
    """A file-like object that returns what it is asked to write.

    ``csv.writer`` wants something with ``write``; a StreamingHttpResponse
    wants an iterable of strings. This is the hinge between them, so an export
    of ten thousand orders never assembles the whole file in memory.
    """

    def write(self, value):
        return value


#: Characters Excel and LibreOffice treat as the start of a formula. Customer
#: names and addresses come from a public checkout form, so a shopper called
#: ``=cmd|' /c calc'!A1`` would otherwise be executing on the merchant's
#: machine the moment they double-click the export.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _csv_safe(value) -> str:
    text = "" if value is None else str(value)
    if text.startswith(_FORMULA_PREFIXES):
        return "'" + text
    return text


CSV_COLUMNS = [
    "Reference", "Date", "Store", "Customer", "Email", "Phone",
    "Address", "City", "Postal code", "Items", "Units",
    "Total", "Currency", "Payment status", "Payment reference",
]


def _csv_row(order) -> list:
    items = list(order.items.all())
    return [
        _csv_safe(invoices.reference(order)),
        timezone.localtime(order.created_at).strftime("%Y-%m-%d %H:%M"),
        _csv_safe(order.store.name),
        _csv_safe(order.customer_name),
        _csv_safe(order.customer_email),
        _csv_safe(order.customer_phone),
        # Newlines inside a quoted CSV field are legal but make the file
        # awkward to read in a spreadsheet, so the address is flattened.
        _csv_safe(" / ".join(p.strip() for p in order.shipping_address.splitlines() if p.strip())),
        _csv_safe(order.city),
        _csv_safe(order.postal_code),
        _csv_safe("; ".join(f"{i.quantity} x {i.product_name}" for i in items)),
        sum(i.quantity for i in items),
        order.total_amount,
        order.store.currency or "XAF",
        order.get_payment_status_display(),
        _csv_safe(order.fapshi_trans_id),
    ]


class MerchantOrderExportView(MerchantOrderQuerysetMixin, generics.ListAPIView):
    """GET /orders/export/ — the current order list as a CSV download.

    Subclasses the list view rather than reimplementing it so every filter,
    search term and ordering the dashboard can apply to the table applies
    unchanged to the file. Pagination is switched off: an export of page one
    of an order book is not an export.
    """

    serializer_class = MerchantOrderListSerializer
    pagination_class = None

    @extend_schema(
        responses={(200, "text/csv"): {"type": "string", "format": "binary"}},
        parameters=[
            OpenApiParameter(
                "store", str, description="Limit the export to one store (UUID)."
            ),
            OpenApiParameter(
                "payment_status", str, description="pending, paid or failed."
            ),
        ],
    )
    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        writer = csv.writer(_Echo())

        def rows():
            yield writer.writerow(CSV_COLUMNS)
            # .iterator() would drop the prefetch, so items are fetched in
            # batches instead — an order book is per-merchant, not per-platform.
            for order in queryset:
                yield writer.writerow(_csv_row(order))

        stamp = timezone.localdate().isoformat()
        response = StreamingHttpResponse(rows(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="koraa-orders-{stamp}.csv"'
        return response


class MerchantOrderInvoiceView(APIView):
    """POST /orders/{id}/invoice/ — re-send the shopper their invoice.

    The paid callback already sends one. This is for the shopper who says it
    never arrived, or whose address had a typo the merchant has since fixed —
    a deliberate action, which is why nothing here is de-duplicated.
    """

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses={200: None})
    def post(self, request, pk):
        order = (
            Order.objects.filter(store__in=accessible_stores(request.user))
            .select_related("store")
            .prefetch_related("items")
            .filter(pk=pk)
            .first()
        )
        if order is None:
            raise NotFound("Order not found.")

        if not order.customer_email:
            return Response(
                {"detail": "This order has no customer email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sent = invoices.send_invoice(order)
        if not sent:
            return Response(
                {"detail": "The invoice could not be sent. Please try again shortly."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"sent": True, "to": order.customer_email})


class MerchantOrderDownloadsView(APIView):
    """POST /orders/{id}/downloads/ — re-send the buyer their download links.

    The counterpart to re-sending an invoice, and needed more often: a lost
    download email is a lost purchase, and the buyer has no account to sign into
    to find it again. Re-sending does not mint new grants or reset the count —
    it emails the same links, so a buyer who has used all five downloads is not
    quietly given five more.
    """

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses={200: None})
    def post(self, request, pk):
        order = (
            Order.objects.filter(store__in=accessible_stores(request.user))
            .select_related("store")
            .prefetch_related("items__product")
            .filter(pk=pk)
            .first()
        )
        if order is None:
            raise NotFound("Order not found.")

        if order.payment_status != Order.PaymentStatus.PAID:
            return Response(
                {"detail": "This order has not been paid, so there is nothing to send."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not downloads.digital_items(order):
            return Response(
                {"detail": "This order has no digital products."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not order.customer_email:
            return Response(
                {"detail": "This order has no customer email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not downloads.send_downloads(order):
            return Response(
                {"detail": "The links could not be sent. Please try again shortly."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"sent": True, "to": order.customer_email})


# ── Digital delivery, buyer-facing ────────────────────────────────────────────
#
# Both views are unauthenticated by design. A Koraa storefront has no shopper
# accounts, so the token in the URL is the credential: it was emailed to the
# address that paid, it is 256 bits of ``secrets`` output, and it carries its own
# expiry and download count.
#
# Neither view is throttled by scope. The token is unguessable, so there is no
# brute-force surface to rate-limit, and throttling a buyer who is re-trying a
# download on a bad connection would cost them a purchase.


def _grant_or_404(token: str) -> DownloadGrant:
    grant = (
        DownloadGrant.objects
        .select_related("order", "order__store", "product")
        .filter(token=token)
        .first()
    )
    if grant is None:
        # Deliberately the same answer as an expired token would give from the
        # buyer's point of view — nothing here confirms whether a token ever
        # existed.
        raise NotFound("This download link is not valid.")
    return grant


def _grant_state(grant: DownloadGrant) -> str:
    if grant.is_expired:
        return "expired"
    if grant.is_exhausted:
        return "exhausted"
    return "ready"


class PublicDownloadView(APIView):
    """
    GET /public/download/{token}/

    What the buyer's download page renders: the shop's identity, the product,
    and one entry per file. Returns 200 for an expired or used-up grant with
    ``state`` saying which, because the page has something worth showing in both
    cases — the merchant's contact details, so the buyer can ask.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request, token):
        grant = _grant_or_404(token)
        store = grant.order.store
        files = list(grant.product.files.all()) if grant.product else []

        return Response({
            "state": _grant_state(grant),
            "product_name": grant.product_name,
            "reference": invoices.reference(grant.order),
            "purchased_at": grant.order.created_at,
            "downloads_remaining": grant.downloads_remaining,
            "expires_at": grant.expires_at,
            "store": {
                "name": store.name,
                "slug": store.slug,
                "url": store.storefront_url,
                "email": store.email,
                "phone": store.phone,
                "logo": request.build_absolute_uri(store.logo.url) if store.logo else None,
                "primary_color": getattr(
                    getattr(store, "storefront_config", None), "primary_color", "#7c3aed"
                ),
            },
            "files": [
                {
                    "id": str(f.id),
                    "name": f.display_name,
                    "size_bytes": f.size_bytes,
                    # The file itself is fetched through the token, never from a
                    # media URL: MEDIA_ROOT is served publicly, so a direct link
                    # would work forever for anyone who saw it once.
                    "url": f"/api/v1/public/download/{grant.token}/files/{f.id}/",
                }
                for f in files
            ],
        })


class PublicDownloadFileView(APIView):
    """
    GET /public/download/{token}/files/{file_id}/

    Streams one file and counts it against the grant. The count is incremented
    before the response is handed back rather than after: a partial download the
    buyer retries is far more common than a merchant complaining that a failed
    transfer was counted, and counting after the stream finishes needs a hook
    that does not exist here.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request, token, file_id):
        grant = _grant_or_404(token)

        if grant.is_expired:
            return Response(
                {"detail": "This download link has expired.", "state": "expired"},
                status=status.HTTP_410_GONE,
            )
        if grant.is_exhausted:
            return Response(
                {
                    "detail": "This link has been used the maximum number of times.",
                    "state": "exhausted",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if grant.product is None:
            return Response(
                {"detail": "This product is no longer available.", "state": "gone"},
                status=status.HTTP_410_GONE,
            )

        product_file = grant.product.files.filter(pk=file_id).first()
        if product_file is None or not product_file.file:
            raise NotFound("That file is not part of this purchase.")

        try:
            handle = product_file.file.open("rb")
        except (FileNotFoundError, OSError):
            # The row exists but the bytes do not — a storage migration gone
            # wrong, most likely. The buyer must not be charged a download for
            # the platform's mistake.
            logger.exception(
                "Missing file for product file %s (grant %s)", product_file.id, grant.id
            )
            return Response(
                {"detail": "This file could not be found. Please contact the shop."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        grant.record_download()

        response = FileResponse(
            handle, as_attachment=True, filename=product_file.display_name
        )
        # Nothing about a paid download belongs in a shared cache.
        response["Cache-Control"] = "private, no-store"
        return response
