"""Change Variant.stock_quantity default from 0 to 1 and backfill existing rows.

Any variant that still has stock_quantity=0 (merchant never touched it) gets
set to 1 so the product stops showing "out of stock" on the storefront.
"""

from django.db import migrations, models


def backfill_stock(apps, schema_editor):
    Variant = apps.get_model("products", "Variant")
    Variant.objects.filter(stock_quantity=0).update(stock_quantity=1)


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0002_product_files_and_delivery"),
    ]

    operations = [
        migrations.RunPython(backfill_stock, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="variant",
            name="stock_quantity",
            field=models.IntegerField(default=1, verbose_name="stock quantity"),
        ),
    ]
