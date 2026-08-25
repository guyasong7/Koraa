"""Download grants — a paid buyer's link to a digital product's files.

Hand-written: ``makemigrations`` was unavailable when this shipped. Verify with
``makemigrations --check --dry-run``, which should report no changes.

``token`` carries ``default=apps.orders.models._mint_token``. Django serialises
that as a reference to the function, so the function must keep its name and stay
importable from ``apps.orders.models`` for this migration to replay on a fresh
database.
"""

import uuid

import django.db.models.deletion
from django.db import migrations, models

import apps.orders.models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0001_initial"),
        ("products", "0002_product_files_and_delivery"),
    ]

    operations = [
        migrations.CreateModel(
            name="DownloadGrant",
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
                ("product_name", models.CharField(max_length=255)),
                (
                    "token",
                    models.CharField(
                        default=apps.orders.models._mint_token,
                        editable=False,
                        max_length=64,
                        unique=True,
                    ),
                ),
                ("max_downloads", models.PositiveIntegerField(default=5)),
                ("download_count", models.PositiveIntegerField(default=0)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_downloaded_at", models.DateTimeField(blank=True, null=True)),
                (
                    "order",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="download_grants",
                        to="orders.order",
                    ),
                ),
                (
                    "product",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="download_grants",
                        to="products.product",
                    ),
                ),
            ],
            options={
                "verbose_name": "download grant",
                "verbose_name_plural": "download grants",
                "ordering": ["-created_at"],
                "unique_together": {("order", "product")},
            },
        ),
    ]
