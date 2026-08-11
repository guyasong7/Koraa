"""Categories serializers."""
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from .models import Category


class CategorySerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            "id", "name", "slug", "description", "image",
            "parent", "children", "sort_order", "is_visible",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_children(self, obj):
        if obj.children.exists():
            return CategorySerializer(obj.children.filter(is_visible=True), many=True).data
        return []

    def create(self, validated_data):
        store = self.context["store"]
        return Category.objects.create(store=store, **validated_data)
