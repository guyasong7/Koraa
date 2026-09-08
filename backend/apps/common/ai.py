"""AI access — single provider, one model for both vision and chat.

Previously on OpenRouter's free tier with model chains to work around
per-model rate limits and a 50 req/day account cap. Now pointed at a
dedicated API (OpenAI-compatible) with a single capable model that
handles both vision and text.

The chain-walking logic is kept but simplified: there is one model by
default, and the chain exists only so a .env override can still add
fallbacks if the primary ever needs one.

Reasoning-leak detection is retained — claude-sonnet does not leak, but
if a fallback model is added via env it might, and the cost of the check
is near zero.
"""
import json
import logging
import re
from datetime import datetime, timezone

import requests
from decouple import config

logger = logging.getLogger(__name__)

API_URL = config("AI_API_URL", default="https://emtf.aipm9527.xyz/v1/chat/completions")
API_KEY = config("AI_API_KEY", default="")
API_MODEL = config("AI_API_MODEL", default="claude-opus-4-6")

#: A reply that starts by discussing the request instead of answering it.
_LEAKED_REASONING = re.compile(
    r"""^\s*(
        (okay|alright|hmm|right|so)\b[,.]?\s+(the\s+user|they|we\s+need|i\s+need|let\s+me|first)
      | the\s+user\s+(is|says|wants|asks|has|sells|needs)
      | let\s+me\s+(unpack|think|break|analyz|consider)
      | (here('?s|\s+is)|this\s+is)\s+(my|a|the)\s+(thinking|thought|reasoning)\s+process
      | (thinking|thought)\s+process\b
      | <think>
    )""",
    re.IGNORECASE | re.VERBOSE,
)

# One model for both vision and chat. The env vars let you override or
# add fallbacks as comma-separated names without touching code.
_extra_vision = config("AI_VISION_MODELS", default="")
_extra_chat = config("AI_CHAT_MODELS", default="")

VISION_MODELS = [API_MODEL] + [m.strip() for m in _extra_vision.split(",") if m.strip()]
CHAT_MODELS = [API_MODEL] + [m.strip() for m in _extra_chat.split(",") if m.strip()]


class AIUnavailable(RuntimeError):
    """No model in the chain produced an answer."""


class AIQuotaExhausted(AIUnavailable):
    """
    The account's allowance is spent.

    Kept for API compatibility with callers that catch it separately.
    `resets_at` is a UTC datetime when the provider said so, else None.
    """

    def __init__(self, message, resets_at=None):
        super().__init__(message)
        self.resets_at = resets_at


def _daily_quota_reset(error):
    """
    Return the reset time if `error` is a daily quota cap, else None.
    """
    error_str = str(error)
    if "free-models-per-day" not in error_str and "rate_limit" not in error_str.lower():
        return None
    try:
        headers = (error.get("metadata") or {}).get("headers") or {}
        return datetime.fromtimestamp(int(headers["X-RateLimit-Reset"]) / 1000, tz=timezone.utc)
    except (AttributeError, KeyError, TypeError, ValueError, OSError):
        return None


def quota_wait_hint(resets_at):
    """
    Turn a quota reset time into something worth saying to a merchant.
    """
    if resets_at is None:
        return "tomorrow"
    hours = (resets_at - datetime.now(tz=timezone.utc)).total_seconds() / 3600
    if hours <= 0:
        return "in a few minutes"
    if hours < 1:
        return "in under an hour"
    if hours < 2:
        return "in about an hour"
    if hours >= 24:
        return "tomorrow"
    return f"in about {round(hours)} hours"


def _dedup(models):
    """Keep order, drop repeats."""
    seen = set()
    return [m for m in models if m and not (m in seen or seen.add(m))]


def chat_completion(models, messages, *, max_tokens, temperature=0.4,
                    json_mode=False, timeout=60):
    """
    Ask each model in turn and return the first real answer as text.

    Raises AIUnavailable if the chain is exhausted.
    """
    api_key = API_KEY
    if not api_key:
        raise AIUnavailable("AI_API_KEY is not configured.")

    payload = {
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    failures = []
    for model in _dedup(models):
        try:
            resp = requests.post(
                API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={**payload, "model": model},
                timeout=timeout,
            )
        except requests.RequestException as exc:
            failures.append(f"{model}: {type(exc).__name__}")
            logger.warning("AI API %s unreachable: %s", model, exc)
            continue

        try:
            data = resp.json()
        except json.JSONDecodeError:
            failures.append(f"{model}: HTTP {resp.status_code}, non-JSON body")
            continue

        if "error" in data:
            detail = str(data["error"])[:200]

            resets_at = _daily_quota_reset(data["error"])
            if resets_at is not None or "free-models-per-day" in detail:
                logger.error("AI API daily quota spent; resets %s",
                             resets_at.isoformat() if resets_at else "unknown")
                raise AIQuotaExhausted(
                    f"daily quota spent ({detail})", resets_at=resets_at
                )

            failures.append(f"{model}: {detail}")
            logger.warning("AI API %s returned an error: %s", model, detail)
            continue

        try:
            text = (data["choices"][0]["message"].get("content") or "").strip()
        except (KeyError, IndexError):
            failures.append(f"{model}: unexpected response shape")
            continue

        if not text:
            failures.append(f"{model}: empty content")
            logger.warning("AI API %s returned no content", model)
            continue

        if not json_mode and _LEAKED_REASONING.match(text):
            failures.append(f"{model}: reply opened with leaked reasoning")
            logger.warning(
                "AI API %s leaked reasoning into the reply. Opened with: %r",
                model, text[:80]
            )
            continue

        logger.info("AI answered with %s", data.get("model", model))
        return text

    raise AIUnavailable("; ".join(failures) or "no models configured")


def strip_json_fence(text):
    """
    Undo the markdown fence a model adds after being told not to.
    """
    text = text.strip()
    for fence in ("```json", "```"):
        if text.startswith(fence):
            text = text[len(fence):]
            break
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()
