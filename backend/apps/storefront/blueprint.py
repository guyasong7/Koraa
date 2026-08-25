"""
Blueprint — guided storefront setup.

The storefront editor asks merchants for hex codes, a font name from a
dropdown, and a button radius. That works if you already know what you
want. Most people opening their first shop do not, and the editor's
defaults were the only thing standing between them and a purple hero on
a white page.

Blueprint replaces those questions with a handful of visual ones: what do
you sell, which of these palettes feels right, which of these two type
specimens reads better. Each answer is a *whole* decision — a palette
carries five colours that were checked against each other, a pairing
carries a heading and a body face that were chosen to sit together — so
there is no combination of answers that produces an ugly storefront.

Everything the wizard can offer is defined here and served by
``/api/v1/storefront/blueprint/``. The frontend renders whatever this
module returns and posts back the keys it was given, which is what keeps
the swatch a merchant clicked identical to the colour their shop gets.

Section content still comes from ``presets.get_base_sections`` — the
copy tailored per business type already existed and is good; Blueprint
decides which of those sections appear and in what order, not what they
say.
"""

from __future__ import annotations

from django.db import transaction

from .models import StorefrontConfig, StorefrontSection
from .presets import get_base_config, get_base_sections


# ── Palettes ──────────────────────────────────────────────────────────────────
#
# Five colours each, picked as a set. ``text`` on ``background`` clears
# 4.5:1 in every entry and white-on-``primary`` clears 4.5:1, because the
# renderer puts white text on primary in the hero button, the price badge
# and the announcement bar without asking whether that is legible. A
# palette that fails there would look broken no matter what the merchant
# chose afterwards.
#
# ``secondary`` is the newsletter/section wash — a tint of the primary
# hue rather than a grey, so a section break reads as part of the brand.

PALETTES: dict[str, dict] = {
    "violet_ink": {
        "name": "Violet Ink",
        "mood": "Confident and current",
        "colors": {
            "primary_color": "#6d28d9",
            "secondary_color": "#f5f3ff",
            "accent_color": "#4c1d95",
            "background_color": "#ffffff",
            "text_color": "#0d1117",
        },
    },
    "rose_clay": {
        "name": "Rose Clay",
        "mood": "Soft and considered",
        "colors": {
            "primary_color": "#be185d",
            "secondary_color": "#fdf2f8",
            "accent_color": "#9d174d",
            "background_color": "#fffbfc",
            "text_color": "#1c1017",
        },
    },
    "terracotta": {
        "name": "Terracotta",
        "mood": "Warm and handmade",
        "colors": {
            "primary_color": "#c2410c",
            "secondary_color": "#fff7ed",
            "accent_color": "#9a3412",
            "background_color": "#fffdf9",
            "text_color": "#1c1310",
        },
    },
    "saffron": {
        "name": "Saffron",
        "mood": "Bright and generous",
        "colors": {
            "primary_color": "#b45309",
            "secondary_color": "#fffbeb",
            "accent_color": "#92400e",
            "background_color": "#fffdf7",
            "text_color": "#1a1408",
        },
    },
    "deep_forest": {
        "name": "Deep Forest",
        "mood": "Natural and steady",
        "colors": {
            "primary_color": "#15803d",
            "secondary_color": "#f0fdf4",
            "accent_color": "#166534",
            "background_color": "#ffffff",
            "text_color": "#0c1410",
        },
    },
    "ocean": {
        "name": "Ocean",
        "mood": "Calm and professional",
        "colors": {
            "primary_color": "#0e7490",
            "secondary_color": "#ecfeff",
            "accent_color": "#155e75",
            "background_color": "#ffffff",
            "text_color": "#0a1418",
        },
    },
    "charcoal": {
        "name": "Charcoal",
        "mood": "Quiet and editorial",
        "colors": {
            "primary_color": "#171717",
            "secondary_color": "#f5f5f5",
            "accent_color": "#404040",
            "background_color": "#ffffff",
            "text_color": "#0a0a0a",
        },
    },
    "midnight": {
        "name": "Midnight",
        "mood": "Dark and technical",
        "colors": {
            "primary_color": "#3b82f6",
            "secondary_color": "#1e293b",
            "accent_color": "#60a5fa",
            "background_color": "#0b1120",
            "text_color": "#e8eefc",
        },
    },
}


# ── Type pairings ─────────────────────────────────────────────────────────────
#
# A heading face and a body face. Both must be in
# ``StorefrontConfig.Font`` — the model validates them and the renderer
# only self-hosts those six, so a seventh name would silently fall back
# to the browser default.
#
# Pairings exist because the renderer previously drove headings and body
# copy from one ``font`` value: `.sf-d` read `var(--sf-font, Outfit)`,
# and since --sf-font was always set the Outfit fallback never applied.
# Every storefront was single-face whether that suited it or not.

PAIRINGS: dict[str, dict] = {
    "outfit_inter": {
        "name": "Outfit & Inter",
        "mood": "Modern, clean",
        "heading_font": StorefrontConfig.Font.OUTFIT,
        "font": StorefrontConfig.Font.INTER,
    },
    "raleway_lato": {
        "name": "Raleway & Lato",
        "mood": "Elegant, light",
        "heading_font": StorefrontConfig.Font.RALEWAY,
        "font": StorefrontConfig.Font.LATO,
    },
    "poppins_inter": {
        "name": "Poppins & Inter",
        "mood": "Friendly, round",
        "heading_font": StorefrontConfig.Font.POPPINS,
        "font": StorefrontConfig.Font.INTER,
    },
    "outfit_nunito": {
        "name": "Outfit & Nunito",
        "mood": "Warm, approachable",
        "heading_font": StorefrontConfig.Font.OUTFIT,
        "font": StorefrontConfig.Font.NUNITO,
    },
    "inter_inter": {
        "name": "Inter only",
        "mood": "Plain, neutral",
        "heading_font": StorefrontConfig.Font.INTER,
        "font": StorefrontConfig.Font.INTER,
    },
    "lato_lato": {
        "name": "Lato only",
        "mood": "Quiet, readable",
        "heading_font": StorefrontConfig.Font.LATO,
        "font": StorefrontConfig.Font.LATO,
    },
}


# ── Style kits ────────────────────────────────────────────────────────────────
#
# Button shape and product-card density move together far more often than
# not — square buttons with compact cards reads as a spreadsheet, pills
# with large cards reads as a lookbook. Offering them as named looks
# rather than two dropdowns removes a combination step the merchant has
# no reason to be doing.

STYLE_KITS: dict[str, dict] = {
    "soft": {
        "name": "Soft",
        "mood": "Rounded corners, even spacing",
        "button_style": StorefrontConfig.ButtonStyle.ROUNDED,
        "product_card_style": StorefrontConfig.ProductCardStyle.STANDARD,
    },
    "editorial": {
        "name": "Editorial",
        "mood": "Square edges, large imagery",
        "button_style": StorefrontConfig.ButtonStyle.SQUARE,
        "product_card_style": StorefrontConfig.ProductCardStyle.LARGE,
    },
    "boutique": {
        "name": "Boutique",
        "mood": "Pill buttons, tight grid",
        "button_style": StorefrontConfig.ButtonStyle.PILL,
        "product_card_style": StorefrontConfig.ProductCardStyle.COMPACT,
    },
    "direct": {
        "name": "Direct",
        "mood": "Square edges, standard grid",
        "button_style": StorefrontConfig.ButtonStyle.SQUARE,
        "product_card_style": StorefrontConfig.ProductCardStyle.STANDARD,
    },
}


# ── Categories ────────────────────────────────────────────────────────────────
#
# Keys are ``Merchant.BusinessType`` values, because the category answer
# is written back to the merchant profile and drives
# ``presets.get_base_sections``. The recommendations below are what the
# wizard pre-selects, so a merchant who accepts every default still gets
# something coherent for what they sell rather than the generic purple.

CATEGORIES: dict[str, dict] = {
    "fashion": {
        "name": "Fashion & Apparel",
        "blurb": "Clothing, shoes, bags, accessories",
        "recommends": {"palette": "charcoal", "pairing": "raleway_lato", "kit": "editorial"},
    },
    "beauty": {
        "name": "Beauty & Cosmetics",
        "blurb": "Skincare, make-up, hair, fragrance",
        "recommends": {"palette": "rose_clay", "pairing": "raleway_lato", "kit": "boutique"},
    },
    "food": {
        "name": "Food & Beverages",
        "blurb": "Prepared food, groceries, drinks",
        "recommends": {"palette": "terracotta", "pairing": "poppins_inter", "kit": "soft"},
    },
    "electronics": {
        "name": "Electronics",
        "blurb": "Phones, computers, audio, gadgets",
        "recommends": {"palette": "midnight", "pairing": "inter_inter", "kit": "direct"},
    },
    "digital": {
        "name": "Digital Products",
        "blurb": "Files, courses, templates, subscriptions",
        "recommends": {"palette": "ocean", "pairing": "outfit_inter", "kit": "soft"},
    },
    "services": {
        "name": "Services",
        "blurb": "Bookings, consulting, repairs, events",
        "recommends": {"palette": "ocean", "pairing": "outfit_nunito", "kit": "soft"},
    },
    "retail": {
        "name": "General Retail",
        "blurb": "A mixed catalogue, or a bit of everything",
        "recommends": {"palette": "violet_ink", "pairing": "outfit_inter", "kit": "soft"},
    },
    "other": {
        "name": "Something else",
        "blurb": "Start neutral and adjust later",
        "recommends": {"palette": "violet_ink", "pairing": "inter_inter", "kit": "soft"},
    },
}


# ── Section menu ──────────────────────────────────────────────────────────────
#
# What the homepage step offers. ``navbar`` and ``footer`` are absent on
# purpose: the renderer draws both unconditionally, so a toggle for them
# would be a control that does nothing.
#
# ``required`` sections are shown but cannot be switched off — a shop
# with no way to reach the products is not a shop.

SECTION_MENU: list[dict] = [
    {
        "type": StorefrontSection.SectionType.ANNOUNCEMENT_BAR,
        "name": "Announcement bar",
        "blurb": "A thin strip above everything for one message",
        "required": False,
    },
    {
        "type": StorefrontSection.SectionType.HERO,
        "name": "Hero banner",
        "blurb": "Full-width image, headline and a button",
        "required": False,
    },
    {
        "type": StorefrontSection.SectionType.CATEGORIES,
        "name": "Categories",
        "blurb": "Let people jump straight to a part of the catalogue",
        "required": False,
    },
    {
        "type": StorefrontSection.SectionType.FEATURED_PRODUCTS,
        "name": "Featured products",
        "blurb": "A short row of the things you most want to sell",
        "required": False,
    },
    {
        "type": StorefrontSection.SectionType.CATALOG,
        "name": "Product catalogue",
        "blurb": "The full grid, with optional category sidebar",
        "required": True,
    },
    {
        "type": StorefrontSection.SectionType.PROMO_BANNER,
        "name": "Promotion",
        "blurb": "A banner for a sale or a single offer",
        "required": False,
    },
    {
        "type": StorefrontSection.SectionType.ABOUT,
        "name": "About",
        "blurb": "Who you are and why you sell this",
        "required": False,
    },
    {
        "type": StorefrontSection.SectionType.NEWSLETTER,
        "name": "Newsletter",
        "blurb": "Collect email addresses for later",
        "required": False,
    },
]

#: Sections the renderer always draws. Never offered as a choice, never
#: disabled by an apply.
ALWAYS_ON = {
    StorefrontSection.SectionType.NAVBAR,
    StorefrontSection.SectionType.FOOTER,
}

REQUIRED_SECTIONS = {s["type"] for s in SECTION_MENU if s["required"]}
OPTIONAL_SECTIONS = {s["type"] for s in SECTION_MENU if not s["required"]}

#: Every section the wizard can speak about. Anything outside this set is owned
#: by another part of the product, and an apply must leave it alone.
OFFERABLE_SECTIONS = REQUIRED_SECTIONS | OPTIONAL_SECTIONS

#: Sections an apply never switches off. ``ALWAYS_ON`` is drawn unconditionally;
#: the enquiry form belongs to the enquiry-form builder instead of the wizard —
#: ``_ensure_enquiry_section`` adds the row when a merchant designs a form, and
#: the services preset ships one enabled. Treating it as "not chosen" would take
#: a service business's only way of being asked for a quote off its homepage,
#: and the homepage step has no switch to put it back.
PRESERVED_ON_APPLY = ALWAYS_ON | {StorefrontSection.SectionType.CONTACT_FORM}


# ── Reads ─────────────────────────────────────────────────────────────────────

def normalise_category(value: str | None) -> str:
    """Coerce anything into a category key, defaulting to retail.

    Mirrors ``Merchant.BusinessType``'s own default so a merchant whose
    profile predates this module lands somewhere sensible instead of on
    the neutral 'other' preset.
    """
    if value and value in CATEGORIES:
        return value
    return "retail"


def recommended(category: str | None) -> dict:
    """The palette / pairing / kit the wizard pre-selects for a category."""
    return dict(CATEGORIES[normalise_category(category)]["recommends"])


def default_section_types(category: str | None) -> list[str]:
    """Section types the preset for ``category`` switches on.

    Read from ``presets.get_base_sections`` rather than restated here, so
    the homepage step opens on the same layout a store already gets at
    creation time.

    Narrowed to what the homepage step actually offers. A preset may enable a
    section the wizard does not present — the services preset ships an enquiry
    form — and recommending one would leave that step holding a key with no
    checkbox to match it.
    """
    preset = get_base_sections(normalise_category(category))
    chosen = [
        s["type"]
        for s in preset
        if s.get("enabled", True) and s["type"] in OFFERABLE_SECTIONS
    ]
    # A preset that somehow omits the catalogue would hand back a
    # homepage with nothing to buy.
    for required in REQUIRED_SECTIONS:
        if required not in chosen:
            chosen.append(required)
    return chosen


def catalogue(category: str | None = None) -> dict:
    """Everything the wizard needs to render, in the order it asks for it.

    ``defaults`` is the whole answer set pre-filled from the merchant's
    business type, so the frontend can open on a complete, valid
    selection and the merchant can click through to the end without
    making a single choice.

    Each section option carries ``default_settings``. The wizard's preview
    has to show a section the merchant just switched on, and a store that
    has never had one has no row and therefore no copy — without this the
    homepage step would toggle sections that stayed invisible until after
    the wizard was submitted.
    """
    resolved = normalise_category(category)
    rec = recommended(resolved)

    # The retail preset is the only one that covers all eight offerable
    # sections, so it is the source for placeholder copy.
    fallback_settings = {s["type"]: s["settings"] for s in get_base_sections("retail")}
    own_settings = {s["type"]: s["settings"] for s in get_base_sections(resolved)}

    return {
        "categories": [
            {
                "key": key,
                "name": value["name"],
                "blurb": value["blurb"],
                # Every category carries its own recommendation, not just
                # the merchant's current one. The first question is "what do
                # you sell?" — if answering it differently cannot change the
                # palette, type and layout that follow, it is not really a
                # question, and the merchant ends up with a fashion shop's
                # recommendations on a bakery.
                "recommends": {
                    "palette": value["recommends"]["palette"],
                    "pairing": value["recommends"]["pairing"],
                    "style_kit": value["recommends"]["kit"],
                    "sections": default_section_types(key),
                },
            }
            for key, value in CATEGORIES.items()
        ],
        "palettes": [
            {
                "key": key,
                "name": value["name"],
                "mood": value["mood"],
                **value["colors"],
            }
            for key, value in PALETTES.items()
        ],
        "pairings": [
            {
                "key": key,
                "name": value["name"],
                "mood": value["mood"],
                "heading_font": value["heading_font"],
                "font": value["font"],
            }
            for key, value in PAIRINGS.items()
        ],
        "style_kits": [
            {
                "key": key,
                "name": value["name"],
                "mood": value["mood"],
                "button_style": value["button_style"],
                "product_card_style": value["product_card_style"],
            }
            for key, value in STYLE_KITS.items()
        ],
        "sections": [
            {
                "type": entry["type"],
                "name": entry["name"],
                "blurb": entry["blurb"],
                "required": entry["required"],
                "default_settings": own_settings.get(
                    entry["type"], fallback_settings.get(entry["type"], {})
                ),
            }
            for entry in SECTION_MENU
        ],
        "defaults": {
            "category": resolved,
            "palette": rec["palette"],
            "pairing": rec["pairing"],
            "style_kit": rec["kit"],
            "sections": default_section_types(resolved),
        },
    }


def config_patch(palette: str, pairing: str, style_kit: str) -> dict:
    """Turn three answer keys into the config fields they stand for.

    Unknown keys fall back to the retail recommendation rather than
    raising: the wizard validates before calling, and a stale bookmark
    replaying an old key should still produce a usable storefront.
    """
    fallback = CATEGORIES["retail"]["recommends"]
    chosen_palette = PALETTES.get(palette) or PALETTES[fallback["palette"]]
    chosen_pairing = PAIRINGS.get(pairing) or PAIRINGS[fallback["pairing"]]
    chosen_kit = STYLE_KITS.get(style_kit) or STYLE_KITS[fallback["kit"]]

    return {
        **chosen_palette["colors"],
        "heading_font": chosen_pairing["heading_font"],
        "font": chosen_pairing["font"],
        "button_style": chosen_kit["button_style"],
        "product_card_style": chosen_kit["product_card_style"],
    }


# ── Write ─────────────────────────────────────────────────────────────────────

@transaction.atomic
def apply(store, *, category: str, palette: str, pairing: str,
          style_kit: str, sections: list[str]) -> None:
    """Write a completed blueprint onto ``store``.

    Atomic because a half-applied blueprint is worse than none: a shop
    with the new palette and the old section order is a layout nobody
    chose.

    Existing section rows are updated, never recreated. Re-running the
    wizard on a live shop is a normal thing to do — the merchant is
    changing their mind about the look — and dropping the rows would take
    every hero headline and about-us paragraph they had written with it.
    Sections they deselected are disabled rather than deleted, for the
    same reason: switching one back on should bring its copy back.
    """
    merchant = store.merchant
    resolved = normalise_category(category)

    # The category is the merchant's own business type, not a per-store
    # setting, and it drives the presets used at every future store
    # creation. Writing it back is what makes the answer stick.
    if merchant is not None and merchant.business_type != resolved:
        merchant.business_type = resolved
        merchant.save(update_fields=["business_type"])

    config, _ = StorefrontConfig.objects.get_or_create(store=store)
    for field, value in config_patch(palette, pairing, style_kit).items():
        setattr(config, field, value)
    # Page structure follows the category, which is what the wizard's own
    # copy promises: "This sets the starting layout". Palette, pairing and
    # kit only ever changed the surface — a food shop and a boutique came
    # out the same shape in different colours.
    config.layout = get_base_config(resolved)["layout"]
    config.save()

    # Order follows the merchant's chosen sequence, which is the order
    # SECTION_MENU lists them in — the wizard presents the homepage top
    # to bottom, so the list it posts back is already the layout.
    wanted = [t for t in sections if t in OFFERABLE_SECTIONS]
    for required in REQUIRED_SECTIONS:
        if required not in wanted:
            wanted.append(required)

    preset_settings = {
        s["type"]: s["settings"] for s in get_base_sections(resolved)
    }
    existing = {s.type: s for s in store.storefront_sections.all()}

    # Numbering starts at 2 so an announcement bar can always sit at 1
    # whether or not it was chosen; the navbar is drawn outside the
    # ordered list, so nothing competes for the top slot.
    order = 2
    to_update = []
    to_create = []

    for section_type in wanted:
        if section_type == StorefrontSection.SectionType.ANNOUNCEMENT_BAR:
            position = 1
        else:
            position = order
            order += 1

        row = existing.get(section_type)
        if row is None:
            to_create.append(
                StorefrontSection(
                    store=store,
                    type=section_type,
                    order=position,
                    enabled=True,
                    settings=preset_settings.get(section_type, {}),
                )
            )
        else:
            row.order = position
            row.enabled = True
            # Only seed copy that was never written. An empty settings
            # dict means this section has never been configured; a
            # populated one is the merchant's own words.
            if not row.settings:
                row.settings = preset_settings.get(section_type, {})
            to_update.append(row)

    for section_type, row in existing.items():
        if section_type in PRESERVED_ON_APPLY or section_type in wanted:
            continue
        if row.enabled:
            row.enabled = False
            to_update.append(row)

    if to_create:
        StorefrontSection.objects.bulk_create(to_create)
    if to_update:
        StorefrontSection.objects.bulk_update(
            to_update, ["order", "enabled", "settings"]
        )

    # The footer is drawn unconditionally, so a store that has never had
    # one needs the row to exist before the renderer looks for it.
    if StorefrontSection.SectionType.FOOTER not in existing:
        footer = next(
            (
                s
                for s in get_base_sections(resolved)
                if s["type"] == StorefrontSection.SectionType.FOOTER
            ),
            None,
        )
        if footer is not None:
            StorefrontSection.objects.create(
                store=store,
                type=StorefrontSection.SectionType.FOOTER,
                order=99,
                enabled=True,
                settings=footer["settings"],
            )
