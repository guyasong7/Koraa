"""Site settings: one JSON column for the preferences, one column for the file.

Hand-written to match ``Store.site_settings`` and ``Store.social_image`` as
declared in ``apps/stores/models.py``. Both are additive and nullable/defaulted,
so this applies to a populated table without a rewrite pass and needs no data
migration — ``site_settings.resolved()`` fills in every default at read time, so
existing rows answer correctly with an empty dict.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("stores", "0002_store_domain_expires_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="store",
            name="site_settings",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Availability, languages, privacy, crawlers and image preferences.",
                verbose_name="site settings",
            ),
        ),
        migrations.AddField(
            model_name="store",
            name="social_image",
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to="stores/social/",
                verbose_name="social sharing image",
            ),
        ),
    ]
