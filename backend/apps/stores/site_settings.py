"""
Site settings — the shop-wide preferences that are not design and not content.

Thirteen panels' worth: who may see the site, what languages it declares, how
it treats cookies, which crawlers it allows, how it optimises images, and so
on. They have three things in common, and the shape of this module follows
from them.

**One schema, both ends.** Every field is declared once, here, with its kind,
its choices, its label and its help text. The API serves that declaration
alongside the values, and the dashboard renders whatever it is given. Thirteen
panels written as bespoke forms would restate every choice list in TypeScript
and drift from this file within a release.

**One column.** All of it lives in ``Store.site_settings``, a JSONField, rather
than in thirty columns or a second table. These are sparse, defaulted
preferences that are read as a whole and written as a whole; the only reason to
give one its own column would be to filter or index on it, and nothing here is
filtered or indexed. Files cannot live in JSON, so the two image settings point
at real ``Store`` columns instead — see ``Field.source``.

**Defaults are the answer, not null.** Reading a setting must never be
``store.site_settings.get("crawlers") or "allow_all"`` at the call site. Use
:func:`get` or :func:`resolved`, which merge over :data:`DEFAULTS`, so a store
saved before a setting existed answers the same as one saved after.

Settings that only take effect somewhere else in the codebase say where in
their ``help`` text, so a panel that stores a preference nothing reads yet is
visible as such rather than looking finished.
"""

from __future__ import annotations

from dataclasses import dataclass, field as dc_field
from typing import Any, Optional

from rest_framework import serializers

# ── Vocabularies ──────────────────────────────────────────────────────────────

LANGUAGES = [
    ("en", "English"),
    ("fr", "Français"),
    ("pt", "Português"),
    ("ar", "العربية"),
    ("sw", "Kiswahili"),
    ("ha", "Hausa"),
    ("yo", "Yorùbá"),
    ("ig", "Igbo"),
    ("am", "አማርኛ"),
    ("zu", "isiZulu"),
]

#: Curated rather than the full tz database: a merchant picking a timezone from
#: 600 options picks the wrong one. Africa first, because that is who this is for.
TIMEZONES = [
    ("Africa/Douala", "Douala (WAT, UTC+1)"),
    ("Africa/Lagos", "Lagos (WAT, UTC+1)"),
    ("Africa/Accra", "Accra (GMT, UTC+0)"),
    ("Africa/Abidjan", "Abidjan (GMT, UTC+0)"),
    ("Africa/Dakar", "Dakar (GMT, UTC+0)"),
    ("Africa/Kinshasa", "Kinshasa (WAT, UTC+1)"),
    ("Africa/Johannesburg", "Johannesburg (SAST, UTC+2)"),
    ("Africa/Nairobi", "Nairobi (EAT, UTC+3)"),
    ("Africa/Cairo", "Cairo (EET, UTC+2)"),
    ("Africa/Casablanca", "Casablanca (UTC+1)"),
    ("Africa/Kigali", "Kigali (CAT, UTC+2)"),
    ("Africa/Addis_Ababa", "Addis Ababa (EAT, UTC+3)"),
    ("Europe/London", "London (UTC+0/+1)"),
    ("Europe/Paris", "Paris (UTC+1/+2)"),
    ("America/New_York", "New York (UTC−5/−4)"),
    ("UTC", "UTC"),
]

#: Crawlers a merchant may plausibly want to name individually. The AI trainers
#: are listed because "may my product photographs be used to train a model" is
#: a question merchants now ask, and robots.txt is the only lever they have.
KNOWN_AGENTS = [
    ("GPTBot", "GPTBot (OpenAI)"),
    ("ClaudeBot", "ClaudeBot (Anthropic)"),
    ("Google-Extended", "Google-Extended (Gemini training)"),
    ("CCBot", "CCBot (Common Crawl)"),
    ("Bytespider", "Bytespider (ByteDance)"),
    ("PerplexityBot", "PerplexityBot"),
    ("Amazonbot", "Amazonbot"),
    ("FacebookBot", "FacebookBot"),
]


# ── Field declarations ────────────────────────────────────────────────────────

BOOL, STRING, TEXT, URL, INT, CHOICE, MULTI, TAGS, IMAGE = (
    "bool", "string", "text", "url", "int", "choice", "multi", "tags", "image",
)


@dataclass(frozen=True)
class Field:
    key: str
    label: str
    kind: str
    default: Any = None
    help: str = ""
    choices: tuple = ()
    max_length: Optional[int] = None
    minimum: Optional[int] = None
    maximum: Optional[int] = None
    #: "settings" lives in ``Store.site_settings``; "store" is a real column on
    #: ``Store``, which is how the two image fields work — a file cannot be
    #: stored in JSON. The dashboard PATCHes each source to its own endpoint.
    source: str = "settings"
    #: Show this field only when another one has a given value, so the podcast
    #: fields are not in the way of someone running a blog.
    depends_on: Optional[dict] = None
    #: True for anything that must not be echoed back to the browser.
    secret: bool = False

    def as_dict(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "kind": self.kind,
            "help": self.help,
            "choices": [{"value": v, "label": l} for v, l in self.choices],
            "max_length": self.max_length,
            "min": self.minimum,
            "max": self.maximum,
            "source": self.source,
            "depends_on": self.depends_on,
            "secret": self.secret,
        }


@dataclass(frozen=True)
class Panel:
    key: str
    title: str
    blurb: str
    fields: list = dc_field(default_factory=list)
    #: A panel the generic renderer cannot draw — an upload, or the CSV
    #: import/export tool. The dashboard matches on this string.
    component: str = ""

    def as_dict(self) -> dict:
        return {
            "key": self.key,
            "title": self.title,
            "blurb": self.blurb,
            "component": self.component,
            "fields": [f.as_dict() for f in self.fields],
        }


PANELS: list[Panel] = [
    Panel(
        key="availability",
        title="Site Availability",
        blurb="Who can open your storefront. Applies to the whole shop, "
              "including product pages and checkout.",
        fields=[
            Field(
                "availability", "Who can view this site", CHOICE, default="public",
                choices=(
                    ("public", "Public — anyone can visit"),
                    ("password", "Password — visitors need a passcode"),
                    ("private", "Private — only you and your team"),
                ),
                help="Enforced by the storefront API, so it holds on every page "
                     "and on direct links, not only on the home page.",
            ),
            Field(
                "access_password", "Passcode", STRING, default="", max_length=64,
                depends_on={"key": "availability", "value": "password"},
                help="Share this with the people you want to let in. Anyone with "
                     "it can see the whole shop.",
            ),
            Field(
                "availability_note", "Message on the gate", TEXT, default="",
                max_length=300,
                depends_on={"key": "availability", "value": "password"},
                help="Shown above the passcode box. “Launching 1 March — ask us "
                     "for early access.”",
            ),
        ],
    ),
    Panel(
        key="languages",
        title="Site Languages",
        blurb="The languages your shop is offered in. Declaring them tells "
              "search engines which audience each page is for.",
        fields=[
            Field(
                "default_language", "Primary language", CHOICE, default="en",
                choices=tuple(LANGUAGES),
                help="Sets the page's lang attribute, which is what screen "
                     "readers and translation prompts read.",
            ),
            Field(
                "languages", "Also available in", MULTI, default=[],
                choices=tuple(LANGUAGES),
                help="Adds an hreflang tag per language. Koraa does not "
                     "translate your copy — this declares what you have "
                     "written yourself.",
            ),
            Field(
                "show_language_picker", "Show a language picker", BOOL, default=False,
                help="Only useful once you have written the copy in more than "
                     "one language.",
            ),
        ],
    ),
    Panel(
        key="regional",
        title="Regional Settings",
        blurb="Where the shop operates, and the conventions it uses for dates "
              "and measurements. Your country and currency are on the store "
              "details page.",
        fields=[
            Field(
                "timezone", "Timezone", CHOICE, default="Africa/Douala",
                choices=tuple(TIMEZONES),
                help="Order times and opening hours are shown in this zone.",
            ),
            Field(
                "measurement", "Measurement system", CHOICE, default="metric",
                choices=(("metric", "Metric — kg, cm"), ("imperial", "Imperial — lb, in")),
            ),
            Field(
                "date_format", "Date format", CHOICE, default="dmy",
                choices=(
                    ("dmy", "31/12/2026"),
                    ("mdy", "12/31/2026"),
                    ("ymd", "2026-12-31"),
                ),
            ),
            Field(
                "first_day_of_week", "Week starts on", CHOICE, default="mon",
                choices=(("mon", "Monday"), ("sun", "Sunday")),
            ),
        ],
    ),
    Panel(
        key="privacy",
        title="Cookies and Data Privacy",
        blurb="What visitors are told about cookies, and where your policies "
              "live.",
        fields=[
            Field(
                "cookie_banner", "Cookie banner", CHOICE, default="off",
                choices=(
                    ("off", "Off"),
                    ("notice", "Notice — tells visitors, no choice offered"),
                    ("consent", "Consent — analytics wait for agreement"),
                ),
                help="Consent mode holds analytics back until the visitor "
                     "agrees, which is what GDPR asks for if you sell into Europe.",
            ),
            Field(
                "cookie_banner_text", "Banner text", TEXT, default="", max_length=400,
                depends_on={"key": "cookie_banner", "value": "notice"},
            ),
            Field("cookie_policy_url", "Cookie policy link", URL, default=""),
            Field("privacy_policy_url", "Privacy policy link", URL, default=""),
            Field(
                "data_requests_email", "Data requests go to", STRING, default="",
                max_length=254,
                help="Where a customer writes to ask for a copy of their data, "
                     "or to have it deleted.",
            ),
        ],
    ),
    Panel(
        key="favicon",
        title="Favicon",
        blurb="The small mark in a browser tab, a bookmark and a search result.",
        component="favicon",
        fields=[
            Field(
                "favicon", "Favicon", IMAGE, source="store",
                help="A square image, at least 64×64. Your logo cropped to the "
                     "mark usually works; a full wordmark does not — at 16 "
                     "pixels it is a smudge.",
            ),
        ],
    ),
    Panel(
        key="social_links",
        title="Social Links",
        blurb="Where your shop lives elsewhere. Shown in the storefront footer "
              "and used by search engines to tie the accounts together.",
        fields=[
            Field("instagram", "Instagram", URL, source="store"),
            Field("facebook", "Facebook", URL, source="store"),
            Field("whatsapp", "WhatsApp number", STRING, source="store", max_length=20),
            Field("social_x", "X / Twitter", URL, default=""),
            Field("social_tiktok", "TikTok", URL, default=""),
            Field("social_youtube", "YouTube", URL, default=""),
            Field("social_pinterest", "Pinterest", URL, default=""),
            Field("social_linkedin", "LinkedIn", URL, default=""),
        ],
    ),
    Panel(
        key="social_sharing",
        title="Social Sharing",
        blurb="What appears when someone pastes a link to your shop into "
              "WhatsApp, Instagram or X.",
        component="social_sharing",
        fields=[
            Field(
                "social_image", "Sharing image", IMAGE, source="store",
                help="1200×630 works everywhere. Without it, chat apps show a "
                     "bare link with no picture, which almost nobody opens.",
            ),
            Field(
                "social_title", "Sharing title", STRING, default="", max_length=90,
                help="Defaults to your search title.",
            ),
            Field(
                "social_description", "Sharing description", TEXT, default="",
                max_length=200, help="Defaults to your search description.",
            ),
            Field(
                "twitter_card", "X card size", CHOICE, default="summary_large_image",
                choices=(
                    ("summary_large_image", "Large image"),
                    ("summary", "Small thumbnail"),
                ),
            ),
        ],
    ),
    Panel(
        key="pinterest",
        title="Pinterest Save Buttons",
        blurb="A Save button over your product photographs, so a shopper can "
              "pin them to a board — and the pin links back to you.",
        fields=[
            Field(
                "pinterest_save", "Save button", CHOICE, default="off",
                choices=(
                    ("off", "Off"),
                    ("hover", "On hover — appears when the mouse is over an image"),
                    ("always", "Always visible"),
                ),
                help="On a touch screen there is no hover, so “on hover” shows "
                     "the button permanently there.",
            ),
            Field(
                "pinterest_verify", "Pinterest domain verification", STRING,
                default="", max_length=120,
                help="The content value from Pinterest's meta tag. Needed before "
                     "pins from your shop count as yours.",
            ),
        ],
    ),
    Panel(
        key="import_export",
        title="Import & Export Content",
        blurb="Move your catalogue in and out as a spreadsheet.",
        component="import_export",
        fields=[],
    ),
    Panel(
        key="blog",
        title="Blog Preferences",
        blurb="Settings for a blog or podcast on your shop. The feed and the "
              "posts themselves are not built yet — this stores your choices "
              "for when they are.",
        fields=[
            Field("blog_enabled", "Enable a blog or podcast", BOOL, default=False),
            Field(
                "blog_kind", "This is a", CHOICE, default="blog",
                choices=(("blog", "Blog"), ("podcast", "Podcast")),
                depends_on={"key": "blog_enabled", "value": True},
            ),
            Field(
                "blog_title", "Title", STRING, default="", max_length=120,
                depends_on={"key": "blog_enabled", "value": True},
            ),
            Field(
                "blog_tags", "Tags", TAGS, default=[],
                depends_on={"key": "blog_enabled", "value": True},
                help="Comma separated. Used to group posts and to fill the "
                     "feed's category tags.",
            ),
            Field(
                "rss_enabled", "Publish an RSS feed", BOOL, default=True,
                depends_on={"key": "blog_enabled", "value": True},
                help="A podcast needs one — it is how Apple and Spotify read "
                     "your episodes.",
            ),
            Field(
                "rss_items", "Items in the feed", INT, default=20,
                minimum=1, maximum=100,
                depends_on={"key": "blog_enabled", "value": True},
            ),
            Field(
                "podcast_author", "Podcast author", STRING, default="", max_length=120,
                depends_on={"key": "blog_kind", "value": "podcast"},
            ),
            Field(
                "podcast_explicit", "Contains explicit content", BOOL, default=False,
                depends_on={"key": "blog_kind", "value": "podcast"},
            ),
        ],
    ),
    Panel(
        key="promotion",
        title="Site Promotion",
        blurb="Whether Koraa may show your shop off.",
        fields=[
            Field(
                "allow_koraa_promotion", "Let Koraa promote this shop", BOOL,
                default=True,
                help="We may feature it on the Koraa home page, in the shop "
                     "directory, or on our social accounts. Turning this off "
                     "does not affect anything else about your shop.",
            ),
            Field(
                "allow_case_study", "Open to being a case study", BOOL, default=False,
                help="We would contact you first, and you would see the piece "
                     "before it went out.",
            ),
            Field(
                "promotion_pitch", "What should we say about you", TEXT, default="",
                max_length=400,
                help="A sentence or two in your own words, so a feature does "
                     "not describe you wrongly.",
            ),
        ],
    ),
    Panel(
        key="crawlers",
        title="Crawlers",
        blurb="Which robots may read your shop. Written into robots.txt, which "
              "well-behaved crawlers obey and badly-behaved ones ignore.",
        fields=[
            Field(
                "crawlers", "Crawler access", CHOICE, default="allow_all",
                choices=(
                    ("allow_all", "Allow all crawlers"),
                    ("search_only", "Search engines only — block the rest"),
                    ("block_all", "Block everything"),
                ),
                help="Blocking everything removes you from Google. Only do it "
                     "on a shop you do not want found.",
            ),
            Field(
                "blocked_agents", "Also block these", MULTI, default=[],
                choices=tuple(KNOWN_AGENTS),
                help="Named crawlers to refuse regardless of the setting above. "
                     "The AI trainers are here because robots.txt is the only "
                     "place you can say no to them.",
            ),
            Field(
                "crawl_delay", "Crawl delay (seconds)", INT, default=0,
                minimum=0, maximum=30,
                help="Ask crawlers to wait between requests. 0 means no request. "
                     "Google ignores this; Bing and Yandex honour it.",
            ),
            Field(
                "custom_robots", "Extra robots.txt rules", TEXT, default="",
                max_length=2000,
                help="Appended verbatim. Only use this if you know the syntax — "
                     "a bad rule here can hide your whole shop.",
            ),
        ],
    ),
    Panel(
        key="images",
        title="Image Settings",
        blurb="How your product photographs are loaded and displayed.",
        fields=[
            Field(
                "image_optimization", "Optimisation", CHOICE, default="auto",
                choices=(
                    ("auto", "Automatic — resize and compress for each device"),
                    ("off", "Off — serve the original file"),
                ),
                help="Turning this off means a shopper on a phone downloads your "
                     "full-size photographs. On a slow connection that is the "
                     "difference between a sale and a closed tab.",
            ),
            Field(
                "image_quality", "Compression quality", INT, default=80,
                minimum=40, maximum=95,
                depends_on={"key": "image_optimization", "value": "auto"},
                help="80 is indistinguishable from the original for most "
                     "photographs. Below 60 shows on fabric and skin.",
            ),
            Field(
                "image_lazy_load", "Load images as they scroll into view", BOOL,
                default=True,
                help="Keeps the first screen fast. The hero image always loads "
                     "immediately regardless.",
            ),
            Field(
                "image_fit", "How images fill their frame", CHOICE, default="cover",
                choices=(
                    ("cover", "Fill the frame — crops to fit"),
                    ("contain", "Fit inside — shows the whole image"),
                ),
                help="Fit inside suits products photographed on white; fill "
                     "suits lifestyle photography.",
            ),
            Field(
                "image_zoom", "Click to zoom", BOOL, default=True,
            ),
        ],
    ),
]


# ── Lookup, defaults, coercion ────────────────────────────────────────────────

#: Only settings-sourced fields; the "store" ones are real columns.
FIELDS: dict[str, Field] = {
    f.key: f for p in PANELS for f in p.fields if f.source == "settings"
}

DEFAULTS: dict[str, Any] = {k: f.default for k, f in FIELDS.items()}

#: Never returned to the browser. There is one, and it is the passcode: the
#: dashboard shows whether a passcode is set, not what it is.
SECRET_KEYS = {"access_password"}


def resolved(store) -> dict:
    """Every setting for ``store``, defaults filled in.

    Unknown keys in the stored blob are dropped rather than passed through:
    they are settings that were removed, and returning them would have the
    dashboard render fields that no longer do anything.
    """
    stored = store.site_settings if isinstance(store.site_settings, dict) else {}
    return {key: stored.get(key, default) for key, default in DEFAULTS.items()}


def get(store, key: str) -> Any:
    """One setting, with its default. The only sanctioned way to read one."""
    if key not in DEFAULTS:
        raise KeyError(f"{key!r} is not a site setting")
    stored = store.site_settings if isinstance(store.site_settings, dict) else {}
    return stored.get(key, DEFAULTS[key])


def public(store) -> dict:
    """The settings the storefront may see.

    The passcode is replaced by a boolean. The storefront needs to know that a
    gate exists; it does not need the key, and anything sent to a public API is
    published whether or not the UI displays it.
    """
    values = resolved(store)
    values["has_access_password"] = bool(values.pop("access_password", ""))
    return values


def _coerce(f: Field, value: Any) -> Any:
    """One value, validated against its declaration."""
    if f.kind == BOOL:
        if isinstance(value, bool):
            return value
        raise serializers.ValidationError({f.key: "Must be true or false."})

    if f.kind == INT:
        try:
            number = int(value)
        except (TypeError, ValueError):
            raise serializers.ValidationError({f.key: "Must be a whole number."})
        if f.minimum is not None and number < f.minimum:
            raise serializers.ValidationError({f.key: f"Must be at least {f.minimum}."})
        if f.maximum is not None and number > f.maximum:
            raise serializers.ValidationError({f.key: f"Must be at most {f.maximum}."})
        return number

    if f.kind == CHOICE:
        allowed = [v for v, _ in f.choices]
        if value not in allowed:
            raise serializers.ValidationError(
                {f.key: f"Must be one of: {', '.join(allowed)}."}
            )
        return value

    if f.kind == MULTI:
        if not isinstance(value, list):
            raise serializers.ValidationError({f.key: "Must be a list."})
        allowed = {v for v, _ in f.choices}
        unknown = [v for v in value if v not in allowed]
        if unknown:
            raise serializers.ValidationError(
                {f.key: f"Not recognised: {', '.join(map(str, unknown))}."}
            )
        # Deduplicated in declaration order, so the stored list is stable and
        # two saves of the same selection produce the same value.
        return [v for v, _ in f.choices if v in set(value)]

    if f.kind == TAGS:
        if isinstance(value, str):
            value = [part.strip() for part in value.split(",")]
        if not isinstance(value, list):
            raise serializers.ValidationError({f.key: "Must be a list of tags."})
        tags, seen = [], set()
        for tag in value:
            text = str(tag).strip()[:40]
            if text and text.lower() not in seen:
                seen.add(text.lower())
                tags.append(text)
        return tags[:30]

    # STRING, TEXT, URL
    text = "" if value is None else str(value).strip()
    if f.max_length and len(text) > f.max_length:
        raise serializers.ValidationError(
            {f.key: f"Must be {f.max_length} characters or fewer."}
        )
    if f.kind == URL and text and not text.startswith(("http://", "https://")):
        # Merchants paste "instagram.com/shop" far more often than a full URL,
        # and a link without a scheme resolves against the storefront.
        text = f"https://{text}"
    return text


def validate_patch(patch: dict) -> dict:
    """Validate an incoming partial update. Returns only the known keys."""
    if not isinstance(patch, dict):
        raise serializers.ValidationError("Expected an object of settings.")

    unknown = [k for k in patch if k not in FIELDS]
    if unknown:
        raise serializers.ValidationError(
            {"detail": f"Unknown setting(s): {', '.join(sorted(unknown))}."}
        )

    return {key: _coerce(FIELDS[key], value) for key, value in patch.items()}


def apply_patch(store, patch: dict) -> dict:
    """Merge a validated patch into the store and save. Returns the new values.

    Only the keys sent are touched, and the stored blob keeps just the
    non-default values — a store row does not need to carry forty settings that
    equal their default, and pruning them means a changed default reaches every
    shop that never overrode it.
    """
    clean = validate_patch(patch)
    stored = dict(store.site_settings) if isinstance(store.site_settings, dict) else {}
    stored.update(clean)
    store.site_settings = {
        key: value for key, value in stored.items()
        if key in DEFAULTS and value != DEFAULTS[key]
    }
    store.save(update_fields=["site_settings", "updated_at"])
    return resolved(store)


def catalogue() -> list:
    """The panel declarations, for the dashboard to render."""
    return [p.as_dict() for p in PANELS]
