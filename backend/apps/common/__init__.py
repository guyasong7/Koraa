"""Shared helpers with no models of their own.

Deliberately not an installed app: no AppConfig, nothing in INSTALLED_APPS, so
Django never auto-imports anything here. Modules are imported explicitly by the
apps that use them.
"""
