"""
Service enquiries — validating a merchant-designed form and delivering it.

The merchant builds the form (``ServiceForm.fields``), so the shape of a valid
submission is only known at request time. This module is the validator for that:
it walks the merchant's own field list, checks each answer against the type they
chose, and rejects everything they did not ask for.

Why the answers are checked at all, given the merchant made the form:

- **The endpoint is public.** Anything that accepts a JSON body from the
  internet and emails it onward is a spam relay unless it is bounded. Keys not
  in the form are dropped rather than passed through, so nobody can inject
  ``{"To": ...}``-shaped content or a wall of text into the merchant's inbox.
- **Lengths are capped.** A required "message" field with no ceiling is a
  megabyte of Viagra ads in a database row and an email nobody can open.
- **Choice fields are checked against their options.** Otherwise a select is
  decoration.

The merchant's email carries the answers with their labels and a reply-to of the
sender, so replying goes to the customer and not to Koraa's noreply address.
That reply-to is the whole point of the feature: "they can email them through
the form" means the merchant answers by hitting Reply.
"""

from __future__ import annotations

import logging
import re
from datetime import date

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import EmailMultiAlternatives
from django.core.validators import validate_email
from django.template.loader import render_to_string
from django.utils import timezone

from apps.orders import invoices
from .models import FormSubmission, ServiceForm

logger = logging.getLogger(__name__)

#: Per-answer ceilings. Generous enough that no honest enquiry is truncated and
#: small enough that a submission cannot be used as free storage.
MAX_LENGTHS = {
    "text": 300,
    "email": 254,
    "tel": 40,
    "number": 30,
    "date": 40,
    "select": 200,
    "radio": 200,
    "textarea": 5000,
}
MAX_CHOICES = 30

#: Any of these in a field key, and the answer is treated as the sender's name,
#: address or number for the columns lifted onto FormSubmission. Matched on the
#: key rather than the label so a merchant writing in French still gets a
#: clickable reply address.
NAME_HINTS = ("name", "nom", "fullname", "full_name")
PHONE_HINTS = ("phone", "tel", "mobile", "whatsapp", "numero")

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


class EnquiryError(Exception):
    """Invalid submission. ``errors`` maps field key → message.

    Field-keyed rather than one string so the storefront can show each message
    under the input it belongs to instead of a banner listing everything.
    """

    def __init__(self, errors: dict):
        self.errors = errors
        super().__init__("; ".join(f"{k}: {v}" for k, v in errors.items()))


def _clean_text(value) -> str:
    """A single answer, flattened to text and stripped of control characters.

    Control characters are removed because they land in an email header context
    in the subject line and in the merchant's terminal in a log line, and no
    enquiry needs them.
    """
    text = "" if value is None else str(value)
    text = _CONTROL_CHARS.sub("", text)
    return text.strip()


def _options(field: dict) -> list:
    """A choice field's options as plain strings.

    Accepts both the plain list the builder writes and the
    ``{"value": ..., "label": ...}`` form, so a form saved by a later builder
    version still validates.
    """
    raw = field.get("options") or []
    values = []
    for option in raw:
        if isinstance(option, dict):
            value = option.get("value", option.get("label", ""))
        else:
            value = option
        value = _clean_text(value)
        if value:
            values.append(value)
    return values


def validate(form: ServiceForm, data: dict) -> list:
    """Check ``data`` against ``form.fields``.

    Returns ``[{"key", "label", "value"}]`` in the order the form asks, ready to
    store on a FormSubmission. Raises EnquiryError with per-field messages.

    Unanswered optional fields are kept with an empty value rather than dropped:
    the merchant asked the question, and "they left it blank" is information.
    """
    if not isinstance(data, dict):
        raise EnquiryError({"__all__": "Expected a set of answers."})

    errors: dict = {}
    answers: list = []

    for field in form.fields or []:
        if not isinstance(field, dict):
            continue
        key = _clean_text(field.get("key"))
        if not key:
            continue

        label = _clean_text(field.get("label")) or key
        kind = field.get("type", "text")
        required = bool(field.get("required"))
        raw = data.get(key)

        # ── Tick boxes: several values ────────────────────────────────────────
        if kind == "checkboxes":
            chosen = raw if isinstance(raw, list) else ([raw] if raw else [])
            chosen = [_clean_text(c) for c in chosen[:MAX_CHOICES]]
            chosen = [c for c in chosen if c]
            allowed = _options(field)
            if allowed:
                unknown = [c for c in chosen if c not in allowed]
                if unknown:
                    errors[key] = "Choose from the options given."
                    continue
            if required and not chosen:
                errors[key] = f"{label} is required."
                continue
            answers.append({"key": key, "label": label, "value": ", ".join(chosen)})
            continue

        # ── Single tick box: a yes or a no ───────────────────────────────────
        if kind == "checkbox":
            ticked = raw in (True, "true", "True", "on", "yes", 1, "1")
            if required and not ticked:
                errors[key] = f"{label} is required."
                continue
            answers.append({"key": key, "label": label, "value": "Yes" if ticked else "No"})
            continue

        value = _clean_text(raw)

        if not value:
            if required:
                errors[key] = f"{label} is required."
                continue
            answers.append({"key": key, "label": label, "value": ""})
            continue

        limit = MAX_LENGTHS.get(kind, MAX_LENGTHS["text"])
        if len(value) > limit:
            errors[key] = f"Please keep {label.lower()} under {limit} characters."
            continue

        if kind == "email":
            try:
                validate_email(value)
            except DjangoValidationError:
                errors[key] = "That does not look like an email address."
                continue

        elif kind == "tel":
            # Deliberately loose. Cameroonian numbers are written half a dozen
            # ways and rejecting a real number to enforce a format loses the
            # lead; this only insists it is mostly digits.
            digits = sum(c.isdigit() for c in value)
            if digits < 6:
                errors[key] = "Please include a phone number we can call."
                continue

        elif kind == "number":
            try:
                float(value.replace(",", "").replace(" ", ""))
            except ValueError:
                errors[key] = "Please enter a number."
                continue

        elif kind == "date":
            try:
                date.fromisoformat(value[:10])
            except ValueError:
                errors[key] = "Please give the date as YYYY-MM-DD."
                continue

        elif kind in ("select", "radio"):
            allowed = _options(field)
            if allowed and value not in allowed:
                errors[key] = "Choose from the options given."
                continue

        answers.append({"key": key, "label": label, "value": value})

    if errors:
        raise EnquiryError(errors)

    if not any(a["value"] for a in answers):
        # A form of nothing but optional fields, all left blank. Storing and
        # emailing that is noise, and it is the cheapest possible spam.
        raise EnquiryError({"__all__": "Please fill in at least one field."})

    return answers


def contact_details(form: ServiceForm, answers: list) -> dict:
    """Pull the sender's name, email and phone out of their own answers.

    Typed fields win over guessed ones: an ``email`` field is an email address
    whatever it is called, and only when there is none does the key get read.
    """
    types = {}
    for field in form.fields or []:
        if isinstance(field, dict) and field.get("key"):
            types[_clean_text(field["key"])] = field.get("type", "text")

    email = next(
        (a["value"] for a in answers if types.get(a["key"]) == "email" and a["value"]),
        "",
    )
    phone = next(
        (a["value"] for a in answers if types.get(a["key"]) == "tel" and a["value"]),
        "",
    )
    if not phone:
        phone = next(
            (
                a["value"] for a in answers
                if any(h in a["key"].lower() for h in PHONE_HINTS) and a["value"]
            ),
            "",
        )
    name = next(
        (
            a["value"] for a in answers
            if any(h in a["key"].lower() for h in NAME_HINTS) and a["value"]
        ),
        "",
    )

    return {"name": name[:255], "email": email[:254], "phone": phone[:40]}


def record(form: ServiceForm, answers: list) -> FormSubmission:
    """Store the enquiry. Kept separate from sending so a mail failure still
    leaves the merchant a lead in the dashboard."""
    details = contact_details(form, answers)
    return FormSubmission.objects.create(
        store=form.store,
        form=form,
        answers=answers,
        sender_name=details["name"],
        sender_email=details["email"],
        sender_phone=details["phone"],
    )


def _context(submission: FormSubmission) -> dict:
    store = submission.store
    return {
        "submission": submission,
        "store": store,
        "answers": [a for a in submission.answers if a.get("value")],
        "store_logo": invoices.absolute_media(store.logo.url) if store.logo else "",
        "store_url": store.storefront_url,
        "dashboard_url": settings.KORAA_DASHBOARD_URL.rstrip("/"),
        "koraa_url": settings.KORAA_DASHBOARD_URL.rstrip("/"),
        "enquiries_url": (
            f"{settings.KORAA_DASHBOARD_URL.rstrip('/')}"
            f"/dashboard/stores/{store.id}/enquiries"
        ),
    }


def _plain(context: dict, for_sender: bool) -> str:
    store = context["store"]
    lines = "\n".join(
        f"  {a['label']}: {a['value']}" for a in context["answers"]
    )
    if for_sender:
        return (
            f"Thank you for contacting {store.name}.\n"
            f"{'-' * 48}\n"
            f"Here is a copy of what you sent:\n\n{lines}\n\n"
            f"{'-' * 48}\n"
            f"We will reply as soon as we can.\n\n"
            f"{store.name} — {context['store_url']}\n"
        )
    submission = context["submission"]
    reply = submission.sender_email or "no email given"
    return (
        f"New enquiry through {store.name}\n"
        f"{'-' * 48}\n"
        f"{lines}\n"
        f"{'-' * 48}\n"
        f"Reply to: {reply}\n"
        f"Received: {timezone.localtime(submission.created_at).strftime('%d %B %Y, %H:%M')}\n\n"
        f"All your enquiries: {context['enquiries_url']}\n"
    )


def notify(submission: FormSubmission) -> bool:
    """Email the merchant the enquiry, and the sender their copy.

    Returns whether the merchant's copy went out — the sender's copy is a
    courtesy, and failing to send it must not report the lead as undelivered.

    Never raises: this runs inside a public request, and an SMTP outage should
    leave the visitor with a thank-you and the merchant with a stored lead
    rather than a 500 that invites them to submit again.
    """
    form = submission.form
    context = _context(submission)
    store = submission.store

    recipients = form.recipients() if form else []
    if not recipients:
        logger.error(
            "Enquiry %s for store %s has nowhere to go — no notify address, no "
            "store email, no merchant email",
            submission.id, store.id,
        )
        return False

    who = submission.sender_name or submission.sender_email or "someone"
    sent = False
    try:
        message = EmailMultiAlternatives(
            subject=f"New enquiry from {who} — {store.name}",
            body=_plain(context, for_sender=False),
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=recipients,
            # Hitting Reply answers the customer. Without this the merchant
            # replies to Koraa's noreply address and the lead dies there.
            reply_to=[submission.sender_email] if submission.sender_email else None,
        )
        message.attach_alternative(
            render_to_string("emails/enquiry_received.html", context), "text/html"
        )
        message.send(fail_silently=False)
        sent = True
    except Exception:
        logger.exception("Failed to deliver enquiry %s to merchant", submission.id)

    if sent:
        submission.emailed_at = timezone.now()
        submission.save(update_fields=["emailed_at"])

    if form and form.send_copy_to_sender and submission.sender_email:
        try:
            copy = EmailMultiAlternatives(
                subject=f"We got your message — {store.name}",
                body=_plain(context, for_sender=True),
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[submission.sender_email],
                reply_to=recipients[:1],
            )
            copy.attach_alternative(
                render_to_string("emails/enquiry_copy.html", context), "text/html"
            )
            copy.send(fail_silently=False)
        except Exception:
            logger.exception("Failed to send enquiry copy for %s", submission.id)

    return sent
