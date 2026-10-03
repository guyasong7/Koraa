"""Lightweight health endpoint, exempt from DRF throttling."""

from django.db import connection
from django.core.cache import cache
from django.http import JsonResponse


def health(request):
    checks = {}

    try:
        with connection.cursor() as cur:
            cur.execute("SELECT 1")
        checks["db"] = "ok"
    except Exception:
        checks["db"] = "fail"

    try:
        cache.set("_health", 1, timeout=10)
        if cache.get("_health") == 1:
            checks["cache"] = "ok"
        else:
            checks["cache"] = "fail"
    except Exception:
        checks["cache"] = "fail"

    ok = all(v == "ok" for v in checks.values())
    return JsonResponse(checks, status=200 if ok else 503)
