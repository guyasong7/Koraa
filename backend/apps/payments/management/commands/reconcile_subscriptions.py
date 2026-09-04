"""
Settle plan payments whose Fapshi webhook never arrived.

Fapshi sends each webhook once and never retries, so a notification lost to a
deploy or a restart is lost permanently — the merchant has paid for a term and
holds a PENDING subscription. Direct-pay removed the redirect that used to cover
this by accident, so this command and the beat job that runs it are the backstop.
Celery beat runs it twice an hour in production; this is also how you run it by
hand, and how local development (no Redis) exercises it at all.

    # Safe. Asks Fapshi, writes nothing.
    python manage.py reconcile_subscriptions --dry-run

    # The scheduled behaviour: activate everything Fapshi confirms.
    python manage.py reconcile_subscriptions

    # Widen the net when clearing a known backlog.
    python manage.py reconcile_subscriptions --older-than 1 --limit 500

Nothing here moves money outward, so there is no ``--retry-payouts`` counterpart:
a plan payment comes *in*. The worst this command can do is ask Fapshi a question.

Exits non-zero when Fapshi could not be reached for one or more transactions, so
a cron that swallows output still surfaces the problem.
"""

from django.core.management.base import BaseCommand, CommandError

from apps.payments import reconcile


class Command(BaseCommand):
    help = "Settle plan payments stuck pending after a lost webhook."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help=(
                "Report what would happen without writing. Still calls Fapshi — "
                "that is the only way to know — but a status check moves no money."
            ),
        )
        parser.add_argument(
            "--older-than",
            type=int,
            default=reconcile.DEFAULT_OLDER_THAN_MINUTES,
            metavar="MINUTES",
            help=(
                "Only touch payments pending at least this long "
                f"(default {reconcile.DEFAULT_OLDER_THAN_MINUTES}). Keeps the sweep "
                "clear of the merchant's own polling, which shares Fapshi's "
                "per-transaction status budget."
            ),
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=reconcile.DEFAULT_LIMIT,
            help=(
                f"Most payments to examine in one pass (default "
                f"{reconcile.DEFAULT_LIMIT}). Oldest first, so the remainder is "
                "picked up next pass."
            ),
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        report = reconcile.reconcile_pending(
            older_than_minutes=options["older_than"],
            limit=options["limit"],
            dry_run=dry_run,
        )

        prefix = "Would settle" if dry_run else "Settled"

        if report.examined == 0:
            self.stdout.write("No plan payments are stuck pending.")
        else:
            self.stdout.write(f"{prefix} — {report.summary()}.")

            if report.activated:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"{report.activated} payment(s) confirmed"
                        + ("." if dry_run else " — those plans are now active.")
                    )
                )
            if report.failed:
                self.stdout.write(
                    f"{report.failed} payment(s) confirmed failed by Fapshi."
                )
            if report.still_pending:
                self.stdout.write(
                    f"{report.still_pending} payment(s) not approved by the "
                    "merchant yet."
                )

        # Reported whether or not anything was examined: these rows are invisible
        # to the sweep by definition, so this line is the only place they surface.
        if report.unfollowable:
            self.stdout.write(
                self.style.WARNING(
                    f"{report.unfollowable} pending subscription(s) have no "
                    "transaction id and cannot be settled automatically — Fapshi "
                    "never confirmed the charge, so one may exist for each. These "
                    "need checking against the Fapshi dashboard by hand."
                )
            )

        if report.unreachable:
            # A CommandError so the exit status is non-zero and beat logs it as a
            # failure. Nothing was changed for these and they stay in the queue for
            # the next pass, so this is a "look at me", not a rollback.
            raise CommandError(
                f"Fapshi could not be reached for {report.unreachable} payment(s); "
                "they were left untouched and will be retried on the next pass."
            )
