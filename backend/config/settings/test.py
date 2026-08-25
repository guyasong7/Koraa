"""Test settings — development's conveniences, production's password rules.

Tests run on top of ``development`` so they keep the parts that make a suite
fast and offline: console email, permissive hosts, the local database.

The one thing they must not inherit is the empty ``AUTH_PASSWORD_VALIDATORS``.
Development clears the list so a dev can type "123" into a signup form, but that
also disarms every assertion that a weak password is *refused* — the test asking
for a 400 got a cheerful 201, and registration looked fine while the only thing
standing between a real account and "123" was switched off in the run that was
supposed to check it. Restoring the base list means auth is exercised against the
rules production actually applies.
"""
from .development import *  # noqa: F401,F403
from .base import AUTH_PASSWORD_VALIDATORS  # noqa: F401
