"""
OpenRouter access, in one place.

Both callers run on OpenRouter's free tier, and the free tier is the part that
breaks. A free model that answered a minute ago can return 429 "rate-limited
upstream" for the next ten — `google/gemma-4-31b-it:free` did exactly that for
the whole time this was written — so a single hard-coded model name is not
something either feature can rely on. Each caller names a chain instead, and
`chat_completion` walks it until one model answers.

Two chains rather than one setting: auto-fill has to read an image, chat only
reads text, and the free models that are good at each are not the same model.
The old single OPENROUTER_MODEL is no longer read, because one name cannot be
both a vision model and a chat model.

Reasoning models need two accommodations. They spend their budget on a hidden
`reasoning` field and put the answer in `content`, so a max_tokens that looks
generous can still return content=None — the whole budget went to thinking.
That empty answer counts as a failure here and moves on to the next model.

They also spill that thinking into `content` itself. nemotron-3-super answered
one merchant question cleanly and opened the next with "Okay, the user sells
shoes in Cameroon... Let me unpack this", which is not something a merchant
should ever read. Every request therefore sends reasoning.exclude, which is
OpenRouter's switch for keeping the chain-of-thought out of the reply. It stops
the leak; it does not stop the model thinking, so the tokens are still spent
and the budgets here still have to cover them.

reasoning.exclude is not quite enough on its own, because the spill is
stochastic rather than tied to a particular question: the same four prompts
leaked once in production and not at all on the next run. So a reply that opens
like a thought rather than an answer is treated as a failure too, the same as an
empty one, and the chain moves on. No model choice can rule this out — the
detector is the part that can.
"""
import json
import logging
import re

import requests
from decouple import config

logger = logging.getLogger(__name__)

API_URL = "https://openrouter.ai/api/v1/chat/completions"

#: A reply that starts by discussing the request instead of answering it.
#: Deliberately narrow — it wants the model's planning voice ("okay, the user
#: wants...", "let me unpack this", "Thinking Process:"), not the ordinary
#: openers a helpful answer might use, because a false positive here silently
#: costs an extra model call. Only ever applied to prose replies; JSON answers
#: start with a brace and never match.
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

# Free and vision-capable. dots-3 reads an image accurately and honours
# response_format, so it leads. openrouter/free auto-routes across whatever
# free models are healthy, which makes it the useful thing to fall back to
# rather than a second guess at a specific name.
VISION_MODELS = [
    config("OPENROUTER_VISION_MODEL", default="dots-studio/dots-3-note-preview:free"),
    "openrouter/free",
    "google/gemma-4-31b-it:free",
]

# Free and text-only. nemotron-3-super answers in a few seconds; ultra is the
# retry when super opens with its thinking instead of an answer, and was clean
# across every prompt it was tried on. nemotron-3.5-lightning is deliberately
# absent: it prints "Here's a thinking process:" almost every time, which is the
# failure the detector above exists to catch.
CHAT_MODELS = [
    config("OPENROUTER_CHAT_MODEL", default="nvidia/nemotron-3-super-120b-a12b:free"),
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "openrouter/free",
]


class AIUnavailable(RuntimeError):
    """No model in the chain produced an answer."""


def _dedup(models):
    """Keep order, drop repeats — a configured model may already be in the chain."""
    seen = set()
    return [m for m in models if m and not (m in seen or seen.add(m))]


def chat_completion(models, messages, *, max_tokens, temperature=0.4,
                    json_mode=False, timeout=60):
    """
    Ask each model in turn and return the first real answer as text.

    Raises AIUnavailable if the chain is exhausted, so callers decide what a
    dead upstream looks like to their own client.
    """
    api_key = config("OPENROUTER_API_KEY", default="")
    if not api_key:
        raise AIUnavailable("OPENROUTER_API_KEY is not configured.")

    payload = {
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        # Keep the chain-of-thought out of `content`; see the module docstring.
        "reasoning": {"exclude": True},
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
            logger.warning("OpenRouter %s unreachable: %s", model, exc)
            continue

        # A rate-limited or refused model is the next model's problem, not the
        # caller's. Anything else non-2xx is worth the same treatment: there is
        # another model to try, and no reason to spend the caller's request on
        # arguing with this one.
        try:
            data = resp.json()
        except json.JSONDecodeError:
            failures.append(f"{model}: HTTP {resp.status_code}, non-JSON body")
            continue

        if "error" in data:
            detail = str(data["error"])[:200]
            failures.append(f"{model}: {detail}")
            logger.warning("OpenRouter %s returned an error: %s", model, detail)
            continue

        try:
            text = (data["choices"][0]["message"].get("content") or "").strip()
        except (KeyError, IndexError):
            failures.append(f"{model}: unexpected response shape")
            continue

        if not text:
            # Reasoning spent the budget; see the module docstring.
            failures.append(f"{model}: empty content (reasoning used the budget)")
            logger.warning("OpenRouter %s returned no content", model)
            continue

        if not json_mode and _LEAKED_REASONING.match(text):
            failures.append(f"{model}: reply opened with leaked reasoning")
            logger.warning(
                "OpenRouter %s leaked its reasoning into the reply; trying the next model. "
                "Opened with: %r", model, text[:80]
            )
            continue

        logger.info("OpenRouter answered with %s", data.get("model", model))
        return text

    raise AIUnavailable("; ".join(failures) or "no models configured")


def strip_json_fence(text):
    """
    Undo the markdown fence a model adds after being told not to.

    response_format usually prevents this, but it is only advisory on some free
    models and costs nothing to defend against.
    """
    text = text.strip()
    for fence in ("```json", "```"):
        if text.startswith(fence):
            text = text[len(fence):]
            break
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()
