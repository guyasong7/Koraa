"""Accounts signals."""
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model

User = get_user_model()


@receiver(post_save, sender=User)
def on_user_created(sender, instance, created, **kwargs):
    """Hook for post-registration logic (e.g., welcome email, analytics event)."""
    if created:
        pass  # Future: trigger welcome email task via Celery
