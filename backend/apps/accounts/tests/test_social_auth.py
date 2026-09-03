"""
Google sign-in: what the token buys, and what a failure means.

Two behaviours are pinned here.

The avatar: Google sends the profile photo as a `picture` claim, which used to
be dropped on the floor, so every Google account arrived with no photo. It is
stored as a URL in `avatar_url` rather than downloaded, and refreshed on each
sign-in because Google rotates those URLs — but it must never touch `avatar`,
which is the merchant's own upload and outranks it.

The failure modes: a bad token and a broken dependency are different answers.
Certificate verification reaches Redis and Google, and both can fail while the
caller's token is perfectly good; reporting that as "invalid token" sent people
off to re-check credentials that were fine. A bad token is 400, everything else
is 503.
"""

import pytest
from django.contrib.auth import get_user_model
from google.auth import exceptions as google_exceptions
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()

SOCIAL_URL = "/api/v1/auth/social/"

GOOGLE_PHOTO = "https://lh3.googleusercontent.com/a/ACg8ocKexample=s96-c"
ROTATED_PHOTO = "https://lh3.googleusercontent.com/a/ACg8ocKrotated=s96-c"


def payload(**extra):
    body = {"provider": "google", "id_token": "any-token-the-stub-ignores"}
    body.update(extra)
    return body


@pytest.fixture
def google_token(monkeypatch):
    """Stub verification; mutate the returned dict to shape the claims."""
    claims = {
        "email": "social@koraa.test",
        "name": "Social User",
        "email_verified": True,
        "picture": GOOGLE_PHOTO,
    }
    monkeypatch.setattr(
        "apps.accounts.views.verify_firebase_id_token", lambda token: claims
    )
    return claims


@pytest.mark.django_db
class TestGoogleAvatar:
    def test_picture_is_stored_on_first_sign_in(self, google_token):
        response = APIClient().post(SOCIAL_URL, payload(), format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["user"]["avatar_url"] == GOOGLE_PHOTO
        assert User.objects.get(email="social@koraa.test").avatar_url == GOOGLE_PHOTO

    def test_rotated_picture_replaces_the_stale_one(self, google_token):
        """Google's URLs expire, so a stale one renders as a broken image."""
        api = APIClient()
        api.post(SOCIAL_URL, payload(), format="json")

        google_token["picture"] = ROTATED_PHOTO
        response = api.post(SOCIAL_URL, payload(), format="json")

        assert response.data["user"]["avatar_url"] == ROTATED_PHOTO

    def test_uploaded_avatar_is_never_disturbed(self, google_token):
        """`avatar` is the merchant's own upload and outranks the provider."""
        user = User.objects.create_user(
            email="social@koraa.test", full_name="Social User", password="Koraa@2024!"
        )
        user.avatar = "avatars/mine.png"
        user.save(update_fields=["avatar"])

        APIClient().post(SOCIAL_URL, payload(), format="json")

        user.refresh_from_db()
        assert user.avatar == "avatars/mine.png"
        assert user.avatar_url == GOOGLE_PHOTO

    def test_missing_picture_claim_is_not_an_error(self, google_token):
        """Apple, and Google accounts with no photo, send no `picture`."""
        del google_token["picture"]

        response = APIClient().post(SOCIAL_URL, payload(), format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["user"]["avatar_url"] == ""

    def test_avatar_url_is_not_client_writable(self, google_token):
        """It is provider-owned; a merchant must not be able to point it anywhere."""
        api = APIClient()
        login = api.post(SOCIAL_URL, payload(), format="json")
        api.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

        api.patch(
            "/api/v1/auth/me/", {"avatar_url": "https://evil.test/x.png"}, format="json"
        )

        assert User.objects.get(email="social@koraa.test").avatar_url == GOOGLE_PHOTO


@pytest.mark.django_db
class TestSignInFailureModes:
    def test_bad_token_is_a_400(self, monkeypatch):
        """google-auth raises ValueError for a token that is genuinely bad."""
        monkeypatch.setattr(
            "apps.accounts.views.verify_firebase_id_token",
            lambda token: (_ for _ in ()).throw(ValueError("Token expired")),
        )

        response = APIClient().post(SOCIAL_URL, payload(), format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        # The reason must not leak to an unauthenticated caller — the client
        # gets one flat answer whatever the token was wrong about.
        assert response.data["error"] == (
            "Invalid or expired sign-in token. Please try again."
        )

    @pytest.mark.parametrize(
        "error",
        [
            ConnectionError("Redis is gone"),
            TimeoutError("socket timeout"),
            google_exceptions.TransportError("could not reach Google"),
        ],
    )
    def test_infrastructure_failure_is_a_503(self, monkeypatch, error):
        """A Redis blip or an unreachable Google is our fault, not the token's."""
        monkeypatch.setattr(
            "apps.accounts.views.verify_firebase_id_token",
            lambda token: (_ for _ in ()).throw(error),
        )

        response = APIClient().post(SOCIAL_URL, payload(), format="json")

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert "temporarily unavailable" in response.data["error"]

    def test_no_email_in_token_is_a_400(self, google_token):
        google_token["email"] = None

        response = APIClient().post(SOCIAL_URL, payload(), format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestCertsCacheIsOptional:
    """A cache outage must not take sign-in down — in either direction."""

    def test_unreadable_cache_still_verifies(self, monkeypatch):
        from apps.accounts import firebase

        def exploding_get(*args, **kwargs):
            raise ConnectionError("Redis read timed out")

        monkeypatch.setattr(firebase.cache, "get", exploding_get)
        monkeypatch.setattr(firebase.cache, "set", lambda *a, **k: None)

        fetched = {}

        def fake_transport(url, **kwargs):
            fetched["url"] = url
            return firebase._CachedResponse(b"{}", {}, 200)

        monkeypatch.setattr(firebase, "_transport", fake_transport)

        response = firebase._cached_request("https://certs.example.test/keys")

        # It fell through to the network instead of raising.
        assert fetched["url"] == "https://certs.example.test/keys"
        assert response.status == 200

    def test_unwritable_cache_still_verifies(self, monkeypatch):
        from apps.accounts import firebase

        monkeypatch.setattr(firebase.cache, "get", lambda *a, **k: None)
        monkeypatch.setattr(
            firebase.cache,
            "set",
            lambda *a, **k: (_ for _ in ()).throw(ConnectionError("Redis write failed")),
        )
        monkeypatch.setattr(
            firebase,
            "_transport",
            lambda url, **kwargs: firebase._CachedResponse(b"{}", {}, 200),
        )

        response = firebase._cached_request("https://certs.example.test/keys")

        assert response.status == 200
