"""
Analytics endpoints — one public writer, three authenticated readers.

The writer is deliberately generous about what it will ignore. A tracker is
fire-and-forget: it runs on somebody else's browser, on a page that may be
mid-navigation, and a 400 telling it what it got wrong reaches nobody. So a bad
kind, an unknown store or a malformed path produce ``204 No Content`` and no row,
never an error the storefront has to handle.

The readers are split three ways to match the page's three tabs. One combined
endpoint would compute all three on every tab switch; three let react-query keep
each one and make going back instant.
"""

from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.products.models import Product
from apps.stores.access import accessible_stores
from apps.stores.models import Store

from . import collect, reports


class AnalyticsCollectView(APIView):
    """
    POST /api/v1/public/analytics/collect/

    ``{"store": "<slug>", "kind": "page_view", "path": "/", "referrer": "...",
    "product": "<uuid>", "label": "..."}``

    Throttled on the anonymous scope like every other public write. A tracker
    that is being hammered is either a bug or an attempt to inflate somebody's
    numbers, and neither deserves unbounded writes.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "anon"

    def post(self, request):
        slug = str(request.data.get("store") or "").strip()
        kind = str(request.data.get("kind") or "").strip()
        if not slug or kind not in collect.ALLOWED_KINDS:
            return Response(status=status.HTTP_204_NO_CONTENT)

        # Published only. A draft shop's own preview traffic is the merchant
        # looking at their own work, and counting it would flatter every new
        # store's first week.
        store = Store.objects.filter(slug=slug, status=Store.Status.PUBLISHED).first()
        if store is None:
            return Response(status=status.HTTP_204_NO_CONTENT)

        product = None
        product_id = str(request.data.get("product") or "").strip()
        if product_id:
            # Scoped to the store: a client that sends someone else's product id
            # must not have it recorded against this shop.
            product = Product.objects.filter(pk=product_id, store=store).first()

        collect.record(
            request,
            store,
            kind=kind,
            path=request.data.get("path", ""),
            referrer=request.data.get("referrer", ""),
            product=product,
            label=request.data.get("label", ""),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class MerchantReportView(APIView):
    """Shared scoping for the three report endpoints.

    ``?store=<id>`` narrows to one shop; omitting it reports on every shop the
    caller can reach, which is what makes "and others if they are available"
    work without a second endpoint.
    """

    permission_classes = [permissions.IsAuthenticated]

    def scope(self, request):
        """``(every store, the selected ones, window)`` for this request.

        The first two are separate on purpose: the page's store picker needs
        every shop the caller can reach even while the report covers one, and
        deriving the options from the filtered set would leave a merchant who
        picked one shop unable to pick another.
        """
        available = list(accessible_stores(request.user))
        selected = available

        store_id = request.query_params.get("store", "").strip()
        if store_id and store_id != "all":
            # Matched in Python against the list already fetched, so an id the
            # caller cannot reach is an empty selection rather than a signal
            # that it exists.
            selected = [s for s in available if str(s.id) == store_id]
            if not selected:
                raise ValidationError({"store": "No such store, or you cannot open it."})

        window = reports.Window(reports.resolve_days(request.query_params.get("days")))
        return available, selected, window

    def payload(self, stores, window):
        raise NotImplementedError

    def get(self, request):
        available, selected, window = self.scope(request)
        data = self.payload(selected, window)
        data["available_stores"] = [
            {"id": str(s.id), "name": s.name, "slug": s.slug, "status": s.status}
            for s in available
        ]
        return Response(data)


class TrafficView(MerchantReportView):
    """GET /api/v1/analytics/traffic/?store=&days= — views, visitors, sources."""

    def payload(self, stores, window):
        return reports.traffic(stores, window)


class EngagementView(MerchantReportView):
    """GET /api/v1/analytics/engagement/?store=&days= — what visitors did."""

    def payload(self, stores, window):
        return reports.engagement(stores, window)


class SalesView(MerchantReportView):
    """GET /api/v1/analytics/sales/?store=&days= — orders and money."""

    def payload(self, stores, window):
        return reports.sales(stores, window)
