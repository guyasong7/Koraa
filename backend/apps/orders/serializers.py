from rest_framework import serializers
from .models import Order, OrderItem
from apps.products.models import Product
from . import invoices
from apps.payments import fapshi

class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["id", "product", "product_name", "quantity", "price"]
        read_only_fields = ["id", "price", "product_name"]

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "store", "customer_name", "customer_email", "customer_phone",
            "shipping_address", "city", "postal_code", "total_amount",
            "payment_status", "payment_link", "items", "created_at"
        ]
        read_only_fields = ["id", "payment_status", "payment_link", "total_amount", "created_at"]

class OrderItemInputSerializer(serializers.Serializer):
    """One line of an incoming cart."""
    product_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=1000, default=1)


class OrderCreateSerializer(serializers.Serializer):
    customer_name = serializers.CharField(max_length=255)
    customer_email = serializers.EmailField()
    customer_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    shipping_address = serializers.CharField()
    city = serializers.CharField(max_length=100)
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True)

    # Previously a bare list of dicts, so a missing product_id or a negative
    # quantity reached the view and either crashed it or produced a credit.
    items = OrderItemInputSerializer(many=True, allow_empty=False)

    def validate_items(self, items):
        seen = set()
        for item in items:
            pid = item["product_id"]
            if pid in seen:
                raise serializers.ValidationError(
                    "The same product appears more than once; combine the quantities."
                )
            seen.add(pid)
        return items


class OrderChargeRequestSerializer(serializers.Serializer):
    """The mobile money number to charge, for ``POST .../orders/{id}/pay/``.

    Separate from ``OrderCreateSerializer`` because charging is a separate
    request. Creating the order prices it against live product data; the shopper
    sees that authoritative total and *then* approves the charge. Collecting the
    phone number up front and charging in one step would mean a price correction
    could only ever be discovered after the money had gone.

    ``phone`` is validated here rather than in the view so a mistyped number is a
    400 with a field error against the input that caused it — before anything is
    sent to Fapshi.
    """

    phone = serializers.CharField(max_length=20)
    #: Omitted means "let Fapshi work it out from the prefix", which its own docs
    #: recommend over a caller-supplied guess. Sent only when a shopper overrode
    #: the pre-selection, so a wrong prefix table of ours cannot misroute a charge.
    medium = serializers.ChoiceField(
        choices=[(fapshi.MEDIUM_MTN, "MTN MoMo"), (fapshi.MEDIUM_ORANGE, "Orange Money")],
        required=False,
        allow_blank=True,
    )

    def validate_phone(self, raw):
        try:
            return fapshi.normalise_msisdn(raw)
        except fapshi.FapshiRejected as exc:
            # The message names what is wrong with the number and is written for a
            # shopper to read; see `normalise_msisdn`.
            raise serializers.ValidationError(str(exc)) from exc


class OrderChargeSerializer(serializers.ModelSerializer):
    """What the shopper's browser is told after a charge is requested.

    Deliberately small. This response reaches a public, unauthenticated caller,
    so it carries what the checkout needs to follow the payment and nothing that
    would help someone enumerate orders: no address, no line items, no email.

    ``charge_accepted`` is the field the frontend branches on. False means Fapshi
    never confirmed it took the request, so the charge may or may not exist — the
    one outcome that must not be reported to a shopper as a failure.
    """

    reference = serializers.SerializerMethodField()
    currency = serializers.SerializerMethodField()
    charge_accepted = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id", "reference", "total_amount", "currency",
            "payment_status", "charge_accepted",
        ]

    def get_reference(self, obj) -> str:
        return invoices.reference(obj)

    def get_currency(self, obj) -> str:
        return obj.store.currency or "XAF"

    def get_charge_accepted(self, obj) -> bool:
        # A transId exists only when Fapshi answered and accepted the charge.
        return bool(obj.fapshi_trans_id)


class OrderStatusSerializer(serializers.ModelSerializer):
    """The polling response for ``GET .../orders/{id}/status/``.

    Same reasoning as ``OrderChargeSerializer`` on what it omits, and the same
    fields, so the checkout can hand either one to the same render path.

    ``settled`` rather than ``payment_status == "paid"``: a *failed* payment is
    also settled and also final, and a browser that polls until "paid" would
    poll a failed order forever. Fapshi's own status strings never appear —
    ``payment_status`` is Koraa's vocabulary, which is what keeps the gateway
    replaceable.
    """

    reference = serializers.SerializerMethodField()
    currency = serializers.SerializerMethodField()
    settled = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id", "reference", "total_amount", "currency",
            "payment_status", "settled",
        ]

    def get_reference(self, obj) -> str:
        return invoices.reference(obj)

    def get_currency(self, obj) -> str:
        return obj.store.currency or "XAF"

    def get_settled(self, obj) -> bool:
        return obj.is_settled


# ── Merchant-facing ───────────────────────────────────────────────────────────
#
# The serializers above answer a shopper mid-checkout. These answer the
# merchant looking at what they have sold, which needs different fields: the
# reference they will quote on the phone, which of their shops the order came
# from, and its currency — a merchant with a shop in XAF and one in USD cannot
# read a column of bare numbers.


class MerchantOrderItemSerializer(serializers.ModelSerializer):
    """One sold line, as recorded at the time of sale.

    ``product`` may be null: the snapshot columns on OrderItem exist so a
    deleted product still shows what was bought and what it cost.
    """

    line_total = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = ["id", "product", "product_name", "quantity", "price", "line_total"]

    def get_line_total(self, obj) -> str:
        return str(obj.price * obj.quantity)


class MerchantOrderListSerializer(serializers.ModelSerializer):
    """A row in the merchant's order list."""

    reference = serializers.SerializerMethodField()
    store_name = serializers.CharField(source="store.name", read_only=True)
    store_slug = serializers.CharField(source="store.slug", read_only=True)
    currency = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id", "reference", "store", "store_name", "store_slug", "currency",
            "customer_name", "customer_email", "customer_phone",
            "city", "total_amount", "payment_status", "item_count", "created_at",
        ]

    def get_reference(self, obj) -> str:
        return invoices.reference(obj)

    def get_currency(self, obj) -> str:
        return obj.store.currency or "XAF"

    def get_item_count(self, obj) -> int:
        # ``item_count`` is annotated on the list queryset; the fallback keeps
        # the serializer usable on a plain instance (the invoice endpoint).
        annotated = getattr(obj, "item_count", None)
        if annotated is not None:
            return annotated
        return sum(i.quantity for i in obj.items.all())


class MerchantOrderDetailSerializer(MerchantOrderListSerializer):
    """One order, opened. Adds the lines and the delivery address."""

    items = MerchantOrderItemSerializer(many=True, read_only=True)

    class Meta(MerchantOrderListSerializer.Meta):
        fields = MerchantOrderListSerializer.Meta.fields + [
            "shipping_address", "postal_code", "payment_link",
            "fapshi_trans_id", "items", "updated_at",
        ]

