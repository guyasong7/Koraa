from apps.storefront.models import StorefrontSection, StorefrontConfig

def get_base_sections(business_type: str) -> list:
    """Returns a tailored list of sections based on business type."""
    
    # Generic footer for all
    footer = {
        "type": StorefrontSection.SectionType.FOOTER,
        "order": 9, "enabled": True,
        "settings": {
            "tagline": "Quality products, delivered to your door.",
            "links": [{"label": "Home", "url": "/"}, {"label": "Shop", "url": "/shop"}, {"label": "About", "url": "/about"}],
        },
    }

    if business_type == "fashion":
        return [
            {
                "type": StorefrontSection.SectionType.ANNOUNCEMENT_BAR,
                "order": 1, "enabled": True,
                "settings": {"text": "Free shipping on the new summer collection!", "bg_color": "#7f1d1d", "text_color": "#ffffff"},
            },
            {
                "type": StorefrontSection.SectionType.HERO,
                "order": 2, "enabled": True,
                "settings": {
                    "title": "Elevate Your Style",
                    "subtitle": "Discover the latest trends and exclusive fashion pieces curated just for you.",
                    "button_text": "Shop the Collection",
                    "image": "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&q=80&w=2000",
                    "overlay": True,
                },
            },
            {
                "type": StorefrontSection.SectionType.CATEGORIES,
                "order": 3, "enabled": True,
                "settings": {"title": "Shop by Category", "show_all": True},
            },
            {
                "type": StorefrontSection.SectionType.FEATURED_PRODUCTS,
                "order": 4, "enabled": True,
                "settings": {"title": "Trending Now"},
            },
            {
                "type": StorefrontSection.SectionType.CATALOG,
                "order": 5, "enabled": True,
                "settings": {"title": "All Apparel", "show_sidebar": False},
            },
            footer
        ]

    elif business_type == "beauty":
        return [
            {
                "type": StorefrontSection.SectionType.ANNOUNCEMENT_BAR,
                "order": 1, "enabled": True,
                "settings": {"text": "Cruelty-free & organic beauty products.", "bg_color": "#f472b6", "text_color": "#ffffff"},
            },
            {
                "type": StorefrontSection.SectionType.HERO,
                "order": 2, "enabled": True,
                "settings": {
                    "title": "Glow From Within",
                    "subtitle": "Premium skincare and cosmetics that enhance your natural beauty.",
                    "button_text": "Discover Your Routine",
                    "image": "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&q=80&w=2000",
                    "overlay": True,
                },
            },
            {
                "type": StorefrontSection.SectionType.ABOUT,
                "order": 3, "enabled": True,
                "settings": {
                    "title": "Our Philosophy",
                    "content": "We believe in clean, sustainable beauty. Every product is carefully formulated to nourish your skin and protect the environment.",
                    "image": "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&q=80&w=800",
                },
            },
            {
                "type": StorefrontSection.SectionType.FEATURED_PRODUCTS,
                "order": 4, "enabled": True,
                "settings": {"title": "Must-Haves"},
            },
            {
                "type": StorefrontSection.SectionType.CATALOG,
                "order": 5, "enabled": True,
                "settings": {"title": "Full Collection", "show_sidebar": False},
            },
            footer
        ]

    elif business_type == "food":
        # A takeaway is not a shop with different photographs. The menu
        # layout renders these as a sticky tab strip over a price list, so
        # the categories row has to come before the catalogue for the tabs
        # to be above what they filter, and ``show_sidebar`` is meaningless
        # here — the tabs *are* the filter.
        #
        # The footer carries the three things a food storefront is asked for
        # and the generic one has nowhere to put: when you are open, where
        # you are, and how far you deliver. They are placeholders to edit;
        # the layout renders no hours column at all once the list is empty,
        # so clearing them says nothing rather than something untrue.
        return [
            {
                "type": StorefrontSection.SectionType.HERO,
                "order": 1, "enabled": True,
                "settings": {
                    "title": "Cooked fresh, served fast",
                    "subtitle": "Today's menu, made to order, ready for pickup or delivery.",
                    "button_text": "See today's menu",
                    "image": "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=2000",
                    "overlay": True,
                },
            },
            {
                "type": StorefrontSection.SectionType.FEATURED_PRODUCTS,
                "order": 2, "enabled": True,
                "settings": {"title": "Today's Specials"},
            },
            {
                "type": StorefrontSection.SectionType.CATEGORIES,
                "order": 3, "enabled": True,
                "settings": {"title": "The Menu", "show_all": True},
            },
            {
                "type": StorefrontSection.SectionType.CATALOG,
                "order": 4, "enabled": True,
                "settings": {"title": "Full Menu", "show_sidebar": False},
            },
            {
                "type": StorefrontSection.SectionType.ABOUT,
                "order": 5, "enabled": True,
                "settings": {
                    "title": "From our kitchen",
                    "content": "We cook in small batches from produce bought that morning, which is why the menu changes and why nothing sits under a lamp. Order ahead and it goes on when you arrive.",
                    "image": "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&q=80&w=800",
                },
            },
            {
                "type": StorefrontSection.SectionType.FOOTER,
                "order": 9, "enabled": True,
                "settings": {
                    "tagline": "Cooked to order, served hot, every day of the week.",
                    "links": [
                        {"label": "Full menu", "url": "/shop"},
                        {"label": "Today's specials", "url": "/shop"},
                        {"label": "From our kitchen", "url": "/about"},
                    ],
                    "hours": [
                        {"label": "Mon – Thu", "value": "11:00 – 22:00"},
                        {"label": "Fri – Sat", "value": "11:00 – 23:30"},
                        {"label": "Sunday", "value": "12:00 – 21:00"},
                    ],
                    "address": "123 Market Street\nDouala, Cameroon",
                    "note": "Delivery within 5 km · Pickup ready in 20 minutes",
                },
            },
        ]

    elif business_type == "electronics":
        return [
            {
                "type": StorefrontSection.SectionType.PROMO_BANNER,
                "order": 1, "enabled": True,
                "settings": {
                    "title": "New Tech Drops",
                    "subtitle": "Get the latest gadgets before they sell out.",
                    "button_text": "Shop Tech",
                    "button_url": "/shop",
                    "image": "https://images.unsplash.com/photo-1550009158-9ebf6d1736eb?auto=format&fit=crop&q=80&w=2000",
                },
            },
            {
                "type": StorefrontSection.SectionType.HERO,
                "order": 2, "enabled": True,
                "settings": {
                    "title": "Next-Gen Electronics",
                    "subtitle": "Upgrade your lifestyle with our premium selection of devices.",
                    "button_text": "Explore Devices",
                    "image": "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&q=80&w=2000",
                    "overlay": True,
                },
            },
            {
                "type": StorefrontSection.SectionType.FEATURED_PRODUCTS,
                "order": 3, "enabled": True,
                "settings": {"title": "Top Rated Gadgets"},
            },
            {
                "type": StorefrontSection.SectionType.CATALOG,
                "order": 4, "enabled": True,
                "settings": {"title": "All Products", "show_sidebar": True},
            },
            footer
        ]

    elif business_type == "digital":
        # No shipping, no stock, no photography to speak of — the page has to
        # sell on words and structure, so the promo strip carries the offer
        # and About explains delivery.
        return [
            {
                "type": StorefrontSection.SectionType.HERO,
                "order": 1, "enabled": True,
                "settings": {
                    "title": "Templates and courses that ship today",
                    "subtitle": "Buy once, download instantly, keep it forever. No subscriptions, no waiting.",
                    "button_text": "Browse the library",
                    "image": "",
                    "overlay": False,
                },
            },
            {
                "type": StorefrontSection.SectionType.FEATURED_PRODUCTS,
                "order": 2, "enabled": True,
                "settings": {"title": "Most downloaded"},
            },
            {
                "type": StorefrontSection.SectionType.ABOUT,
                "order": 3, "enabled": True,
                "settings": {
                    "title": "How it works",
                    "content": "Pick what you need and pay. Your download link arrives by email straight away, and stays in your account for good. Every file comes with a plain-language guide, and updates are free.",
                    "image": "",
                },
            },
            {
                "type": StorefrontSection.SectionType.CATALOG,
                "order": 4, "enabled": True,
                "settings": {"title": "The full library", "show_sidebar": False},
            },
            {
                "type": StorefrontSection.SectionType.NEWSLETTER,
                "order": 5, "enabled": True,
                "settings": {
                    "title": "Hear about new releases",
                    "subtitle": "One email when something new lands. Nothing else.",
                    "placeholder": "your@email.com",
                    "button_text": "Keep me posted",
                },
            },
            footer
        ]

    elif business_type == "services":
        # Nobody adds a consultation to a basket the way they add a shirt.
        # The page leads with credibility and ends with a way to get in touch.
        return [
            {
                "type": StorefrontSection.SectionType.HERO,
                "order": 1, "enabled": True,
                "settings": {
                    "title": "Work with people who turn up",
                    "subtitle": "Clear quotes, fixed timelines, and someone who answers the phone.",
                    "button_text": "See what we do",
                    "image": "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&q=80&w=2000",
                    "overlay": True,
                },
            },
            {
                "type": StorefrontSection.SectionType.ABOUT,
                "order": 2, "enabled": True,
                "settings": {
                    "title": "How we work",
                    "content": "We start with a conversation, not a contract. You get a written quote with the scope and the price on it, and we do not begin until you are happy with both.",
                    "image": "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=800",
                },
            },
            {
                "type": StorefrontSection.SectionType.CATALOG,
                "order": 3, "enabled": True,
                "settings": {"title": "What we offer", "show_sidebar": False},
            },
            {
                "type": StorefrontSection.SectionType.PROMO_BANNER,
                "order": 4, "enabled": True,
                "settings": {
                    "title": "Not sure what you need?",
                    "subtitle": "Tell us the problem and we will tell you what it takes to fix it.",
                    "button_text": "Ask us",
                    # Anchors at the enquiry form below rather than a /contact
                    # page that does not exist on a storefront.
                    "button_url": "#enquiry",
                    "image": "",
                },
            },
            {
                # The whole point of a service site: a quote request. The
                # section reads its title and fields from the store's
                # ServiceForm, so the copy here is only a fallback.
                "type": StorefrontSection.SectionType.CONTACT_FORM,
                "order": 5, "enabled": True,
                "settings": {
                    "title": "Tell us about the job",
                    "subtitle": "The more you tell us, the more accurate the quote.",
                },
            },
            footer
        ]

    # Default / Retail
    return [
        {
            "type": StorefrontSection.SectionType.ANNOUNCEMENT_BAR,
            "order": 1, "enabled": True,
            "settings": {"text": "🎉 Free shipping on orders over 25,000 XAF!", "bg_color": "#a855f7", "text_color": "#ffffff"},
        },
        {
            "type": StorefrontSection.SectionType.HERO,
            "order": 2, "enabled": True,
            "settings": {
                "title": "Welcome to Our Store",
                "subtitle": "Discover premium products, curated collections, and exclusive deals.",
                "button_text": "Shop Now",
                "image": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=2000",
                "overlay": True,
            },
        },
        {
            "type": StorefrontSection.SectionType.CATEGORIES,
            "order": 3, "enabled": True,
            "settings": {"title": "Browse by Category", "show_all": True},
        },
        {
            "type": StorefrontSection.SectionType.FEATURED_PRODUCTS,
            "order": 4, "enabled": True,
            "settings": {"title": "Featured Products"},
        },
        {
            "type": StorefrontSection.SectionType.CATALOG,
            "order": 5, "enabled": True,
            "settings": {"title": "Our Collection", "show_sidebar": True},
        },
        {
            "type": StorefrontSection.SectionType.PROMO_BANNER,
            "order": 6, "enabled": True,
            "settings": {
                "title": "Special Offer",
                "subtitle": "Up to 40% off selected items this week only.",
                "button_text": "Grab the Deal",
                "button_url": "/shop",
                "image": "",
            },
        },
        {
            "type": StorefrontSection.SectionType.ABOUT,
            "order": 7, "enabled": True,
            "settings": {
                "title": "Our Story",
                "content": "We believe in high-quality products and exceptional customer service.",
                "image": "",
            },
        },
        {
            "type": StorefrontSection.SectionType.NEWSLETTER,
            "order": 8, "enabled": True,
            "settings": {"title": "Stay in the Loop", "subtitle": "Get new arrivals and exclusive deals in your inbox.", "placeholder": "Enter your email", "button_text": "Subscribe"},
        },
        footer
    ]

def get_base_config(business_type: str) -> dict:
    """The starting design for a category.

    Each category gets its own ``layout`` — the page structure — as well as
    its own palette and type. Without the layout key these presets only ever
    recoloured one fixed page: a takeaway and a boutique differed by hue and
    nothing else. See ``StorefrontConfig.Layout``.

    ``heading_font`` is set explicitly everywhere. It used to be omitted, so
    every category inherited the model default (Outfit) no matter which body
    face was chosen, and the pairings the wizard offers had no counterpart
    here.
    """

    if business_type == "fashion":
        # Deep oxblood on bone, editorial serif-ish pairing, square edges.
        return {
            "primary_color": "#7f1d1d",
            "secondary_color": "#fafaf9",
            "accent_color": "#991b1b",
            "background_color": "#ffffff",
            "text_color": "#171717",
            "font": StorefrontConfig.Font.LATO,
            "heading_font": StorefrontConfig.Font.RALEWAY,
            "button_style": StorefrontConfig.ButtonStyle.SQUARE,
            "product_card_style": StorefrontConfig.ProductCardStyle.LARGE,
            "layout": StorefrontConfig.Layout.EDITORIAL,
        }

    elif business_type == "beauty":
        return {
            "primary_color": "#be185d",
            "secondary_color": "#fdf2f8",
            "accent_color": "#ec4899",
            "background_color": "#fffbfc",
            "text_color": "#111827",
            "font": StorefrontConfig.Font.LATO,
            "heading_font": StorefrontConfig.Font.RALEWAY,
            "button_style": StorefrontConfig.ButtonStyle.PILL,
            "product_card_style": StorefrontConfig.ProductCardStyle.COMPACT,
            "layout": StorefrontConfig.Layout.BOUTIQUE,
        }

    elif business_type == "food":
        # Terracotta, Poppins & Inter, Soft — the same three the blueprint
        # wizard pre-selects for this category (``blueprint.CATEGORIES``).
        # They disagreed before: onboarding gave a lighter accent than the
        # primary and compact cards, so a food shop looked different
        # depending on whether the merchant ran the wizard or skipped it.
        return {
            "primary_color": "#c2410c",
            "secondary_color": "#fff7ed",
            "accent_color": "#9a3412",
            "background_color": "#fffdf9",
            "text_color": "#1c1310",
            "font": StorefrontConfig.Font.INTER,
            "heading_font": StorefrontConfig.Font.POPPINS,
            "button_style": StorefrontConfig.ButtonStyle.ROUNDED,
            "product_card_style": StorefrontConfig.ProductCardStyle.STANDARD,
            "layout": StorefrontConfig.Layout.MENU,
        }

    elif business_type == "electronics":
        return {
            "primary_color": "#3b82f6",
            "secondary_color": "#1e293b",
            "accent_color": "#60a5fa",
            "background_color": "#0f172a",
            "text_color": "#f8fafc",
            "font": StorefrontConfig.Font.INTER,
            "heading_font": StorefrontConfig.Font.INTER,
            "button_style": StorefrontConfig.ButtonStyle.SQUARE,
            "product_card_style": StorefrontConfig.ProductCardStyle.COMPACT,
            "layout": StorefrontConfig.Layout.TECHGRID,
        }

    elif business_type == "digital":
        return {
            "primary_color": "#4f46e5",
            "secondary_color": "#eef2ff",
            "accent_color": "#7c3aed",
            "background_color": "#ffffff",
            "text_color": "#111827",
            "font": StorefrontConfig.Font.INTER,
            "heading_font": StorefrontConfig.Font.OUTFIT,
            "button_style": StorefrontConfig.ButtonStyle.ROUNDED,
            "product_card_style": StorefrontConfig.ProductCardStyle.STANDARD,
            "layout": StorefrontConfig.Layout.SHOWCASE,
        }

    elif business_type == "services":
        return {
            "primary_color": "#0f766e",
            "secondary_color": "#f0fdfa",
            "accent_color": "#0d9488",
            "background_color": "#ffffff",
            "text_color": "#0f1117",
            "font": StorefrontConfig.Font.NUNITO,
            "heading_font": StorefrontConfig.Font.OUTFIT,
            "button_style": StorefrontConfig.ButtonStyle.ROUNDED,
            "product_card_style": StorefrontConfig.ProductCardStyle.STANDARD,
            "layout": StorefrontConfig.Layout.SERVICE,
        }

    # Default / Retail
    return {
        "primary_color": "#a855f7",
        "secondary_color": "#faf5ff",
        "accent_color": "#7e22ce",
        "background_color": "#ffffff",
        "text_color": "#0f1117",
        "font": StorefrontConfig.Font.INTER,
        "heading_font": StorefrontConfig.Font.OUTFIT,
        "button_style": StorefrontConfig.ButtonStyle.ROUNDED,
        "product_card_style": StorefrontConfig.ProductCardStyle.STANDARD,
        "layout": StorefrontConfig.Layout.CLASSIC,
    }
