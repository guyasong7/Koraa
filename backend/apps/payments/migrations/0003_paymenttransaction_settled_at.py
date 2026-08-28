"""``settled_at`` on PaymentTransaction, with the same mandatory backfill.

See ``orders.0003_order_settlement_fields`` for the full reasoning. The stake
here is different but no smaller: a transaction that already activated a
subscription and looks unsettled would activate it again, adding a second year
to the term and paying the referral bonus twice — for one payment.
"""

from django.db import migrations, models


def _mark_historic_transactions_settled(apps, schema_editor):
    """Backfill ``settled_at`` on transactions that already reached a verdict.

    INITIATED rows keep a NULL marker on purpose: those are the ones still worth
    asking Fapshi about, and leaving them unmarked is what lets them settle.

    ``fapshi_status`` is left blank on these rows rather than filled from our own
    ``status``. The two are not the same thing — one is Fapshi's word, the other
    is ours — and copying ours across would put invented evidence in the field
    somebody reads when they want to know what Fapshi actually said.
    """
    PaymentTransaction = apps.get_model("payments", "PaymentTransaction")
    PaymentTransaction.objects.filter(
        status__in=["successful", "failed", "expired"], settled_at__isnull=True
    ).update(settled_at=models.F("updated_at"))


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0002_subscription_expiry_notice_sent_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="paymenttransaction",
            name="fapshi_status",
            field=models.CharField(blank=True, max_length=32),
        ),
        migrations.AddField(
            model_name="paymenttransaction",
            name="settled_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.RunPython(
            _mark_historic_transactions_settled,
            migrations.RunPython.noop,
        ),
    ]
