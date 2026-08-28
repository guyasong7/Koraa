"""Settlement and payout fields on Order, plus a backfill that must not be skipped.

Every schema change here is additive and nullable, because production has live
rows and this has to apply without a window.

The one operation that is not mechanical is ``_mark_historic_orders_settled``.
``settled_at`` becomes the marker that stops an order being settled twice, and a
NULL marker reads as "never settled" — so without a backfill, every order already
sitting at PAID would look unsettled to the new code, and the first reconcile pass
would pay each of those merchants a *second* time. The backfill is the difference
between this migration being safe and it being expensive.

Historic orders get ``payout_status = UNKNOWN`` rather than PENDING for the same
reason. The old code paid the merchant and only wrote a log line, so nothing in
the database records whether that payout landed. UNKNOWN says exactly that, and
keeps those rows out of the reach of ``reconcile_orders --retry-payouts``;
PENDING would invite it to pay them all again.

Deliberately absent: the partial unique constraint on ``fapshi_trans_id``. It
belongs here, but a UniqueConstraint fails at migrate time if the table already
holds duplicates, and production could not be queried to rule that out — the only
reachable database here is the local sqlite one. A migration that might abort
half-way through a deploy is worse than a missing constraint, especially as the
real guard is ``settled_at`` read under ``select_for_update``; the constraint is
defence in depth. Add it once production has been checked:

    SELECT fapshi_trans_id, COUNT(*) FROM orders_order
    WHERE fapshi_trans_id IS NOT NULL
    GROUP BY fapshi_trans_id HAVING COUNT(*) > 1;
"""

from django.db import migrations, models


def _mark_historic_orders_settled(apps, schema_editor):
    """Backfill ``settled_at`` on orders that already reached a terminal state.

    ``updated_at`` is the closest thing to a settlement timestamp these rows
    have. It is not exact — any later write moved it — but the value only needs
    to be non-NULL and roughly right; what matters is that it is not NULL.
    """
    Order = apps.get_model("orders", "Order")

    # Paid: the buyer's money arrived. Whether the merchant's share went out is
    # genuinely unknown, hence UNKNOWN rather than a guess in either direction.
    paid = Order.objects.filter(payment_status="paid", settled_at__isnull=True)
    paid.update(settled_at=models.F("updated_at"), payout_status="unknown")

    # Failed: nothing was ever owed to anyone.
    failed = Order.objects.filter(payment_status="failed", settled_at__isnull=True)
    failed.update(settled_at=models.F("updated_at"), payout_status="not_applicable")

    # Pending rows are left with settled_at NULL on purpose: that is what makes
    # `reconcile_orders` pick them up and finish what was started.


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0002_downloadgrant"),
        ("stores", "0003_store_site_settings"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="fapshi_revenue",
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=10, null=True
            ),
        ),
        migrations.AddField(
            model_name="order",
            name="fapshi_status",
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.AddField(
            model_name="order",
            name="financial_trans_id",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="order",
            name="paid_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="order",
            name="payout_amount",
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=10, null=True
            ),
        ),
        migrations.AddField(
            model_name="order",
            name="payout_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="order",
            name="payout_error",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="order",
            name="payout_reference",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="order",
            name="payout_status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("sent", "Sent"),
                    ("failed", "Failed"),
                    ("unknown", "Unknown — verify with Fapshi"),
                    ("not_applicable", "Not applicable"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="order",
            name="settled_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddIndex(
            model_name="order",
            index=models.Index(
                fields=["payment_status", "created_at"], name="order_status_created_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="order",
            index=models.Index(
                fields=["fapshi_trans_id"], name="order_fapshi_trans_idx"
            ),
        ),
        migrations.RunPython(
            _mark_historic_orders_settled,
            # Reversing drops the columns outright, so there is nothing to undo.
            migrations.RunPython.noop,
        ),
    ]
