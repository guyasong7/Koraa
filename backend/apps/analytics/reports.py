"""
The three reports behind the analytics page: traffic, engagement, sales.

Each returns plain dictionaries rather than serialized models, because none of
them is a model — they are answers to questions, and the shape of each answer is
chosen for the chart that draws it.

Two rules run through all three:

**Every series is dense.** The database returns rows only for days something
happened, and a line chart fed those rows draws a straight climb through a quiet
week. Each report fills the gaps with zeroes, so a flat day looks flat.

**Money and counts come from the tables that hold them exactly.** Orders and
enquiries are read from ``orders.Order`` and ``storefront.FormSubmission``, not
from collected events — see the note in ``models.py``. Only traffic, product
views, add-to-carts, checkout starts and searches are sampled, and the page
labels those as measured rather than absolute.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from apps.orders.models import Order, OrderItem
from apps.storefront.models import FormSubmission

from .models import Event

#: Nothing longer. These are scans over a table that only grows, and a merchant
#: asking for "all time" wants a number rather than a timeout. A year covers
#: every comparison the page offers.
MAX_DAYS = 365
DEFAULT_DAYS = 30

#: How many rows a breakdown list returns. The chart is the story; these are its
#: footnotes, and a hundred paths is not a footnote.
TOP_N = 8

#: Wide enough that a year of XAF revenue cannot overflow the sum. Order totals
#: are max_digits=10, and a thousand of them added together is not.
MONEY = DecimalField(max_digits=16, decimal_places=2)


def resolve_days(raw) -> int:
    """A day count from a query parameter, clamped to something answerable."""
    try:
        days = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_DAYS
    return max(1, min(days, MAX_DAYS))


class Window:
    """A date range, plus the equally long range before it.

    The previous window is what makes a number mean anything: "412 views" says
    less than "412 views, up from 260". Both are derived here so the two can
    never end up measured over different lengths.

    Dates are local, not UTC. A merchant in Douala reading "today" means their
    today, and a UTC day boundary would file a third of the evening's orders
    under tomorrow.
    """

    def __init__(self, days: int):
        self.days = days
        self.end: date = timezone.localdate()
        self.start: date = self.end - timedelta(days=days - 1)
        self.previous_end: date = self.start - timedelta(days=1)
        self.previous_start: date = self.previous_end - timedelta(days=days - 1)

    @property
    def dates(self) -> list:
        return [self.start + timedelta(days=i) for i in range(self.days)]

    def filter(self, field="created_at", previous=False) -> Q:
        """A range filter on a datetime field, inclusive of both end dates."""
        start, end = (
            (self.previous_start, self.previous_end) if previous else (self.start, self.end)
        )
        return Q(**{f"{field}__date__gte": start, f"{field}__date__lte": end})

    def as_dict(self) -> dict:
        return {
            "days": self.days,
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
        }


def _dense(rows, dates, fields: dict) -> list:
    """Fill a sparse day series with zero rows, in date order.

    ``fields`` maps each numeric key to the value a missing day should carry.
    """
    by_date = {row["date"]: row for row in rows}
    series = []
    for day in dates:
        row = by_date.get(day)
        entry = {"date": day.isoformat()}
        for field, default in fields.items():
            value = row.get(field) if row else None
            entry[field] = default if value is None else value
        series.append(entry)
    return series


def _rate(part, whole) -> float:
    """A percentage to one decimal place, and 0 rather than a division error."""
    if not whole:
        return 0.0
    return round(part * 100 / whole, 1)


def _money(value) -> str:
    """A decimal as a string, so JSON parsing cannot round somebody's revenue."""
    return str(Decimal(value or 0).quantize(Decimal("0.01")))


def _amount(value, addable: bool):
    """Money, or ``None`` when adding these figures would be meaningless.

    ``addable`` is false when the selected shops bill in more than one currency.
    5,000 XAF plus 5,000 NGN is not 10,000 of anything, and a total that pretends
    otherwise is worse than no total — the merchant would have no way to know it
    was wrong. Every money figure in the sales report goes through here.
    """
    return _money(value) if addable else None


def _sum(queryset, field="total_amount"):
    """A Decimal sum that is 0 rather than None on an empty queryset."""
    return queryset.aggregate(
        total=Coalesce(Sum(field), Value(Decimal("0")), output_field=MONEY)
    )["total"]


def _per_store(stores, queryset, label) -> list:
    """One row per shop, so a merchant with several can compare them.

    Shops with nothing in the range are included with a zero. "This shop got no
    traffic at all" is the finding, and dropping the row hides it.
    """
    counts = dict(
        queryset.values("store_id").annotate(n=Count("id")).values_list("store_id", "n")
    )
    rows = [
        {
            "id": str(store.id),
            "name": store.name,
            "slug": store.slug,
            label: counts.get(store.id, 0),
        }
        for store in stores
    ]
    return sorted(rows, key=lambda row: row[label], reverse=True)


# ── Traffic ───────────────────────────────────────────────────────────────────

def traffic(stores, window: Window) -> dict:
    """Views, visitors, and where they came from.

    ``stores`` is a list of the shops in scope, so one shop and "all my shops"
    are the same query — which is also what makes the per-store breakdown free.
    """
    views = Event.objects.filter(
        window.filter(), store__in=stores, kind=Event.Kind.PAGE_VIEW
    )
    before = Event.objects.filter(
        window.filter(previous=True), store__in=stores, kind=Event.Kind.PAGE_VIEW
    )

    per_day = (
        views.annotate(date=TruncDate("created_at"))
        .values("date")
        .annotate(views=Count("id"), visitors=Count("visitor", distinct=True))
    )

    total_views = views.count()
    # Distinct over the whole range, and *not* unique people: the visitor hash
    # rotates at midnight, so somebody who came on three days counts three
    # times. The dashboard says so beside the number rather than implying
    # otherwise.
    total_visitors = views.values("visitor").distinct().count()

    # A bounce is a visitor whose whole day on the shop was a single page.
    single_page = views.values("visitor").annotate(seen=Count("id")).filter(seen=1).count()

    return {
        "range": window.as_dict(),
        "totals": {
            "views": total_views,
            "visitors": total_visitors,
            "views_per_visitor": round(total_views / total_visitors, 2) if total_visitors else 0.0,
            "bounce_rate": _rate(single_page, total_visitors),
        },
        "previous": {
            "views": before.count(),
            "visitors": before.values("visitor").distinct().count(),
        },
        "series": _dense(per_day, window.dates, {"views": 0, "visitors": 0}),
        "top_pages": [
            {"path": row["path"] or "/", "views": row["views"]}
            for row in views.values("path").annotate(views=Count("id")).order_by("-views")[:TOP_N]
        ],
        "referrers": [
            # A blank referrer is a typed address, a bookmark, or an app that
            # strips it. Named rather than dropped: for most small shops it is
            # the largest single source, and hiding it makes the list a lie.
            {"source": row["referrer"] or "Direct", "views": row["views"]}
            for row in views.values("referrer").annotate(views=Count("id")).order_by("-views")[:TOP_N]
        ],
        "devices": [
            {"device": row["device"], "views": row["views"]}
            for row in views.values("device").annotate(views=Count("id")).order_by("-views")
        ],
        "stores": _per_store(stores, views, "views"),
    }


# ── Engagement ────────────────────────────────────────────────────────────────

def engagement(stores, window: Window) -> dict:
    """What visitors did once they arrived, and how far they got.

    The funnel's last step comes from ``Order`` rather than from events, so the
    bottom is exact even where the top is sampled. That can make the last step
    look impossibly good — somebody whose browser blocked the tracker still
    shows up as an order — so no rate is reported across that join. Only steps
    measured the same way are compared with each other.
    """
    events = Event.objects.filter(window.filter(), store__in=stores)

    def count(kind):
        return events.filter(kind=kind).count()

    product_views = count(Event.Kind.PRODUCT_VIEW)
    carted = count(Event.Kind.ADD_TO_CART)
    checkouts = count(Event.Kind.CHECKOUT_START)
    searches = count(Event.Kind.SEARCH)

    paid_orders = Order.objects.filter(
        window.filter(), store__in=stores, payment_status=Order.PaymentStatus.PAID
    ).count()
    enquiries = FormSubmission.objects.filter(window.filter(), store__in=stores).count()

    per_day = (
        events.annotate(date=TruncDate("created_at"))
        .values("date")
        .annotate(
            product_views=Count("id", filter=Q(kind=Event.Kind.PRODUCT_VIEW)),
            add_to_cart=Count("id", filter=Q(kind=Event.Kind.ADD_TO_CART)),
            checkout_start=Count("id", filter=Q(kind=Event.Kind.CHECKOUT_START)),
        )
    )

    return {
        "range": window.as_dict(),
        "totals": {
            "product_views": product_views,
            "add_to_cart": carted,
            "checkout_started": checkouts,
            "searches": searches,
            "enquiries": enquiries,
            "orders_paid": paid_orders,
        },
        # Each rate is against the step above it, which is the comparison that
        # answers "where am I losing people". Rates against the first step would
        # read as a funnel leaking everywhere at once.
        "funnel": _funnel([
            # "Opened", not "viewed": a Koraa storefront is one page, so the
            # tracker records a product event when a visitor opens that
            # product rather than when a product page loads. Naming the step
            # after what was measured is the whole difference between a funnel
            # and a guess.
            ("Opened a product", product_views, True),
            ("Added to cart", carted, True),
            ("Reached checkout", checkouts, True),
            ("Paid", paid_orders, False),
        ]),
        "series": _dense(
            per_day,
            window.dates,
            {"product_views": 0, "add_to_cart": 0, "checkout_start": 0},
        ),
        "top_products": _top_products(events),
        "searches": [
            {"term": row["label"], "count": row["n"]}
            for row in events.filter(kind=Event.Kind.SEARCH)
            .exclude(label="")
            .values("label")
            .annotate(n=Count("id"))
            .order_by("-n")[:TOP_N]
        ],
        "stores": _per_store(stores, events, "events"),
    }


def _funnel(steps) -> list:
    """Each step with its share of the step above it.

    ``comparable`` false means the count came from a different source than the
    step above, so no rate is given rather than one that cannot be trusted.
    """
    rows = []
    previous = None
    for label, count, comparable in steps:
        rows.append({
            "step": label,
            "count": count,
            "rate": _rate(count, previous) if comparable and previous is not None else None,
        })
        previous = count
    return rows


def _top_products(events) -> list:
    """The products that got the most attention, viewed and carted side by side.

    Both numbers in one row on purpose: a product with many views and no carts
    is a different problem from one with neither, and two separate lists leave
    that comparison as the merchant's homework.
    """
    rows = (
        events.filter(product__isnull=False)
        .values("product_id", "product__name")
        .annotate(
            views=Count("id", filter=Q(kind=Event.Kind.PRODUCT_VIEW)),
            carted=Count("id", filter=Q(kind=Event.Kind.ADD_TO_CART)),
        )
        .order_by("-views", "-carted")[:TOP_N]
    )
    return [
        {
            "id": str(row["product_id"]),
            "name": row["product__name"],
            "views": row["views"],
            "carted": row["carted"],
            "cart_rate": _rate(row["carted"], row["views"]),
        }
        for row in rows
    ]


# ── Sales ─────────────────────────────────────────────────────────────────────

def sales(stores, window: Window) -> dict:
    """Orders and money, from the order book.

    Neither sampled nor consent-dependent: every order is here whether or not the
    shopper's browser ever talked to the tracker.

    Revenue counts paid orders only. A pending order is a hope and a failed one
    is not money — either in a revenue total is how a merchant ends up believing
    a figure they cannot spend. The unpaid ones are still reported, under
    ``by_status``, where they read as what they are.

    The one figure mixing the two sources is the conversion rate, and it is
    ``None`` unless there is traffic to divide by.

    Every money figure is ``None`` when the selected shops bill in different
    currencies — see :func:`_amount`. Order and unit counts survive a mixed
    selection, because those do add up.
    """
    orders = Order.objects.filter(window.filter(), store__in=stores)
    paid = orders.filter(payment_status=Order.PaymentStatus.PAID)
    before = Order.objects.filter(
        window.filter(previous=True),
        store__in=stores,
        payment_status=Order.PaymentStatus.PAID,
    )

    currency = _single_currency(stores)
    addable = currency is not None

    revenue = _sum(paid)
    order_count = paid.count()

    per_day = (
        paid.annotate(date=TruncDate("created_at"))
        .values("date")
        .annotate(
            orders=Count("id"),
            revenue=Coalesce(Sum("total_amount"), Value(Decimal("0")), output_field=MONEY),
        )
    )

    units = OrderItem.objects.filter(order__in=paid).aggregate(
        n=Coalesce(Sum("quantity"), 0)
    )["n"]

    visitors = (
        Event.objects.filter(window.filter(), store__in=stores, kind=Event.Kind.PAGE_VIEW)
        .values("visitor")
        .distinct()
        .count()
    )

    return {
        "range": window.as_dict(),
        # Null for a mixed selection, and the page then shows amounts per shop
        # rather than one total that is arithmetic on two different things.
        "currency": currency,
        "totals": {
            "orders": order_count,
            "orders_all": orders.count(),
            "revenue": _amount(revenue, addable),
            "average_order": _amount(revenue / order_count, addable) if order_count else _amount(0, addable),
            "units": units,
            # Null, not zero, when nothing was measured: "0%" would read as
            # "nobody who visited bought anything".
            "conversion_rate": _rate(order_count, visitors) if visitors else None,
        },
        "previous": {
            "orders": before.count(),
            "revenue": _amount(_sum(before), addable),
        },
        "series": _sales_series(per_day, window, addable),
        "by_status": [
            {
                "status": row["payment_status"],
                "orders": row["n"],
                "revenue": _amount(row["total"], addable),
            }
            for row in orders.values("payment_status")
            .annotate(
                n=Count("id"),
                total=Coalesce(Sum("total_amount"), Value(Decimal("0")), output_field=MONEY),
            )
            .order_by("-n")
        ],
        "top_products": [
            {
                "name": row["product_name"],
                "units": row["units"],
                "revenue": _amount(row["revenue"], addable),
            }
            # Grouped by the snapshot name rather than the product id: a line
            # whose product was later deleted still sold, and grouping by id
            # files all of those under "None".
            for row in OrderItem.objects.filter(order__in=paid)
            .values("product_name")
            .annotate(
                units=Coalesce(Sum("quantity"), 0),
                revenue=Coalesce(
                    Sum(F("price") * F("quantity"), output_field=MONEY),
                    Value(Decimal("0")),
                    output_field=MONEY,
                ),
            )
            # Ordered by units rather than revenue, so the list is the same list
            # whichever currencies the selection mixes.
            .order_by("-units")[:TOP_N]
        ],
        "stores": _sales_per_store(stores, paid),
    }


def _sales_series(rows, window: Window, addable: bool) -> list:
    """The daily orders-and-revenue line, dense, with money as strings."""
    by_date = {row["date"]: row for row in rows}
    series = []
    for day in window.dates:
        row = by_date.get(day)
        series.append({
            "date": day.isoformat(),
            "orders": row["orders"] if row else 0,
            "revenue": _amount(row["revenue"] if row else 0, addable),
        })
    return series


def _sales_per_store(stores, paid) -> list:
    """Revenue per shop, each reported in its own currency."""
    totals = {
        row["store_id"]: row
        for row in paid.values("store_id").annotate(
            orders=Count("id"),
            revenue=Coalesce(Sum("total_amount"), Value(Decimal("0")), output_field=MONEY),
        )
    }
    rows = [
        {
            "id": str(store.id),
            "name": store.name,
            "slug": store.slug,
            "currency": store.currency,
            "orders": totals.get(store.id, {}).get("orders", 0),
            "revenue": _money(totals.get(store.id, {}).get("revenue", 0)),
        }
        for store in stores
    ]
    return sorted(rows, key=lambda row: Decimal(row["revenue"]), reverse=True)


def _single_currency(stores):
    """The one currency every selected shop bills in, or None if they differ."""
    codes = {store.currency for store in stores}
    return codes.pop() if len(codes) == 1 else None
