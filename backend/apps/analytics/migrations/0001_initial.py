"""The storefront event table.

Hand-written: ``makemigrations`` was unavailable when this shipped. Verify with
``makemigrations --check --dry-run``, which should report no changes.

The three index names are written out in ``models.py`` rather than left to
Django's hash, so they appear here as English and do not churn.
"""

import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("products", "0001_initial"),
        ("stores", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Event",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "kind",
                    models.CharField(
                        choices=[
                            ("page_view", "Page view"),
                            ("product_view", "Product view"),
                            ("add_to_cart", "Added to cart"),
                            ("checkout_start", "Started checkout"),
                            ("search", "Searched"),
                        ],
                        max_length=20,
                    ),
                ),
                ("path", models.CharField(blank=True, max_length=300, verbose_name="path")),
                (
                    "referrer",
                    models.CharField(blank=True, max_length=200, verbose_name="referrer"),
                ),
                (
                    "device",
                    models.CharField(
                        choices=[
                            ("desktop", "Desktop"),
                            ("mobile", "Mobile"),
                            ("tablet", "Tablet"),
                            ("unknown", "Unknown"),
                        ],
                        default="unknown",
                        max_length=10,
                    ),
                ),
                ("visitor", models.CharField(blank=True, max_length=64)),
                ("label", models.CharField(blank=True, max_length=200, verbose_name="label")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "product",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="analytics_events",
                        to="products.product",
                    ),
                ),
                (
                    "store",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="analytics_events",
                        to="stores.store",
                    ),
                ),
            ],
            options={
                "verbose_name": "event",
                "verbose_name_plural": "events",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="event",
            index=models.Index(fields=["store", "-created_at"], name="an_event_recent"),
        ),
        migrations.AddIndex(
            model_name="event",
            index=models.Index(fields=["store", "kind", "-created_at"], name="an_event_kind"),
        ),
        migrations.AddIndex(
            model_name="event",
            index=models.Index(fields=["store", "product"], name="an_event_product"),
        ),
    ]
