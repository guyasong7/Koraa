from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0002_alter_notification_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="notification",
            name="type",
            field=models.CharField(
                choices=[
                    ("team_invite", "Team Invite"),
                    ("team_invite_accepted", "Team Invite Accepted"),
                    ("team_invite_rejected", "Team Invite Rejected"),
                    ("order_placed", "Order Placed"),
                    ("plan_expiring", "Plan Expiring"),
                    ("plan_expired", "Plan Expired"),
                    ("general", "General"),
                ],
                default="general",
                max_length=40,
            ),
        ),
    ]
