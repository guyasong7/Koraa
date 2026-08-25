"""pytest configuration for Koraa backend.

``DJANGO_SETTINGS_MODULE`` is set in ``pytest.ini`` (``config.settings.test``),
which pytest-django reads before this file is imported. It used to be assigned
here as well, pointing at ``config.settings.development`` — an assignment onto
the already-configured settings object, so it selected nothing and only
disagreed with the ini about which module a test run actually uses.
"""
