"""
Order invoices — the document a shopper gets after paying.

Koraa sends the *merchant* an email when an order is paid, and sent the
shopper nothing at all: no confirmation, no reference, no record of what
they had bought or what they had been charged. This module is that record.

An invoice is built from the ``OrderItem`` snapshot rows rather than from
the products they point at, because a shopper's invoice must not change
when the merchant edits a price next week. ``OrderItem`` already keeps
``product_name`` and ``price`` for exactly that reason; a deleted product
leaves the line intact.

It is deliberately two-branded. The storefront's own logo leads — the
shopper bought from that shop, not from Koraa — with Koraa's mark in the
footer as the platform that carried it. A shop with no logo uploaded gets
its name set as type instead, which is the same fallback the storefront
navbar makes.

Sending is idempotent from the caller's point of view but not recorded: the
paid callback sends once, and the merchant can resend from the dashboard,
which is a deliberate action rather than a duplicate.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from .models import Order

logger = logging.getLogger(__name__)


def absolute_media(url: str) -> str:
    """An absolute URL for something a mail client has to fetch.

    ``MEDIA_URL`` is relative in development, so ``store.logo.url`` comes
    back as ``/media/stores/logos/x.png`` — which resolves against the mail
    client's own origin and renders as a broken image. On S3 the URL is
    already absolute and is returned untouched.

    Public because the download email needs the same fix for the same logo.
    """
    if not url:
        return ""
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return f"{settings.KORAA_API_URL.rstrip('/')}{url}"


def reference(order: Order) -> str:
    """The human-facing invoice number.

    The order's uuid is unusable as a reference someone reads down a phone,
    so the first block is used — the same eight characters the merchant's
    order list and the Fapshi payment message already show, so all three
    name the order the same way.
    """
    return str(order.id)[:8].upper()


def build_context(order: Order) -> dict:
    """Everything the invoice template renders, and nothing derived twice."""
    store = order.store
    currency = store.currency or "XAF"

    lines = []
    for item in order.items.all():
        line_total = Decimal(item.price) * item.quantity
        lines.append({
            "name": item.product_name,
            "quantity": item.quantity,
            "price": item.price,
            "total": line_total,
        })

    subtotal = sum((line["total"] for line in lines), Decimal("0"))

    return {
        "order": order,
        "store": store,
        "reference": reference(order),
        "currency": currency,
        "lines": lines,
        "subtotal": subtotal,
        # Kept separate from subtotal so a shipping or tax line can be added
        # later without the template having to decide which one to trust.
        "total": order.total_amount,
        "is_paid": order.payment_status == Order.PaymentStatus.PAID,
        "store_logo": absolute_media(store.logo.url) if store.logo else "",
        "store_url": store.storefront_url,
        "dashboard_url": settings.KORAA_DASHBOARD_URL.rstrip("/"),
        "koraa_url": settings.KORAA_DASHBOARD_URL.rstrip("/"),
    }


def plain_text(context: dict) -> str:
    """The text alternative, for clients that will not render HTML.

    Written out rather than stripped from the HTML because an invoice read
    as plain text still has to be readable as an invoice.
    """
    store = context["store"]
    order = context["order"]
    currency = context["currency"]

    lines = "\n".join(
        f"  {line['quantity']} x {line['name']} — {currency} {line['total']:,.0f}"
        for line in context["lines"]
    )

    return (
        f"Invoice {context['reference']} from {store.name}\n"
        f"{'-' * 48}\n"
        f"{lines}\n"
        f"{'-' * 48}\n"
        f"Total: {currency} {order.total_amount:,.0f}\n"
        f"Status: {'Paid' if context['is_paid'] else 'Awaiting payment'}\n\n"
        f"Delivering to:\n{order.shipping_address}\n{order.city}\n\n"
        f"Questions? Reply to this email"
        + (f" or contact {store.email}." if store.email else ".")
        + f"\n\n{store.name} — {context['store_url']}\n"
    )


def send_invoice(order: Order) -> bool:
    """Email the invoice to the shopper. Returns whether it went out.

    Never raises. This is called from the payment callback, where an SMTP
    outage must not turn a successful payment into a 500 that Fapshi then
    retries — the payment is already taken and the order already marked
    paid by the time we get here.
    """
    if not order.customer_email:
        logger.warning("Order %s has no customer email; no invoice sent", order.id)
        return False

    context = build_context(order)
    subject = f"Invoice {context['reference']} — {order.store.name}"

    try:
        message = EmailMultiAlternatives(
            subject=subject,
            body=plain_text(context),
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[order.customer_email],
            # A shopper replying to an invoice wants the shop, not Koraa's
            # noreply address.
            reply_to=[order.store.email] if order.store.email else None,
        )
        message.attach_alternative(
            render_to_string("emails/order_invoice.html", context), "text/html"
        )
        message.send(fail_silently=False)
    except Exception:
        logger.exception("Failed to send invoice for order %s", order.id)
        return False

    return True
