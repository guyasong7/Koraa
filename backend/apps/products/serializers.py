"""Products serializers."""
from rest_framework import serializers
from .models import (
    Product,
    ProductFile,
    ProductImage,
    ProductVariant,
    ProductOption,
    ProductOptionValue,
)


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "image", "alt_text", "sort_order", "is_primary"]
        read_only_fields = ["id"]


class ProductFileSerializer(serializers.ModelSerializer):
    """A digital product's asset, as the merchant's dashboard sees it.

    ``file`` is write-only. The stored path is under MEDIA_ROOT and therefore
    public to anyone who has it, so the dashboard is given a name and a size to
    show and nothing that could be pasted into a browser. Buyers reach the bytes
    through a download token instead.
    """

    name = serializers.CharField(source="display_name", read_only=True)
    file = serializers.FileField(write_only=True)

    class Meta:
        model = ProductFile
        fields = ["id", "name", "label", "file", "size_bytes", "sort_order", "created_at"]
        read_only_fields = ["id", "name", "size_bytes", "created_at"]


class ProductOptionValueSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductOptionValue
        fields = ["id", "value", "sort_order"]
        read_only_fields = ["id"]


class ProductOptionSerializer(serializers.ModelSerializer):
    values = ProductOptionValueSerializer(many=True, read_only=True)

    class Meta:
        model = ProductOption
        fields = ["id", "name", "sort_order", "values"]
        read_only_fields = ["id"]


class ProductVariantSerializer(serializers.ModelSerializer):
    effective_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_in_stock = serializers.BooleanField(read_only=True)
    option_values = ProductOptionValueSerializer(many=True, read_only=True)

    class Meta:
        model = ProductVariant
        fields = [
            "id", "option_values", "price", "compare_at_price",
            "effective_price", "sku", "barcode",
            "stock_quantity", "track_inventory", "allow_backorder",
            "weight", "image", "is_default", "is_in_stock",
        ]
        read_only_fields = ["id", "effective_price", "is_in_stock"]


class ProductListSerializer(serializers.ModelSerializer):
    """Lightweight for list views."""
    primary_image = ProductImageSerializer(read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    is_on_sale = serializers.BooleanField(read_only=True)
    in_stock = serializers.BooleanField(read_only=True)
    low_stock = serializers.BooleanField(read_only=True)
    #: So the list can say "3 files" on a digital row and warn on nought,
    #: without the dashboard fetching every product's detail to find out.
    file_count = serializers.IntegerField(source="files.count", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "base_price", "compare_at_price",
            "is_on_sale", "in_stock", "low_stock", "status", "is_featured",
            "primary_image", "images", "product_type", "file_count", "created_at",
        ]
        read_only_fields = fields


class ProductDetailSerializer(serializers.ModelSerializer):
    """Full detail with images, options, variants."""
    images = ProductImageSerializer(many=True, read_only=True)
    files = ProductFileSerializer(many=True, read_only=True)
    options = ProductOptionSerializer(many=True, read_only=True)
    variants = ProductVariantSerializer(many=True, read_only=True)
    is_on_sale = serializers.BooleanField(read_only=True)
    in_stock = serializers.BooleanField(read_only=True)
    low_stock = serializers.BooleanField(read_only=True)
    is_stocked = serializers.BooleanField(read_only=True)
    # Convenience fields — read from the default (simple) variant
    sku = serializers.SerializerMethodField()
    stock_quantity = serializers.SerializerMethodField()

    def _default_variant(self, obj):
        return obj.variants.filter(is_default=True).first() or obj.variants.first()

    def get_sku(self, obj):
        v = self._default_variant(obj)
        return v.sku if v else ""

    def get_stock_quantity(self, obj):
        v = self._default_variant(obj)
        return v.stock_quantity if v else 0

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "description", "short_description",
            "product_type", "category",
            "base_price", "compare_at_price", "is_on_sale",
            "status", "is_featured", "in_stock", "low_stock", "is_stocked",
            "seo_title", "seo_description", "weight",
            "sku", "stock_quantity",
            "download_limit", "download_window_days", "accepts_enquiries",
            "images", "files", "options", "variants",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]


class ProductCreateSerializer(serializers.ModelSerializer):
    sku = serializers.CharField(write_only=True, required=False, allow_blank=True)
    stock_quantity = serializers.IntegerField(write_only=True, required=False, min_value=0)

    class Meta:
        model = Product
        fields = [
            "name", "description", "short_description", "product_type",
            "category", "base_price", "compare_at_price",
            "status", "is_featured", "seo_title", "seo_description", "weight",
            "sku", "stock_quantity",
            "download_limit", "download_window_days", "accepts_enquiries",
        ]

    def create(self, validated_data):
        sku = validated_data.pop("sku", "")
        stock_quantity = validated_data.pop("stock_quantity", 0)

        store = self.context["store"]
        product = Product.objects.create(store=store, **validated_data)

        if product.product_type == Product.ProductType.SIMPLE:
            ProductVariant.objects.create(
                product=product,
                is_default=True,
                sku=sku,
                stock_quantity=stock_quantity,
            )
        return product

    def update(self, instance, validated_data):
        sku = validated_data.pop("sku", None)
        stock_quantity = validated_data.pop("stock_quantity", None)
        
        product = super().update(instance, validated_data)
        
        if product.product_type == Product.ProductType.SIMPLE:
            variant = product.variants.filter(is_default=True).first() or product.variants.first()
            if variant:
                if sku is not None:
                    variant.sku = sku
                if stock_quantity is not None:
                    variant.stock_quantity = stock_quantity
                variant.save()
                
        return product
