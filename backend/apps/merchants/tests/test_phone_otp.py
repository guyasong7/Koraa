"""
Phone OTP API tests.

Focus is the failure path of ``POST /merchants/phone/send-otp/``. The gateway
error shape is easy to read wrongly: ``send_sms`` hands back Camoo's raw body,
where ``code`` and ``message`` sit under ``sms`` (``code`` a string on errors,
an int on success), while local failures — unset credentials, a timeout — never
reach Camoo and return a flat ``{"error": ...}``. Reading ``code`` off the top
level matches neither, so every failure collapsed to "Unknown gateway error".
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()

SEND_OTP_URL = "/api/v1/merchants/phone/send-otp/"

# Camoo's text when the sender ID is unapproved or the account is out of credit.
CAMOO_INTERNAL_ERROR = "An Internal Error Has Occurred."
PENDING_SENDER_HINT = "pending approval"


@pytest.fixture
def auth_client(db):
    user = User.objects.create_user(
        email="phone@koraa.test",
        full_name="Phone Tester",
        password="Koraa@2024!",
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _stub_send_sms(monkeypatch, ok, payload):
    """Point the view's ``send_sms`` at a canned (ok, body) result."""
    monkeypatch.setattr(
        "apps.merchants.views.send_sms",
        lambda *args, **kwargs: (ok, payload),
    )


@pytest.mark.django_db
class TestPhoneSendOTPValidation:
    def test_missing_phone_is_rejected(self, auth_client):
        response = auth_client.post(SEND_OTP_URL, {}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_non_e164_phone_is_rejected(self, auth_client):
        response = auth_client.post(SEND_OTP_URL, {"phone": "683140781"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_anonymous_user_is_rejected(self, db):
        response = APIClient().post(
            SEND_OTP_URL, {"phone": "+237683140781"}, format="json"
        )
        assert response.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

    def test_success_returns_200(self, auth_client, monkeypatch):
        _stub_send_sms(
            monkeypatch,
            True,
            {"_message": "success", "sms": {"code": 200, "message-count": 1}},
        )
        response = auth_client.post(
            SEND_OTP_URL, {"phone": "+237683140781"}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestPhoneSendOTPGatewayErrors:
    """The 502 body must name the real cause, never a generic fallback."""

    @pytest.mark.parametrize("code", ["500", 500])
    def test_pending_sender_id_is_explained(self, auth_client, monkeypatch, code):
        """Camoo reports this as a 500; the real cause is sender ID or credit.

        The code arrives as a string from the gateway and as an int in its docs,
        so both must land on the explanatory message.
        """
        _stub_send_sms(
            monkeypatch,
            False,
            {"_message": "error", "sms": {"code": code, "message": CAMOO_INTERNAL_ERROR}},
        )
        response = auth_client.post(
            SEND_OTP_URL, {"phone": "+237683140781"}, format="json"
        )

        assert response.status_code == status.HTTP_502_BAD_GATEWAY
        assert PENDING_SENDER_HINT in response.data["error"]
        # The opaque gateway text must not reach the merchant.
        assert CAMOO_INTERNAL_ERROR not in response.data["error"]

    def test_other_gateway_error_is_passed_through(self, auth_client, monkeypatch):
        """A gateway message that actually says something is worth showing."""
        _stub_send_sms(
            monkeypatch,
            False,
            {"_message": "error", "sms": {"code": "401", "message": "Invalid credentials"}},
        )
        response = auth_client.post(
            SEND_OTP_URL, {"phone": "+237683140781"}, format="json"
        )

        assert response.status_code == status.HTTP_502_BAD_GATEWAY
        assert response.data["error"] == "Invalid credentials"

    def test_local_failure_uses_flat_error_key(self, auth_client, monkeypatch):
        """Unset credentials never reach Camoo, so there is no ``sms`` block."""
        _stub_send_sms(
            monkeypatch, False, {"error": "Camoo SMS credentials not configured."}
        )
        response = auth_client.post(
            SEND_OTP_URL, {"phone": "+237683140781"}, format="json"
        )

        assert response.status_code == status.HTTP_502_BAD_GATEWAY
        assert response.data["error"] == "Camoo SMS credentials not configured."

    def test_unparseable_response_falls_back(self, auth_client, monkeypatch):
        """An empty body is the only case the generic message should cover."""
        _stub_send_sms(monkeypatch, False, {})
        response = auth_client.post(
            SEND_OTP_URL, {"phone": "+237683140781"}, format="json"
        )

        assert response.status_code == status.HTTP_502_BAD_GATEWAY
        assert response.data["error"] == "Unknown gateway error"

    def test_null_sms_block_does_not_crash(self, auth_client, monkeypatch):
        """``sms: null`` would raise on ``.get`` if the block were used raw."""
        _stub_send_sms(monkeypatch, False, {"sms": None, "error": "Gateway timeout"})
        response = auth_client.post(
            SEND_OTP_URL, {"phone": "+237683140781"}, format="json"
        )

        assert response.status_code == status.HTTP_502_BAD_GATEWAY
        assert response.data["error"] == "Gateway timeout"
