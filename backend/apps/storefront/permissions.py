"""Storefront permissions."""
from rest_framework import permissions

from apps.stores.access import accessible_stores


class CanManageStore(permissions.BasePermission):
    """The caller owns this store or holds an accepted invite to it.

    Storefront design is one of the things a teammate is invited to do, so
    this is not an owner-only check. It replaces an earlier IsStoreOwner
    that compared ``store.merchant.user`` to the caller and therefore locked
    every invited teammate out of the editor.
    """
    message = "You do not have access to this store."

    def has_object_permission(self, request, view, obj):
        # obj may be a StorefrontConfig, a StorefrontSection, or a Store
        store = getattr(obj, "store", obj)
        return accessible_stores(request.user).filter(pk=store.pk).exists()
