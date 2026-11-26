# Quick Fix Guide - Migration Issues

## Issue: PaymentTransaction Migration Failing

The migration is failing because we're adding non-nullable fields to an existing model that has data.

## Solution

### Option 1: Make Fields Nullable (Recommended)

Edit `backend/apps/payments/models.py`:

```python
class PaymentTransaction(models.Model):
    # ... existing fields ...
    
    # Support both subscription and template purchases
    external_id = models.CharField(
        max_length=100, 
        db_index=True, 
        blank=True, 
        null=True,  # Allow null for existing records
        help_text="Our reference (order-123, template-uuid, etc.)"
    )
    fapshi_trans_id = models.CharField(
        max_length=100, 
        blank=True, 
        null=True,  # Already nullable
        db_index=True
    )
    fapshi_transaction_id = models.CharField(
        max_length=100, 
        blank=True, 
        null=True,  # Allow null
        help_text="Alias for fapshi_trans_id"
    )
    
    payment_link = models.URLField(blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="XAF", blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.INITIATED)
    
    # Optional fields for subscriptions
    plan = models.CharField(max_length=20, choices=Plan.choices, blank=True, null=True)
    billing_cycle = models.CharField(max_length=10, default="monthly", blank=True)
    
    # Payment provider
    provider = models.CharField(max_length=20, default="fapshi", blank=True)
    
    # Metadata for flexible use (templates, orders, etc.)
    metadata = models.JSONField(default=dict, blank=True)
```

Then run:
```bash
cd backend
python manage.py makemigrations payments
python manage.py makemigrations themes
python manage.py migrate
```

### Option 2: Fresh Migration (If No Production Data)

If you don't have important data yet:

```bash
cd backend

# Reset migrations
rm apps/payments/migrations/000*.py
rm apps/themes/migrations/0002_*.py

# Recreate from scratch
python manage.py makemigrations payments
python manage.py makemigrations themes
python manage.py migrate
```

### Option 3: Data Migration (For Production)

Create a data migration to populate existing records:

```bash
cd backend
python manage.py makemigrations --empty payments
```

Edit the generated migration file:

```python
def populate_external_ids(apps, schema_editor):
    PaymentTransaction = apps.get_model('payments', 'PaymentTransaction')
    for txn in PaymentTransaction.objects.filter(external_id__isnull=True):
        # Generate external_id from fapshi_trans_id or subscription
        if txn.fapshi_trans_id:
            txn.external_id = f"legacy-{txn.fapshi_trans_id}"
        elif txn.subscription_id:
            txn.external_id = f"sub-{txn.subscription_id}"
        else:
            txn.external_id = f"txn-{txn.id}"
        txn.save()

class Migration(migrations.Migration):
    dependencies = [
        ('payments', 'XXXX_previous_migration'),
    ]
    
    operations = [
        # Add field as nullable first
        migrations.AddField(
            model_name='paymenttransaction',
            name='external_id',
            field=models.CharField(max_length=100, null=True, blank=True),
        ),
        # Populate data
        migrations.RunPython(populate_external_ids),
        # Make non-nullable
        migrations.AlterField(
            model_name='paymenttransaction',
            name='external_id',
            field=models.CharField(max_length=100, db_index=True),
        ),
    ]
```

## Quick Commands

```bash
# Check current migrations
python manage.py showmigrations

# Check what migrations will be created
python manage.py makemigrations --dry-run

# Create migrations
python manage.py makemigrations

# Apply migrations
python manage.py migrate

# Rollback last migration (if needed)
python manage.py migrate payments 0001  # or whatever the previous number was
```

## Recommended: Option 1

For quickest setup, use **Option 1** (make fields nullable). This is production-safe and allows existing records to continue working while new template purchases use the new fields.

The nullable fields won't cause issues because:
1. New template purchases will always set `external_id`
2. Old subscription payments don't need it
3. You can query for template purchases using the metadata field

---

## After Migrations Work

1. **Test the API:**
```bash
python manage.py runserver
curl http://localhost:8000/api/v1/templates/
```

2. **Create a test template:**
```bash
python manage.py shell
>>> from apps.themes.models import Template
>>> from apps.accounts.models import User
>>> user = User.objects.first()
>>> template = Template.objects.create(
...     name="Test Template",
...     slug="test-template",
...     author=user,
...     description="Test",
...     is_free=True,
...     status="approved"
... )
```

3. **Test purchase flow:**
```bash
curl -X POST http://localhost:8000/api/v1/templates/test-template/purchase/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+237670000000"}'
```

---

## Common Errors & Fixes

### Error: "ImproperlyConfigured: Requested setting FAPSHI_API_KEY"
**Fix:** Add Fapshi credentials to your `.env`:
```
FAPSHI_API_KEY=your_key
FAPSHI_API_SECRET=your_secret
```

### Error: "cannot import name 'RevenueSplit'"
**Fix:** Make sure the model is imported in `apps/payments/models.py` (already added)

### Error: "No such table: revenue_splits"
**Fix:** Run migrations: `python manage.py migrate`

### Error: "template_purchases.transaction_id does not exist"
**Fix:** The TemplatePurchase.transaction field needs the PaymentTransaction migration first. Run payments migrations before themes migrations.

---

## Correct Migration Order

```bash
# 1. Update payment models first
python manage.py makemigrations payments

# 2. Then create themes migrations (they depend on payments)
python manage.py makemigrations themes

# 3. Apply all migrations
python manage.py migrate
```

This ensures that PaymentTransaction and RevenueSplit exist before TemplatePurchase tries to reference them.
