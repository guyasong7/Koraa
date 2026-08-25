from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="subscription",
            name="expiry_notice_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
