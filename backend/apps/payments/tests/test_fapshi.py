"""The Fapshi client, exercised without touching the network.

Every test here patches one of two seams and nothing else: ``requests.request``
for the tests that are *about* HTTP classification, and ``fapshi._request`` for
everything above it. That is the whole reason ``_request`` exists as a single
chokepoint — ``requirements-dev.txt`` has neither ``responses`` nor
``requests-mock``, and this suite deliberately does not add one.

Two of these tests are regressions for bugs that cost real money and are worth
naming, because a future refactor that "simplifies" either one puts the bug back:

* ``TestOutageIsNotFailure`` — the old ``_check_fapshi_status`` returned
  ``"FAILED"`` for any non-200 response, and callers marked paid orders failed and
  cancelled live subscriptions on the strength of it.
* ``TestRateLimitIsRetryable`` — a 429 is expected in normal operation, because
  Fapshi caps status checks at six per minute per transaction. Classifying it with
  the other 4xx as "do not retry" means abandoning payments for asking too often.

Settings are pinned per test rather than inherited. The suite runs on top of
``config.settings.development``, which reads a developer's real ``.env`` — so
without ``override_settings`` these tests would exercise whichever Fapshi
environment that file happens to point at.
"""

import pytest
import requests
from django.core.exceptions import ImproperlyConfigured
from django.test import override_settings

from apps.payments import fapshi

# A base URL that is neither Fapshi environment, so a test that somehow escapes
# its mock fails to connect instead of reaching live and moving money.
FAKE_SETTINGS = {
    "FAPSHI_BASE_URL": "https://fapshi.invalid",
    "FAPSHI_API_USER": "test-user",
    "FAPSHI_API_KEY": "test-key",
    "FAPSHI_MIN_AMOUNT": 100,
}


@pytest.fixture
def fapshi_env():
    """The fake Fapshi configuration, for the duration of one test.

    A fixture rather than a class decorator: ``override_settings`` refuses to
    decorate anything that is not a ``SimpleTestCase`` subclass, and these are
    plain pytest classes. Applied with ``@pytest.mark.usefixtures``.

    A per-test ``@override_settings`` on top of this still works — Django's
    overrides stack, and the decorator is entered after the fixture.
    """
    with override_settings(**FAKE_SETTINGS):
        yield


#: Shorthand for the classes that need a configured Fapshi.
FAKE = pytest.mark.usefixtures("fapshi_env")


class FakeResponse:
    """The parts of ``requests.Response`` that ``_request`` actually reads."""

    def __init__(self, status_code=200, body=None, text=None):
        self.status_code = status_code
        self._body = body
        self.text = text if text is not None else str(body)

    def json(self):
        if self._body is None:
            raise ValueError("no JSON")
        return self._body


@pytest.fixture
def sent(monkeypatch):
    """Records the outbound call and replies with whatever the test queues.

    Yields a dict the test reads after the call: ``method``, ``url``, ``json``,
    ``headers``. Set ``reply`` to a ``FakeResponse`` or to an exception instance
    to have it raised.
    """
    captured = {"reply": FakeResponse(200, {"ok": True})}

    def fake_request(method, url, *, json=None, headers=None, timeout=None):
        captured.update(method=method, url=url, json=json, headers=headers, timeout=timeout)
        reply = captured["reply"]
        if isinstance(reply, BaseException):
            raise reply
        return reply

    monkeypatch.setattr(requests, "request", fake_request)
    return captured


# ── Configuration ────────────────────────────────────────────────────────────


class TestConfiguration:
    @override_settings(FAPSHI_BASE_URL="")
    def test_missing_base_url_raises_rather_than_defaulting_to_live(self):
        """The most dangerous default this codebase had.

        ``FAPSHI_BASE_URL`` used to default to ``https://live.fapshi.com``, so a
        deployment that configured nothing at all charged real buyers. Empty must
        fail, and it must fail naming the variable.
        """
        with pytest.raises(ImproperlyConfigured, match="FAPSHI_BASE_URL"):
            fapshi._base()

    @override_settings(FAPSHI_BASE_URL="https://sandbox.fapshi.com/")
    def test_trailing_slash_is_trimmed(self):
        # Otherwise every URL gets a double slash, which some gateways 404 on.
        assert fapshi._base() == "https://sandbox.fapshi.com"

    @override_settings(FAPSHI_API_USER="", FAPSHI_API_KEY="k")
    def test_missing_credentials_raise(self):
        with pytest.raises(ImproperlyConfigured, match="FAPSHI_API_USER"):
            fapshi._headers()

    def test_credentials_are_read_per_call_not_at_import(self):
        """Why ``_headers()`` is a function.

        The code this replaces built a module-level ``FAPSHI_HEADERS`` dict from
        settings at import time, which ``override_settings`` cannot reach — so
        none of it was testable. If this test ever fails, someone has hoisted the
        headers back to module scope.
        """
        with override_settings(FAPSHI_API_USER="first", FAPSHI_API_KEY="k"):
            assert fapshi._headers()["apiuser"] == "first"
        with override_settings(FAPSHI_API_USER="second", FAPSHI_API_KEY="k"):
            assert fapshi._headers()["apiuser"] == "second"


# ── HTTP classification ──────────────────────────────────────────────────────


@FAKE
class TestRequestClassification:
    def test_success_returns_the_decoded_body(self, sent):
        sent["reply"] = FakeResponse(200, {"transId": "abc"})
        assert fapshi._request("GET", "/x") == {"transId": "abc"}

    def test_headers_and_url_are_built_from_settings(self, sent):
        fapshi._request("GET", "/payment-status/abc")
        assert sent["url"] == "https://fapshi.invalid/payment-status/abc"
        assert sent["headers"] == {"apiuser": "test-user", "apikey": "test-key"}

    def test_get_sends_no_body(self, sent):
        """Fapshi rejects a GET carrying a JSON body, so it must be absent."""
        fapshi._request("GET", "/payment-status/abc")
        assert sent["json"] is None

    def test_server_error_is_unavailable(self, sent):
        sent["reply"] = FakeResponse(503, {"message": "upstream down"})
        with pytest.raises(fapshi.FapshiUnavailable, match="upstream down"):
            fapshi._request("GET", "/x")

    def test_network_error_is_unavailable(self, sent):
        sent["reply"] = requests.ConnectionError("no route to host")
        with pytest.raises(fapshi.FapshiUnavailable):
            fapshi._request("GET", "/x")

    def test_read_timeout_is_unavailable_not_failure(self, sent):
        """A timeout on a charge is the dangerous case: the operator may still be
        processing it, so the outcome is unknown and the money may well move."""
        sent["reply"] = requests.Timeout("read timed out")
        with pytest.raises(fapshi.FapshiUnavailable):
            fapshi._request("POST", "/direct-pay", json={"amount": 100})

    def test_client_error_is_rejected(self, sent):
        sent["reply"] = FakeResponse(400, {"message": "amount must be at least 100"})
        with pytest.raises(fapshi.FapshiRejected, match="at least 100"):
            fapshi._request("POST", "/direct-pay", json={})

    def test_forbidden_surfaces_the_message(self, sent):
        """A 403 is bad credentials *or* a non-whitelisted IP, and only the
        message tells them apart. Losing it costs an afternoon."""
        sent["reply"] = FakeResponse(403, {"message": "IP not whitelisted"})
        with pytest.raises(fapshi.FapshiRejected, match="IP not whitelisted"):
            fapshi._request("POST", "/payout", json={})

    def test_non_json_success_is_unavailable(self, sent):
        """A 200 of HTML means a proxy or WAF answered, not Fapshi."""
        sent["reply"] = FakeResponse(200, None, text="<html>Gateway Error</html>")
        with pytest.raises(fapshi.FapshiUnavailable, match="non-JSON"):
            fapshi._request("GET", "/x")

    def test_json_array_is_unavailable(self, sent):
        sent["reply"] = FakeResponse(200, ["not", "an", "object"])
        with pytest.raises(fapshi.FapshiUnavailable, match="expected an object"):
            fapshi._request("GET", "/x")

    def test_long_error_bodies_are_trimmed(self, sent):
        sent["reply"] = FakeResponse(500, None, text="x" * 5000)
        with pytest.raises(fapshi.FapshiUnavailable) as exc:
            fapshi._request("GET", "/x")
        assert len(str(exc.value)) < 500


@FAKE
class TestRateLimitIsRetryable:
    """REGRESSION. Fapshi allows six status checks per minute per transaction and
    answers the seventh with 429. Lumping that in with the other 4xx as "our
    request was wrong, do not retry" means giving up on a live payment because we
    asked about it too eagerly."""

    def test_429_is_rate_limited(self, sent):
        sent["reply"] = FakeResponse(429, {"message": "too many requests"})
        with pytest.raises(fapshi.FapshiRateLimited):
            fapshi._request("GET", "/payment-status/abc")

    def test_rate_limit_is_a_kind_of_unavailable(self, sent):
        """So that callers written to leave state alone when the answer is
        unknown do the right thing here without knowing this class exists."""
        sent["reply"] = FakeResponse(429, {"message": "slow down"})
        with pytest.raises(fapshi.FapshiUnavailable):
            fapshi._request("GET", "/payment-status/abc")

    def test_rate_limit_is_not_a_rejection(self, sent):
        sent["reply"] = FakeResponse(429, {"message": "slow down"})
        with pytest.raises(fapshi.FapshiError) as exc:
            fapshi._request("GET", "/payment-status/abc")
        assert not isinstance(exc.value, fapshi.FapshiRejected)

    def test_pacing_constants_match_the_documented_cap(self):
        # Six per minute is ten seconds apart exactly; the interval must not drift
        # below it, or a polling caller trips the limit it was written to respect.
        assert fapshi.STATUS_CALLS_PER_MINUTE == 6
        assert fapshi.STATUS_MIN_INTERVAL_SECONDS >= 60 / fapshi.STATUS_CALLS_PER_MINUTE


# ── Phone numbers ────────────────────────────────────────────────────────────


class TestNormaliseMsisdn:
    @pytest.mark.parametrize(
        "raw",
        [
            "670000000",
            "+237670000000",
            "237670000000",
            "00237670000000",
            "670 000 000",
            " +237 6 70 00 00 00 ",
            "+237-670-000-000",
        ],
    )
    def test_accepts_what_people_actually_type(self, raw):
        """All seven are the same number. Fapshi wants nine local digits."""
        assert fapshi.normalise_msisdn(raw) == "670000000"

    @pytest.mark.parametrize("raw", ["", "   ", None])
    def test_blank_is_rejected(self, raw):
        with pytest.raises(fapshi.FapshiRejected, match="required"):
            fapshi.normalise_msisdn(raw)

    def test_landline_is_rejected(self):
        """A 2xx number parses as a valid Cameroonian number but cannot hold a
        mobile money wallet, so it is refused here rather than by Fapshi."""
        with pytest.raises(fapshi.FapshiRejected, match="not a mobile number"):
            fapshi.normalise_msisdn("+237222000000")

    def test_foreign_number_is_rejected(self):
        with pytest.raises(fapshi.FapshiRejected, match="Cameroonian"):
            fapshi.normalise_msisdn("+33612345678")

    @pytest.mark.parametrize("raw", ["6700000", "67000000000", "abcdefghi", "670-abc"])
    def test_malformed_is_rejected(self, raw):
        with pytest.raises(fapshi.FapshiRejected):
            fapshi.normalise_msisdn(raw)


class TestInferMedium:
    @pytest.mark.parametrize("msisdn", ["670000000", "677123456", "650000000", "654999999"])
    def test_mtn_prefixes(self, msisdn):
        assert fapshi.infer_medium(msisdn) == fapshi.MEDIUM_MTN

    @pytest.mark.parametrize("msisdn", ["690000000", "699123456", "656000000", "685000000"])
    def test_orange_prefixes(self, msisdn):
        assert fapshi.infer_medium(msisdn) == fapshi.MEDIUM_ORANGE

    def test_camtel_is_unknown(self):
        """62x is Camtel, which Fapshi does not carry. ``None`` leaves the radio
        unselected rather than guessing at the buyer's operator."""
        assert fapshi.infer_medium("620000000") is None

    def test_wrong_length_is_unknown(self):
        assert fapshi.infer_medium("67000") is None

    def test_matches_fapshi_own_sandbox_numbers(self):
        """Fapshi's documented test numbers are an independent check on the prefix
        table: it publishes 650/67x as MTN and 656/69x as Orange, so if this table
        disagrees with them it is wrong."""
        for key in ("mtn_success", "mtn_failure"):
            for number in fapshi.SANDBOX_NUMBERS[key]:
                assert fapshi.infer_medium(number) == fapshi.MEDIUM_MTN, number
        for key in ("orange_success", "orange_failure"):
            for number in fapshi.SANDBOX_NUMBERS[key]:
                assert fapshi.infer_medium(number) == fapshi.MEDIUM_ORANGE, number


# ── Amounts ──────────────────────────────────────────────────────────────────


@FAKE
class TestToXaf:
    @pytest.mark.parametrize(
        "given,expected",
        [
            (100, 100),
            ("2500.00", 2500),
            ("50000.49", 50000),
            ("50000.50", 50001),  # ROUND_HALF_UP
            ("50000.99", 50001),
        ],
    )
    def test_rounds_to_whole_francs(self, given, expected):
        """XAF has no minor unit, but Koraa stores money with two decimal places."""
        assert fapshi.to_xaf(given) == expected

    def test_payout_direction_floors(self):
        """So Koraa never pays out a franc more than it collected."""
        from decimal import ROUND_DOWN
        assert fapshi.to_xaf("50000.99", rounding=ROUND_DOWN) == 50000

    @pytest.mark.parametrize("given", [0, -1, "0.00", "-50"])
    def test_non_positive_is_rejected(self, given):
        with pytest.raises(fapshi.FapshiRejected, match="positive"):
            fapshi.to_xaf(given)

    @pytest.mark.parametrize("given", [1, 99, "99.49"])
    def test_below_the_floor_is_rejected(self, given):
        with pytest.raises(fapshi.FapshiRejected, match="minimum is 100"):
            fapshi.to_xaf(given)

    @override_settings(FAPSHI_MIN_AMOUNT=500)
    def test_floor_is_configurable(self):
        with pytest.raises(fapshi.FapshiRejected, match="minimum is 500"):
            fapshi.to_xaf(499)
        assert fapshi.to_xaf(500) == 500

    @pytest.mark.parametrize("given", ["abc", None, "", object()])
    def test_nonsense_is_rejected(self, given):
        with pytest.raises(fapshi.FapshiRejected, match="not a usable amount"):
            fapshi.to_xaf(given)


class TestExternalRef:
    def test_uuid_passes_untouched(self):
        """``Order.id`` is a UUID, whose string form is hex and hyphens."""
        value = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
        assert fapshi.external_ref(value) == value

    def test_integer_pk_passes(self):
        assert fapshi.external_ref(42) == "42"

    @pytest.mark.parametrize("bad", ["with space", "semi;colon", "slash/es", "hash#"])
    def test_illegal_characters_are_rejected(self, bad):
        """Better a clear error here than a 400 from Fapshi, which would leave a
        charge nothing can be matched to."""
        with pytest.raises(fapshi.FapshiRejected, match="rejects"):
            fapshi.external_ref(bad)

    def test_too_long_is_rejected(self):
        with pytest.raises(fapshi.FapshiRejected, match="allows 100"):
            fapshi.external_ref("a" * 101)

    @pytest.mark.parametrize("bad", ["", "   ", None])
    def test_blank_is_rejected(self, bad):
        with pytest.raises(fapshi.FapshiRejected, match="reference is required"):
            fapshi.external_ref(bad)


# ── direct-pay ───────────────────────────────────────────────────────────────


@pytest.fixture
def call(monkeypatch):
    """Patches the single chokepoint. Records the call, replies as told.

    This is the seam the plan names: everything above ``_request`` is tested
    through it, so no test needs to know what ``requests`` looks like.
    """
    captured = {"reply": {}}

    def fake_request(method, path, *, json=None):
        captured.update(method=method, path=path, json=json)
        reply = captured["reply"]
        if isinstance(reply, BaseException):
            raise reply
        return reply

    monkeypatch.setattr(fapshi, "_request", fake_request)
    return captured


@FAKE
class TestDirectPay:
    def test_posts_to_direct_pay_and_returns_the_trans_id(self, call):
        call["reply"] = {"message": "accepted", "transId": "tx_123"}
        trans_id = fapshi.direct_pay(
            amount="2500.00", phone="+237 670 000 000", external_id="order-1"
        )
        assert trans_id == "tx_123"
        assert call["method"] == "POST"
        assert call["path"] == "/direct-pay"

    def test_payload_matches_the_documented_field_names(self, call):
        call["reply"] = {"transId": "tx_123"}
        fapshi.direct_pay(
            amount="2500.00",
            phone="+237670000000",
            external_id="order-1",
            name="Ada Lovelace",
            email="ada@example.com",
            message="Order #1",
        )
        assert call["json"] == {
            "amount": 2500,
            "phone": "670000000",  # nine local digits, no +237
            "externalId": "order-1",
            "name": "Ada Lovelace",
            "email": "ada@example.com",
            "message": "Order #1",
        }

    def test_medium_is_omitted_unless_chosen(self, call):
        """Fapshi's own instruction for the field is "omit to auto-detect", and
        its allocation data is fresher than a prefix table in this repo. Sending
        a guessed medium risks routing a charge to the wrong operator."""
        call["reply"] = {"transId": "tx_123"}
        fapshi.direct_pay(amount=1000, phone="670000000", external_id="o1")
        assert "medium" not in call["json"]

    def test_chosen_medium_is_sent(self, call):
        call["reply"] = {"transId": "tx_123"}
        fapshi.direct_pay(
            amount=1000, phone="670000000", external_id="o1",
            medium=fapshi.MEDIUM_ORANGE,
        )
        assert call["json"]["medium"] == "orange money"

    def test_unknown_medium_is_rejected_before_the_call(self, call):
        call["reply"] = {"transId": "tx_123"}
        with pytest.raises(fapshi.FapshiRejected, match="not a payment medium"):
            fapshi.direct_pay(
                amount=1000, phone="670000000", external_id="o1", medium="airtel",
            )
        assert "path" not in call, "should not have reached the network"

    def test_blank_optional_fields_are_omitted(self, call):
        """Fapshi rejects empty strings on some optional fields."""
        call["reply"] = {"transId": "tx_123"}
        fapshi.direct_pay(
            amount=1000, phone="670000000", external_id="o1",
            name="", email="", message="",
        )
        assert set(call["json"]) == {"amount", "phone", "externalId"}

    def test_response_without_trans_id_is_unavailable(self, call):
        """Worse than a refusal: money may move and nothing could match it, so
        the caller must keep the order pending rather than call it failed."""
        call["reply"] = {"message": "Payment initiated"}
        with pytest.raises(fapshi.FapshiUnavailable, match="no transId"):
            fapshi.direct_pay(amount=1000, phone="670000000", external_id="o1")

    def test_bad_amount_never_reaches_the_network(self, call):
        with pytest.raises(fapshi.FapshiRejected):
            fapshi.direct_pay(amount=50, phone="670000000", external_id="o1")
        assert "path" not in call

    def test_bad_phone_never_reaches_the_network(self, call):
        with pytest.raises(fapshi.FapshiRejected):
            fapshi.direct_pay(amount=1000, phone="+33612345678", external_id="o1")
        assert "path" not in call

    def test_phone_is_masked_in_logs(self, call, caplog):
        """Numbers are personal data and payment logs are full of them. Three
        digits is enough to match a support enquiry and not enough to dial."""
        call["reply"] = {"transId": "tx_123"}
        with caplog.at_level("INFO", logger="apps.payments.fapshi"):
            fapshi.direct_pay(amount=1000, phone="670123456", external_id="o1")
        logged = "\n".join(r.getMessage() for r in caplog.records)
        assert "670123456" not in logged
        assert "…456" in logged


# ── payment-status ───────────────────────────────────────────────────────────


@FAKE
class TestOutageIsNotFailure:
    """REGRESSION, and the most expensive bug in the code this replaces.

    ``_check_fapshi_status`` answered ``"FAILED"`` on any non-200. Callers took it
    at face value: orders were marked failed and subscriptions cancelled for
    payments that had very likely succeeded. Every one of these must raise."""

    @pytest.mark.parametrize(
        "boom",
        [
            fapshi.FapshiUnavailable("500"),
            fapshi.FapshiRateLimited("429"),
        ],
    )
    def test_status_raises_rather_than_reporting_failure(self, call, boom):
        call["reply"] = boom
        with pytest.raises(fapshi.FapshiUnavailable):
            fapshi.payment_status("tx_123")

    def test_missing_status_field_is_unavailable_not_failed(self, call):
        call["reply"] = {"message": "ok but no status"}
        with pytest.raises(fapshi.FapshiUnavailable, match="no status"):
            fapshi.payment_status("tx_123")

    def test_the_word_failed_is_never_returned_without_fapshi_saying_it(self, call):
        """Belt and braces on the above: the only route to ``"FAILED"`` is Fapshi
        actually sending it."""
        call["reply"] = {"status": "SUCCESSFUL"}
        assert fapshi.payment_status("tx_123") == "SUCCESSFUL"


@FAKE
class TestPaymentStatus:
    def test_gets_the_documented_path(self, call):
        call["reply"] = {"status": "PENDING"}
        fapshi.payment_status("tx_123")
        assert call["method"] == "GET"
        assert call["path"] == "/payment-status/tx_123"

    @pytest.mark.parametrize("raw", ["successful", "Successful", "SUCCESSFUL"])
    def test_status_is_upper_cased(self, call, raw):
        call["reply"] = {"status": raw}
        assert fapshi.payment_status("tx_123") == "SUCCESSFUL"

    def test_blank_trans_id_is_rejected_before_the_call(self, call):
        with pytest.raises(fapshi.FapshiRejected, match="transaction id is required"):
            fapshi.payment_status("")
        assert "path" not in call

    def test_details_carries_the_fields_settlement_needs(self, call):
        """``revenue`` is the amount after Fapshi's fee — what Koraa actually
        receives, and therefore what a merchant payout must be based on."""
        call["reply"] = {
            "status": "SUCCESSFUL",
            "amount": 2500,
            "revenue": 2425,
            "financialTransId": "MP123456",
            "dateConfirmed": "2026-08-28T10:00:00.000Z",
        }
        details = fapshi.payment_details("tx_123")
        assert details["revenue"] == 2425
        assert details["financialTransId"] == "MP123456"
        assert details["dateConfirmed"] == "2026-08-28T10:00:00.000Z"

    def test_unrecognised_status_passes_through_with_a_warning(self, call, caplog):
        """A status we have never seen is far likelier to be a new Fapshi state
        than a corrupt response, and every caller treats non-terminal as "keep
        waiting" — which is the right answer. It must be loud, not fatal."""
        call["reply"] = {"status": "REVERSED"}
        with caplog.at_level("WARNING", logger="apps.payments.fapshi"):
            assert fapshi.payment_status("tx_123") == "REVERSED"
        assert "REVERSED" in caplog.text
        assert "REVERSED" not in fapshi.TERMINAL_STATUSES


class TestStatusVocabulary:
    def test_terminal_statuses_are_a_subset_of_all(self):
        assert fapshi.TERMINAL_STATUSES <= fapshi.ALL_STATUSES
        assert fapshi.UNSUCCESSFUL_STATUSES <= fapshi.TERMINAL_STATUSES

    def test_pending_and_created_are_not_terminal(self):
        """A direct-pay transaction sits PENDING until the payer acts, and never
        expires — so polling stops on its own timeout, not on a Fapshi state."""
        assert fapshi.STATUS_PENDING not in fapshi.TERMINAL_STATUSES
        assert fapshi.STATUS_CREATED not in fapshi.TERMINAL_STATUSES

    def test_success_is_not_counted_as_unsuccessful(self):
        assert fapshi.STATUS_SUCCESSFUL not in fapshi.UNSUCCESSFUL_STATUSES


# ── payout ───────────────────────────────────────────────────────────────────


@FAKE
class TestPayout:
    def test_posts_to_payout_and_returns_the_trans_id(self, call):
        call["reply"] = {"transId": "po_123"}
        assert fapshi.payout(phone="670000000", amount=2000, external_id="o1") == "po_123"
        assert call["path"] == "/payout"

    def test_amount_floors_so_koraa_never_overpays(self, call):
        call["reply"] = {"transId": "po_123"}
        fapshi.payout(phone="670000000", amount="2375.99", external_id="o1")
        assert call["json"]["amount"] == 2375

    def test_response_without_trans_id_is_unavailable(self, call):
        """Money may have gone out with no reference for it, so the caller must
        leave the payout unresolved for a human rather than record a success."""
        call["reply"] = {"message": "ok"}
        with pytest.raises(fapshi.FapshiUnavailable, match="no transId"):
            fapshi.payout(phone="670000000", amount=2000, external_id="o1")


# ── initiate-pay ─────────────────────────────────────────────────────────────


@FAKE
class TestInitiatePay:
    def test_returns_link_and_trans_id(self, call):
        call["reply"] = {"link": "https://pay.fapshi.com/abc", "transId": "tx_9"}
        link, trans_id = fapshi.initiate_pay(
            amount=50000, email="a@example.com",
            redirect_url="https://koraa.africa/done", external_id="sub-1",
        )
        assert (link, trans_id) == ("https://pay.fapshi.com/abc", "tx_9")

    @pytest.mark.parametrize(
        "reply",
        [{"transId": "tx_9"}, {"link": "https://pay.fapshi.com/abc"}, {}],
    )
    def test_incomplete_response_is_unavailable(self, call, reply):
        call["reply"] = reply
        with pytest.raises(fapshi.FapshiUnavailable, match="incomplete"):
            fapshi.initiate_pay(
                amount=50000, email="a@example.com",
                redirect_url="https://koraa.africa/done", external_id="sub-1",
            )


# ── Webhooks ─────────────────────────────────────────────────────────────────


class TestWebhookSecret:
    @override_settings(FAPSHI_WEBHOOK_SECRET="s3cr3t")
    def test_matching_secret_passes(self):
        assert fapshi.webhook_secret_ok("s3cr3t") is True

    @override_settings(FAPSHI_WEBHOOK_SECRET="s3cr3t")
    def test_surrounding_whitespace_is_tolerated(self):
        assert fapshi.webhook_secret_ok("  s3cr3t  ") is True

    @override_settings(FAPSHI_WEBHOOK_SECRET="s3cr3t")
    @pytest.mark.parametrize("supplied", ["wrong", "s3cr3", "s3cr3t2", "", None])
    def test_wrong_secret_fails(self, supplied):
        assert fapshi.webhook_secret_ok(supplied) is False

    @override_settings(FAPSHI_WEBHOOK_SECRET="")
    def test_unset_secret_does_not_fail_closed(self):
        """Deliberate. Authenticity comes from re-asking Fapshi about the payment,
        never from the payload, so this check is belt to those braces. Failing
        closed on an unset variable would mean a deploy that forgot to copy one
        silently stops settling payments — much the worse failure."""
        assert fapshi.webhook_secret_ok(None) is True
        assert fapshi.webhook_secret_ok("anything") is True
