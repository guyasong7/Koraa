import csv
import logging

from rest_framework import generics, permissions, status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Sum
from django.http import FileResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from . import downloads, invoices
from .models import DownloadGrant, Order, OrderItem
from .serializers import (
    MerchantOrderDetailSerializer,
    MerchantOrderListSerializer,
    OrderCreateSerializer,
    OrderSerializer,
)
from apps.stores.access import accessible_stores
from apps.stores.models import Store
from apps.products.models import Product, ProductVariant
from apps.payments.views import _initiate_fapshi_payment, _check_fapshi_status, _initiate_fapshi_payout
from apps.merchants.models import MerchantPayoutAccount
from apps.notifications.models import Notification
from drf_spectacular.utils import OpenApiParameter, extend_schema
from django.core.mail import send_mail
from django.conf import settings
from rest_framework.views import APIView

logger = logging.getLogger(__name__)

#: Share of each order Koraa keeps. The remainder is paid out to the merchant.
PLATFORM_COMMISSION_RATE = getattr(settings, "KORAA_PLATFORM_COMMISSION_RATE", 0.05)


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
    Public endpoint for placing an order on a custom storefront.
    """
    permission_classes = [permissions.AllowAny]
    serializer_class = OrderCreateSerializer

    @extend_schema(responses={201: OrderSerializer})
    def create(self, request, domain, *args, **kwargs):
        domain = domain.strip().lower()
        store = None
        
        # 1. Check StoreDomain (Custom Domains)
        from apps.domains.models import StoreDomain
        store_domain = StoreDomain.objects.filter(
            domain=domain, is_verified=True, status="active"
        ).select_related("store").first()

        if store_domain:
            store = store_domain.store
        else:
            # 2. Extract slug from Koraa subdomains (e.g. my-store.koraa.africa or my-store.localhost:3000)
            domain_without_port = domain.split(":")[0]
            slug = domain_without_port.split(".")[0]
            try:
                # Only a published store may take money. Accepting orders
                # against a draft store charged real customers on shops the
                # merchant had not launched.
                store = Store.objects.get(
                    slug=slug,
                    status=Store.Status.PUBLISHED,
                )
            except Store.DoesNotExist:
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

        # Fapshi is called after the commit: a 15-second HTTP timeout should not
        # be holding the variant row locks taken above.
        # The callback verifies using externalId = "order_" + str(order.id)
        scheme = "https" if request.is_secure() else "http"
        redirect_url = f"{scheme}://{domain}/checkout/success?order={order.id}"
        message = f"Order #{str(order.id)[:8]} at {store.name}"

        try:
            link, trans_id = _initiate_fapshi_payment(
                amount=int(total_amount),
                email=order.customer_email,
                redirect_url=redirect_url,
                external_id=f"order_{order.id}",
                message=message,
            )
            order.payment_link = link
            order.fapshi_trans_id = trans_id
            order.save(update_fields=["payment_link", "fapshi_trans_id"])
        except Exception:
            # The order is kept so the merchant can see the attempt, but the
            # failure is logged instead of silently swallowed.
            logger.exception("Fapshi initiation failed for order %s", order.id)

        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

class StorefrontOrderCallbackView(APIView):
    """
    GET /public/storefront/orders/callback/
    Fapshi webhook/callback for storefront orders.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        trans_id = request.query_params.get("transId") or request.query_params.get("trans_id")
        if not trans_id:
            return Response({"error": "transId is required."}, status=status.HTTP_400_BAD_REQUEST)

        order = get_object_or_404(Order, fapshi_trans_id=trans_id)

        if order.payment_status == Order.PaymentStatus.PAID:
            return Response({"message": "Order already paid"}, status=status.HTTP_200_OK)

        fapshi_status_str = _check_fapshi_status(trans_id)

        if fapshi_status_str in ("SUCCESSFUL", "SUCCESS"):
            order.payment_status = Order.PaymentStatus.PAID
            order.save()

            merchant = order.store.merchant

            # 1. Payout to merchant, less the platform commission. The previous
            #    version sent the full order total, so Koraa earned nothing on
            #    any sale.
            payout_accounts = MerchantPayoutAccount.objects.filter(merchant=merchant)
            if payout_accounts.exists():
                account = payout_accounts.first()
                gross = int(order.total_amount)
                commission = int(gross * PLATFORM_COMMISSION_RATE)
                net = gross - commission
                if net > 0:
                    ok = _initiate_fapshi_payout(account.phone, net)
                    if not ok:
                        logger.error(
                            "Payout of %s XAF to merchant %s failed for order %s; "
                            "settle manually",
                            net, merchant.id, order.id,
                        )
            else:
                logger.warning(
                    "Order %s paid but merchant %s has no payout account",
                    order.id, merchant.id,
                )

            # 2. In-App Notification
            Notification.objects.create(
                recipient=merchant.user,
                type=Notification.Type.ORDER_PLACED,
                title="New Order Received!",
                body=f"You received an order of {order.total_amount} XAF from {order.customer_name}.",
                data={"order_id": str(order.id)}
            )

            # 3. Email the merchant that they have a sale.
            try:
                send_mail(
                    subject=f"New Order Received: {order.store.name}",
                    message=f"You received a new order from {order.customer_name} for {order.total_amount} XAF.\n\nCheck your dashboard for details.",
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[merchant.user.email],
                    fail_silently=True,
                )
            except Exception:
                pass

            # 4. Email the shopper their invoice. Only the merchant was told
            #    anything before this; the person who had just paid got no
            #    reference, no itemised total and no record of the purchase.
            #    send_invoice never raises — the payment is already taken and
            #    the order already marked paid, so an SMTP outage must not turn
            #    this into a 500 that Fapshi then retries.
            invoices.send_invoice(order)

            # 5. Digital lines: mint the download links and email them.
            #    Separate from the invoice on purpose — the links are the
            #    product, and burying them under a line-items table is how a
            #    buyer ends up emailing the merchant to ask where their file is.
            #    Minting is idempotent, so the webhook arriving after the
            #    redirect cannot reset a buyer's download count.
            downloads.send_downloads(order)

            # 6. WhatsApp Notification Placeholder
            # TODO: Integrate Twilio or Infobip

            return Response({"message": "Payment verified and order marked as paid"}, status=status.HTTP_200_OK)
            
        elif fapshi_status_str == "FAILED":
            order.payment_status = Order.PaymentStatus.FAILED
            order.save()
            return Response({"message": "Payment failed"}, status=status.HTTP_200_OK)

        return Response({"message": f"Payment is {fapshi_status_str}"}, status=status.HTTP_200_OK)


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
