"""
Template purchase payment integration with Fapshi.

Handles:
- Template purchase payments (direct pay)
- Revenue sharing (70% creator, 30% platform)
- Webhook processing
- Payment verification
"""

from decimal import Decimal, ROUND_DOWN
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.payments.fapshi import (
    direct_pay,
    payment_status,
    FapshiError,
    FapshiRejected,
    FapshiUnavailable,
)
from apps.themes.models import Template, TemplatePurchase


# Revenue sharing configuration
PLATFORM_SHARE = Decimal("0.30")  # 30% to Koraa
CREATOR_SHARE = Decimal("0.70")  # 70% to creator
MIN_TEMPLATE_PRICE = Decimal("1000.00")  # 1000 XAF minimum


class TemplatePurchaseError(Exception):
    """Template purchase error."""
    pass


def calculate_revenue_split(total_amount: Decimal) -> dict:
    """
    Calculate revenue split for template purchase.

    Args:
        total_amount: Total purchase amount

    Returns:
        dict with platform_amount, creator_amount
    """
    platform_amount = (total_amount * PLATFORM_SHARE).quantize(
        Decimal("0.01"), rounding=ROUND_DOWN
    )
    creator_amount = total_amount - platform_amount

    return {
        "platform_amount": platform_amount,
        "creator_amount": creator_amount,
        "total_amount": total_amount,
    }


def initiate_template_purchase(
    template: Template,
    user,
    phone_number: str,
    store=None
) -> dict:
    """
    Initiate Fapshi payment for template purchase.

    Args:
        template: Template being purchased
        user: User making purchase
        phone_number: User's MTN/Orange phone number
        store: Optional store this purchase is for

    Returns:
        dict with transaction info

    Raises:
        TemplatePurchaseError: If purchase fails
        FapshiError: If Fapshi request fails
    """

    # Validate
    if template.is_free:
        raise TemplatePurchaseError("This template is free - no payment needed")

    if template.price < MIN_TEMPLATE_PRICE:
        raise TemplatePurchaseError(
            f"Template price must be at least {MIN_TEMPLATE_PRICE} {template.currency}"
        )

    # Check if already purchased
    if TemplatePurchase.objects.filter(template=template, user=user).exists():
        raise TemplatePurchaseError("You already own this template")

    # Calculate amounts
    revenue_split = calculate_revenue_split(template.price)

    # Create purchase record (pending)
    purchase = TemplatePurchase.objects.create(
        template=template,
        user=user,
        store=store,
        amount_paid=template.price,
        currency=template.currency,
    )

    # Generate external reference
    external_ref = f"template-{purchase.id}"

    try:
        # Initiate Fapshi direct pay
        result = direct_pay(
            amount=template.price,
            phone_number=phone_number,
            external_id=external_ref,
            message=f"Purchase: {template.name}",
        )

        # Store transaction reference
        from apps.payments.models import PaymentTransaction

        txn = PaymentTransaction.objects.create(
            external_id=external_ref,
            fapshi_transaction_id=result.get("transId"),
            amount=template.price,
            currency=template.currency,
            status="PENDING",
            provider="fapshi",
            metadata={
                "template_id": str(template.id),
                "template_purchase_id": str(purchase.id),
                "user_id": str(user.id),
                "revenue_split": {
                    "platform": str(revenue_split["platform_amount"]),
                    "creator": str(revenue_split["creator_amount"]),
                },
            },
        )

        purchase.transaction = txn
        purchase.save(update_fields=["transaction"])

        return {
            "purchase_id": str(purchase.id),
            "transaction_id": result.get("transId"),
            "external_id": external_ref,
            "amount": float(template.price),
            "currency": template.currency,
            "status": "PENDING",
            "message": "Payment initiated. Please approve on your phone.",
        }

    except FapshiRejected as e:
        # Payment rejected - delete purchase
        purchase.delete()
        raise TemplatePurchaseError(f"Payment rejected: {e}")

    except FapshiUnavailable as e:
        # Fapshi unavailable - keep purchase as pending
        raise TemplatePurchaseError(f"Payment service temporarily unavailable: {e}")


def verify_template_purchase(purchase_id: str) -> dict:
    """
    Verify template purchase payment status.

    Args:
        purchase_id: TemplatePurchase ID

    Returns:
        dict with status info
    """
    try:
        purchase = TemplatePurchase.objects.select_related(
            "transaction", "template", "user"
        ).get(id=purchase_id)
    except TemplatePurchase.DoesNotExist:
        raise TemplatePurchaseError("Purchase not found")

    if not purchase.transaction:
        raise TemplatePurchaseError("No transaction associated with purchase")

    # Check Fapshi status
    try:
        status_data = payment_status(purchase.transaction.fapshi_transaction_id)

        new_status = status_data.get("status", "PENDING")
        purchase.transaction.status = new_status
        purchase.transaction.save(update_fields=["status", "updated_at"])

        # If successful, process revenue split
        if new_status == "SUCCESSFUL":
            _process_template_payment_success(purchase)

        return {
            "purchase_id": str(purchase.id),
            "status": new_status,
            "template": purchase.template.name,
            "amount": float(purchase.amount_paid),
        }

    except FapshiUnavailable as e:
        return {
            "purchase_id": str(purchase.id),
            "status": "UNKNOWN",
            "message": "Payment status unavailable, try again later",
        }


@transaction.atomic
def _process_template_payment_success(purchase: TemplatePurchase):
    """
    Process successful template payment.
    - Mark purchase as complete
    - Calculate and record revenue split
    - Update template stats
    """

    # Already processed?
    if purchase.transaction.metadata.get("processed"):
        return

    # Calculate revenue split
    revenue_split = calculate_revenue_split(purchase.amount_paid)

    # Create revenue split records (for future payout tracking)
    from apps.payments.models import RevenueSplit

    # Platform share
    RevenueSplit.objects.create(
        transaction=purchase.transaction,
        recipient_type="platform",
        amount=revenue_split["platform_amount"],
        currency=purchase.currency,
    )

    # Creator share
    RevenueSplit.objects.create(
        transaction=purchase.transaction,
        recipient=purchase.template.author,
        recipient_type="creator",
        amount=revenue_split["creator_amount"],
        currency=purchase.currency,
        metadata={
            "template_id": str(purchase.template.id),
            "template_name": purchase.template.name,
        },
    )

    # Update transaction metadata
    purchase.transaction.metadata["processed"] = True
    purchase.transaction.metadata["processed_at"] = timezone.now().isoformat()
    purchase.transaction.save(update_fields=["metadata"])

    # Update template stats
    Template.objects.filter(pk=purchase.template.pk).update(
        downloads=models.F("downloads") + 1
    )


def handle_template_purchase_webhook(webhook_data: dict) -> dict:
    """
    Handle Fapshi webhook for template purchase.

    Args:
        webhook_data: Webhook payload from Fapshi

    Returns:
        dict with processing result
    """
    from apps.payments.models import PaymentTransaction

    external_id = webhook_data.get("externalId")
    status = webhook_data.get("status")
    trans_id = webhook_data.get("transId")

    # Find transaction
    try:
        txn = PaymentTransaction.objects.select_related(
            "template_purchases"
        ).get(external_id=external_id)
    except PaymentTransaction.DoesNotExist:
        return {"error": "Transaction not found"}

    # Update status
    txn.status = status
    txn.fapshi_transaction_id = trans_id
    txn.save(update_fields=["status", "fapshi_transaction_id", "updated_at"])

    # Process if successful
    if status == "SUCCESSFUL":
        purchase = txn.template_purchases.first()
        if purchase:
            _process_template_payment_success(purchase)

    return {"status": "processed"}


# Import after functions are defined
from django.db import models
