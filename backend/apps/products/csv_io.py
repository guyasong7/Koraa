"""
Catalogue import and export as a spreadsheet.

The Import & Export Content settings panel drives this. Two operations that are
deliberately asymmetric:

**Export** is the whole catalogue, one row per product, in the same column order
that import accepts — so the file you download is a file you can edit and put
back. Variants are not flattened into it: a product with three sizes would
become three rows that re-import as three products, and a merchant discovering
that has a mess to undo by hand.

**Import** is a dry-run-then-commit. The first call reports what would happen
without touching anything; the second applies it. A CSV that turns out to have
prices in the name column should be discovered before it has created forty
products, not after. Matching is by ``slug`` where present and by name
otherwise, so re-importing an exported file updates rather than duplicates.

CSV injection is handled on the way out (see ``_safe``) because product names
are merchant-typed but product *descriptions* on an imported file may have come
from anywhere.
"""

from __future__ import annotations

import csv
import io
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils.text import slugify

from .models import Product

#: Column order for both directions. Import matches on the header name, not the
#: position, so a merchant who reorders or deletes columns in Excel still gets a
#: usable file — but this is the order they will see if they do nothing.
COLUMNS = [
    "slug",
    "name",
    "description",
    "short_description",
    "type",
    "category",
    "price",
    "compare_at_price",
    "status",
    "featured",
    "weight",
    "seo_title",
    "seo_description",
    "image_url",
]

#: Required on import. Everything else has a sensible default; a row without a
#: name and a price is not a product.
REQUIRED = ["name", "price"]

_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _safe(value) -> str:
    """Neutralise a value Excel would treat as a formula."""
    text = "" if value is None else str(value)
    if text.startswith(_FORMULA_PREFIXES):
        return "'" + text
    return text


class _Echo:
    """A file-like object that returns what it is asked to write."""

    def write(self, value):
        return value


def export_rows(store, request=None):
    """Yield the catalogue as CSV lines, header first.

    A generator so a large catalogue streams rather than assembling in memory.
    ``.iterator()`` is deliberately not used: it would drop the prefetches and
    turn the images lookup into one query per product.
    """
    writer = csv.writer(_Echo())
    yield writer.writerow(COLUMNS)

    products = (
        Product.objects.filter(store=store)
        .select_related("category")
        .prefetch_related("images")
        .order_by("name")
    )

    for product in products:
        primary = None
        for image in product.images.all():
            if image.is_primary:
                primary = image
                break
            primary = primary or image

        image_url = ""
        if primary and primary.image:
            image_url = primary.image.url
            if request is not None:
                image_url = request.build_absolute_uri(image_url)

        yield writer.writerow([
            _safe(product.slug),
            _safe(product.name),
            _safe(product.description),
            _safe(product.short_description),
            _safe(product.product_type),
            _safe(product.category.name if product.category else ""),
            _safe(product.base_price),
            _safe(product.compare_at_price if product.compare_at_price is not None else ""),
            _safe(product.status),
            "yes" if product.is_featured else "no",
            _safe(product.weight if product.weight is not None else ""),
            _safe(product.seo_title),
            _safe(product.seo_description),
            _safe(image_url),
        ])


TRUE_WORDS = {"yes", "y", "true", "1", "on", "active"}


def _decimal(value, field: str, row_number: int, errors: list):
    text = str(value or "").strip().replace(",", "")
    if not text:
        return None
    try:
        number = Decimal(text)
    except (InvalidOperation, ValueError):
        errors.append(f"Row {row_number}: “{value}” is not a number ({field}).")
        return None
    if number < 0:
        errors.append(f"Row {row_number}: {field} cannot be negative.")
        return None
    return number


def _resolve_type(value: str) -> str:
    text = (value or "").strip().lower()
    allowed = {choice for choice, _ in Product.ProductType.choices}
    return text if text in allowed else Product.ProductType.SIMPLE


def _resolve_status(value: str) -> str:
    text = (value or "").strip().lower()
    allowed = {choice for choice, _ in Product.Status.choices}
    return text if text in allowed else Product.Status.DRAFT


def parse(file_obj) -> dict:
    """Read an uploaded CSV into rows, collecting every problem it finds.

    Every row is checked before anything is reported, so a merchant sees all
    twelve bad rows at once rather than fixing one and re-uploading twelve times.
    """
    try:
        raw = file_obj.read()
    except Exception:
        return {"rows": [], "errors": ["That file could not be read."]}

    if isinstance(raw, bytes):
        # Excel on Windows writes a BOM; utf-8-sig eats it. Latin-1 is the
        # fallback because it cannot fail, and a mangled accent is a better
        # outcome than refusing the file.
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = raw.decode("latin-1", errors="replace")
    else:
        text = raw

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return {"rows": [], "errors": ["That file has no header row."]}

    headers = {(name or "").strip().lower(): name for name in reader.fieldnames}
    missing = [column for column in REQUIRED if column not in headers]
    if missing:
        return {
            "rows": [],
            "errors": [
                "The file is missing the "
                + " and ".join(f"“{column}”" for column in missing)
                + " column."
            ],
        }

    def cell(raw_row, column):
        source = headers.get(column)
        return (raw_row.get(source) or "").strip() if source else ""

    rows, errors = [], []
    for index, raw_row in enumerate(reader, start=2):  # row 1 is the header
        if not any((value or "").strip() for value in raw_row.values()):
            continue

        name = cell(raw_row, "name")
        if not name:
            errors.append(f"Row {index}: no name.")
            continue

        price = _decimal(cell(raw_row, "price"), "price", index, errors)
        if price is None:
            if not any(f"Row {index}:" in error for error in errors):
                errors.append(f"Row {index}: no price.")
            continue

        rows.append({
            "row": index,
            "slug": slugify(cell(raw_row, "slug")) or slugify(name),
            "name": name[:255],
            "description": cell(raw_row, "description"),
            "short_description": cell(raw_row, "short_description")[:500],
            "product_type": _resolve_type(cell(raw_row, "type")),
            "category": cell(raw_row, "category"),
            "base_price": price,
            "compare_at_price": _decimal(
                cell(raw_row, "compare_at_price"), "compare_at_price", index, errors
            ),
            "status": _resolve_status(cell(raw_row, "status")),
            "is_featured": cell(raw_row, "featured").lower() in TRUE_WORDS,
            "weight": _decimal(cell(raw_row, "weight"), "weight", index, errors),
            "seo_title": cell(raw_row, "seo_title")[:70],
            "seo_description": cell(raw_row, "seo_description")[:160],
        })

    if len(rows) > 1000:
        errors.append(
            f"That file has {len(rows)} products. Import 1000 at a time so a "
            "mistake stays small enough to undo."
        )
        rows = []

    return {"rows": rows, "errors": errors}


def plan(store, rows: list) -> dict:
    """What ``rows`` would do to ``store``, without doing it."""
    existing_slugs = set(Product.objects.filter(store=store).values_list("slug", flat=True))
    lowered_names = {
        name.lower(): slug
        for name, slug in Product.objects.filter(store=store).values_list("name", "slug")
    }

    creates, updates, seen = [], [], set()
    for row in rows:
        slug = row["slug"]
        match = slug if slug in existing_slugs else lowered_names.get(row["name"].lower())
        # A slug already claimed earlier in this same file is a duplicate row,
        # not a second product — the last one would silently win otherwise.
        if match and match not in seen:
            updates.append(row["name"])
            seen.add(match)
        else:
            creates.append(row["name"])
            seen.add(slug)

    return {
        "create": len(creates),
        "update": len(updates),
        "create_sample": creates[:8],
        "update_sample": updates[:8],
    }


@transaction.atomic
def apply(store, rows: list) -> dict:
    """Create or update products from parsed rows.

    Atomic: a file that fails halfway leaves the catalogue as it was, rather
        than half-imported with no record of where it stopped.
    """
    from apps.categories.models import Category

    by_slug = {p.slug: p for p in Product.objects.filter(store=store)}
    by_name = {p.name.lower(): p for p in by_slug.values()}

    # Keyed by both name and slug: a category named "Dresses " already in the
    # shop slugifies to "dresses", so matching on name alone would try to create
    # a second one and hit the (store, slug) uniqueness constraint.
    categories: dict = {}
    for category in Category.objects.filter(store=store):
        categories[category.name.strip().lower()] = category
        categories[category.slug] = category

    created = updated = 0

    for row in rows:
        category = None
        if row["category"]:
            name = row["category"].strip()
            category = categories.get(name.lower()) or categories.get(slugify(name))
            if category is None:
                # Slug left to Category.save, which derives it from the name.
                category = Category.objects.create(store=store, name=name[:255])
                categories[name.lower()] = category
                categories[category.slug] = category

        fields = {
            "name": row["name"],
            "description": row["description"],
            "short_description": row["short_description"],
            "product_type": row["product_type"],
            "base_price": row["base_price"],
            "compare_at_price": row["compare_at_price"],
            "status": row["status"],
            "is_featured": row["is_featured"],
            "seo_title": row["seo_title"],
            "seo_description": row["seo_description"],
        }
        if row["weight"] is not None:
            fields["weight"] = row["weight"]
        if category is not None:
            fields["category"] = category

        product = by_slug.get(row["slug"]) or by_name.get(row["name"].lower())
        if product is not None:
            for key, value in fields.items():
                setattr(product, key, value)
            product.save()
            updated += 1
        else:
            # The slug is free — anything already using it was matched above and
            # updated instead. Registering the new product immediately means a
            # second row with the same slug updates it rather than colliding.
            product = Product.objects.create(store=store, slug=row["slug"], **fields)
            by_slug[product.slug] = product
            by_name[product.name.lower()] = product
            created += 1

    return {"created": created, "updated": updated}


def template_rows():
    """A one-row example file, so a merchant starting from nothing has a shape."""
    writer = csv.writer(_Echo())
    yield writer.writerow(COLUMNS)
    yield writer.writerow([
        "wax-print-dress",
        "Wax Print Dress",
        "Hand-finished cotton wax print, cut to order.",
        "Cotton wax print, made to order",
        "simple",
        "Dresses",
        "25000",
        "30000",
        "active",
        "yes",
        "0.4",
        "Wax Print Dress — Bella Fashion Douala",
        "Hand-finished cotton wax print dresses, made to order in Douala.",
        "",
    ])
