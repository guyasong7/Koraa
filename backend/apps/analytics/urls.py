"""
Analytics routes, split by who is allowed to call them.

``public_patterns`` is the single write endpoint. It is unauthenticated because
the caller is a shopper's browser on a storefront, and a Koraa storefront has no
shopper accounts to authenticate against.

``merchant_patterns`` are the three reads behind the dashboard's three tabs, and
are authenticated. They live at ``/analytics/`` rather than under a store,
because a merchant with several shops wants one page with a shop filter — which
is what ``?store=`` is for, and what omitting it reports on.

``urlpatterns`` is aliased to the public set, matching ``apps.orders.urls``.
"""

from django.urls import path

from .views import AnalyticsCollectView, EngagementView, SalesView, TrafficView

public_patterns = [
    path("analytics/collect/", AnalyticsCollectView.as_view(), name="analytics-collect"),
]

merchant_patterns = [
    path("traffic/", TrafficView.as_view(), name="analytics-traffic"),
    path("engagement/", EngagementView.as_view(), name="analytics-engagement"),
    path("sales/", SalesView.as_view(), name="analytics-sales"),
]

urlpatterns = public_patterns
