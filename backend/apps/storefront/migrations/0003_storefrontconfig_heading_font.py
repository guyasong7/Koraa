"""Add StorefrontConfig.heading_font.

Existing rows get the field default (Outfit) rather than a copy of their
``font``. Every storefront created before this migration was rendered
with `.sf-d { font-family: var(--sf-font, Outfit) }` — because --sf-font
was always set, headings resolved to the row's ``font`` and the Outfit
fallback was dead code.

Backfilling ``heading_font = font`` would therefore preserve exactly what
those shops look like today. It is deliberately not done: the default
pairs Outfit headings with whatever body face the row already has, which
is the pairing that fallback was written to produce and a visible
improvement over single-face headings. Merchants who want the old look can
pick "Inter only" or "Lato only" in Blueprint.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("storefront", "0002_add_catalog_section_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="storefrontconfig",
            name="heading_font",
            field=models.CharField(
                choices=[
                    ("Inter", "Inter"),
                    ("Outfit", "Outfit"),
                    ("Poppins", "Poppins"),
                    ("Lato", "Lato"),
                    ("Raleway", "Raleway"),
                    ("Nunito", "Nunito"),
                ],
                default="Outfit",
                max_length=50,
            ),
        ),
    ]
