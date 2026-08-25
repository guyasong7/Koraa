"""WSGI config for Koraa project."""
import os
import threading

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
application = get_wsgi_application()


def _warm_caches() -> None:
    """Pre-fill caches whose first miss a real user would otherwise wait for.

    Here rather than in an AppConfig.ready(): ready() also runs for `migrate`,
    `collectstatic`, `shell` and the test suite, and none of those should make
    a network call to Google. wsgi.py runs only when something is actually
    serving requests.

    In a daemon thread because gunicorn is timing worker boot. The Firebase
    certificate fetch is a round trip to www.googleapis.com, and a slow or
    unreachable one must delay nothing — a cold cache costs the first Google
    sign-in a few hundred milliseconds, which is exactly what the old code
    charged every sign-in.
    """
    from apps.accounts.firebase import warm_certs_cache

    warm_certs_cache()


threading.Thread(target=_warm_caches, name="koraa-cache-warm", daemon=True).start()
