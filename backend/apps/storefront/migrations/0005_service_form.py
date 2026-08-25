"""The service enquiry form and its submissions, plus the section that shows it.

Hand-written: ``makemigrations`` was unavailable when this shipped. Verify with
``makemigrations --check --dry-run``, which should report no changes.

``ServiceForm.fields`` defaults to an empty list rather than to
``DEFAULT_FIELDS``: a callable default in a migration is a reference to a
function that has to stay importable forever, and the model's ``save()`` seeds
the starter fields on first write instead.
"""

import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("storefront", "0004_storefrontconfig_layout"),
        ("stores", "0003_store_site_settings"),
    ]

    operations = [
        migrations.AlterField(
            model_name="storefrontsection",
            name="type",
            field=models.CharField(
                choices=[
                    ("announcement_bar", "Announcement Bar"),
                    ("navbar", "Navbar"),
                    ("hero", "Hero"),
                    ("categories", "Categories"),
                    ("featured_products", "Featured Products"),
                    ("product_grid", "Product Grid"),
                    ("catalog", "Catalog"),
                    ("promo_banner", "Promo Banner"),
                    ("about", "About"),
                    ("testimonials", "Testimonials"),
                    ("newsletter", "Newsletter"),
                    ("contact_form", "Enquiry Form"),
                    ("footer", "Footer"),
                ],
                max_length=50,
            ),
        ),
        migrations.CreateModel(
            name="ServiceForm",
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
                ("is_enabled", models.BooleanField(default=True, verbose_name="enabled")),
                (
                    "title",
                    models.CharField(
                        default="Get in touch", max_length=160, verbose_name="title"
                    ),
                ),
                (
                    "description",
                    models.TextField(
                        blank=True,
                        default="Tell us what you need and we will come back to you.",
                        verbose_name="description",
                    ),
                ),
                (
                    "submit_label",
                    models.CharField(
                        default="Send enquiry", max_length=60, verbose_name="button text"
                    ),
                ),
                (
                    "success_message",
                    models.CharField(
                        default=(
                            "Thank you — your message is on its way. We will reply "
                            "shortly."
                        ),
                        max_length=300,
                        verbose_name="success message",
                    ),
                ),
                (
                    "fields",
                    models.JSONField(blank=True, default=list, verbose_name="fields"),
                ),
                (
                    "notify_emails",
                    models.JSONField(blank=True, default=list, verbose_name="notify"),
                ),
                (
                    "send_copy_to_sender",
                    models.BooleanField(
                        default=True,
                        help_text="Email the person a copy of what they sent.",
                        verbose_name="copy the sender",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "store",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="service_form",
                        to="stores.store",
                    ),
                ),
            ],
            options={
                "verbose_name": "service form",
                "verbose_name_plural": "service forms",
            },
        ),
        migrations.CreateModel(
            name="FormSubmission",
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
                ("answers", models.JSONField(default=list, verbose_name="answers")),
                ("sender_name", models.CharField(blank=True, max_length=255)),
                ("sender_email", models.EmailField(blank=True, max_length=254)),
                ("sender_phone", models.CharField(blank=True, max_length=40)),
                ("is_read", models.BooleanField(default=False)),
                ("emailed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "form",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="submissions",
                        to="storefront.serviceform",
                    ),
                ),
                (
                    "store",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="form_submissions",
                        to="stores.store",
                    ),
                ),
            ],
            options={
                "verbose_name": "form submission",
                "verbose_name_plural": "form submissions",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="formsubmission",
            index=models.Index(
                fields=["store", "-created_at"], name="sf_submission_recent"
            ),
        ),
    ]
