"""
Storefront signals — keeping the cached public payload honest.

Every model here contributes something to the response
``PublicStorefrontByDomainView`` returns, so a change to any of them has to
invalidate it. The receivers are deliberately dumb: work out which store was
affected, bump its version, done. No attempt to decide whether a particular
field actually appears in the payload — that judgement would have to be kept in
step with the payload builders forever, and getting it wrong shows a merchant a
shop that does not match what they just saved.

``post_delete`` matters as much as ``post_save``. Removing a product or turning
a section off is the change most likely to be noticed and least likely to be
forgiven: the shop keeps advertising something that is gone.

Signals rather than explicit calls in the views because these models are edited
from more than the storefront endpoints — the admin, management commands, the
blueprint apply path, and bulk product imports all write them, and none of those
would remember to clear a cache.
"""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.products.models import Product, ProductFile, ProductImage, ProductVariant
from apps.stores.models import Store

from . import cache as sf_cache
from .models import ServiceForm, StorefrontConfig, StorefrontSection


def _invalidate_store(instance) -> None:
    """Bump the version for the store an instance belongs to."""
    store_id = getattr(instance, "store_id", None)
    if store_id:
        sf_cache.invalidate(store_id)


@receiver(post_save, sender=Store)
@receiver(post_delete, sender=Store)
def on_store_change(sender, instance, **kwargs):
    """The store row itself: name, logo, currency, contact details, SEO, and
    the site_settings JSON blob that carries availability and the cookie
    banner. Publishing and unpublishing land here too."""
    sf_cache.invalidate(instance.pk)


@receiver(post_save, sender=StorefrontConfig)
@receiver(post_delete, sender=StorefrontConfig)
@receiver(post_save, sender=StorefrontSection)
@receiver(post_delete, sender=StorefrontSection)
@receiver(post_save, sender=ServiceForm)
@receiver(post_delete, sender=ServiceForm)
def on_storefront_change(sender, instance, **kwargs):
    """Theme, layout, sections and the service form — all keyed on `store`."""
    _invalidate_store(instance)


@receiver(post_save, sender=Product)
@receiver(post_delete, sender=Product)
def on_product_change(sender, instance, **kwargs):
    """The payload carries the first fifty active products, so any product
    change can reorder or replace what is on the page."""
    _invalidate_store(instance)


@receiver(post_save, sender=ProductImage)
@receiver(post_delete, sender=ProductImage)
@receiver(post_save, sender=ProductVariant)
@receiver(post_delete, sender=ProductVariant)
@receiver(post_save, sender=ProductFile)
@receiver(post_delete, sender=ProductFile)
def on_product_detail_change(sender, instance, **kwargs):
    """Images, variants and downloadable files hang off a product, not a store,
    so this costs one query to find the store. Worth it: the primary image is in
    the payload, and a product whose image changed but whose card still shows
    the old one looks like the upload failed.

    Wrapped because a cascade delete can fire this after the product row is
    already gone, and a signal must not turn a successful delete into a 500."""
    try:
        store_id = instance.product.store_id
    except Exception:
        return
    if store_id:
        sf_cache.invalidate(store_id)
