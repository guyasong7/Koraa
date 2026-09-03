"""
AI chat availability.

The rule under test: having no store is a normal state, not an error. Onboarding
creates a Merchant and nothing else, so every newly registered account reaches
the assistant with an empty store list. It used to answer those callers with a
403, which made the assistant look broken for exactly the merchants who had the
most to ask — so the no-store case must stay covered.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.merchants.models import Merchant
from apps.stores.models import Store

User = get_user_model()

CHAT_URL = "/api/v1/stores/ai-chat/"

# What the prompt must say when the merchant has nothing yet.
NO_STORE_LINE = "has not created a store yet"


@pytest.fixture
def merchant_client(db):
    user = User.objects.create_user(
        email="ai@koraa.test", full_name="AI Tester", password="Koraa@2024!"
    )
    Merchant.objects.create(user=user, business_name="Fresh Business", country="CM")
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


@pytest.fixture
def captured_prompt(monkeypatch):
    """Stand in for OpenRouter and keep the request body for inspection."""
    sent = {}

    class FakeResponse:
        @staticmethod
        def json():
            return {"choices": [{"message": {"content": "Sure, here's how."}}]}

    def fake_post(url, **kwargs):
        sent.update(kwargs.get("json") or {})
        return FakeResponse()

    monkeypatch.setattr("requests.post", fake_post)
    return sent


def system_content(sent):
    return next(m["content"] for m in sent["messages"] if m["role"] == "system")


@pytest.mark.django_db
class TestChatWithoutAStore:
    def test_no_store_still_answers(self, merchant_client, captured_prompt):
        client, _ = merchant_client
        response = client.post(CHAT_URL, {"message": "How do I start?"}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["reply"] == "Sure, here's how."

    def test_prompt_says_there_is_no_store(self, merchant_client, captured_prompt):
        """Without this the model invents a store rather than admitting none."""
        client, _ = merchant_client
        client.post(CHAT_URL, {"message": "How do I start?"}, format="json")

        prompt = system_content(captured_prompt)
        assert NO_STORE_LINE in prompt
        # And it must be told to help rather than to refuse.
        assert "Do not claim you cannot help" in prompt

    def test_empty_message_is_still_rejected(self, merchant_client, captured_prompt):
        """Dropping the 403 must not drop the input check with it."""
        client, _ = merchant_client
        response = client.post(CHAT_URL, {"message": "   "}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_anonymous_user_is_rejected(self, db, captured_prompt):
        response = APIClient().post(CHAT_URL, {"message": "Hello"}, format="json")

        assert response.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )


@pytest.mark.django_db
class TestChatWithAStore:
    def test_store_details_reach_the_prompt(self, merchant_client, captured_prompt):
        client, user = merchant_client
        Store.objects.create(
            merchant=user.merchant, name="Corner Shop", slug="corner-shop", currency="XAF"
        )

        response = client.post(CHAT_URL, {"message": "How am I doing?"}, format="json")

        assert response.status_code == status.HTTP_200_OK
        prompt = system_content(captured_prompt)
        assert "Corner Shop" in prompt
        # The no-store guidance must not linger once a store exists.
        assert NO_STORE_LINE not in prompt
