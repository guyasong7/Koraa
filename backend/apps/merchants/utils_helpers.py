from rest_framework.exceptions import PermissionDenied


def require_own_merchant(user):
    """
    The merchant profile the user owns, for actions that belong to the account
    rather than to a single store: creating a store, inviting teammates,
    payouts, billing.

    Distinct from get_active_merchant, which falls back to an employer's
    merchant. That fallback is wrong here — it would let a teammate spend the
    owner's store quota or invite people onto the owner's account.
    """
    merchant = getattr(user, "merchant", None)
    if merchant is None:
        raise PermissionDenied(
            "Only the account owner can do this. Complete merchant onboarding "
            "to open a store of your own."
        )
    return merchant


def get_active_merchant(user):
    """
    Returns the Merchant that the user is currently acting as.
    First checks if the user is the owner of a merchant profile.
    If not, checks if the user is an accepted staff member for any merchant.
    Raises PermissionDenied if neither is found.

    This is for merchant-level reads only (profile, identity). It cannot
    answer "which stores may this user open?" — it collapses to a single
    merchant, and to the user's *own* one whenever they have it, so an
    accepted invite is invisible to it. Store access lives in
    apps.stores.access.accessible_stores.
    """
    if hasattr(user, "merchant"):
        return user.merchant

    # Only accepted invitations grant access. Without this filter, anyone who
    # had merely been invited — or who had explicitly rejected the invite —
    # acted as the merchant with full permissions.
    from .models import MerchantStaff

    first_employment = (
        user.merchant_employments.filter(status=MerchantStaff.Status.ACCEPTED)
        .select_related("merchant")
        .first()
    )
    if first_employment:
        return first_employment.merchant

    raise PermissionDenied(
        "You must complete merchant onboarding or accept a team invitation first."
    )
