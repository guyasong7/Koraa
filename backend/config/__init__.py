"""Koraa backend package — auto-configure Celery on startup."""
from .celery import app as celery_app

__all__ = ("celery_app",)
