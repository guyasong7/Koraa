# Generated migration

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('stores', '0006_discountcode'),
        ('themes', '0002_template_templatepurchase_templatereview_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='store',
            name='template_applied',
            field=models.ForeignKey(
                blank=True,
                help_text='The marketplace template currently applied to this store',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='stores_using',
                to='themes.template'
            ),
        ),
    ]
