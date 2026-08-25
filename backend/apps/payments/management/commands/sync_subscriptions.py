"""
Run the subscription lifecycle sweeps once.

Celery beat runs these on a schedule in production. Local development has
no Redis (see ``backend/.env``), so this command is how you exercise them:

    python manage.py sync_subscriptions
    python manage.py sync_subscriptions --dry-run
"""

from django.core.management.base import BaseCommand

from apps.payments import lifecycle


class Command(BaseCommand):
    help = "Warn merchants of expiring plans and retire lapsed ones."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=lifecycle.WARNING_DAYS,
            help=f"How many days ahead to warn (default {lifecycle.WARNING_DAYS}).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would happen without writing or emailing.",
        )

    def handle(self, *args, **options):
        if options["dry_run"]:
            from datetime import timedelta

            from django.utils import timezone

            from apps.payments.models import Plan, Subscription

            now = timezone.now()
            cutoff = now + timedelta(days=options["days"])
            expiring = (
                Subscription.objects.filter(
                    status=Subscription.Status.ACTIVE,
                    expires_at__gt=now,
                    expires_at__lte=cutoff,
                    expiry_notice_sent_at__isnull=True,
                )
                .exclude(plan=Plan.FREE)
                .count()
            )
            lapsed = (
                Subscription.objects.filter(
                    status=Subscription.Status.ACTIVE, expires_at__lte=now
                )
                .exclude(plan=Plan.FREE)
                .count()
            )
            self.stdout.write(
                f"Would warn {expiring} merchant(s) and expire {lapsed} subscription(s)."
            )
            return

        warned = lifecycle.warn_expiring_subscriptions(days=options["days"])
        expired = lifecycle.expire_lapsed_subscriptions()
        self.stdout.write(
            self.style.SUCCESS(
                f"Warned {warned} merchant(s); expired {expired} subscription(s)."
            )
        )
