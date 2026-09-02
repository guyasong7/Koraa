"""
Store SEO audit.

"They can come run their site SEO" — so this is a report the merchant asks
for, not a background job. It reads only what is already in the database:
nothing here fetches the live storefront, because a draft store has no live
storefront and it is precisely the draft store that needs the advice.

Design notes:

* **Every check earns or loses a weight.** A store that is not published
  cannot rank at all, so that check is worth five times a missing favicon.
  The score is the fraction of available weight earned, which means a shop
  with no products is not punished twice for having no product descriptions —
  checks that cannot apply are dropped from the denominator as well as the
  numerator (see ``Check.applicable``).

* **A warning is worth half.** Most SEO advice is not pass/fail: a 40-character
  meta description is not *absent*, it is short. Grading those as failures
  produces a score that never moves and advice nobody reads.

* **Every failing check carries a fix and, where possible, a link.** A score
  on its own tells a merchant they are bad at something. ``fix`` tells them
  what to type and ``action`` tells them where.

* **Placeholder copy counts as missing.** The blueprint seeds "Welcome to Our
  Store" so a new storefront is not blank, which means the most common real
  SEO problem on this platform is a live shop still carrying the demo text.
  A check that only looks for emptiness cannot see that, so the seeded strings
  are listed in ``PLACEHOLDERS`` and treated as unwritten.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from django.conf import settings
from django.utils import timezone

from apps.products.models import Product
from apps.storefront.models import StorefrontSection

from .models import Store

# ── Thresholds ────────────────────────────────────────────────────────────────
#
# What search engines actually display, not what the columns allow. Google
# truncates a title around 60 characters and a description around 160; the
# model permits 70 and 160, so a title can be valid and still be cut off.
TITLE_MIN, TITLE_IDEAL_MAX = 30, 60
DESC_MIN, DESC_IDEAL_MAX = 70, 160
#: Below this a product page is a price with a name on it — nothing to rank.
THIN_DESCRIPTION = 120

#: Copy the blueprint and the section defaults seed. Present in the database,
#: but not written by the merchant, so it is treated as absent.
PLACEHOLDERS = {
    "welcome to our store",
    "discover premium products, curated collections, and exclusive deals.",
    "our story",
    "we believe in high-quality products and exceptional customer service. "
    "every item is carefully selected to ensure the best experience.",
    "quality products, delivered to your door.",
    "browse by category",
    "featured products",
    "our collection",
}

PASS, WARN, FAIL = "pass", "warn", "fail"


def _written(value: Optional[str]) -> str:
    """The merchant's own words, or "" if this is seeded or blank."""
    text = (value or "").strip()
    if not text or text.lower() in PLACEHOLDERS:
        return ""
    return text


@dataclass
class Check:
    key: str
    label: str
    status: str
    weight: int
    detail: str
    fix: str = ""
    #: False when the check cannot apply — a store with no products is not
    #: failing "products have descriptions", the question does not arise. Such
    #: checks are reported for transparency but scored out of nothing.
    applicable: bool = True
    action: Optional[dict] = None

    def as_dict(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "status": self.status,
            "weight": self.weight,
            "detail": self.detail,
            "fix": self.fix,
            "applicable": self.applicable,
            "action": self.action,
        }


@dataclass
class Group:
    key: str
    title: str
    blurb: str
    checks: list = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "key": self.key,
            "title": self.title,
            "blurb": self.blurb,
            "checks": [c.as_dict() for c in self.checks],
        }


def _grade(score: int) -> str:
    if score >= 90:
        return "A"
    if score >= 75:
        return "B"
    if score >= 60:
        return "C"
    if score >= 40:
        return "D"
    return "F"


def _links(store: Store) -> dict:
    """Where each fix is performed, so the report can link to it."""
    base = f"/dashboard/stores/{store.id}"
    return {
        "seo": f"{base}/seo",
        "settings": f"{base}/settings",
        "design": f"{base}/settings",
        "store": base,
        "products": f"/dashboard/products?store={store.id}",
        "categories": f"{base}/categories",
    }


# ── The checks ────────────────────────────────────────────────────────────────


def _listing_group(store: Store, links: dict) -> Group:
    """What a search result for this shop looks like."""
    group = Group(
        key="listing",
        title="Search listing",
        blurb="The title and description Google shows when someone finds you.",
    )

    title = _written(store.seo_title)
    if not title:
        group.checks.append(Check(
            key="seo_title", label="Search title is set", status=FAIL, weight=5,
            detail="No search title, so search engines will invent one from the page.",
            fix=f"Write a {TITLE_MIN}–{TITLE_IDEAL_MAX} character title with your shop "
                "name and what you sell — “Bella Beauty — Skincare & Fragrance in Douala”.",
            action={"label": "Write a title", "href": links["seo"]},
        ))
    elif len(title) < TITLE_MIN:
        group.checks.append(Check(
            key="seo_title", label="Search title is set", status=WARN, weight=5,
            detail=f"Your title is {len(title)} characters — short enough to waste the space.",
            fix=f"Aim for {TITLE_MIN}–{TITLE_IDEAL_MAX} characters. Add what you sell, "
                "or the town you sell in.",
            action={"label": "Edit the title", "href": links["seo"]},
        ))
    elif len(title) > TITLE_IDEAL_MAX:
        group.checks.append(Check(
            key="seo_title", label="Search title is set", status=WARN, weight=5,
            detail=f"Your title is {len(title)} characters; Google cuts it off around "
                   f"{TITLE_IDEAL_MAX}.",
            fix="Put the important words first and trim the rest.",
            action={"label": "Shorten the title", "href": links["seo"]},
        ))
    else:
        group.checks.append(Check(
            key="seo_title", label="Search title is set", status=PASS, weight=5,
            detail=f"{len(title)} characters — a good length.",
        ))

    if title and store.name.lower() not in title.lower():
        group.checks.append(Check(
            key="title_brand", label="Your shop name is in the title", status=WARN, weight=1,
            detail=f"“{store.name}” does not appear in your search title.",
            fix="People search for shops by name. Put yours in the title.",
            action={"label": "Edit the title", "href": links["seo"]},
        ))
    elif title:
        group.checks.append(Check(
            key="title_brand", label="Your shop name is in the title", status=PASS, weight=1,
            detail="Someone searching your name will find this listing.",
        ))

    desc = _written(store.seo_description)
    if not desc:
        group.checks.append(Check(
            key="seo_description", label="Search description is set", status=FAIL, weight=4,
            detail="No description, so search engines will quote whatever text they find first.",
            fix=f"Write {DESC_MIN}–{DESC_IDEAL_MAX} characters saying what you sell, "
                "who for, and where you deliver. This is your advert.",
            action={"label": "Write a description", "href": links["seo"]},
        ))
    elif len(desc) < DESC_MIN:
        group.checks.append(Check(
            key="seo_description", label="Search description is set", status=WARN, weight=4,
            detail=f"{len(desc)} characters — under half the space you are given.",
            fix=f"Aim for {DESC_MIN}–{DESC_IDEAL_MAX} characters.",
            action={"label": "Edit the description", "href": links["seo"]},
        ))
    elif len(desc) > DESC_IDEAL_MAX:
        group.checks.append(Check(
            key="seo_description", label="Search description is set", status=WARN, weight=4,
            detail=f"{len(desc)} characters; the end will be cut off with an ellipsis.",
            fix=f"Trim to {DESC_IDEAL_MAX} characters.",
            action={"label": "Shorten the description", "href": links["seo"]},
        ))
    else:
        group.checks.append(Check(
            key="seo_description", label="Search description is set", status=PASS, weight=4,
            detail=f"{len(desc)} characters — a good length.",
        ))

    slug = store.slug or ""
    if len(slug) < 4 or slug.replace("-", "").isdigit():
        group.checks.append(Check(
            key="slug", label="Web address is readable", status=WARN, weight=2,
            detail=f"“{slug}” tells a customer nothing about the shop.",
            fix="A readable address is easier to remember, to type and to trust. "
                "Changing it breaks existing links, so change it before you advertise.",
            action={"label": "Store settings", "href": links["store"]},
        ))
    else:
        group.checks.append(Check(
            key="slug", label="Web address is readable", status=PASS, weight=2,
            detail=f"{slug}.{settings.KORAA_STOREFRONT_DOMAIN} reads as a shop address.",
        ))

    return group


def _reachable_group(store: Store, links: dict) -> Group:
    """Whether a search engine can see the shop at all."""
    group = Group(
        key="reachable",
        title="Can be found",
        blurb="Nothing else on this page matters while the shop is invisible.",
    )

    if store.status == Store.Status.PUBLISHED:
        group.checks.append(Check(
            key="published", label="Store is published", status=PASS, weight=8,
            detail="Live, and search engines can reach it.",
        ))
    else:
        group.checks.append(Check(
            key="published", label="Store is published", status=FAIL, weight=8,
            detail=f"This store is {store.get_status_display().lower()}. "
                   "It is not on the internet, so it cannot rank for anything.",
            fix="Publish the store. Everything else here is preparation for that.",
            action={"label": "Publish", "href": links["store"]},
        ))

    if store.custom_domain and store.domain_verified:
        group.checks.append(Check(
            key="domain", label="Own domain connected", status=PASS, weight=2,
            detail=f"Serving from {store.custom_domain}.",
        ))
    elif store.custom_domain:
        group.checks.append(Check(
            key="domain", label="Own domain connected", status=WARN, weight=2,
            detail=f"{store.custom_domain} is added but not verified, so it is not serving yet.",
            fix="Finish the DNS step for this domain.",
            action={"label": "Domain settings", "href": links["store"]},
        ))
    else:
        group.checks.append(Check(
            key="domain", label="Own domain connected", status=WARN, weight=2,
            detail=f"You are on a {settings.KORAA_STOREFRONT_DOMAIN} subdomain.",
            fix="A subdomain ranks perfectly well, but reputation you build on your "
                "own domain stays yours if you ever move.",
            action={"label": "Add a domain", "href": links["store"]},
        ))

    return group


def _identity_group(store: Store, links: dict) -> Group:
    """What a person sees when the listing is shared or bookmarked."""
    group = Group(
        key="identity",
        title="Brand & identity",
        blurb="What shows up in a browser tab, a bookmark and a shared link.",
    )

    if store.logo:
        group.checks.append(Check(
            key="logo", label="Logo uploaded", status=PASS, weight=3,
            detail="Used on the storefront, invoices and shared links.",
        ))
    else:
        group.checks.append(Check(
            key="logo", label="Logo uploaded", status=FAIL, weight=3,
            detail="No logo, so your shop name is set as plain type everywhere a mark belongs.",
            fix="Upload a square logo of at least 512×512.",
            action={"label": "Upload a logo", "href": links["design"]},
        ))

    if store.favicon:
        group.checks.append(Check(
            key="favicon", label="Favicon uploaded", status=PASS, weight=2,
            detail="Your mark appears in the browser tab.",
        ))
    else:
        group.checks.append(Check(
            key="favicon", label="Favicon uploaded", status=WARN, weight=2,
            detail="Browser tabs and bookmarks show a blank page icon.",
            fix="Upload a 32×32 or 64×64 version of your logo as a favicon.",
            action={"label": "Upload a favicon", "href": links["settings"]},
        ))

    about = _written(store.description)
    if len(about) >= 200:
        group.checks.append(Check(
            key="about", label="Shop description written", status=PASS, weight=3,
            detail=f"{len(about)} characters of your own copy.",
        ))
    elif about:
        group.checks.append(Check(
            key="about", label="Shop description written", status=WARN, weight=3,
            detail=f"{len(about)} characters — thin for the page search engines read first.",
            fix="Say what you sell, what makes it different, and where you deliver. "
                "Two or three paragraphs.",
            action={"label": "Edit the description", "href": links["store"]},
        ))
    else:
        group.checks.append(Check(
            key="about", label="Shop description written", status=FAIL, weight=3,
            detail="Your shop description is empty or still the seeded example text.",
            fix="Write it in your own words. This is the text a search engine has "
                "to work out what your shop is from.",
            action={"label": "Write a description", "href": links["store"]},
        ))

    if _written(store.tagline):
        group.checks.append(Check(
            key="tagline", label="Tagline written", status=PASS, weight=1,
            detail="Shown under your name on the storefront.",
        ))
    else:
        group.checks.append(Check(
            key="tagline", label="Tagline written", status=WARN, weight=1,
            detail="No tagline, so the storefront falls back to generic copy.",
            fix="One line: what you sell, in your own voice.",
            action={"label": "Add a tagline", "href": links["store"]},
        ))

    contactable = bool(store.email or store.phone or store.whatsapp)
    group.checks.append(Check(
        key="contact", label="Contact details published", status=PASS if contactable else FAIL,
        weight=3,
        detail="A customer can reach you." if contactable
        else "No email, phone or WhatsApp anywhere on the shop.",
        fix="" if contactable else
            "Add at least one. Search engines treat a contactable business as a real "
            "one, and a shopper who cannot ask a question does not buy.",
        action=None if contactable else {"label": "Add contact details", "href": links["store"]},
    ))

    socials = [s for s in (store.instagram, store.facebook, store.whatsapp) if s]
    group.checks.append(Check(
        key="social", label="Social profiles linked", status=PASS if socials else WARN, weight=1,
        detail=f"{len(socials)} profile{'' if len(socials) == 1 else 's'} linked." if socials
        else "No social profiles linked.",
        fix="" if socials else "Linked profiles are how most African shops are actually found.",
        action=None if socials else {"label": "Add social links", "href": links["settings"]},
    ))

    return group


def _catalogue_group(store: Store, links: dict) -> Group:
    """The pages that will actually rank: the products."""
    group = Group(
        key="catalogue",
        title="Products",
        blurb="Each product is a page that can rank on its own.",
    )

    products = list(
        Product.objects.filter(store=store, status=Product.Status.ACTIVE)
        .prefetch_related("images")
    )
    total = len(products)

    if total == 0:
        group.checks.append(Check(
            key="has_products", label="Store has products", status=FAIL, weight=6,
            detail="No published products, so there is nothing for anyone to find.",
            fix="Add and publish your first product.",
            action={"label": "Add a product", "href": links["products"]},
        ))
        # Everything below is about the products there are none of.
        for key, label in [
            ("product_descriptions", "Products are described"),
            ("product_images", "Products have photographs"),
            ("image_alt", "Photographs have alt text"),
        ]:
            group.checks.append(Check(
                key=key, label=label, status=WARN, weight=0,
                detail="Nothing to check until you have products.",
                applicable=False,
            ))
        return group

    if total >= 6:
        group.checks.append(Check(
            key="has_products", label="Store has products", status=PASS, weight=6,
            detail=f"{total} published products.",
        ))
    else:
        group.checks.append(Check(
            key="has_products", label="Store has products", status=WARN, weight=6,
            detail=f"Only {total} published product{'' if total == 1 else 's'}.",
            fix="A shop with a handful of products has a handful of pages to be found "
                "by. Publish the rest of your range.",
            action={"label": "Add products", "href": links["products"]},
        ))

    undescribed, thin = [], []
    for p in products:
        body = _written(p.description) or _written(p.short_description)
        if not body:
            undescribed.append(p.name)
        elif len(body) < THIN_DESCRIPTION:
            thin.append(p.name)

    if undescribed:
        group.checks.append(Check(
            key="product_descriptions", label="Products are described", status=FAIL, weight=5,
            detail=f"{len(undescribed)} of {total} products have no description: "
                   + _sample(undescribed),
            fix="A product page with only a name and a price has almost no text to "
                "match a search against. Two or three sentences each.",
            action={"label": "Fix descriptions", "href": links["products"]},
        ))
    elif thin:
        group.checks.append(Check(
            key="product_descriptions", label="Products are described", status=WARN, weight=5,
            detail=f"{len(thin)} of {total} descriptions are under {THIN_DESCRIPTION} "
                   "characters: " + _sample(thin),
            fix="Say what it is made of, what size it is, and who it is for.",
            action={"label": "Expand descriptions", "href": links["products"]},
        ))
    else:
        group.checks.append(Check(
            key="product_descriptions", label="Products are described", status=PASS, weight=5,
            detail=f"All {total} products carry a real description.",
        ))

    imageless = [p.name for p in products if not p.images.all()]
    if imageless:
        status = FAIL if len(imageless) > total / 2 else WARN
        group.checks.append(Check(
            key="product_images", label="Products have photographs", status=status, weight=4,
            detail=f"{len(imageless)} of {total} products have no photograph: "
                   + _sample(imageless),
            fix="Photographs are the single biggest driver of both clicks and image "
                "search traffic.",
            action={"label": "Add photographs", "href": links["products"]},
        ))
    else:
        group.checks.append(Check(
            key="product_images", label="Products have photographs", status=PASS, weight=4,
            detail="Every product has at least one photograph.",
        ))

    images = [img for p in products for img in p.images.all()]
    missing_alt = [img for img in images if not (img.alt_text or "").strip()]
    if not images:
        group.checks.append(Check(
            key="image_alt", label="Photographs have alt text", status=WARN, weight=0,
            detail="No photographs to describe yet.",
            applicable=False,
        ))
    elif missing_alt:
        group.checks.append(Check(
            key="image_alt", label="Photographs have alt text", status=WARN, weight=2,
            detail=f"{len(missing_alt)} of {len(images)} photographs have no alt text.",
            fix="Alt text is how image search reads a photograph, and how a customer "
                "on a screen reader shops. Describe what is in the picture.",
            action={"label": "Edit products", "href": links["products"]},
        ))
    else:
        group.checks.append(Check(
            key="image_alt", label="Photographs have alt text", status=PASS, weight=2,
            detail=f"All {len(images)} photographs are described.",
        ))

    names = [p.name.strip().lower() for p in products]
    duplicates = {n for n in names if names.count(n) > 1}
    if duplicates:
        group.checks.append(Check(
            key="duplicate_names", label="Product names are distinct", status=WARN, weight=1,
            detail=f"{len(duplicates)} name{'' if len(duplicates) == 1 else 's'} used more "
                   "than once: " + _sample(sorted(duplicates)),
            fix="Two pages competing for the same words split the traffic between them. "
                "Add the size, colour or variant to the name.",
            action={"label": "Rename products", "href": links["products"]},
        ))
    else:
        group.checks.append(Check(
            key="duplicate_names", label="Product names are distinct", status=PASS, weight=1,
            detail="No two products share a name.",
        ))

    if store.categories.exists():
        group.checks.append(Check(
            key="categories", label="Products are categorised", status=PASS, weight=1,
            detail="Categories give search engines a structure to follow.",
        ))
    else:
        group.checks.append(Check(
            key="categories", label="Products are categorised", status=WARN, weight=1,
            detail="No categories, so the whole catalogue is one flat list.",
            fix="Group your products. Category pages rank for the broad searches "
                "individual products cannot.",
            action={"label": "Add categories", "href": links["categories"]},
        ))

    return group


def _content_group(store: Store, links: dict) -> Group:
    """The storefront's own copy, which is the page a search engine reads."""
    group = Group(
        key="content",
        title="Storefront copy",
        blurb="The words on your home page, which is usually the page that ranks.",
    )

    sections = {
        s.type: (s.settings or {})
        for s in StorefrontSection.objects.filter(store=store, enabled=True)
    }

    hero = sections.get(StorefrontSection.SectionType.HERO, {})
    hero_title = _written(hero.get("title"))
    hero_sub = _written(hero.get("subtitle"))
    if hero_title and hero_sub:
        group.checks.append(Check(
            key="hero_copy", label="Hero copy is your own", status=PASS, weight=3,
            detail="Your headline and subheading are written, not seeded.",
        ))
    elif hero_title or hero_sub:
        group.checks.append(Check(
            key="hero_copy", label="Hero copy is your own", status=WARN, weight=3,
            detail="Half of your hero is still the example text Koraa seeded.",
            fix="The first heading on the page carries more weight than any other. "
                "Say what you sell in it.",
            action={"label": "Edit the hero", "href": links["design"]},
        ))
    else:
        group.checks.append(Check(
            key="hero_copy", label="Hero copy is your own", status=FAIL, weight=3,
            detail="Your hero still reads “Welcome to Our Store”.",
            fix="Replace it with what you actually sell. This is the sentence a "
                "search engine and a first-time visitor both read first.",
            action={"label": "Edit the hero", "href": links["design"]},
        ))

    about = sections.get(StorefrontSection.SectionType.ABOUT, {})
    about_body = _written(about.get("content"))
    if len(about_body) >= 300:
        group.checks.append(Check(
            key="about_section", label="About section written", status=PASS, weight=2,
            detail=f"{len(about_body)} characters of your own copy on the home page.",
        ))
    elif about_body:
        group.checks.append(Check(
            key="about_section", label="About section written", status=WARN, weight=2,
            detail=f"{len(about_body)} characters — the shortest section on most storefronts.",
            fix="This is the easiest place to add the words customers actually search "
                "for: your town, your craft, your materials.",
            action={"label": "Edit the About section", "href": links["design"]},
        ))
    else:
        group.checks.append(Check(
            key="about_section", label="About section written", status=FAIL, weight=2,
            detail="No About section copy, or still the seeded example.",
            fix="Write a few paragraphs about the business in your own words.",
            action={"label": "Write your story", "href": links["design"]},
        ))

    footer = sections.get(StorefrontSection.SectionType.FOOTER, {})
    if _written(footer.get("tagline")):
        group.checks.append(Check(
            key="footer_copy", label="Footer copy is your own", status=PASS, weight=1,
            detail="Your footer says something specific to this shop.",
        ))
    else:
        group.checks.append(Check(
            key="footer_copy", label="Footer copy is your own", status=WARN, weight=1,
            detail="The footer still carries the seeded line.",
            fix="One line about the shop, on every page.",
            action={"label": "Edit the footer", "href": links["design"]},
        ))

    return group


def _sample(names: list, limit: int = 3) -> str:
    """The first few offenders, named. A count alone is not actionable."""
    shown = ", ".join(f"“{n}”" for n in names[:limit])
    remainder = len(names) - limit
    return f"{shown} and {remainder} more" if remainder > 0 else shown


# ── Report ────────────────────────────────────────────────────────────────────

_WEIGHT_EARNED = {PASS: 1.0, WARN: 0.5, FAIL: 0.0}


def audit(store: Store) -> dict:
    """The whole report for one store."""
    links = _links(store)
    groups = [
        _reachable_group(store, links),
        _listing_group(store, links),
        _content_group(store, links),
        _catalogue_group(store, links),
        _identity_group(store, links),
    ]

    checks = [c for g in groups for c in g.checks]
    scored = [c for c in checks if c.applicable and c.weight > 0]
    possible = sum(c.weight for c in scored)
    earned = sum(c.weight * _WEIGHT_EARNED[c.status] for c in scored)
    score = round(100 * earned / possible) if possible else 0

    # Ordered worst-first and weighted, so the list reads as "do this next"
    # rather than as an inventory of everything wrong.
    priorities = sorted(
        (c for c in scored if c.status != PASS),
        key=lambda c: (c.status != FAIL, -c.weight),
    )

    title = _written(store.seo_title) or store.name
    description = _written(store.seo_description) or _written(store.description) or ""

    return {
        "store": {
            "id": str(store.id),
            "name": store.name,
            "slug": store.slug,
            "url": store.storefront_url,
        },
        "generated_at": timezone.now().isoformat(),
        "score": score,
        "grade": _grade(score),
        "summary": {
            "passed": sum(1 for c in scored if c.status == PASS),
            "warnings": sum(1 for c in scored if c.status == WARN),
            "problems": sum(1 for c in scored if c.status == FAIL),
            "total": len(scored),
        },
        # What the search result will look like as things stand, so the merchant
        # can see the consequence of the two fields rather than trusting a score.
        "preview": {
            "title": title[:TITLE_IDEAL_MAX],
            "url": store.storefront_url,
            "description": description[:DESC_IDEAL_MAX],
            "truncated_title": len(title) > TITLE_IDEAL_MAX,
            "truncated_description": len(description) > DESC_IDEAL_MAX,
        },
        "priorities": [c.as_dict() for c in priorities[:5]],
        "groups": [g.as_dict() for g in groups],
    }
