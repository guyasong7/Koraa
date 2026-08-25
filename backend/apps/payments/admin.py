from django.contrib import admin
from .models import Subscription, PaymentTransaction


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "plan", "status", "billing_cycle", "amount_paid", "starts_at", "expires_at")
    list_filter = ("plan", "status", "billing_cycle")
    search_fields = ("user__email",)


@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    list_display = ("user", "plan", "amount", "status", "fapshi_trans_id", "created_at")
    list_filter = ("plan", "status")
    search_fields = ("user__email", "fapshi_trans_id")
