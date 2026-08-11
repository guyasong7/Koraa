"""Categories models — hierarchical, store-scoped."""
import uuid
from django.db import models
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _


class Category(models.Model):
    """
    Product category — scoped to a Store.
    Supports one level of nesting (parent → children).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(
        "stores.Store", on_delete=models.CASCADE, related_name="categories"
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="children",
    )
    name = models.CharField(_("name"), max_length=255)
    slug = models.SlugField(_("slug"), max_length=255)
    description = models.TextField(_("description"), blank=True)
    image = models.ImageField(_("image"), upload_to="categories/", blank=True, null=True)
    sort_order = models.PositiveIntegerField(_("sort order"), default=0)
    is_visible = models.BooleanField(_("visible"), default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("category")
        verbose_name_plural = _("categories")
        ordering = ["sort_order", "name"]
        unique_together = [("store", "slug")]

    def __str__(self):
        return f"{self.store.name} / {self.name}"

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)
