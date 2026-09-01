"""
Storefront views.

Merchant-authenticated endpoints:
  GET/PATCH  /api/v1/storefront/config/
  GET/POST   /api/v1/storefront/sections/
  PATCH/DEL  /api/v1/storefront/sections/{id}/
  POST       /api/v1/storefront/sections/reorder/
  POST       /api/v1/storefront/publish/
  GET/PATCH  /api/v1/storefront/service-form/
  GET        /api/v1/storefront/enquiries/
  GET/PATCH  /api/v1/storefront/enquiries/{id}/

Public endpoints (no auth):
  GET  /api/v1/public/storefront/{slug}/config/
  GET  /api/v1/public/storefront/{slug}/sections/
  GET  /api/v1/public/storefront/by-domain/
  POST /api/v1/public/storefront/{slug}/unlock/
  POST /api/v1/public/storefront/{slug}/enquiries/
  GET  /api/v1/public/storefront/{slug}/robots.txt
"""

from django.utils import timezone
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.db.models import Max
from django.http import HttpResponse
import uuid as uuid_module

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework.exceptions import (
    NotFound,
    PermissionDenied,
    ValidationError as DRFValidationError,
)

from apps.stores.access import accessible_stores
from apps.stores.models import Store
from apps.stores import site_settings
from . import cache as sf_cache
from . import enquiries
from .models import FormSubmission, ServiceForm, StorefrontConfig, StorefrontSection
from .serializers import (
    StorefrontConfigSerializer,
    StorefrontSectionSerializer,
    StorefrontSectionCreateSerializer,
    SectionReorderListSerializer,
    BlueprintApplySerializer,
    FormSubmissionSerializer,
    PublicServiceFormSerializer,
    PublicStorefrontConfigSerializer,
    PublicStorefrontSectionSerializer,
    ServiceFormSerializer,
)
from .permissions import CanManageStore



# ── Helpers ────────────────────────────────────────────────────────────────────

def get_merchant_store(request):
    """The store this request is about.

    ``?store_id=<uuid>`` names it explicitly; without one, fall back to the
    caller's newest active store. Resolved against every store they may
    open — their own and any shared with them — so a teammate editing a
    shared storefront lands on the right shop rather than on nothing.
    """
    stores = accessible_stores(request.user)

    store_id = request.query_params.get("store_id")
    if store_id:
        try:
            store = stores.filter(id=store_id).first()
        except (DjangoValidationError, ValueError):
            # A malformed uuid is a bad request, not a server error.
            raise DRFValidationError({"store_id": "Not a valid store id."})
        if store is None:
            raise PermissionDenied("You do not have access to this store.")
        return store

    store = stores.filter(
        status__in=["draft", "preview", "published"]
    ).order_by("-created_at").first()

    if not store:
        raise PermissionDenied("No store found. Create a store first.")
    return store


def get_or_create_config(store):
    """Get or lazily create StorefrontConfig for a store."""
    from .models import StorefrontConfig, create_default_sections
    from .presets import get_base_config
    
    config, created_config = StorefrontConfig.objects.get_or_create(store=store)
    if created_config:
        business_type = store.merchant.business_type if store.merchant else "other"
        base_cfg = get_base_config(business_type)
        
        # Apply the tailored config settings
        for key, value in base_cfg.items():
            setattr(config, key, value)
        config.save()
        
        create_default_sections(store)
    return config


# ── Merchant endpoints ─────────────────────────────────────────────────────────

class StorefrontConfigView(APIView):
    """
    GET  /api/v1/storefront/config/  — get draft config
    PATCH /api/v1/storefront/config/ — update draft config
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        store = get_merchant_store(request)
        config = get_or_create_config(store)
        serializer = StorefrontConfigSerializer(config)
        return Response(serializer.data)

    def patch(self, request):
        store = get_merchant_store(request)
        config = get_or_create_config(store)
        serializer = StorefrontConfigSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class StorefrontSectionListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/v1/storefront/sections/ — list sections
    POST /api/v1/storefront/sections/ — create section
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        store = get_merchant_store(self.request)
        return StorefrontSection.objects.filter(store=store).order_by("order")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return StorefrontSectionCreateSerializer
        return StorefrontSectionSerializer

    def create(self, request, *args, **kwargs):
        store = get_merchant_store(request)
        serializer = StorefrontSectionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        section = serializer.save(store=store)
        return Response(
            StorefrontSectionSerializer(section).data,
            status=status.HTTP_201_CREATED,
        )


class StorefrontSectionDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    PATCH  /api/v1/storefront/sections/{id}/ — update section
    DELETE /api/v1/storefront/sections/{id}/ — delete section
    """
    permission_classes = [permissions.IsAuthenticated, CanManageStore]
    serializer_class = StorefrontSectionSerializer

    def get_queryset(self):
        store = get_merchant_store(self.request)
        return StorefrontSection.objects.filter(store=store)

    def get_object(self):
        obj = super().get_object()
        self.check_object_permissions(self.request, obj)
        return obj


class SectionReorderView(APIView):
    """
    POST /api/v1/storefront/sections/reorder/
    Body: { sections: [{id, order}, ...] }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        store = get_merchant_store(request)
        serializer = SectionReorderListSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        section_ids = [str(s["id"]) for s in serializer.validated_data["sections"]]
        # Security: only allow sections belonging to the merchant's store
        qs = StorefrontSection.objects.filter(store=store, id__in=section_ids)
        section_map = {str(s.id): s for s in qs}

        if len(section_map) != len(section_ids):
            raise PermissionDenied("One or more sections do not belong to your store.")

        for item in serializer.validated_data["sections"]:
            section = section_map[str(item["id"])]
            section.order = item["order"]
            section.save(update_fields=["order"])

        return Response({"status": "reordered"})


class StorefrontPublishView(APIView):
    """
    POST /api/v1/storefront/publish/
    Snapshots draft config + sections into published state.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        store = get_merchant_store(request)
        config = get_or_create_config(store)

        # Snapshot config
        config.published_config = config.to_dict()
        config.published_at = timezone.now()
        config.save(update_fields=["published_config", "published_at"])

        # Snapshot each section's settings
        sections = StorefrontSection.objects.filter(store=store)
        for section in sections:
            section.published_settings = section.settings
        StorefrontSection.objects.bulk_update(sections, ["published_settings"])

        # Mark store as published if it's still in draft
        if store.status == Store.Status.DRAFT:
            store.publish()

        return Response({
            "status": "published",
            "published_at": config.published_at,
            "storefront_url": store.storefront_url,
        })


class BlueprintCatalogueView(APIView):
    """
    GET /api/v1/storefront/blueprint/?store_id=<uuid>

    Every choice the guided setup wizard can offer, plus a complete set of
    pre-filled answers derived from the merchant's business type. The
    frontend renders this verbatim — nothing about the palettes, pairings
    or kits is duplicated in the client — so adding a palette here makes
    it appear in the wizard without a frontend deploy.

    ``current`` reports the store's live config so the wizard can open on
    the merchant's existing look when they re-run it, rather than acting
    as if every shop were brand new.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from . import blueprint

        store = get_merchant_store(request)
        config = get_or_create_config(store)
        merchant = store.merchant

        return Response({
            **blueprint.catalogue(
                merchant.business_type if merchant is not None else None
            ),
            "current": {
                "font": config.font,
                "heading_font": config.heading_font,
                "button_style": config.button_style,
                "product_card_style": config.product_card_style,
                "primary_color": config.primary_color,
                "sections": list(
                    StorefrontSection.objects
                    # Only what the homepage step can show a switch for. The
                    # frontend seeds that step from this list and posts it back
                    # untouched, so a services store's enquiry form — enabled by
                    # its preset, absent from the menu — came back as a section
                    # the serializer refuses, failing the wizard on a row the
                    # merchant was never shown.
                    .filter(
                        store=store,
                        enabled=True,
                        type__in=blueprint.OFFERABLE_SECTIONS,
                    )
                    .order_by("order")
                    .values_list("type", flat=True)
                ),
            },
            "store": {
                "id": str(store.id),
                "name": store.name,
                "tagline": store.tagline,
            },
        })


class BlueprintApplyView(APIView):
    """
    POST /api/v1/storefront/blueprint/apply/?store_id=<uuid>
    Body: {category, palette, pairing, style_kit, sections: [type, ...]}

    Writes the wizard's answers to the draft config and section layout. The
    result is not published — the merchant lands in the editor with a live
    preview and publishes when they are happy, which is the same path the
    manual editor already uses.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from . import blueprint

        store = get_merchant_store(request)
        # Ensures a config row and the preset sections exist before apply
        # touches them, so a store created before Blueprint does not need
        # special handling.
        get_or_create_config(store)

        serializer = BlueprintApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        blueprint.apply(store, **serializer.validated_data)

        config = store.storefront_config
        config.refresh_from_db()
        sections = StorefrontSection.objects.filter(store=store).order_by("order")

        return Response({
            "status": "applied",
            "config": StorefrontConfigSerializer(config).data,
            "sections": StorefrontSectionSerializer(sections, many=True).data,
        })


class SectionImageUploadView(APIView):
    """
    POST /api/v1/storefront/sections/{id}/upload-image/
    Upload an image file for a section's settings (e.g. hero background).
    Returns the URL to store in section.settings.image
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        store = get_merchant_store(request)
        try:
            section = StorefrontSection.objects.get(pk=pk, store=store)
        except StorefrontSection.DoesNotExist:
            raise NotFound("Section not found.")

        uploaded = request.FILES.get("image")
        if not uploaded:
            return Response({"error": "No image provided."}, status=400)

        # Save to media/storefront/sections/<uuid>.<ext>
        ext = uploaded.name.split(".")[-1].lower()
        filename = f"storefront/sections/{uuid_module.uuid4()}.{ext}"
        path = default_storage.save(filename, ContentFile(uploaded.read()))
        url = request.build_absolute_uri(f"/media/{path}")

        # Persist to section.settings
        section.settings = {**section.settings, "image": url}
        section.save(update_fields=["settings"])

        return Response({"url": url, "section_id": str(section.id)})


class StoreAssetUploadView(APIView):
    """
    POST /api/v1/storefront/store-assets/
    Upload the store's logo, favicon or social sharing image.
    Body: multipart/form-data with field 'logo', 'favicon' or 'social_image'
    """
    permission_classes = [permissions.IsAuthenticated]

    #: Where each field's files land. `social_image` is here because the Social
    #: Sharing settings panel uploads through this endpoint; a file cannot live
    #: in the site_settings JSON blob alongside the rest of that panel.
    ASSET_DIRS = {
        "logo": "stores/logos",
        "favicon": "stores/favicons",
        "social_image": "stores/social",
    }

    def post(self, request):
        store = get_merchant_store(request)
        updated = []

        for field, directory in self.ASSET_DIRS.items():
            file = request.FILES.get(field)
            if not file:
                continue
            ext = file.name.split(".")[-1].lower()
            filename = f"{directory}/{uuid_module.uuid4()}.{ext}"
            path = default_storage.save(filename, ContentFile(file.read()))
            setattr(store, field, path)
            updated.append(field)

        if updated:
            store.save(update_fields=updated)

        def url(field):
            asset = getattr(store, field)
            return request.build_absolute_uri(asset.url) if asset else None

        return Response({field: url(field) for field in self.ASSET_DIRS})



# ── Public endpoints ───────────────────────────────────────────────────────────

def _serialize_products(store, request):
    """Return a lightweight list of active products for the storefront."""
    from apps.products.models import Product
    products = (
        Product.objects
        .filter(store=store, status="active")
        .prefetch_related("images", "variants", "files")
        .order_by("-is_featured", "-created_at")[:50]
    )
    result = []
    for p in products:
        primary = p.images.filter(is_primary=True).first() or p.images.first()
        result.append({
            "id": str(p.id),
            "name": p.name,
            "slug": p.slug,
            "short_description": p.short_description,
            "base_price": str(p.base_price),
            "compare_at_price": str(p.compare_at_price) if p.compare_at_price else None,
            "is_featured": p.is_featured,
            "is_on_sale": p.is_on_sale,
            "in_stock": p.in_stock,
            # A digital file and a service are not bought the way a shirt is:
            # one is an instant download, the other is an enquiry. The storefront
            # cannot render the right control without being told which.
            "product_type": p.product_type,
            "file_count": len(p.files.all()) if p.is_digital else 0,
            # Only meaningful on a service. False means the merchant does not
            # want to be asked about this one, so the card shows a price and no
            # button rather than an enquiry link that leads nowhere useful.
            "accepts_enquiries": p.accepts_enquiries if p.is_service else False,
            "image": request.build_absolute_uri(primary.image.url) if primary and primary.image else None,
        })
    return result


class PublicStorefrontConfigView(APIView):
    """
    GET /api/v1/public/storefront/{slug}/config/
    Returns the PUBLISHED config for a store (safe for customers).
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, slug):
        try:
            store = Store.objects.get(slug=slug, status=Store.Status.PUBLISHED)
        except Store.DoesNotExist:
            raise NotFound("Store not found or not published.")

        try:
            config = store.storefront_config
        except StorefrontConfig.DoesNotExist:
            raise NotFound("Storefront not configured.")

        serializer = PublicStorefrontConfigSerializer(config, context={"request": request})
        return Response(serializer.data)


class PublicStorefrontSectionsView(APIView):
    """
    GET /api/v1/public/storefront/{slug}/sections/
    Returns the enabled PUBLISHED sections ordered by `order`.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, slug):
        try:
            store = Store.objects.get(slug=slug, status=Store.Status.PUBLISHED)
        except Store.DoesNotExist:
            raise NotFound("Store not found or not published.")

        sections = StorefrontSection.objects.filter(
            store=store, enabled=True
        ).order_by("order")

        serializer = PublicStorefrontSectionSerializer(sections, many=True)
        return Response(serializer.data)


def _resolve_store_by_domain(domain: str) -> Store:
    """The published store a hostname belongs to, or 404.

    Two ways in, in priority order: an explicit verified StoreDomain mapping,
    then the subdomain pattern (``bella-fashion.koraa.cm`` and, in dev,
    ``bella-fashion.localhost:3000``).
    """
    from apps.domains.models import StoreDomain

    store_domain = StoreDomain.objects.filter(
        domain=domain, is_verified=True, status="active"
    ).select_related("store").first()
    if store_domain:
        return store_domain.store

    slug = domain.split(":")[0].split(".")[0]
    try:
        # Published only. Draft, preview and suspended stores are not public —
        # the merchant's own preview goes through PreviewStorefrontView, which
        # is authenticated and owner-scoped.
        return Store.objects.get(slug=slug, status=Store.Status.PUBLISHED)
    except Store.DoesNotExist:
        raise NotFound("No store found for this domain.")


def _storefront_payload(store, request) -> dict:
    """Everything the storefront app needs to render one shop."""
    try:
        config = store.storefront_config
    except StorefrontConfig.DoesNotExist:
        raise NotFound("Storefront not configured.")

    sections = StorefrontSection.objects.filter(
        store=store, enabled=True
    ).order_by("order")

    def asset(field):
        value = getattr(store, field)
        return request.build_absolute_uri(value.url) if value else None

    return {
        "store": {
            "id": str(store.id),
            "name": store.name,
            "slug": store.slug,
            "tagline": store.tagline,
            "description": store.description,
            "logo": asset("logo"),
            "favicon": asset("favicon"),
            "social_image": asset("social_image"),
            "currency": store.currency,
            "email": store.email,
            "phone": store.phone,
            "whatsapp": store.whatsapp,
            "instagram": store.instagram,
            "facebook": store.facebook,
            "seo_title": store.seo_title,
            "seo_description": store.seo_description,
        },
        # Availability, languages, cookie banner, Pinterest buttons and image
        # handling all live here. `public()` swaps the passcode for a boolean —
        # this response is served to anyone who asks.
        "settings": site_settings.public(store),
        "config": PublicStorefrontConfigSerializer(config, context={"request": request}).data,
        "sections": PublicStorefrontSectionSerializer(sections, many=True).data,
        "products": _serialize_products(store, request),
        # Only when the merchant has switched it on. A `contact_form` section
        # with no form behind it renders nothing, so the storefront checks this
        # key rather than assuming the section implies a form.
        "service_form": _public_service_form(store),
    }


def _public_service_form(store):
    """The enquiry form for a storefront, or None.

    Read rather than created: a shop that has never opened the builder has no
    row, and minting one from a public GET would write to the database on every
    crawl of every storefront.
    """
    form = getattr(store, "service_form", None)
    if form is None or not form.is_enabled:
        return None
    return PublicServiceFormSerializer(form).data


def _gate_payload(store, request, reason: str) -> dict:
    """What a locked shop returns instead of itself.

    Deliberately a 200 rather than a 401: the storefront app treats any non-2xx
    from this endpoint as "no such shop" and renders a 404, and a shop behind a
    passcode is not a shop that does not exist. The payload carries only what
    the gate screen needs to look like the merchant's shop — name, logo and
    their own message — and none of the catalogue.
    """
    return {
        "locked": reason,
        "store": {
            "name": store.name,
            "slug": store.slug,
            "logo": request.build_absolute_uri(store.logo.url) if store.logo else None,
            "favicon": request.build_absolute_uri(store.favicon.url) if store.favicon else None,
        },
        "gate": {
            "message": site_settings.get(store, "availability_note"),
            "primary_color": getattr(
                getattr(store, "storefront_config", None), "primary_color", ""
            ),
        },
    }


def _availability_block(store, passcode: str = "") -> str:
    """``""`` if this visitor may see the shop, else why not.

    Enforced here rather than in the frontend because this endpoint *is* the
    shop: a gate that only the Next.js page honoured would be bypassed by
    fetching the API directly.
    """
    mode = site_settings.get(store, "availability")
    if mode == "private":
        return "private"
    if mode == "password":
        expected = site_settings.get(store, "access_password")
        if not expected:
            # A shop set to password with no passcode saved would otherwise be
            # sealed shut with no way in, including for the merchant.
            return ""
        # Not constant-time, and it does not need to be: the value is a
        # merchant-chosen shop passcode, the endpoint is rate limited, and a
        # timing oracle over the network is a worse attack than guessing.
        return "" if passcode == expected else "password"
    return ""


class PublicStorefrontByDomainView(APIView):
    """
    GET /api/v1/public/storefront/by-domain/?domain=bella-fashion.koraa.cm
    Resolves a hostname to a store's published config + sections.
    Used by the storefront Next.js app on every request.

    The payload is cached — see ``apps.storefront.cache`` for how it is keyed
    and invalidated. Resolution and the availability gate deliberately stay
    outside the cache: ``_resolve_store_by_domain`` filters on PUBLISHED and
    ``_availability_block`` reads the passcode setting, so unpublishing a shop
    or putting it behind a password takes effect on the next request rather
    than when a cache entry happens to expire.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        domain = request.query_params.get("domain", "").strip().lower()
        if not domain:
            return Response({"error": "domain is required"}, status=400)

        store = _resolve_store_by_domain(domain)

        blocked = _availability_block(store)
        if blocked:
            # Not cached: it is four fields and a colour, and a locked shop is
            # not the traffic worth optimising for.
            return Response(_gate_payload(store, request, blocked))

        return Response(
            sf_cache.get_or_build(
                store.pk, request, lambda: _storefront_payload(store, request)
            )
        )


class StorefrontUnlockView(APIView):
    """
    POST /api/v1/public/storefront/{slug}/unlock/  {"passcode": "..."}

    Returns the full storefront payload when the passcode is right. A POST with
    the passcode in the body rather than a GET with it in the query string, so
    it does not end up in access logs, browser history or a shared link.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    #: Reuses the login rate (10/minute). This is a password prompt, and an
    #: unthrottled one on a public endpoint is a four-digit passcode away from
    #: being no gate at all.
    throttle_scope = "auth"

    def post(self, request, slug):
        try:
            store = Store.objects.get(slug=slug, status=Store.Status.PUBLISHED)
        except Store.DoesNotExist:
            raise NotFound("No store found.")

        passcode = str(request.data.get("passcode", "")).strip()
        blocked = _availability_block(store, passcode)
        if blocked == "private":
            raise PermissionDenied("This shop is private.")
        if blocked:
            return Response(
                {"detail": "That passcode is not right."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # The same payload the by-domain endpoint serves, so it shares the cache
        # entry rather than building a second copy of it. The passcode was
        # checked above; the cached value carries nothing the gate was hiding
        # that an unlocked visitor should not see.
        return Response(
            sf_cache.get_or_build(
                store.pk, request, lambda: _storefront_payload(store, request)
            )
        )


class StorefrontRobotsView(APIView):
    """
    GET /api/v1/public/storefront/{slug}/robots.txt

    Built from the store's Crawlers settings. Served as text/plain so the
    storefront app can proxy it straight through at /robots.txt.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, slug):
        store = Store.objects.filter(slug=slug).first()
        if store is None:
            # An unknown host gets the safest answer rather than a 404 a crawler
            # would not know what to do with.
            return HttpResponse("User-agent: *\nDisallow: /\n", content_type="text/plain")

        return HttpResponse(_robots_txt(store, request), content_type="text/plain")


#: Crawlers that are allowed through on "search engines only".
_SEARCH_AGENTS = ["Googlebot", "Bingbot", "DuckDuckBot", "Slurp", "YandexBot", "Baiduspider"]


def _robots_txt(store, request) -> str:
    """The robots.txt for one shop.

    A shop that is not published, or is private or behind a passcode, is
    disallowed outright whatever the crawler setting says — the setting is about
    a live public shop, and letting Google index a store still being built is
    how a half-finished draft ends up as somebody's search result.
    """
    lines: list[str] = [f"# {store.name} — served by Koraa"]

    if store.status != Store.Status.PUBLISHED or site_settings.get(store, "availability") != "public":
        lines += ["User-agent: *", "Disallow: /"]
        return "\n".join(lines) + "\n"

    mode = site_settings.get(store, "crawlers")
    delay = site_settings.get(store, "crawl_delay")

    # Named refusals come first: a crawler stops at the first group matching its
    # own user-agent, so a specific Disallow after a wildcard Allow still wins.
    for agent in site_settings.get(store, "blocked_agents"):
        lines += ["", f"User-agent: {agent}", "Disallow: /"]

    if mode == "block_all":
        lines += ["", "User-agent: *", "Disallow: /"]
    elif mode == "search_only":
        for agent in _SEARCH_AGENTS:
            lines += ["", f"User-agent: {agent}", "Allow: /"]
        lines += ["", "User-agent: *", "Disallow: /"]
    else:
        lines += ["", "User-agent: *", "Allow: /", "Disallow: /checkout", "Disallow: /cart"]

    if delay:
        lines += [f"Crawl-delay: {delay}"]

    extra = site_settings.get(store, "custom_robots").strip()
    if extra:
        lines += ["", "# Added by the merchant", extra]

    sitemap = f"{store.storefront_url.rstrip('/')}/sitemap.xml"
    lines += ["", f"Sitemap: {sitemap}"]
    return "\n".join(lines) + "\n"


class PreviewStorefrontView(APIView):
    """
    GET /api/v1/public/storefront/preview/{store_id}/
    Returns DRAFT config for the preview iframe.
    Requires the merchant's JWT token.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, store_id):
        # Shared stores included: this endpoint backs the storefront editor
        # and the Blueprint preview pane, both of which a teammate can open.
        store = accessible_stores(request.user).filter(id=store_id).first()
        if store is None:
            raise NotFound("Store not found.")

        config = get_or_create_config(store)
        sections = StorefrontSection.objects.filter(store=store).order_by("order")

        return Response({
            "store": {
                "id": str(store.id),
                "name": store.name,
                "slug": store.slug,
                "tagline": store.tagline,
                "logo": request.build_absolute_uri(store.logo.url) if store.logo else None,
                "currency": store.currency,
            },
            # The editor preview honours the same settings the live shop does,
            # so a merchant turning on the cookie banner or the Pinterest
            # buttons sees them in the pane rather than only after publishing.
            "settings": site_settings.public(store),
            "config": StorefrontConfigSerializer(config).data,
            "sections": StorefrontSectionSerializer(sections, many=True).data,
            "products": _serialize_products(store, request),
            "service_form": _public_service_form(store),
        })


# ── Service enquiry form ──────────────────────────────────────────────────────
#
# Koraa sells to service businesses as well as shops, and a photographer cannot
# price a wedding from a product grid. The form is how they get asked, and every
# submission is emailed to them with the sender as reply-to — so answering a lead
# is hitting Reply.
#
# The builder is one endpoint, GET and PATCH, in the same shape as the storefront
# config it sits beside. Validation of the field list lives in the serializer;
# validation of a *submission* against that list lives in ``enquiries``, because
# only the second one has to be safe against the open internet.


def _ensure_enquiry_section(store) -> None:
    """Give the storefront somewhere to render the form.

    The section list comes from the blueprint preset, and only the services
    preset ships a ``contact_form``. A merchant who started as a shop and later
    switched the enquiry form on would otherwise have designed a form that
    nothing renders — their storefront falls back to a ``mailto:`` link, which
    loses every field they just wrote.

    Inserted where a "get in touch" belongs: last, but above the footer. The
    footer is pushed down by one rather than the new section sharing its order,
    because ``Meta.ordering = ["order"]`` alone leaves a tie unresolved.
    """
    sections = store.storefront_sections
    if sections.filter(type=StorefrontSection.SectionType.CONTACT_FORM).exists():
        return

    footer = sections.filter(type=StorefrontSection.SectionType.FOOTER).first()
    if footer is not None:
        order = footer.order
        footer.order = order + 1
        footer.save(update_fields=["order"])
    else:
        highest = sections.aggregate(top=Max("order"))["top"]
        order = (highest or 0) + 1

    StorefrontSection.objects.create(
        store=store,
        type=StorefrontSection.SectionType.CONTACT_FORM,
        order=order,
        enabled=True,
        # Left empty on purpose: the section falls back to the form's own title
        # and description, so the two cannot drift apart until the merchant
        # deliberately overrides them in the editor.
        settings={},
    )


class ServiceFormView(APIView):
    """
    GET   /api/v1/storefront/service-form/  — the form, created on first read
    PATCH /api/v1/storefront/service-form/  — save the builder

    Unlike the public payload this does create the row: a merchant who has opened
    the builder is about to edit something, and handing them a 404 to fill in
    would mean the first save is a POST and every one after it a PATCH.
    """

    permission_classes = [permissions.IsAuthenticated]

    def _form(self, request):
        store = get_merchant_store(request)
        form, _created = ServiceForm.objects.get_or_create(store=store)
        return form

    def get(self, request):
        return Response(ServiceFormSerializer(self._form(request)).data)

    def patch(self, request):
        form = self._form(request)
        serializer = ServiceFormSerializer(form, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        form = serializer.save()
        # A form with no section to render it is invisible, and the merchant has
        # no way to add a section from the editor.
        if form.is_enabled and form.fields:
            _ensure_enquiry_section(form.store)
        return Response(serializer.data)


class ServiceFormSubmissionListView(generics.ListAPIView):
    """
    GET /api/v1/storefront/enquiries/ — the leads, newest first

    Kept in the dashboard as well as emailed. An inbox is a notification, not a
    record: addresses change, mail gets deleted, and a lead that only ever
    existed in a message is a lead lost.
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = FormSubmissionSerializer

    def get_queryset(self):
        store = get_merchant_store(self.request)
        return FormSubmission.objects.filter(store=store)


class ServiceFormSubmissionDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/v1/storefront/enquiries/{id}/

    PATCH exists for ``is_read`` and nothing else — everything a visitor sent is
    read-only, because a lead a merchant can edit is not evidence of anything.
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = FormSubmissionSerializer

    def get_queryset(self):
        return FormSubmission.objects.filter(
            store__in=accessible_stores(self.request.user)
        )


class PublicServiceFormSubmitView(APIView):
    """
    POST /api/v1/public/storefront/{slug}/enquiries/  {"answers": {...}}

    Throttled on the anonymous scope. Anything that accepts a body from the
    internet and emails it onward is a spam relay otherwise, and the merchant's
    own inbox is what pays for that.

    Answers the visitor with the merchant's own success message rather than a
    generic one, so the confirmation reads in the shop's voice.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "anon"

    def post(self, request, slug):
        try:
            store = Store.objects.get(slug=slug, status=Store.Status.PUBLISHED)
        except Store.DoesNotExist:
            raise NotFound("Store not found or not published.")

        form = getattr(store, "service_form", None)
        if form is None or not form.is_enabled:
            raise NotFound("This shop is not taking enquiries.")

        # Accepts either {"answers": {...}} or the answers at the top level, so
        # a plain form POST and a JSON fetch both work.
        payload = request.data.get("answers")
        if not isinstance(payload, dict):
            payload = {
                key: request.data.get(key)
                for key in request.data
                if key != "answers"
            }

        try:
            answers = enquiries.validate(form, payload)
        except enquiries.EnquiryError as exc:
            return Response(
                {"errors": exc.errors}, status=status.HTTP_400_BAD_REQUEST
            )

        submission = enquiries.record(form, answers)
        # Stored first, then sent: a mail failure must still leave the merchant
        # a lead in the dashboard rather than losing it entirely.
        delivered = enquiries.notify(submission)

        return Response(
            {
                "received": True,
                "message": form.success_message,
                # Truthfully reported rather than always true. A merchant
                # debugging "I get no emails" needs to know the difference
                # between nobody submitting and SMTP being down.
                "emailed": delivered,
            },
            status=status.HTTP_201_CREATED,
        )

