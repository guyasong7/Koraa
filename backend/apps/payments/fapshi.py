"""The only place Koraa talks to Fapshi.

Fapshi is the Cameroonian payment gateway behind both money paths in this
product: buyers paying merchants on a storefront, and merchants paying Koraa for
a subscription. Both used to build their own requests — ``payments/views.py``
held three module-level helpers and ``orders/views.py`` imported them across the
app boundary — which is how the two flows came to disagree about what a failure
means.

Everything about the wire format lives here: the base URL, the credentials, the
paths, the field names, the status strings. Nothing outside this module should
mention ``requests``, and nothing outside it should see a Fapshi status string
(see ``TERMINAL_STATUSES`` and the note on the frontend below).

Three things in here are load-bearing and were mistakes in the code this
replaces:

1. **An outage is not a failure.** ``payment_status`` raises
   ``FapshiUnavailable`` rather than answering ``"FAILED"``. The old
   ``_check_fapshi_status`` returned ``"FAILED"`` on any non-200, and its callers
   dutifully marked orders failed and cancelled subscriptions for payments that
   had very likely succeeded. Callers must treat ``FapshiUnavailable`` as "we do
   not know" and leave stored state untouched.

2. **Credentials are read per call, not at import.** The old code built a
   module-scope ``FAPSHI_HEADERS`` dict from ``settings`` at import time, so
   ``@override_settings`` could not reach it and none of this was testable.

3. **One HTTP chokepoint.** Every call goes through ``_request``, so a test
   patches exactly one seam. ``requirements-dev.txt`` has neither ``responses``
   nor ``requests-mock`` and this module deliberately does not add one.

Nothing here retries. ``FapshiUnavailable`` says "retryable", but the retry
belongs to a caller that knows whether the operation is safe to repeat: re-asking
for a status is free, re-sending a charge takes the buyer's money twice. The
reconcile command owns that decision.

**Fapshi delivers each webhook once and never retries it.** That is the single
fact that shapes the settlement design: a webhook lost to a deploy, a restart or
a dropped connection is gone for good, and the payment behind it would sit
pending forever. So the webhook is an optimisation — it makes settlement fast —
and ``reconcile_orders`` on a schedule is what makes settlement *certain*. Do not
treat the webhook as the primary path, and do not skip the scheduled reconcile.

The wire contract in this module is verified against Fapshi's own API reference
(``https://docs.fapshi.com/llms.txt`` indexes the machine-readable pages; the
marketing site does not serve them). Two behaviours it documents are easy to get
wrong and are commented where they bite: ``payment-status`` is capped at six calls
per minute per transaction id, and a direct-pay transaction never expires.
"""

import hmac
import logging
import re
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP, InvalidOperation

import phonenumbers
import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)

#: What Fapshi accepts in ``externalId`` / ``userId``. See ``external_ref``.
_EXTERNAL_REF_RE = re.compile(r"^[a-zA-Z0-9\-_]{1,100}$")

# ── Errors ───────────────────────────────────────────────────────────────────


class FapshiError(Exception):
    """Base class. Catch this only where the distinction genuinely does not
    matter, which is rarer than it looks — see the two subclasses."""


class FapshiRejected(FapshiError):
    """Fapshi understood us and said no (4xx other than 429).

    Our request was wrong, or the payment cannot proceed: a malformed number, an
    amount below the floor, bad credentials. Retrying sends the same bad request
    again, so do not. Surface it to the user or to a log a human reads.

    One case deserves naming because it looks like a credential problem and is
    not: a **403** is returned either for invalid credentials *or* for a request
    from an IP that is not on the service's whitelist, and the two are
    indistinguishable except by the ``message`` in the body. Whitelisting is
    optional, gates only ``initiate-pay`` / ``direct-pay`` / ``payout``, and is
    configured in the Fapshi dashboard — so a deploy that moves to a new IP
    starts failing every charge while status checks keep working perfectly.
    """


class FapshiUnavailable(FapshiError):
    """We could not get an answer (timeout, connection error, 5xx, unparseable body).

    **The outcome is unknown, not failed.** For a status check that means "ask
    again later". For a charge it means the buyer's money may or may not have
    moved, so the order must stay pending and be reconciled — never marked
    failed, and never charged again on the strength of this.
    """


class FapshiRateLimited(FapshiUnavailable):
    """Fapshi returned 429. Retryable, and expected under normal load.

    Fapshi permits six ``payment-status`` calls per minute *per transaction id*,
    so this is not an error condition so much as a pacing signal. It subclasses
    ``FapshiUnavailable`` deliberately: any caller that already leaves state
    alone when the answer is unknown does the right thing here without knowing
    this class exists.

    Callers that poll on a user's behalf should serve their stored state rather
    than surfacing this — see the note on the status cache in ``payment_status``.
    """


# ── Status vocabulary ────────────────────────────────────────────────────────

#: The five statuses ``GET /payment-status/{transId}`` can return, per the API
#: reference. ``CREATED`` means the payment has not been attempted; ``PENDING``
#: means the payer is partway through approving it on their handset.
STATUS_SUCCESSFUL = "SUCCESSFUL"
STATUS_FAILED = "FAILED"
STATUS_EXPIRED = "EXPIRED"
STATUS_PENDING = "PENDING"
STATUS_CREATED = "CREATED"

ALL_STATUSES = frozenset(
    {STATUS_CREATED, STATUS_PENDING, STATUS_SUCCESSFUL, STATUS_FAILED, STATUS_EXPIRED}
)

#: Statuses Fapshi will not revise, so the answer can be stored and polling can
#: stop.
#:
#: ``FAILED`` is in here, and that is a judgement rather than a quote. The docs
#: say only that "no payments can be made after the status is SUCCESSFUL or
#: EXPIRED", pointedly leaving FAILED out — because a hosted *link* survives a
#: failed attempt and the payer can try again until the 24-hour window closes. A
#: direct-pay charge has no link to retry, and its own page states the final
#: state is "either SUCCESSFUL or FAILED". So FAILED is terminal for the charges
#: Koraa now makes, and would not be for a link.
#:
#: If ``initiate-pay`` is ever restored to a buyer-facing path, this set is the
#: thing to split in two. ``EXPIRED`` is likewise a link-only outcome: a
#: direct-pay transaction never expires, which is why the frontend needs its own
#: timeout instead of waiting for one — see the note in ``direct_pay``.
TERMINAL_STATUSES = frozenset({STATUS_SUCCESSFUL, STATUS_FAILED, STATUS_EXPIRED})

#: Terminal statuses meaning the buyer's money did not move. Both map onto
#: Koraa's single ``PaymentStatus.FAILED`` — the buyer-visible outcome is
#: identical, and collapsing them here keeps every existing consumer of
#: ``PaymentStatus`` working. The raw Fapshi string is stored alongside it for
#: diagnosis.
UNSUCCESSFUL_STATUSES = frozenset({STATUS_FAILED, STATUS_EXPIRED})

#: None of these strings may reach the browser. The frontend polls a Koraa
#: endpoint that reports Koraa's own ``payment_status``, so Fapshi's vocabulary
#: stays inside this module.

#: Fapshi allows six ``payment-status`` calls per minute **per transaction id**,
#: and answers a seventh with 429. Every polling caller must pace itself against
#: this: the browser may poll Koraa as often as it likes, but Koraa may only ask
#: Fapshi about a given transaction this often. Ten seconds between calls leaves
#: headroom for a webhook and a reconcile pass to ask about the same transaction
#: in the same minute without tipping it over.
STATUS_CALLS_PER_MINUTE = 6
STATUS_MIN_INTERVAL_SECONDS = 10

#: Sandbox numbers with deterministic outcomes, from the environment reference.
#: Any other number in sandbox resolves **randomly**, which makes for a test
#: suite that fails once a week for no reason.
#:
#: These are also the only honest way to exercise the failure path: there is no
#: way to make a real number decline on demand. Note that the prefixes here
#: double as a check on ``infer_medium`` — 650 and 67x are MTN, 656 and 69x are
#: Orange, exactly as it classifies them.
SANDBOX_NUMBERS = {
    "mtn_success": ("670000000", "670000002", "650000000"),
    "mtn_failure": ("670000001", "670000003", "650000001"),
    "orange_success": ("690000000", "690000002", "656000000"),
    "orange_failure": ("690000001", "690000003", "656000001"),
}

# ── Configuration ────────────────────────────────────────────────────────────

#: Connect and read timeouts. The read is the one that matters: a mobile-money
#: charge waits on an operator, not on Fapshi.
_TIMEOUT = (5, 15)


def _base() -> str:
    """The Fapshi origin, or a loud failure.

    ``FAPSHI_BASE_URL`` used to default to ``https://live.fapshi.com``, which
    meant a deployment that had configured nothing at all charged real money
    instead of failing. There is no default now, and this raises on first use —
    at the point of a payment, naming the variable, rather than at import where
    it would take down the whole process including paths that never pay anyone.
    """
    base = (getattr(settings, "FAPSHI_BASE_URL", "") or "").strip().rstrip("/")
    if not base:
        raise ImproperlyConfigured(
            "FAPSHI_BASE_URL is not set. Use https://sandbox.fapshi.com for "
            "testing or https://live.fapshi.com to move real money. There is "
            "deliberately no default: the previous default was the live "
            "endpoint, so a misconfigured deploy took real payments."
        )
    return base


def _headers() -> dict:
    """Auth headers, read from settings on every call.

    Fapshi authenticates with two custom headers rather than a bearer token.
    Built per call so ``@override_settings`` works — see this module's docstring.
    """
    api_user = (getattr(settings, "FAPSHI_API_USER", "") or "").strip()
    api_key = (getattr(settings, "FAPSHI_API_KEY", "") or "").strip()
    if not api_user or not api_key:
        raise ImproperlyConfigured(
            "FAPSHI_API_USER and FAPSHI_API_KEY must both be set to take payments."
        )
    return {"apiuser": api_user, "apikey": api_key}


def min_amount() -> int:
    """The smallest charge Fapshi accepts, in XAF."""
    return int(getattr(settings, "FAPSHI_MIN_AMOUNT", 100))


# ── The single HTTP chokepoint ───────────────────────────────────────────────


def _request(method: str, path: str, *, json: dict | None = None) -> dict:
    """Make one Fapshi call and return its decoded body.

    The only function in the codebase that performs a Fapshi request. Tests patch
    this; nothing else needs patching.

    Raises:
        FapshiRejected: 4xx — our request was wrong. Do not retry.
        FapshiUnavailable: network error, timeout, 5xx, or a body that is not
            JSON. Outcome unknown; retry only where repeating is safe.
    """
    url = f"{_base()}/{path.lstrip('/')}"
    try:
        # `json=None` sends no body, which matters for GET: Fapshi rejects a GET
        # that carries one outright. Never pass `json={}` here.
        resp = requests.request(
            method, url, json=json, headers=_headers(), timeout=_TIMEOUT
        )
    except requests.RequestException as exc:
        # Covers connect errors, read timeouts and TLS failures. A read timeout
        # on a charge is the dangerous one: the operator may still be processing
        # it, so this must not be reported as a failed payment.
        raise FapshiUnavailable(f"Fapshi {method} {path} did not complete: {exc}") from exc

    if resp.status_code >= 500:
        raise FapshiUnavailable(
            f"Fapshi {method} {path} returned {resp.status_code}: {_message(resp)}"
        )

    # 429 is retryable and must not be mistaken for a bad request. Fapshi allows
    # six status checks per minute per transaction id, so a busy order or a tight
    # reconcile loop reaches this in normal operation — and treating it as a
    # rejection would mean giving up on a payment because we asked too eagerly.
    if resp.status_code == 429:
        raise FapshiRateLimited(
            f"Fapshi {method} {path} rate limited: {_message(resp)}"
        )

    if resp.status_code >= 400:
        raise FapshiRejected(
            f"Fapshi {method} {path} returned {resp.status_code}: {_message(resp)}"
        )

    try:
        body = resp.json()
    except ValueError as exc:
        # A 200 that is not JSON means something between us and Fapshi answered
        # instead of Fapshi — a proxy error page, a captive portal, a WAF block.
        # Unknown, not failed.
        raise FapshiUnavailable(
            f"Fapshi {method} {path} returned {resp.status_code} with a "
            f"non-JSON body: {_excerpt(resp.text)}"
        ) from exc

    if not isinstance(body, dict):
        raise FapshiUnavailable(
            f"Fapshi {method} {path} returned {type(body).__name__}, expected an object"
        )
    return body


def _excerpt(text: str, limit: int = 300) -> str:
    """A response body trimmed for a log line.

    Fapshi error bodies are short, but a proxy's HTML page is not, and an
    untrimmed one buries the rest of the log.
    """
    text = " ".join((text or "").split())
    return text if len(text) <= limit else f"{text[:limit]}…"


def _message(resp) -> str:
    """The human-readable reason out of a Fapshi error response.

    Every Fapshi failure carries a ``message`` field and the docs are emphatic
    that it is the thing worth reading — a 403 means *either* bad credentials
    *or* a request from an IP that is not on the service's whitelist, and only
    the message distinguishes them. Guessing between those two costs an
    afternoon.

    Falls back to the raw body, because a non-Fapshi intermediary (proxy, WAF)
    can produce the status code without producing the schema.
    """
    try:
        body = resp.json()
    except ValueError:
        return _excerpt(resp.text)
    if isinstance(body, dict) and body.get("message"):
        return _excerpt(str(body["message"]))
    return _excerpt(resp.text)


def _mask(msisdn: str) -> str:
    """A phone number safe to log: last three digits only.

    Numbers are personal data and appear in payment logs constantly. Three digits
    is enough to match a support enquiry against a log line, and not enough to
    dial or to identify anyone on its own.
    """
    return f"…{msisdn[-3:]}" if len(msisdn) >= 3 else "…"


# ── Value normalisation ──────────────────────────────────────────────────────


def normalise_msisdn(raw: str) -> str:
    """A Cameroonian mobile number as nine local digits, e.g. ``"670000000"``.

    Accepts what people actually type — ``+237 6 70 00 00 00``, ``00237670000000``,
    ``670 000 000`` — and returns the national significant number without the
    country code. Uses ``phonenumbers`` rather than a regex because the
    country-code and trunk-prefix handling is exactly where hand-rolled parsing
    gets it wrong.

    Raises:
        FapshiRejected: not a valid Cameroonian mobile number. Raised as a Fapshi
            rejection because that is what it would be one call later, and it
            keeps callers to a single except clause.
    """
    text = (raw or "").strip()
    if not text:
        raise FapshiRejected("A mobile money number is required.")

    try:
        # Region "CM" so a bare local number parses; an explicit +237 still wins.
        parsed = phonenumbers.parse(text, "CM")
    except phonenumbers.NumberParseException as exc:
        raise FapshiRejected(f"{raw!r} is not a usable phone number.") from exc

    if parsed.country_code != 237:
        raise FapshiRejected(
            "Mobile money payments only work with Cameroonian numbers (+237)."
        )
    if not phonenumbers.is_valid_number(parsed):
        raise FapshiRejected(f"{raw!r} is not a valid Cameroonian number.")

    national = str(parsed.national_number)
    # Every Cameroonian mobile number is nine digits beginning with 6. Landlines
    # (2xx) parse as valid but cannot hold a mobile money wallet, so they are
    # refused here rather than by Fapshi.
    if len(national) != 9 or not national.startswith("6"):
        raise FapshiRejected(
            "That is not a mobile number. Mobile money needs an MTN or Orange "
            "line, which is nine digits starting with 6."
        )
    return national


#: What ``infer_medium`` answers, and the strings Fapshi's ``medium`` field takes.
MEDIUM_MTN = "mobile money"
MEDIUM_ORANGE = "orange money"


def infer_medium(msisdn: str) -> str | None:
    """Which wallet a number probably belongs to, or ``None`` if unclear.

    **A hint for the UI, not a routing decision.** It pre-selects the right radio
    on the checkout form so the buyer usually does not have to think about it.

    It is deliberately not used to fill in ``medium`` on the charge itself: the
    operators reallocate prefix ranges, this table will go stale, and Fapshi
    knows the current allocation better than a constant in our codebase does. So
    ``direct_pay`` omits ``medium`` unless a human explicitly chose one, and
    Fapshi resolves the number itself. Being wrong here costs a pre-ticked radio
    button; being wrong on the charge would send money to the wrong operator.

    Expects the nine-digit form from ``normalise_msisdn``.
    """
    if len(msisdn) != 9:
        return None
    prefix, third = msisdn[:2], msisdn[2]
    if prefix == "67":
        return MEDIUM_MTN
    if prefix == "69":
        return MEDIUM_ORANGE
    if prefix in ("65", "68"):
        # 650-654 and 680-684 are MTN; 655-659 and 685-689 are Orange.
        return MEDIUM_MTN if third in "01234" else MEDIUM_ORANGE
    # 62x is Camtel, which Fapshi does not carry for mobile money.
    return None


def to_xaf(amount, *, rounding=ROUND_HALF_UP) -> int:
    """An amount as whole francs, checked against Fapshi's floor.

    XAF has no minor unit — there are no centimes — but Koraa stores money as
    ``Decimal(max_digits=10, decimal_places=2)``, so values arrive with two
    decimal places that should always be zero. A fractional franc is a data
    problem upstream; it is rounded rather than refused, because refusing would
    block a payment over half a franc.

    ``rounding`` exists for the payout direction: a charge rounds to nearest, a
    payout floors, so Koraa never pays out a franc more than it collected.

    Raises:
        FapshiRejected: not a number, not positive, or below ``FAPSHI_MIN_AMOUNT``.
    """
    try:
        value = Decimal(str(amount)).quantize(Decimal("1"), rounding=rounding)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise FapshiRejected(f"{amount!r} is not a usable amount.") from exc

    cents = int(value)
    if cents <= 0:
        raise FapshiRejected(f"Amount must be positive, got {amount!r}.")

    floor = min_amount()
    if cents < floor:
        raise FapshiRejected(
            f"Fapshi will not process {cents} XAF; the minimum is {floor} XAF."
        )
    return cents


# ── Operations ───────────────────────────────────────────────────────────────


def external_ref(value) -> str:
    """A Koraa id in the form Fapshi's ``externalId`` accepts.

    Fapshi constrains it to ``^[a-zA-Z0-9\\-_]{1,100}$``. Koraa's ``Order.id`` is
    a UUID whose string form is hex and hyphens, and ``PaymentTransaction.id`` is
    an integer, so both pass untouched — but this is the field that ties a
    payment back to a row, and a silent 400 from a stray character would leave a
    charge we cannot match to anything. So it is checked rather than assumed.

    Raises:
        FapshiRejected: empty, too long, or containing anything outside the set.
    """
    text = str(value or "").strip()
    if not text:
        raise FapshiRejected("A reference is required to reconcile the payment.")
    if len(text) > 100:
        raise FapshiRejected(
            f"Reference {text!r} is {len(text)} characters; Fapshi allows 100."
        )
    if not _EXTERNAL_REF_RE.match(text):
        raise FapshiRejected(
            f"Reference {text!r} has characters Fapshi rejects; only letters, "
            "digits, hyphen and underscore are allowed."
        )
    return text


def direct_pay(
    *,
    amount,
    phone: str,
    external_id: str,
    name: str = "",
    email: str = "",
    message: str = "",
    medium: str | None = None,
) -> str:
    """Charge a mobile money number in place. Returns Fapshi's ``transId``.

    ``POST /direct-pay``. This is the whole point of direct-pay: no hosted page
    and no redirect. The payer gets a prompt on their handset, approves it there,
    and the browser it started from stays where it is and polls.

    Returns as soon as Fapshi has *accepted* the request, which is well before
    the payer has approved anything. The returned ``transId`` reads ``PENDING``
    at this point and settlement is driven entirely by ``payment_status``.

    **A direct-pay transaction never expires.** Unlike a hosted link, there is no
    24-hour lapse into ``EXPIRED`` — the documented final state is SUCCESSFUL or
    FAILED, and until the payer acts it stays PENDING indefinitely. So nothing
    external will ever end the wait for us: the caller needs its own timeout, and
    a transaction still PENDING at that point is *unresolved*, not failed.

    ``external_id`` is the Koraa ``Order`` or ``PaymentTransaction`` id, and is
    what ties a webhook back to a row. Fapshi documents it as a reconciliation
    reference and **not** a deduplication key, so sending the same one twice
    charges twice — idempotency is Koraa's job, enforced by ``settled_at`` under
    a row lock.

    ``medium`` is passed only when a human picked it. Fapshi's own instruction
    for the field is "omit to auto-detect", and its detection is better than a
    prefix table of ours — see ``infer_medium``.

    Raises:
        FapshiRejected: the request was refused. Nothing was charged. Note that a
            403 here may mean the server's IP is not whitelisted, or that
            direct-pay is not enabled on the live account — it ships disabled and
            has to be turned on with Fapshi.
        FapshiUnavailable: no answer. **The charge may or may not exist** — do
            not resend it. Record the attempt and reconcile.
    """
    msisdn = normalise_msisdn(phone)
    payload = {
        "amount": to_xaf(amount),
        "phone": msisdn,
        "externalId": external_ref(external_id),
    }
    # Fapshi rejects empty strings on some optional fields, so each is included
    # only when it has a value.
    if name:
        payload["name"] = name[:100]
    if email:
        payload["email"] = email
    if message:
        payload["message"] = message[:200]
    if medium:
        if medium not in (MEDIUM_MTN, MEDIUM_ORANGE):
            raise FapshiRejected(
                f"{medium!r} is not a payment medium Fapshi accepts; expected "
                f"{MEDIUM_MTN!r} or {MEDIUM_ORANGE!r}."
            )
        payload["medium"] = medium

    logger.info(
        "Fapshi direct-pay: %s XAF to %s (ref %s)",
        payload["amount"], _mask(msisdn), payload["externalId"],
    )
    body = _request("POST", "/direct-pay", json=payload)

    trans_id = body.get("transId")
    if not trans_id:
        # A 200 with no transId leaves us unable to follow the payment at all,
        # which is worse than a refusal: the money may move and we could never
        # match it. Unknown, so the caller keeps the order pending.
        raise FapshiUnavailable(
            f"Fapshi accepted the charge but returned no transId: {body!r}"
        )
    return str(trans_id)


def payment_details(trans_id: str) -> dict:
    """Everything Fapshi knows about a transaction. Never guesses.

    ``GET /payment-status/{transId}``. The one function whose contract matters
    more than its implementation: it raises on an outage instead of answering
    ``"FAILED"``. Its predecessor returned ``"FAILED"`` for any non-200, and every
    settle path in the codebase took that at face value — marking paid orders
    failed and cancelling live subscriptions because Fapshi had a bad minute.

    The ``status`` key is normalised to upper case and guaranteed present; the
    rest of the body is passed through as Fapshi sent it. Settlement wants three
    of those fields and ``payment_status`` would throw them away:

    * ``revenue`` — the amount **after Fapshi's own fee**, i.e. what Koraa
      actually receives. Not the same as ``amount``, and the difference matters:
      a merchant payout computed from the gross can exceed what came in.
    * ``financialTransId`` — the operator's reference, which is what a buyer or
      merchant disputing a payment will quote to their MTN or Orange agent.
    * ``dateConfirmed`` — when the money actually moved, as against when Koraa
      noticed. Worth storing, because a reconcile pass can settle an order hours
      after the fact and ``settled_at`` records only the latter.

    Safe to call repeatedly, but **not freely**: Fapshi allows six calls per
    minute per transaction id and answers the seventh with 429 (see
    ``STATUS_CALLS_PER_MINUTE``). Callers polling on a user's behalf must pace
    themselves and serve stored state in between.

    Raises:
        FapshiUnavailable: no answer, or an answer with no status in it. The
            caller must leave stored state exactly as it found it.
        FapshiRateLimited: asked too often. Also unknown — same handling.
        FapshiRejected: unknown transaction id, or bad credentials.
    """
    if not trans_id:
        raise FapshiRejected("A transaction id is required to check a payment.")

    body = _request("GET", f"/payment-status/{trans_id}")
    status = body.get("status")
    if not status:
        raise FapshiUnavailable(
            f"Fapshi returned no status for {trans_id}: {body!r}"
        )

    status = str(status).upper()
    if status not in ALL_STATUSES:
        # Not fatal. An unrecognised status is far more likely to be a new Fapshi
        # state than a corrupt response, and the caller's own branches treat
        # anything non-terminal as "keep waiting" — which is the right answer for
        # a status we have never seen. Logged loudly because it means this module
        # needs updating.
        logger.warning(
            "Fapshi returned an unrecognised status %r for %s; treating it as "
            "non-terminal. ALL_STATUSES in apps/payments/fapshi.py needs a look.",
            status, trans_id,
        )
    return {**body, "status": status}


def payment_status(trans_id: str) -> str:
    """Just the status string, for callers that need nothing else.

    Most branches only ask "did it work". See ``payment_details`` for the full
    body and for everything about pacing and failure modes — this is a one-line
    wrapper over it and shares every raise.
    """
    return payment_details(trans_id)["status"]


def payout(*, phone: str, amount, external_id: str) -> str:
    """Send money to a mobile money number. Returns Fapshi's ``transId``.

    This is how a merchant is paid for a storefront sale, net of commission.
    Amounts floor rather than round, so a fractional franc is never paid out.

    **Base the amount on ``revenue`` from ``payment_details``, not on the order
    total.** Fapshi deducts its own fee before Koraa sees the money, so the gross
    the buyer paid is not what arrived. Computing a payout from the gross means
    paying out more than was received whenever Fapshi's fee exceeds Koraa's
    commission.

    Raises:
        FapshiRejected: refused; nothing was sent.
        FapshiUnavailable: no answer. **The payout may have gone out.** The
            caller must record the attempt as unresolved rather than retrying
            blind — the old code logged the failure and moved on, which is why
            there was no way to tell a failed payout from a sent one.
    """
    msisdn = normalise_msisdn(phone)
    payload = {
        "amount": to_xaf(amount, rounding=ROUND_DOWN),
        "phone": msisdn,
        "externalId": external_ref(external_id),
    }
    logger.info(
        "Fapshi payout: %s XAF to %s (ref %s)",
        payload["amount"], _mask(msisdn), payload["externalId"],
    )
    body = _request("POST", "/payout", json=payload)
    trans_id = body.get("transId")
    if not trans_id:
        # Same reasoning as `direct_pay`: money may have moved and we would have
        # no reference for it. Unresolved, so the caller leaves `payout_status`
        # pending for a human rather than recording a success.
        raise FapshiUnavailable(
            f"Fapshi accepted the payout but returned no transId: {body!r}"
        )
    return str(trans_id)


def initiate_pay(
    *, amount, email: str, redirect_url: str, external_id: str, message: str = ""
) -> tuple[str, str]:
    """Fapshi's hosted checkout page. Returns ``(link, transId)``.

    Kept for the subscription flow only, and only until direct-pay replaces it
    there too. Storefront checkout no longer uses it: a redirect to a hosted page
    was the source of the ``/checkout/success`` 404 and of the "did my payment
    work" ambiguity that direct-pay plus polling removes.

    Unlike direct-pay, a link **does** expire — after 24 hours, into ``EXPIRED``
    — and a payer who fails once can try again on the same link until then. So a
    ``FAILED`` on a transaction from here is not final; see ``TERMINAL_STATUSES``.

    Raises:
        FapshiRejected / FapshiUnavailable: as ``direct_pay``.
    """
    payload = {
        "amount": to_xaf(amount),
        "email": email,
        "redirectUrl": redirect_url,
        "externalId": external_ref(external_id),
        "message": message,
    }
    body = _request("POST", "/initiate-pay", json=payload)
    link, trans_id = body.get("link"), body.get("transId")
    if not link or not trans_id:
        raise FapshiUnavailable(
            f"Fapshi initiate-pay returned an incomplete response: {body!r}"
        )
    return str(link), str(trans_id)


# ── Webhooks ─────────────────────────────────────────────────────────────────


def webhook_secret_ok(supplied: str | None) -> bool:
    """Whether a webhook carried the right ``x-wh-secret`` header.

    Despite the name, this is **not** a signature: Fapshi sends back the same
    static string on every event, so it proves the caller knows a shared secret
    and nothing about the payload. Compared with ``compare_digest`` anyway —
    a plain ``==`` on a secret leaks its prefix through timing, and the cost of
    doing it properly is one import.

    Returns ``True`` when no secret is configured, because this is belt to the
    braces of the outbound re-fetch. ``FapshiWebhookView`` never trusts a payload:
    it takes the transaction id and asks Fapshi directly what happened, so a
    forged webhook can at most cause a wasted status check. Failing closed on an
    unset variable would instead mean a deploy that forgot to copy one silently
    stops settling payments, which is the worse failure by a wide margin.

    Set it in the Fapshi dashboard under the webhook URL. It **cannot be read
    back** afterwards, so it has to be recorded when it is created.
    """
    configured = (getattr(settings, "FAPSHI_WEBHOOK_SECRET", "") or "").strip()
    if not configured:
        return True
    return hmac.compare_digest((supplied or "").strip(), configured)
