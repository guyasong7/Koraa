"""
Storefront customization models.

StorefrontConfig — merchant's design configuration (colors, fonts, etc.)
StorefrontSection — ordered, enable/disable-able page sections
ServiceForm — the enquiry form a service business builds for its own storefront
FormSubmission — one filled-in enquiry, kept and emailed to the merchant
"""

import uuid
from django.db import models
from django.utils.translation import gettext_lazy as _


class StorefrontConfig(models.Model):
    """
    Stores all visual/design configuration for a merchant's storefront.
    Has both a 'draft' state and a 'published' snapshot.
    Merchants edit the draft; clicking Publish copies draft → published.
    """

    class Font(models.TextChoices):
        INTER = "Inter", _("Inter")
        OUTFIT = "Outfit", _("Outfit")
        POPPINS = "Poppins", _("Poppins")
        LATO = "Lato", _("Lato")
        RALEWAY = "Raleway", _("Raleway")
        NUNITO = "Nunito", _("Nunito")

    class ButtonStyle(models.TextChoices):
        ROUNDED = "rounded", _("Rounded")
        SQUARE = "square", _("Square")
        PILL = "pill", _("Pill")

    class ProductCardStyle(models.TextChoices):
        COMPACT = "compact", _("Compact")
        STANDARD = "standard", _("Standard")
        LARGE = "large", _("Large")

    class Layout(models.TextChoices):
        """How the page is put together, as opposed to what colour it is.

        Colours, fonts and card density can all be swapped without the page
        changing shape, which is why every storefront used to look the same
        underneath: one hero, one grid, one about block, for a boutique and a
        takeaway alike. A layout picks the *structure* — whether the hero is
        full-bleed or split, whether the catalogue is a grid or a price list,
        whether categories are tiles or tabs.

        Set from the "What do you sell?" answer, and editable after, since a
        merchant may well want the menu layout for something that is not
        food.

        A layout may also replace the navbar and footer, which sit outside the
        section list. ``menu`` does: a takeaway is asked for a phone number,
        opening hours and an address where a shop is asked for a search field
        and three columns of links. The hours and address are read from the
        footer section's settings, so the merchant edits them where they edit
        the rest of the footer copy.
        """

        CLASSIC = "classic", _("Classic — hero, grid, about")
        EDITORIAL = "editorial", _("Editorial — full-bleed lookbook")
        BOUTIQUE = "boutique", _("Boutique — split hero, filtered catalogue")
        MENU = "menu", _("Menu — tabbed sections, price list")
        TECHGRID = "techgrid", _("Technical — spec panels, sidebar filters")
        SHOWCASE = "showcase", _("Showcase — no-photography cards")
        SERVICE = "service", _("Service — centred hero, offering list")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.OneToOneField(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="storefront_config",
    )

    # ── Colors ────────────────────────────────────────────────────────────────
    primary_color = models.CharField(max_length=20, default="#a855f7")
    secondary_color = models.CharField(max_length=20, default="#ffffff")
    accent_color = models.CharField(max_length=20, default="#7e22ce")
    background_color = models.CharField(max_length=20, default="#ffffff")
    text_color = models.CharField(max_length=20, default="#0f1117")

    # ── Typography ────────────────────────────────────────────────────────────
    #
    # Two faces, because a storefront that sets headings and body copy from
    # one value can never be more than one typeface. The renderer read
    # ``var(--sf-font, Outfit)`` for headings, but --sf-font was always
    # set, so the Outfit fallback never once applied.
    #
    # ``heading_font`` may equal ``font`` — "Inter only" is a legitimate
    # choice, not a missing value — so it is not nullable.
    font = models.CharField(
        max_length=50, choices=Font.choices, default=Font.INTER
    )
    heading_font = models.CharField(
        max_length=50, choices=Font.choices, default=Font.OUTFIT
    )

    # ── UI Style ──────────────────────────────────────────────────────────────
    button_style = models.CharField(
        max_length=20, choices=ButtonStyle.choices, default=ButtonStyle.ROUNDED
    )
    product_card_style = models.CharField(
        max_length=20, choices=ProductCardStyle.choices, default=ProductCardStyle.STANDARD
    )
    #: Page structure. Defaults to classic so storefronts that existed before
    #: this field keep the shape they were published with.
    layout = models.CharField(
        max_length=20, choices=Layout.choices, default=Layout.CLASSIC
    )

    # ── Flexible config (nav links, footer content, announcement text) ────────
    navigation = models.JSONField(
        default=dict,
        blank=True,
        help_text='{"links": [{"label": "Shop", "url": "/shop"}]}',
    )
    footer = models.JSONField(
        default=dict,
        blank=True,
        help_text='{"tagline": "...", "links": [...]}',
    )
    announcement_bar = models.JSONField(
        default=dict,
        blank=True,
        help_text='{"text": "Free shipping!", "enabled": true}',
    )

    # ── Draft / Published snapshot ────────────────────────────────────────────
    published_config = models.JSONField(
        default=None,
        null=True,
        blank=True,
        help_text="Snapshot of the config at last publish. Served to customers.",
    )
    published_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("storefront config")
        verbose_name_plural = _("storefront configs")

    def __str__(self):
        return f"Config for {self.store.name}"

    def to_dict(self):
        """Serialize draft config to a dict for postMessage / snapshot."""
        return {
            "primary_color": self.primary_color,
            "secondary_color": self.secondary_color,
            "accent_color": self.accent_color,
            "background_color": self.background_color,
            "text_color": self.text_color,
            "font": self.font,
            "heading_font": self.heading_font,
            "button_style": self.button_style,
            "product_card_style": self.product_card_style,
            "layout": self.layout,
            "navigation": self.navigation,
            "footer": self.footer,
            "announcement_bar": self.announcement_bar,
        }

    def publish(self):
        """Snapshot current draft into published_config."""
        from django.utils import timezone
        self.published_config = self.to_dict()
        self.published_at = timezone.now()
        self.save(update_fields=["published_config", "published_at"])


class StorefrontSection(models.Model):
    """
    A single content section in the storefront (Hero, Products, etc.)
    Sections are ordered and can be individually enabled/disabled.
    """

    class SectionType(models.TextChoices):
        ANNOUNCEMENT_BAR = "announcement_bar", _("Announcement Bar")
        NAVBAR = "navbar", _("Navbar")
        HERO = "hero", _("Hero")
        CATEGORIES = "categories", _("Categories")
        FEATURED_PRODUCTS = "featured_products", _("Featured Products")
        PRODUCT_GRID = "product_grid", _("Product Grid")
        CATALOG = "catalog", _("Catalog")
        PROMO_BANNER = "promo_banner", _("Promo Banner")
        ABOUT = "about", _("About")
        TESTIMONIALS = "testimonials", _("Testimonials")
        NEWSLETTER = "newsletter", _("Newsletter")
        #: Renders the store's ServiceForm. A service business sells a
        #: conversation, not a basket, so this is the section that closes the
        #: sale for them the way `catalog` does for a shop.
        CONTACT_FORM = "contact_form", _("Enquiry Form")
        FOOTER = "footer", _("Footer")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(
        "stores.Store",
        on_delete=models.CASCADE,
        related_name="storefront_sections",
    )
    type = models.CharField(max_length=50, choices=SectionType.choices)
    order = models.PositiveIntegerField(default=0, db_index=True)
    enabled = models.BooleanField(default=True)

    # Section-specific content (title, subtitle, image URLs, button text, etc.)
    settings = models.JSONField(default=dict, blank=True)

    # Published snapshot for this section
    published_settings = models.JSONField(default=None, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("storefront section")
        verbose_name_plural = _("storefront sections")
        ordering = ["order"]
        unique_together = [["store", "type"]]

    def __str__(self):
        return f"{self.get_type_display()} (order={self.order}) — {self.store.name}"


class ServiceForm(models.Model):
    """The enquiry form a merchant builds for their own storefront.

    Koraa sells to service businesses as well as shops — a photographer, a
    caterer, a tailor — and none of them can price a job from a product grid.
    What they need is to be asked, so this is the form they design to ask with,
    and every submission is emailed to them.

    The fields are a JSON list rather than a table of rows because the merchant
    reorders and renames them freely, and a submission stores the answers
    against the field keys. Turning that into two more tables would buy
    referential integrity over a shape that is only ever read whole.

    One form per store: a second one would need its own section, its own URL and
    its own place in the editor, and no merchant has asked to be asked twice.
    """

    #: Field types the builder offers. The dashboard renders its palette from
    #: this and the public endpoint validates against it, so the two cannot
    #: drift into a form that can be built but not submitted.
    FIELD_TYPES = [
        {"type": "text", "label": "Short text", "multiline": False},
        {"type": "textarea", "label": "Long text", "multiline": True},
        {"type": "email", "label": "Email address", "multiline": False},
        {"type": "tel", "label": "Phone number", "multiline": False},
        {"type": "number", "label": "Number", "multiline": False},
        {"type": "date", "label": "Date", "multiline": False},
        {"type": "select", "label": "Dropdown", "options": True},
        {"type": "radio", "label": "Choose one", "options": True},
        {"type": "checkboxes", "label": "Choose several", "options": True},
        {"type": "checkbox", "label": "Single tick box", "multiline": False},
    ]

    #: Starting point for a store that has never opened the builder. Name and
    #: email are not optional anywhere — an enquiry you cannot reply to is not
    #: an enquiry — so they are seeded required and the builder keeps them so.
    DEFAULT_FIELDS = [
        {"key": "name", "label": "Your name", "type": "text", "required": True,
         "placeholder": "Jane Mbah", "width": "half"},
        {"key": "email", "label": "Email address", "type": "email", "required": True,
         "placeholder": "jane@example.com", "width": "half"},
        {"key": "phone", "label": "Phone number", "type": "tel", "required": False,
         "placeholder": "+237 6 00 00 00 00", "width": "half"},
        {"key": "service", "label": "What can we help with?", "type": "select",
         "required": True, "options": ["A quote", "A booking", "Something else"],
         "width": "half"},
        {"key": "message", "label": "Tell us more", "type": "textarea", "required": True,
         "placeholder": "A few lines about what you need and when.", "width": "full"},
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.OneToOneField(
        "stores.Store", on_delete=models.CASCADE, related_name="service_form"
    )

    is_enabled = models.BooleanField(_("enabled"), default=True)
    title = models.CharField(_("title"), max_length=160, default="Get in touch")
    description = models.TextField(
        _("description"), blank=True,
        default="Tell us what you need and we will come back to you.",
    )
    submit_label = models.CharField(_("button text"), max_length=60, default="Send enquiry")
    success_message = models.CharField(
        _("success message"), max_length=300,
        default="Thank you — your message is on its way. We will reply shortly.",
    )

    fields = models.JSONField(_("fields"), default=list, blank=True)

    #: Where enquiries go. Empty falls back to the store's email and then the
    #: merchant's login address, so a merchant who never fills this in still
    #: receives their leads instead of losing them silently.
    notify_emails = models.JSONField(_("notify"), default=list, blank=True)
    send_copy_to_sender = models.BooleanField(
        _("copy the sender"), default=True,
        help_text="Email the person a copy of what they sent.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("service form")
        verbose_name_plural = _("service forms")

    def __str__(self):
        return f"Enquiry form — {self.store.name}"

    def save(self, *args, **kwargs):
        if not self.fields:
            # Deep-copied: without this every form on the platform would share
            # one list of dicts and the first merchant to rename a label would
            # rename it for everybody.
            import copy
            self.fields = copy.deepcopy(self.DEFAULT_FIELDS)
        super().save(*args, **kwargs)

    def recipients(self):
        """Everyone who should be told about a new enquiry."""
        addresses = [a for a in (self.notify_emails or []) if a]
        if not addresses and self.store.email:
            addresses = [self.store.email]
        if not addresses:
            merchant = getattr(self.store, "merchant", None)
            user = getattr(merchant, "user", None)
            if user and user.email:
                addresses = [user.email]
        # Deduplicated case-insensitively but order preserved, so the address
        # the merchant listed first is the To: line.
        seen, ordered = set(), []
        for address in addresses:
            low = address.lower()
            if low not in seen:
                seen.add(low)
                ordered.append(address)
        return ordered


class FormSubmission(models.Model):
    """One enquiry somebody sent through a ServiceForm.

    Stored as well as emailed. An email is the merchant's notification, not
    their records: inboxes get full, addresses change, and a lead that only
    exists in a message somebody deleted is a lead lost. The dashboard reads
    these rows.

    ``answers`` keeps the labels alongside the values — the merchant may rename
    or delete a field tomorrow, and an enquiry that then reads
    ``{"field_3": "Saturday"}`` is unreadable.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(
        "stores.Store", on_delete=models.CASCADE, related_name="form_submissions"
    )
    form = models.ForeignKey(
        ServiceForm, on_delete=models.SET_NULL, null=True, related_name="submissions"
    )

    #: [{"key": ..., "label": ..., "value": ...}] in the order they were asked.
    answers = models.JSONField(_("answers"), default=list)

    #: Lifted out of the answers so the dashboard can list and search enquiries
    #: without unpacking JSON, and so "reply" is one click.
    sender_name = models.CharField(max_length=255, blank=True)
    sender_email = models.EmailField(blank=True)
    sender_phone = models.CharField(max_length=40, blank=True)

    is_read = models.BooleanField(default=False)
    emailed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("form submission")
        verbose_name_plural = _("form submissions")
        ordering = ["-created_at"]
        # Named explicitly rather than left to Django's hash, so the migration
        # that creates it is readable and does not change if the model moves.
        indexes = [
            models.Index(fields=["store", "-created_at"], name="sf_submission_recent")
        ]

    def __str__(self):
        who = self.sender_name or self.sender_email or "someone"
        return f"Enquiry from {who} — {self.store.name}"

    @property
    def summary(self):
        """The longest answer, trimmed — what a list row shows as a preview."""
        texts = [
            str(a.get("value", "")) for a in (self.answers or [])
            if isinstance(a, dict) and a.get("value")
        ]
        if not texts:
            return ""
        longest = max(texts, key=len)
        return longest[:160] + ("…" if len(longest) > 160 else "")


# ── Default section factory ────────────────────────────────────────────────────

DEFAULT_SECTIONS = [
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
            "content": "We believe in high-quality products and exceptional customer service. Every item is carefully selected to ensure the best experience.",
            "image": "",
        },
    },
    {
        "type": StorefrontSection.SectionType.NEWSLETTER,
        "order": 8, "enabled": True,
        "settings": {"title": "Stay in the Loop", "subtitle": "Get new arrivals and exclusive deals in your inbox.", "placeholder": "Enter your email", "button_text": "Subscribe"},
    },
    {
        "type": StorefrontSection.SectionType.FOOTER,
        "order": 9, "enabled": True,
        "settings": {
            "tagline": "Quality products, delivered to your door.",
            "links": [{"label": "Home", "url": "/"}, {"label": "Shop", "url": "/shop"}, {"label": "About", "url": "/about"}, {"label": "Contact", "url": "/contact"}],
        },
    },
]


def create_default_sections(store):
    """Create default sections for a newly created store tailored to business type."""
    from .presets import get_base_sections
    
    business_type = store.merchant.business_type if store.merchant else "other"
    tailored_sections = get_base_sections(business_type)
    
    sections = []
    for section_data in tailored_sections:
        sections.append(
            StorefrontSection(
                store=store,
                type=section_data["type"],
                order=section_data["order"],
                enabled=section_data["enabled"],
                settings=section_data["settings"],
            )
        )
    StorefrontSection.objects.bulk_create(sections, ignore_conflicts=True)
