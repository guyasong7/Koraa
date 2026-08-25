"""
Who may open a store.

A store is reachable by the merchant who owns it and by anyone that owner
invited to *that store* who accepted the invite. Nothing else grants
access — not sharing a platform, not having been invited and not answered,
and not having been invited to a different store on the same account.

Every merchant-facing view that resolves a store goes through here. That
is the point of the module: the check used to be spelled out at each call
site, and the spellings disagreed. ``merchant__user=user`` (stores.publish,
storefront.preview) asked "do you own it?", while
``merchant=get_active_merchant(user)`` (stores.list, products) asked "what
merchant are you acting as?" — and the second answers with the user's *own*
merchant whenever they have one. An invited user who also ran a shop of
their own therefore got their own shop back and never saw the shared one,
so an accepted invite granted nothing at all.
"""

from dataclasses import dataclass

from django.db.models import Q

from apps.merchants.models import MerchantStaff

from .models import Store


def own_merchant(user):
    """The merchant profile ``user`` owns, or None.

    ``user.merchant`` is a reverse one-to-one, so it raises rather than
    returning None when there is no profile. Django makes that exception a
    subclass of AttributeError precisely so ``getattr`` can absorb it.
    """
    return getattr(user, "merchant", None)


def _accepted(user):
    return MerchantStaff.objects.filter(user=user, status=MerchantStaff.Status.ACCEPTED)


def accessible_stores(user):
    """Every store ``user`` may open — the ones they own, plus shared ones."""
    if not user or not user.is_authenticated:
        return Store.objects.none()

    accepted = _accepted(user)
    scope = Q(pk__in=accepted.filter(store__isnull=False).values("store_id"))
    # Account-wide rows predate per-store invites; see MerchantStaff.store.
    scope |= Q(merchant_id__in=accepted.filter(store__isnull=True).values("merchant_id"))

    mine = own_merchant(user)
    if mine is not None:
        scope |= Q(merchant=mine)

    return Store.objects.filter(scope).select_related("merchant")


@dataclass(frozen=True)
class StoreAccess:
    """What the caller may do with one store they can already reach.

    A teammate runs the shop: products, orders, storefront design, and
    publishing it. What stays with the owner is everything about the
    *account* rather than the shop — deleting the store, deciding who else
    gets in, billing and payouts. Those are the only checks callers need,
    so ``is_owner`` is the whole permission surface.

    ``role`` is the label the owner chose when inviting (admin, manager,
    support). It is shown in the team list and on the store card; it does
    not currently narrow what a teammate can do.
    """

    store: Store
    is_owner: bool
    role: str


def store_access(user, store):
    """Describe ``user``'s relationship to ``store``.

    Assumes the store already came out of :func:`accessible_stores`; for an
    unrelated store this reports a teammate with no role rather than
    raising, so callers must do the reachability check first.
    """
    mine = own_merchant(user)
    if mine is not None and store.merchant_id == mine.id:
        return StoreAccess(store=store, is_owner=True, role="owner")

    membership = (
        _accepted(user)
        .filter(Q(store=store) | Q(store__isnull=True, merchant_id=store.merchant_id))
        .first()
    )
    return StoreAccess(
        store=store,
        is_owner=False,
        role=membership.role if membership is not None else "",
    )
