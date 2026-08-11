"""
Store & tenant isolation tests.
Verifies that merchants cannot access each other's stores.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.merchants.models import Merchant
from apps.stores.models import Store

User = get_user_model()


def create_merchant_user(email, password="Koraa@2024!"):
    user = User.objects.create_user(email=email, full_name="Test", password=password)
    merchant = Merchant.objects.create(
        user=user, business_name=f"Business {email}", country="CM"
    )
    return user, merchant


def get_tokens(client, email, password="Koraa@2024!"):
    response = client.post("/api/v1/auth/login/", {"email": email, "password": password}, format="json")
    return response.data["access"]


@pytest.fixture
def client():
    return APIClient()


@pytest.mark.django_db
class TestStoreCreation:
    def test_create_store(self, client):
        user, merchant = create_merchant_user("store_owner@koraa.test")
        token = get_tokens(client, "store_owner@koraa.test")
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        response = client.post("/api/v1/stores/", {
            "name": "My Fashion Shop",
            "currency": "XAF",
            "country": "CM",
        }, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "My Fashion Shop"
        assert "slug" in response.data
        assert response.data["status"] == "draft"

    def test_create_store_requires_merchant(self, client):
        """User without merchant profile cannot create a store."""
        user = User.objects.create_user(
            email="noMerchant@koraa.test", full_name="No Merch", password="Koraa@2024!"
        )
        token = get_tokens(client, "noMerchant@koraa.test")
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        response = client.post("/api/v1/stores/", {
            "name": "Ghost Store", "currency": "XAF", "country": "CM",
        }, format="json")
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_400_BAD_REQUEST)


@pytest.mark.django_db
class TestTenantIsolation:
    """Critical: verify one merchant cannot see or modify another's store."""

    def test_cannot_list_other_merchants_stores(self, client):
        user_a, merchant_a = create_merchant_user("merchantA@koraa.test")
        user_b, merchant_b = create_merchant_user("merchantB@koraa.test")

        # Merchant A creates a store
        store_a = Store.objects.create(
            merchant=merchant_a, name="Store A", slug="store-a", currency="XAF"
        )

        # Merchant B should not see Store A
        token_b = get_tokens(client, "merchantB@koraa.test")
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_b}")

        response = client.get("/api/v1/stores/")
        assert response.status_code == status.HTTP_200_OK
        store_ids = [str(s["id"]) for s in response.data.get("results", response.data)]
        assert str(store_a.id) not in store_ids

    def test_cannot_access_other_merchants_store_detail(self, client):
        user_a, merchant_a = create_merchant_user("ownerA@koraa.test")
        user_b, merchant_b = create_merchant_user("ownerB@koraa.test")

        store_a = Store.objects.create(
            merchant=merchant_a, name="Private Store", slug="private-store", currency="XAF"
        )

        token_b = get_tokens(client, "ownerB@koraa.test")
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_b}")

        response = client.get(f"/api/v1/stores/{store_a.id}/")
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestStorePublishLifecycle:
    def test_publish_store(self, client):
        user, merchant = create_merchant_user("publisher@koraa.test")
        store = Store.objects.create(
            merchant=merchant, name="Pub Store", slug="pub-store", currency="XAF"
        )
        token = get_tokens(client, "publisher@koraa.test")
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        response = client.post(f"/api/v1/stores/{store.id}/publish/")
        assert response.status_code == status.HTTP_200_OK
        store.refresh_from_db()
        assert store.status == Store.Status.PUBLISHED
        assert store.published_at is not None

    def test_unpublish_store(self, client):
        user, merchant = create_merchant_user("unpublisher@koraa.test")
        store = Store.objects.create(
            merchant=merchant, name="Live Store", slug="live-store", currency="XAF", status="published"
        )
        token = get_tokens(client, "unpublisher@koraa.test")
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        response = client.post(f"/api/v1/stores/{store.id}/unpublish/")
        assert response.status_code == status.HTTP_200_OK
        store.refresh_from_db()
        assert store.status == Store.Status.DRAFT
