"""Image previews for the Django admin.

The admin's default widget for an ImageField renders the filename as a link and
nothing else, so reviewing anything visual meant opening each file in a new tab.
For merchant KYC that is not a papercut: MerchantIdentity holds an ID document,
its reverse, and a selfie taken with it, and the whole point of the review is
comparing the three faces. Three round trips per merchant, with no two images on
screen at once.

WHAT TO USE

`ImagePreviewAdminMixin` is the whole story for most admins — mix it in and every
ImageField and FileField on the change form renders its image above the upload
control, with no per-field wiring:

    class StoreAdmin(ImagePreviewAdminMixin, admin.ModelAdmin):
        ...

One caveat: it works by setting `formfield_overrides`, and a subclass that
defines its own `formfield_overrides` shadows the mixin's rather than merging
with it. Such an admin should spread `ImagePreviewAdminMixin.formfield_overrides`
into its own dict.

`image_preview()` builds a named display method for `list_display` (a thumbnail
column) or `readonly_fields` (a preview that sits in a fieldset without offering
to replace the file):

    logo_preview = image_preview("logo", label="Logo")

NOT AN INSTALLED APP. `apps.common` is a plain utility package — it has no
models, no AppConfig, and is absent from INSTALLED_APPS, so Django never
auto-imports anything here. Each app's admin.py imports from it explicitly.
"""

from pathlib import PurePosixPath

from django.contrib import admin
from django.contrib.admin.widgets import AdminFileWidget
from django.db import models
from django.utils.html import format_html
from django.utils.safestring import mark_safe

#: Suffixes a browser will render in an <img>. Checked for FileField, which can
#: hold anything — a merchant may upload a PDF scan of a business licence, and an
#: <img> pointed at a PDF is a broken-image icon, strictly worse than the link
#: the default widget would have given.
IMAGE_SUFFIXES = frozenset(
    {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".bmp", ".ico"}
)

#: Rendered where a field is empty, matching the admin's own convention for null.
EMPTY = "—"


def file_url(fieldfile) -> str | None:
    """The file's URL, or None when there is nothing to show.

    Every failure mode here ends the same way — no preview — so they are handled
    together rather than distinguished:

    - Falsy `fieldfile`: the field is blank, which is the common case.
    - ValueError: a FieldFile with no name. `.url` raises rather than answering
      None, and a blank=True field that was cleared reaches exactly this.
    - Storage errors: the S3/R2 backend needs settings to build a URL and raises
      if they are absent, so a bucket-backed field on a box configured for local
      media must not take the admin down with it.
    """
    if not fieldfile:
        return None
    try:
        return fieldfile.url
    except Exception:  # noqa: BLE001 — see docstring: every case is "no preview".
        return None


def looks_like_image(url: str) -> bool:
    """Whether `url` names something an <img> can render.

    Reads the suffix rather than sniffing content: this runs while rendering a
    changelist that may hold a hundred rows, and fetching each file to identify
    it would turn one page load into a hundred storage round trips.
    """
    # Strip any query string first — a signed S3 URL carries its credentials
    # there, and "?X-Amz-Signature=..." is not a file extension.
    path = url.split("?", 1)[0]
    return PurePosixPath(path).suffix.lower() in IMAGE_SUFFIXES


def thumbnail_html(fieldfile, *, max_side: int = 60, require_image_suffix: bool = False):
    """An <img> for `fieldfile`, linked to the full file, or None.

    `max_side` bounds both dimensions, so the aspect ratio survives whatever it
    is: store banners are wide, avatars are square, and a fixed width would
    stretch one of them.

    Set `require_image_suffix` for a FileField, whose contents are unconstrained.
    An ImageField has already been validated as an image by Django, so it can
    render unconditionally — including for the suffix-less names some storage
    backends produce.
    """
    url = file_url(fieldfile)
    if not url:
        return None
    if require_image_suffix and not looks_like_image(url):
        return None

    return format_html(
        # target=_blank so a click opens the full-size file without losing an
        # unsaved change form. rel=noreferrer because the media host may be a
        # bucket domain that has no business receiving admin URLs as referrers.
        '<a href="{}" target="_blank" rel="noreferrer noopener">'
        '<img src="{}" alt="" loading="lazy" '
        'style="max-width:{}px;max-height:{}px;width:auto;height:auto;'
        # The checkerboard shows through a transparent PNG, which is how you can
        # tell a logo with an alpha channel from one with a baked-in white box.
        "border-radius:4px;object-fit:contain;"
        'background:#fff url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiI+PHJlY3Qgd2lkdGg9IjgiIGhlaWdodD0iOCIgZmlsbD0iI2VlZSIvPjxyZWN0IHg9IjgiIHk9IjgiIHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiNlZWUiLz48L3N2Zz4=);'
        'box-shadow:0 0 0 1px rgba(0,0,0,.12);vertical-align:middle;"></a>',
        url,
        url,
        max_side,
        max_side,
    )


def image_preview(field_name: str, *, label: str | None = None, max_side: int = 60):
    """A display method rendering `field_name` as a thumbnail.

    Assign the result as a class attribute and name it in `list_display` or
    `readonly_fields`:

        logo_preview = image_preview("logo", label="Logo")

    The returned function takes `(self, obj)` because it becomes a bound method
    of the ModelAdmin. That is also why this is a factory rather than something
    taking the field name at call time — Django looks these up by attribute name
    and calls them with the object only.

    In `readonly_fields` this shows the image without the upload control, which
    is the right shape for a field a reviewer should look at but not replace.
    """

    @admin.display(description=label or field_name.replace("_", " "))
    def display(self, obj):
        thumb = thumbnail_html(
            getattr(obj, field_name, None),
            max_side=max_side,
            # A readonly FileField preview should degrade to nothing rather than
            # to a broken image, same as the widget.
            require_image_suffix=not isinstance(
                obj._meta.get_field(field_name), models.ImageField
            ),
        )
        return thumb or EMPTY

    return display


class ImagePreviewWidget(AdminFileWidget):
    """AdminFileWidget that shows the image above the upload control.

    Subclassing rather than replacing keeps everything the admin's widget
    already does — the "Currently:" line, the Clear checkbox for a nullable
    field, the filename as a link — and adds the picture that was missing.
    """

    #: See `thumbnail_html`. False for ImageField, True for FileField.
    require_image_suffix = False

    #: Big enough to judge whether a photographed ID is legible, which is the
    #: question being asked on the MerchantIdentity form.
    max_side = 240

    def render(self, name, value, attrs=None, renderer=None):
        control = super().render(name, value, attrs, renderer)
        thumb = thumbnail_html(
            value,
            max_side=self.max_side,
            require_image_suffix=self.require_image_suffix,
        )
        if not thumb:
            return control
        return format_html(
            '<div style="margin-bottom:8px;">{}</div>{}', thumb, mark_safe(control)
        )


class FilePreviewWidget(ImagePreviewWidget):
    """Image preview for a FileField, which may hold something that is not one."""

    require_image_suffix = True


class ImagePreviewAdminMixin:
    """Renders every ImageField and FileField on the change form as an image.

    Mix in ahead of ModelAdmin:

        class StoreAdmin(ImagePreviewAdminMixin, admin.ModelAdmin):

    A subclass that sets its own `formfield_overrides` shadows this one — Django
    reads the attribute, so MRO gives it the nearest definition and does not
    merge them. Spread this dict into that one where both are needed.
    """

    formfield_overrides = {
        # ImageField before FileField is not load-bearing (Django matches on the
        # field's exact class, walking its MRO), but it reads in the order the
        # two entries differ.
        models.ImageField: {"widget": ImagePreviewWidget},
        models.FileField: {"widget": FilePreviewWidget},
    }
