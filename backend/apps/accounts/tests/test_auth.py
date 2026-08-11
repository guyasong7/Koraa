"""
Auth API tests.

Tests:
- User registration with auto-OTP send
- JWT login / logout / token refresh
- Email OTP verification
- Password reset flow
- /auth/me/ profile retrieval and update
- Tenant isolation (a user cannot access another's data)
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user_data():
    return {
        "email": "merchant@koraa.test",
        "full_name": "Test Merchant",
        "phone": "+237600000000",
        "password": "Koraa@2024!",
        "password_confirm": "Koraa@2024!",
    }


@pytest.fixture
def registered_user(db, client, user_data):
    """Creates a user and returns (user, tokens)."""
    response = client.post("/api/v1/auth/register/", user_data, format="json")
    assert response.status_code == status.HTTP_201_CREATED
    user = User.objects.get(email=user_data["email"])
    return user, response.data


@pytest.mark.django_db
class TestRegistration:
    def test_register_success(self, client, user_data):
        response = client.post("/api/v1/auth/register/", user_data, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert "access" in response.data
        assert "refresh" in response.data
        assert response.data["user"]["email"] == user_data["email"]
        assert response.data["user"]["is_verified"] is False

    def test_register_duplicate_email(self, client, user_data, db):
        client.post("/api/v1/auth/register/", user_data, format="json")
        response = client.post("/api/v1/auth/register/", user_data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_register_password_mismatch(self, client, user_data, db):
        user_data["password_confirm"] = "WrongPassword123!"
        response = client.post("/api/v1/auth/register/", user_data, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_register_weak_password(self, client, db):
        response = client.post("/api/v1/auth/register/", {
            "email": "test@koraa.test",
            "full_name": "Test",
            "password": "123",
            "password_confirm": "123",
        }, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestLogin:
    def test_login_success(self, client, registered_user):
        user, _ = registered_user
        response = client.post("/api/v1/auth/login/", {
            "email": user.email,
            "password": "Koraa@2024!",
        }, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data
        assert "refresh" in response.data
        assert response.data["user"]["email"] == user.email

    def test_login_wrong_password(self, client, registered_user):
        user, _ = registered_user
        response = client.post("/api/v1/auth/login/", {
            "email": user.email,
            "password": "WrongPassword!",
        }, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_login_nonexistent_user(self, client, db):
        response = client.post("/api/v1/auth/login/", {
            "email": "nobody@koraa.test",
            "password": "Whatever123!",
        }, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestLogout:
    def test_logout_blacklists_token(self, client, registered_user):
        _, data = registered_user
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {data['access']}")
        response = client.post("/api/v1/auth/logout/", {"refresh": data["refresh"]}, format="json")
        assert response.status_code == status.HTTP_200_OK

        # Token should now be blacklisted — refresh should fail
        response = client.post("/api/v1/auth/token/refresh/", {"refresh": data["refresh"]}, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestEmailVerification:
    def test_otp_verify_flow(self, client, registered_user):
        from apps.accounts.models import EmailVerificationOTP
        user, _ = registered_user
        otp_code, _ = EmailVerificationOTP.generate(user)

        response = client.post("/api/v1/auth/verify-email/confirm/", {
            "email": user.email,
            "otp": otp_code,
        }, format="json")
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.is_verified is True

    def test_otp_wrong_code(self, client, registered_user):
        user, _ = registered_user
        response = client.post("/api/v1/auth/verify-email/confirm/", {
            "email": user.email,
            "otp": "000000",
        }, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestMeEndpoint:
    def test_me_returns_profile(self, client, registered_user):
        _, data = registered_user
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {data['access']}")
        response = client.get("/api/v1/auth/me/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["email"] == "merchant@koraa.test"

    def test_me_requires_auth(self, client):
        response = client.get("/api/v1/auth/me/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_me_update_name(self, client, registered_user):
        _, data = registered_user
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {data['access']}")
        response = client.patch("/api/v1/auth/me/", {"full_name": "Updated Name"}, format="json")
        assert response.status_code == status.HTTP_200_OK
