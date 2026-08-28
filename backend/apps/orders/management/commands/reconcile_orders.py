"""
Settle storefront orders whose Fapshi webhook never arrived.

Fapshi sends each webhook once and never retries, so a notification lost to a
deploy or a restart is lost permanently — the buyer has paid and has no invoice,
no download link, and the merchant has no money. This command is the backstop.
Celery beat runs it every 15 minutes in production; this is also how you run it
by hand, and how local development (no Redis) exercises it at all.

    # Safe. Asks Fapshi, writes nothing.
    python manage.py reconcile_orders --dry-run

    # The scheduled behaviour: settle everything Fapshi confirms.
    python manage.py reconcile_orders

    # Widen the net when clearing a known backlog.
    python manage.py reconcile_orders --older-than 1 --limit 500

    # Separate, and MOVES MONEY. Never scheduled.
    python manage.py reconcile_orders --retry-payouts

Exits non-zero when Fapshi could not be reached for one or more orders, so a
cron that swallows output still surfaces the problem. Exiting 0 on an unattended
sweep that gave up on real money is how the present backlog went unnoticed.
"""

from django.core.management.base import BaseCommand, CommandError

from apps.orders import reconcile


class Command(BaseCommand):
    help = "Settle storefront orders stuck pending, and optionally retry payouts."

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
                "Only touch orders pending at least this long "
                f"(default {reconcile.DEFAULT_OLDER_THAN_MINUTES}). Keeps the sweep "
                "clear of the buyer's own polling, which shares Fapshi's per-"
                "transaction status budget."
            ),
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=reconcile.DEFAULT_LIMIT,
            help=(
                f"Most orders to examine in one pass (default {reconcile.DEFAULT_LIMIT}). "
                "Oldest first, so the remainder is picked up next pass."
            ),
        )
        parser.add_argument(
            "--retry-payouts",
            action="store_true",
            help=(
                "MOVES MONEY. Re-send payouts for paid orders whose merchant "
                "payout failed or never ran. Skips payout_status=unknown, where "
                "the money may already have gone out. Do not put this on a timer."
            ),
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        if options["retry_payouts"]:
            self._retry_payouts(dry_run=dry_run, limit=options["limit"])
            return

        report = reconcile.reconcile_pending(
            older_than_minutes=options["older_than"],
            limit=options["limit"],
            dry_run=dry_run,
        )

        prefix = "Would settle" if dry_run else "Settled"
        if report.examined == 0:
            self.stdout.write("No orders are stuck pending. Nothing to do.")
            return

        self.stdout.write(
            f"{prefix} — {report.summary()}."
        )
        if report.paid:
            self.stdout.write(
                self.style.SUCCESS(
                    f"{report.paid} order(s) confirmed paid"
                    + ("." if dry_run else " — invoices, downloads and payouts sent.")
                )
            )
        if report.failed:
            self.stdout.write(f"{report.failed} order(s) confirmed failed by Fapshi.")
        if report.still_pending:
            self.stdout.write(
                f"{report.still_pending} order(s) not finished by the buyer yet."
            )

        if report.unreachable:
            # A CommandError so the exit status is non-zero and beat logs it as a
            # failure. Nothing was changed for these orders and they stay in the
            # queue for the next pass, so this is a "look at me", not a rollback.
            raise CommandError(
                f"Fapshi could not be reached for {report.unreachable} order(s); "
                "they were left untouched and will be retried on the next pass."
            )

    def _retry_payouts(self, *, dry_run: bool, limit: int):
        backlog = reconcile.payout_backlog(limit=limit)
        count = backlog.count() if hasattr(backlog, "count") else len(list(backlog))

        if count == 0:
            self.stdout.write("No merchant payouts are outstanding.")
            return

        if dry_run:
            self.stdout.write(
                f"Would attempt {count} merchant payout(s). Orders and amounts:"
            )
            for order in backlog:
                basis = (
                    order.fapshi_revenue
                    if order.fapshi_revenue is not None
                    else order.total_amount
                )
                self.stdout.write(
                    f"  {order.id}  {order.store.name}  "
                    f"basis {basis} XAF  ({order.payout_status})"
                )
            return

        self.stdout.write(
            self.style.WARNING(f"Sending {count} merchant payout(s) — real money.")
        )
        report = reconcile.retry_failed_payouts(limit=limit)
        self.stdout.write(self.style.SUCCESS(f"Payouts — {report.summary()}."))

        if report.unresolved:
            raise CommandError(
                f"{report.unresolved} payout(s) had no answer from Fapshi and may or "
                "may not have gone out. Check the Fapshi dashboard before retrying "
                "— they are now payout_status=unknown and this command will not "
                "touch them again."
            )
