"""
Order routes, split by who is allowed to call them.

``public_patterns`` are the checkout: a shopper placing an order on a
storefront and Fapshi calling back to say it was paid. Neither carries a
token, so they are mounted under ``/public/``. The two download routes join
them for the same reason — the token in the URL is the credential, because a
Koraa storefront has no shopper accounts to authenticate against.

``merchant_patterns`` are the order book, and are authenticated. They live at
``/orders/`` rather than under a store, because a merchant with three shops
wants one list with a store filter, not three lists.

``urlpatterns`` stays aliased to the public set so the existing
``include("apps.orders.urls")`` under ``public/`` keeps meaning what it meant.
"""

from django.urls import path

from .views import (
    MerchantOrderDetailView,
    MerchantOrderDownloadsView,
    MerchantOrderExportView,
    MerchantOrderInvoiceView,
    MerchantOrderListView,
    PublicDownloadFileView,
    PublicDownloadView,
    StorefrontOrderCallbackView,
    StorefrontOrderChargeView,
    StorefrontOrderCreateView,
    StorefrontOrderStatusView,
)

public_patterns = [
    path("storefront/<str:domain>/orders/", StorefrontOrderCreateView.as_view(), name="storefront-orders-create"),
    # Both keyed by order id rather than nested under the domain: the browser has
    # the id from the create response, and the order already knows its store — so
    # a mismatched domain cannot point a charge at the wrong shop.
    path(
        "storefront/orders/<uuid:order_id>/pay/",
        StorefrontOrderChargeView.as_view(),
        name="storefront-orders-pay",
    ),
    path(
        "storefront/orders/<uuid:order_id>/status/",
        StorefrontOrderStatusView.as_view(),
        name="storefront-orders-status",
    ),
    path("storefront/orders/callback/", StorefrontOrderCallbackView.as_view(), name="storefront-orders-callback"),
    # <str:token> rather than <slug:token>: secrets.token_urlsafe emits "-" and
    # "_", and a slug converter rejects the underscore, which would 404 roughly
    # a third of the links Koraa hands out.
    path("download/<str:token>/", PublicDownloadView.as_view(), name="public-download"),
    path(
        "download/<str:token>/files/<uuid:file_id>/",
        PublicDownloadFileView.as_view(),
        name="public-download-file",
    ),
]

merchant_patterns = [
    path("", MerchantOrderListView.as_view(), name="merchant-orders-list"),
    # Before <uuid:pk>: "export" is not a uuid, so the order only matters for
    # readability, but keeping literal segments first is the habit that stops
    # the next one from being shadowed.
    path("export/", MerchantOrderExportView.as_view(), name="merchant-orders-export"),
    path("<uuid:pk>/", MerchantOrderDetailView.as_view(), name="merchant-orders-detail"),
    path("<uuid:pk>/invoice/", MerchantOrderInvoiceView.as_view(), name="merchant-orders-invoice"),
    path("<uuid:pk>/downloads/", MerchantOrderDownloadsView.as_view(), name="merchant-orders-downloads"),
]

urlpatterns = public_patterns
