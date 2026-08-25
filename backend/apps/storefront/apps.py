"""Storefront app config."""
from django.apps import AppConfig


class StorefrontConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.storefront"
    label = "storefront"
    verbose_name = "Storefront"

    def ready(self):
        # Cache invalidation for the public storefront payload. Imported here
        # rather than at module level because the receivers reference models
        # from other apps, which are not loaded yet when this module is.
        from . import signals  # noqa: F401
