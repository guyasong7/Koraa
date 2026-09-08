"""AI caller tests.

Every test here is a thing that actually happened against the previous
free-tier provider: a model rate-limited for ten minutes, a model that
spent its whole token budget thinking and returned no answer, and a
model that put its thinking in the reply. The chain walks past all of
these as long as one model is healthy.
"""
import pytest
from datetime import datetime, timedelta, timezone

from apps.common import ai
from apps.common.ai import (
    AIQuotaExhausted,
    AIUnavailable,
    chat_completion,
    quota_wait_hint,
    strip_json_fence,
)

MESSAGES = [{"role": "user", "content": "How do I add a product?"}]


class FakeResponse:
    def __init__(self, body, status_code=200):
        self._body = body
        self.status_code = status_code

    def json(self):
        return self._body


def reply(content):
    return {"choices": [{"message": {"content": content}}]}


@pytest.fixture
def ai_api(monkeypatch):
    """
    Queue one response per model the chain will try, in order.

    Returns a recorder whose `models` list says which models were actually
    asked — the assertion that matters is usually "did it move on?".
    """
    state = {"queue": [], "models": [], "payloads": []}

    monkeypatch.setattr(ai, "API_KEY", "test-key")

    def fake_post(url, **kwargs):
        payload = kwargs.get("json") or {}
        state["models"].append(payload.get("model"))
        state["payloads"].append(payload)
        if not state["queue"]:
            raise AssertionError(f"unexpected extra call to {payload.get('model')}")
        return state["queue"].pop(0)

    monkeypatch.setattr("requests.post", fake_post)
    return state


class TestTheChainMovesOn:
    def test_first_healthy_model_answers(self, ai_api):
        ai_api["queue"] = [FakeResponse(reply("Go to Products, then Add."))]

        text = chat_completion(["a", "b"], MESSAGES, max_tokens=100)

        assert text == "Go to Products, then Add."
        assert ai_api["models"] == ["a"], "a healthy first model must end the walk"

    def test_rate_limited_model_is_skipped(self, ai_api):
        """429 rate-limit is the normal weather."""
        ai_api["queue"] = [
            FakeResponse({"error": {"code": 429, "message": "rate-limited upstream"}}, 429),
            FakeResponse(reply("Go to Products.")),
        ]

        assert chat_completion(["a", "b"], MESSAGES, max_tokens=100) == "Go to Products."
        assert ai_api["models"] == ["a", "b"]

    def test_empty_content_is_a_failure_not_an_answer(self, ai_api):
        """A reasoning model that spends the budget returns content=None."""
        ai_api["queue"] = [
            FakeResponse({"choices": [{"message": {"content": None}}]}),
            FakeResponse(reply("Go to Products.")),
        ]

        assert chat_completion(["a", "b"], MESSAGES, max_tokens=100) == "Go to Products."
        assert ai_api["models"] == ["a", "b"]

    def test_unreachable_model_is_skipped(self, ai_api, monkeypatch):
        import requests

        calls = []

        def fake_post(url, **kwargs):
            calls.append((kwargs.get("json") or {}).get("model"))
            if len(calls) == 1:
                raise requests.Timeout("too slow")
            return FakeResponse(reply("Go to Products."))

        monkeypatch.setattr("requests.post", fake_post)

        assert chat_completion(["a", "b"], MESSAGES, max_tokens=100) == "Go to Products."
        assert calls == ["a", "b"]

    def test_duplicate_models_are_asked_once(self, ai_api):
        """The configured model is often already in the hard-coded chain."""
        ai_api["queue"] = [
            FakeResponse({"error": "down"}),
            FakeResponse(reply("Go to Products.")),
        ]

        chat_completion(["a", "a", "b"], MESSAGES, max_tokens=100)

        assert ai_api["models"] == ["a", "b"]

    def test_exhausted_chain_raises_with_every_reason(self, ai_api):
        """Callers turn this into a 503, so it has to say what went wrong."""
        ai_api["queue"] = [
            FakeResponse({"error": "rate limited"}),
            FakeResponse({"error": "no credit"}),
        ]

        with pytest.raises(AIUnavailable) as exc:
            chat_completion(["a", "b"], MESSAGES, max_tokens=100)

        assert "rate limited" in str(exc.value)
        assert "no credit" in str(exc.value)

    def test_missing_api_key_fails_before_any_call(self, monkeypatch):
        monkeypatch.setattr(ai, "API_KEY", "")
        monkeypatch.setattr("requests.post", lambda *a, **k: pytest.fail("called anyway"))

        with pytest.raises(AIUnavailable, match="AI_API_KEY"):
            chat_completion(["a"], MESSAGES, max_tokens=100)


class TestLeakedReasoningIsRejected:
    """
    A reply that opens as a thought rather than an answer is treated as a
    failure, and the chain moves on.
    """

    @pytest.mark.parametrize("leak", [
        "Okay, the user says their store has no orders yet and asks what to check.",
        "Okay, the user sells shoes in Cameroon. Let me unpack this.",
        "Alright, they need help with payments. Let me break this down.",
        "Here's a thinking process: 1. Analyze the request.",
        "Thinking Process: 1. **Analyze the Request:**",
        "The user wants to know how to add a product.",
        "Let me think about what this merchant needs.",
        "<think>They have no store yet</think>",
    ])
    def test_a_thought_shaped_reply_advances_the_chain(self, ai_api, leak):
        ai_api["queue"] = [
            FakeResponse(reply(leak)),
            FakeResponse(reply("Go to Products, then Add.")),
        ]

        text = chat_completion(["a", "b"], MESSAGES, max_tokens=100)

        assert text == "Go to Products, then Add."
        assert ai_api["models"] == ["a", "b"]

    @pytest.mark.parametrize("answer", [
        "It's normal for new stores to have zero orders initially.",
        "**Enable Mobile Money (MTN/Orange) as your primary payment option.**",
        "Adding your first product is straightforward! Here is how.",
        "Here is a checklist to diagnose why your store has no orders.",
        "Here's a process you can follow to publish your store.",
        "Okay! Here are three things to try today.",
        "So you want to add a product — here is how.",
        "First, confirm your store is published.",
        "Right away: check that your product has stock.",
        "I don't have your sales data, but here is what to check.",
    ])
    def test_a_real_answer_is_not_mistaken_for_a_thought(self, ai_api, answer):
        """A false positive costs a silent extra model call, so it matters."""
        ai_api["queue"] = [FakeResponse(reply(answer))]

        assert chat_completion(["a", "b"], MESSAGES, max_tokens=100) == answer
        assert ai_api["models"] == ["a"]

    def test_json_replies_are_never_leak_checked(self, ai_api):
        body = '{"name": "The User Wants Tote", "sku": "KORAA-THE-1234"}'
        ai_api["queue"] = [FakeResponse(reply(body))]

        assert chat_completion(["a"], MESSAGES, max_tokens=100, json_mode=True) == body
        assert ai_api["models"] == ["a"]

    def test_json_mode_asks_for_a_json_object(self, ai_api):
        ai_api["queue"] = [FakeResponse(reply("{}"))]

        chat_completion(["a"], MESSAGES, max_tokens=100, json_mode=True)

        assert ai_api["payloads"][0]["response_format"] == {"type": "json_object"}


class TestDailyQuota:
    QUOTA_429 = {
        "error": {
            "message": ("Rate limit exceeded: free-models-per-day. Add 10 credits "
                        "to unlock 1000 free model requests per day"),
            "code": 429,
            "metadata": {"headers": {
                "X-RateLimit-Limit": "50",
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": "1788825600000",
            }},
        }
    }

    def test_it_stops_the_chain_instead_of_asking_every_model(self, ai_api):
        ai_api["queue"] = [FakeResponse(self.QUOTA_429, 429)]

        with pytest.raises(AIQuotaExhausted):
            chat_completion(["a", "b", "c"], MESSAGES, max_tokens=100)

        assert ai_api["models"] == ["a"], "b and c would refuse identically"

    def test_it_reports_when_the_quota_resets(self, ai_api):
        ai_api["queue"] = [FakeResponse(self.QUOTA_429, 429)]

        with pytest.raises(AIQuotaExhausted) as exc:
            chat_completion(["a"], MESSAGES, max_tokens=100)

        assert exc.value.resets_at == datetime(2026, 9, 8, tzinfo=timezone.utc)

    def test_a_missing_reset_header_is_still_a_quota_failure(self, ai_api):
        ai_api["queue"] = [FakeResponse(
            {"error": {"message": "Rate limit exceeded: free-models-per-day.", "code": 429}}, 429
        )]

        with pytest.raises(AIQuotaExhausted) as exc:
            chat_completion(["a"], MESSAGES, max_tokens=100)

        assert exc.value.resets_at is None

    def test_callers_that_only_catch_AIUnavailable_still_work(self, ai_api):
        ai_api["queue"] = [FakeResponse(self.QUOTA_429, 429)]

        with pytest.raises(AIUnavailable):
            chat_completion(["a"], MESSAGES, max_tokens=100)

    def test_a_transient_per_model_429_is_not_the_daily_cap(self, ai_api):
        ai_api["queue"] = [
            FakeResponse({"error": {"code": 429, "message": "rate-limited upstream"}}, 429),
            FakeResponse(reply("Go to Products.")),
        ]

        assert chat_completion(["a", "b"], MESSAGES, max_tokens=100) == "Go to Products."
        assert ai_api["models"] == ["a", "b"]


class TestQuotaWaitHint:
    @pytest.mark.parametrize("hours,expected", [
        (-1, "in a few minutes"),
        (0.4, "in under an hour"),
        (1.5, "in about an hour"),
        (1.7, "in about an hour"),
        (3.2, "in about 3 hours"),
        (11.6, "in about 12 hours"),
        (30, "tomorrow"),
    ])
    def test_the_wait_is_described_in_round_terms(self, hours, expected):
        resets = datetime.now(tz=timezone.utc) + timedelta(hours=hours)
        assert quota_wait_hint(resets) == expected

    def test_an_unknown_reset_time_still_says_something_useful(self):
        assert quota_wait_hint(None) == "tomorrow"


class TestStripJsonFence:
    @pytest.mark.parametrize("raw,expected", [
        ('```json\n{"a": 1}\n```', '{"a": 1}'),
        ('```\n{"a": 1}\n```', '{"a": 1}'),
        ('{"a": 1}', '{"a": 1}'),
        ('  \n {"a": 1} \n ', '{"a": 1}'),
    ])
    def test_a_fenced_answer_still_parses(self, raw, expected):
        assert strip_json_fence(raw) == expected
