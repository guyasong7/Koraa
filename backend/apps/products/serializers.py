"""Products serializers."""
from rest_framework import serializers
from .models import Product, ProductImage, ProductVariant, ProductOption, ProductOptionValue


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "image", "alt_text", "sort_order", "is_primary"]
        read_only_fields = ["id"]


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
    is_on_sale = serializers.BooleanField(read_only=True)
    in_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "base_price", "compare_at_price",
            "is_on_sale", "in_stock", "status", "is_featured",
            "primary_image", "product_type", "created_at",
        ]
        read_only_fields = fields


class ProductDetailSerializer(serializers.ModelSerializer):
    """Full detail with images, options, variants."""
    images = ProductImageSerializer(many=True, read_only=True)
    options = ProductOptionSerializer(many=True, read_only=True)
    variants = ProductVariantSerializer(many=True, read_only=True)
    is_on_sale = serializers.BooleanField(read_only=True)
    in_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "description", "short_description",
            "product_type", "category",
            "base_price", "compare_at_price", "is_on_sale",
            "status", "is_featured", "in_stock",
            "seo_title", "seo_description", "weight",
            "images", "options", "variants",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]


class ProductCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = [
            "name", "description", "short_description", "product_type",
            "category", "base_price", "compare_at_price",
            "status", "is_featured", "seo_title", "seo_description", "weight",
        ]

    def create(self, validated_data):
        store = self.context["store"]
        product = Product.objects.create(store=store, **validated_data)
        # Create default variant for simple products
        if product.product_type == Product.ProductType.SIMPLE:
            ProductVariant.objects.create(
                product=product,
                is_default=True,
                stock_quantity=0,
            )
        return product
