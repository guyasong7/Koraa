"""Digital-product delivery and service enquiries, on the product side.

Hand-written: ``makemigrations`` was unavailable when this shipped. It is the
same migration the autodetector would produce for ``ProductFile`` plus the three
new Product columns — verify with ``makemigrations --check --dry-run``, which
should report no changes.
"""

import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="download_limit",
            field=models.PositiveIntegerField(
                default=5,
                help_text="How many times a buyer may download. 0 means unlimited.",
                verbose_name="download limit",
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="download_window_days",
            field=models.PositiveIntegerField(
                default=30,
                help_text="How long the buyer's link stays live. 0 means forever.",
                verbose_name="download window (days)",
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="accepts_enquiries",
            field=models.BooleanField(
                default=True,
                help_text="Show an enquiry button instead of add-to-cart on this service.",
                verbose_name="accepts enquiries",
            ),
        ),
        migrations.CreateModel(
            name="ProductFile",
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
                    "file",
                    models.FileField(
                        upload_to="products/files/%Y/%m/", verbose_name="file"
                    ),
                ),
                (
                    "label",
                    models.CharField(
                        blank=True,
                        help_text="What the buyer sees. Defaults to the file name.",
                        max_length=255,
                        verbose_name="label",
                    ),
                ),
                (
                    "size_bytes",
                    models.PositiveBigIntegerField(
                        default=0, verbose_name="size in bytes"
                    ),
                ),
                (
                    "sort_order",
                    models.PositiveIntegerField(default=0, verbose_name="sort order"),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="files",
                        to="products.product",
                    ),
                ),
            ],
            options={
                "verbose_name": "product file",
                "verbose_name_plural": "product files",
                "ordering": ["sort_order", "created_at"],
            },
        ),
    ]
