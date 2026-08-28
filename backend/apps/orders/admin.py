"""Django admin for orders — the recovery surface for money already taken.

There was none. When a storefront payment went wrong the only tools were a
Django shell and the logs, which is why the pending backlog sat there
unnoticed and unfixable.

Two deliberate omissions, both about not fabricating facts:

* **No "mark as paid" action.** It is the obvious button and it is exactly wrong.
  Marking an order paid by hand asserts that money moved, mints download grants,
  and pays out a merchant share — on the word of whoever clicked it. "Re-check
  payment with Fapshi" reaches the same outcome when it is *true*, and does
  nothing when it is not.
* **`DownloadGrant.token` is never displayed.** It is a bearer credential: anyone
  holding it can download the file. Admin views and search terms are logged, so a
  token shown once ends up in a log that outlives it. Presence is shown instead,
  which is all anyone debugging actually needs.

Money and Fapshi identifiers are read-only throughout. A typo in ``total_amount``
would silently change what a merchant is owed, and ``fapshi_trans_id`` is the
only link between a Koraa order and a real payment — editing it detaches the two
irrecoverably.
"""

from django.contrib import admin, messages
from django.utils.safestring import mark_safe

from apps.orders import reconcile, settlement
from apps.orders.models import DownloadGrant, Order, OrderItem


class OrderItemInline(admin.TabularInline):
    """The lines, as snapshotted at purchase.

    Read-only in full: these are a record of what was sold at what price, and the
    order total was computed from them. Editing one would make the total a lie.
    """

    model = OrderItem
    extra = 0
    can_delete = False
    fields = ("product_name", "product", "quantity", "price")
    readonly_fields = fields

    def has_add_permission(self, request, obj):
        return False


class DownloadGrantInline(admin.TabularInline):
    """What a paying buyer was given access to. Token deliberately absent."""

    model = DownloadGrant
    extra = 0
    can_delete = False
    fields = (
        "product_name",
        "download_count",
        "max_downloads",
        "expires_at",
        "last_downloaded_at",
    )
    readonly_fields = fields

    def has_add_permission(self, request, obj):
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        "short_id",
        "store",
        "customer_email",
        "total_amount",
        "payment_status",
        "payout_status",
        "fapshi_trans_id",
        "created_at",
    )
    list_filter = ("payment_status", "payout_status", "store")
    #: ``id`` is searchable because a buyer's receipt quotes it and a support
    #: reply starts from there. ``financial_trans_id`` is what a buyer reads off
    #: their MTN or Orange SMS.
    search_fields = ("customer_email", "fapshi_trans_id", "financial_trans_id", "id")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    inlines = (OrderItemInline, DownloadGrantInline)
    list_select_related = ("store",)

    readonly_fields = (
        "id",
        "created_at",
        "updated_at",
        "total_amount",
        "settled_at",
        "fapshi_trans_id",
        "fapshi_status",
        "fapshi_revenue",
        "financial_trans_id",
        "paid_at",
        "payment_link",
        "payout_status",
        "payout_amount",
        "payout_reference",
        "payout_at",
        "payout_error",
    )

    fieldsets = (
        (None, {"fields": ("id", "store", "created_at", "updated_at")}),
        (
            "Customer",
            {
                "fields": (
                    "customer_name",
                    "customer_email",
                    "customer_phone",
                    "shipping_address",
                    "city",
                    "postal_code",
                )
            },
        ),
        (
            "Payment",
            {
                "fields": (
                    "total_amount",
                    "payment_status",
                    "settled_at",
                    "paid_at",
                    "fapshi_trans_id",
                    "fapshi_status",
                    "fapshi_revenue",
                    "financial_trans_id",
                    "payment_link",
                ),
                "description": (
                    "Read-only. To change payment state, use the "
                    "&ldquo;Re-check payment with Fapshi&rdquo; action — it asks "
                    "Fapshi and settles only what Fapshi confirms."
                ),
            },
        ),
        (
            "Merchant payout",
            {
                "fields": (
                    "payout_status",
                    "payout_amount",
                    "payout_reference",
                    "payout_at",
                    "payout_error",
                ),
                "description": (
                    "<strong>Unknown</strong> means Fapshi accepted the payout and "
                    "then the connection dropped, so the money may already be with "
                    "the merchant. Check the Fapshi dashboard before doing anything "
                    "— the retry action will not touch these, on purpose."
                ),
            },
        ),
    )

    actions = ("recheck_payment", "retry_payout")

    def has_add_permission(self, request):
        """Orders come from checkout, never from here.

        A hand-made order has no payment behind it, and every downstream step —
        invoice, download grant, payout — assumes one exists.
        """
        return False

    @admin.display(description="Order", ordering="created_at")
    def short_id(self, obj):
        """First segment of the UUID — enough to recognise, short enough to scan."""
        return str(obj.id).split("-")[0]

    @admin.action(description="Re-check payment with Fapshi (safe, idempotent)")
    def recheck_payment(self, request, queryset):
        """Ask Fapshi about each selected order and settle what it confirms.

        Safe to run on anything, including already-settled orders: it goes through
        the same ``settled_at`` guard as the webhook, so a second run cannot pay a
        merchant twice or re-mint a download grant. This is the action to reach for
        when a buyer says they paid.
        """
        outcomes = {}
        for order in queryset:
            result = settlement.settle_order(order.id)
            outcomes[result] = outcomes.get(result, 0) + 1

        paid = outcomes.get(settlement.PAID, 0)
        if paid:
            self.message_user(
                request,
                f"{paid} order(s) confirmed paid by Fapshi — invoices, download "
                "links and merchant payouts have been sent.",
                messages.SUCCESS,
            )

        failed = outcomes.get(settlement.FAILED, 0)
        if failed:
            self.message_user(
                request, f"{failed} order(s) confirmed failed by Fapshi.", messages.WARNING
            )

        quiet = outcomes.get(settlement.ALREADY, 0) + outcomes.get(settlement.PENDING, 0)
        if quiet:
            self.message_user(
                request,
                f"{quiet} order(s) unchanged — already settled, or the buyer has "
                "not finished approving the charge.",
                messages.INFO,
            )

        unknown = outcomes.get(settlement.UNKNOWN, 0)
        if unknown:
            self.message_user(
                request,
                f"Fapshi could not be reached for {unknown} order(s). Nothing was "
                "changed and they are safe to re-check in a moment.",
                messages.ERROR,
            )

    @admin.action(description="Retry merchant payout (MOVES MONEY)")
    def retry_payout(self, request, queryset):
        """Re-send the merchant's share for paid orders whose payout did not land.

        Guarded rather than trusting the selection. An order is only attempted
        when it is paid, fully settled, and its ``payout_status`` says no money
        left Koraa — ``pending`` (never attempted) or ``failed`` (Fapshi refused).

        ``sent`` and ``unknown`` are refused and reported. ``unknown`` is the one
        that matters: Fapshi took the payout and never answered, so retrying it
        may pay the merchant a second time out of Koraa's float. There is no
        idempotency key on Fapshi's payout endpoint to protect against that, so
        the protection has to be this refusal.
        """
        eligible, refused = [], []
        for order in queryset.select_related("store", "store__merchant"):
            if (
                order.payment_status == Order.PaymentStatus.PAID
                and order.settled_at is not None
                and order.payout_status in reconcile.RETRYABLE_PAYOUT_STATUSES
            ):
                eligible.append(order)
            else:
                refused.append(order)

        for order in eligible:
            settlement.pay_merchant(order)

        if eligible:
            fresh = Order.objects.filter(pk__in=[o.pk for o in eligible])
            sent = fresh.filter(payout_status=Order.PayoutStatus.SENT).count()
            unresolved = fresh.filter(payout_status=Order.PayoutStatus.UNKNOWN).count()
            other = len(eligible) - sent - unresolved

            if sent:
                self.message_user(
                    request, f"{sent} merchant payout(s) sent.", messages.SUCCESS
                )
            if other:
                self.message_user(
                    request,
                    f"{other} payout(s) did not go out — see payout_error on each.",
                    messages.WARNING,
                )
            if unresolved:
                self.message_user(
                    request,
                    f"{unresolved} payout(s) got no answer from Fapshi and may or may "
                    "not have gone out. Check the Fapshi dashboard. They are now "
                    "marked unknown and this action will not retry them.",
                    messages.ERROR,
                )

        if refused:
            self.message_user(
                request,
                f"{len(refused)} order(s) skipped: not paid, not settled, already "
                "paid out, or in the unknown state where a retry could pay twice.",
                messages.INFO,
            )


@admin.register(DownloadGrant)
class DownloadGrantAdmin(admin.ModelAdmin):
    """Digital delivery, for when a buyer says their link stopped working.

    The two usual answers are here as actions: they used their downloads up, or
    the window closed. Both are fixable without touching the token, which is
    what keeps the credential out of this screen entirely.
    """

    list_display = (
        "product_name",
        "buyer",
        "download_count",
        "max_downloads",
        "expires_at",
        "usable",
        "created_at",
    )
    list_filter = ("created_at", "expires_at")
    #: No ``token`` here, and none in ``list_display``. Search terms reach the
    #: server log; a bearer token that lands in a log outlives the grant.
    search_fields = ("product_name", "order__customer_email")
    ordering = ("-created_at",)
    list_select_related = ("order",)

    readonly_fields = (
        "id",
        "order",
        "product",
        "product_name",
        "token_status",
        "download_count",
        "created_at",
        "last_downloaded_at",
    )
    #: Only the two limits are editable, which is the whole point of this screen:
    #: extending a window or granting another download is a support decision, and
    #: neither reveals the token.
    fields = readonly_fields + ("max_downloads", "expires_at")

    actions = ("reset_download_count", "extend_expiry_30_days")

    def has_add_permission(self, request):
        """Grants are minted by settlement, against a paid order."""
        return False

    @admin.display(description="Buyer", ordering="order__customer_email")
    def buyer(self, obj):
        return obj.order.customer_email

    @admin.display(description="Usable", boolean=True)
    def usable(self, obj):
        return obj.is_usable

    @admin.display(description="Token")
    def token_status(self, obj):
        """Presence only. The value is a bearer credential and is never rendered.

        ``mark_safe`` on a literal, not ``format_html``: there is nothing to
        interpolate, and interpolating the token is precisely what must not happen
        here. Django 6 deprecates ``format_html`` with no arguments anyway.
        """
        if not obj.token:
            return mark_safe("<em>missing — this grant cannot be used</em>")
        return mark_safe(
            "<em>set (hidden — it is a bearer credential; send the buyer a fresh "
            "link from their order instead)</em>"
        )

    @admin.action(description="Reset download count to zero")
    def reset_download_count(self, request, queryset):
        updated = queryset.update(download_count=0)
        self.message_user(
            request, f"Reset the download count on {updated} grant(s).", messages.SUCCESS
        )

    @admin.action(description="Extend expiry by 30 days")
    def extend_expiry_30_days(self, request, queryset):
        """From now, not from the old expiry — an already-lapsed grant must work again.

        Grants with no expiry are left alone: they never expire, and writing a
        date onto one would take away access the buyer already has.
        """
        from datetime import timedelta

        from django.utils import timezone

        updated = queryset.exclude(expires_at__isnull=True).update(
            expires_at=timezone.now() + timedelta(days=30)
        )
        unlimited = queryset.filter(expires_at__isnull=True).count()

        self.message_user(
            request, f"Extended {updated} grant(s) by 30 days.", messages.SUCCESS
        )
        if unlimited:
            self.message_user(
                request,
                f"{unlimited} grant(s) left alone — they never expire.",
                messages.INFO,
            )
