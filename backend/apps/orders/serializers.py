from rest_framework import serializers
from .models import Order, OrderItem
from apps.products.models import Product
from . import invoices

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

