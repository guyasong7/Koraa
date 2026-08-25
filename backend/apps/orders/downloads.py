"""
Digital delivery — what happens after a file is paid for.

A physical order ends with a parcel; a digital one has to end with a link, and
until now Koraa had no way to sell a file at all. This module is the delivery:
when an order is marked paid, every digital line on it mints a
``DownloadGrant`` and the buyer is emailed one link per product.

Design notes:

- **The link is the credential.** There are no shopper accounts on a Koraa
  storefront — checkout takes a name and an email and nothing else — so a
  256-bit token in the URL is what proves the holder paid. It is emailed and
  never shown to anyone else.

- **Minting is idempotent.** Fapshi delivers the redirect and the webhook for
  the same payment, so ``mint_for_order`` may be called twice for one order.
  ``DownloadGrant.mint`` uses get_or_create, which means a second call cannot
  reset the download count or push the expiry out.

- **Files are streamed, never linked.** ``ProductFile.file`` lands under
  MEDIA_ROOT, where a media URL is public to anyone who guesses the path. The
  download view reads the file and serves it under the token's authority; the
  raw URL never leaves the server.

- **The email goes out after the invoice, separately.** One combined message
  would bury the links under a line-items table, and a buyer whose invoice
  arrived but whose download email did not can be re-sent the one that matters
  from the dashboard.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone

from . import invoices
from .models import DownloadGrant, Order

logger = logging.getLogger(__name__)


def digital_items(order: Order) -> list:
    """The order's lines that are digital products.

    Reads through ``OrderItem.product``, which is nullable — a product deleted
    between purchase and payment leaves the line but not the files, and there is
    nothing to deliver in that case.
    """
    items = []
    for item in order.items.select_related("product").all():
        product = item.product
        if product is not None and product.is_digital:
            items.append(item)
    return items


def download_url(order: Order, grant: DownloadGrant) -> str:
    """Where the buyer goes to collect their files.

    Hosted on the shop's own storefront rather than on the Koraa dashboard: the
    buyer's relationship is with the shop, and a download page on a domain they
    have never seen looks like a phishing link.
    """
    return f"{order.store.storefront_url.rstrip('/')}/download/{grant.token}"


def mint_for_order(order: Order) -> list[DownloadGrant]:
    """Create the grants for a paid order. Returns them, newest first.

    Refuses to mint for an unpaid order — that would be handing the file over
    before the money arrives, which is the one thing this must never do.
    """
    if order.payment_status != Order.PaymentStatus.PAID:
        logger.warning(
            "Refusing to mint download grants for unpaid order %s", order.id
        )
        return []

    grants = []
    for item in digital_items(order):
        grants.append(DownloadGrant.mint(order, item.product))
    return grants


def build_context(order: Order, grants: list[DownloadGrant]) -> dict:
    """Everything the download email renders."""
    store = order.store
    return {
        "order": order,
        "store": store,
        "reference": invoices.reference(order),
        # Same absolute-URL fix the invoice needs: MEDIA_URL is relative in
        # development, and a relative logo src resolves against the mail
        # client's origin and renders as a broken image.
        "store_logo": invoices.absolute_media(store.logo.url) if store.logo else "",
        "store_url": store.storefront_url,
        "dashboard_url": settings.KORAA_DASHBOARD_URL.rstrip("/"),
        "koraa_url": settings.KORAA_DASHBOARD_URL.rstrip("/"),
        "downloads": [
            {
                "name": grant.product_name,
                "url": download_url(order, grant),
                "file_count": grant.product.files.count() if grant.product else 0,
                "remaining": grant.downloads_remaining,
                "expires_at": grant.expires_at,
            }
            for grant in grants
        ],
    }


def plain_text(context: dict) -> str:
    """The text alternative.

    Written out rather than stripped from the HTML, because the links are the
    entire content of this message and a mangled one is a lost purchase.
    """
    store = context["store"]
    blocks = []
    for item in context["downloads"]:
        detail = []
        if item["file_count"]:
            detail.append(
                f"{item['file_count']} file" + ("s" if item["file_count"] != 1 else "")
            )
        if item["remaining"] is not None:
            detail.append(f"{item['remaining']} downloads")
        if item["expires_at"]:
            detail.append(
                "available until "
                + timezone.localtime(item["expires_at"]).strftime("%d %B %Y")
            )
        suffix = f" ({', '.join(detail)})" if detail else ""
        blocks.append(f"{item['name']}{suffix}\n  {item['url']}")

    body = "\n\n".join(blocks)
    return (
        f"Your downloads from {store.name}\n"
        f"{'-' * 48}\n"
        f"Order {context['reference']}\n\n"
        f"{body}\n\n"
        f"{'-' * 48}\n"
        f"Keep this email — the links above are how you get back to your files.\n\n"
        f"Trouble downloading? Reply to this email"
        + (f" or contact {store.email}." if store.email else ".")
        + f"\n\n{store.name} — {context['store_url']}\n"
    )


def send_downloads(order: Order, grants: list[DownloadGrant] | None = None) -> bool:
    """Email the buyer their links. Returns whether anything went out.

    Never raises, for the same reason ``invoices.send_invoice`` does not: this
    is called from the payment callback, and an SMTP outage must not turn a
    successful payment into a 500 that Fapshi then retries.
    """
    if grants is None:
        grants = mint_for_order(order)

    if not grants:
        return False

    if not order.customer_email:
        logger.warning(
            "Order %s has digital items but no customer email; %d grant(s) "
            "minted and unreachable",
            order.id, len(grants),
        )
        return False

    context = build_context(order, grants)
    count = len(grants)
    subject = (
        f"Your download from {order.store.name}"
        if count == 1
        else f"Your {count} downloads from {order.store.name}"
    )

    try:
        message = EmailMultiAlternatives(
            subject=subject,
            body=plain_text(context),
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[order.customer_email],
            reply_to=[order.store.email] if order.store.email else None,
        )
        message.attach_alternative(
            render_to_string("emails/order_downloads.html", context), "text/html"
        )
        message.send(fail_silently=False)
    except Exception:
        logger.exception("Failed to send downloads for order %s", order.id)
        return False

    return True
