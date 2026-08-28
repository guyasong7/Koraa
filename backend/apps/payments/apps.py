"""Payments app configuration."""
from django.apps import AppConfig

class PaymentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.payments"
    verbose_name = "Payments"

    def ready(self):
        # Imported for the side effect of registering the checks in that module.
        # `manage.py check` will not find them otherwise.
        from . import checks  # noqa: F401
