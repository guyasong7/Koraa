"""
Store access via team invites.

The rule under test: a store is reachable by its owner and by anyone the
owner invited to *that store* who accepted. A pending invite grants nothing,
an invite to one store does not leak the owner's other stores, and a
teammate never gains the owner's account-level powers.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.merchants.models import Merchant, MerchantStaff
from apps.notifications.models import Notification
from apps.stores.models import Store

User = get_user_model()

PASSWORD = "Koraa@2024!"


def make_merchant(email, business="A Business"):
    user = User.objects.create_user(email=email, full_name="Test User", password=PASSWORD)
    merchant = Merchant.objects.create(user=user, business_name=business, country="CM")
    return user, merchant


def make_plain_user(email):
    """Someone with an account but no merchant profile of their own."""
    return User.objects.create_user(email=email, full_name="Helper", password=PASSWORD)


def auth(client, email):
    response = client.post(
        "/api/v1/auth/login/", {"email": email, "password": PASSWORD}, format="json"
    )
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
    return client


def listed_ids(response):
    rows = response.data.get("results", response.data)
    return [str(row["id"]) for row in rows]


@pytest.fixture
def client():
    return APIClient()


@pytest.mark.django_db
class TestInviteGrantsAccess:
    """Nothing but an accepted invite opens someone else's store."""

    def test_stranger_sees_nothing(self, client):
        _, owner_merchant = make_merchant("owner1@koraa.test")
        store = Store.objects.create(
            merchant=owner_merchant, name="Shop", slug="shop-1", currency="XAF"
        )
        make_plain_user("stranger@koraa.test")

        auth(client, "stranger@koraa.test")
        assert listed_ids(client.get("/api/v1/stores/")) == []
        assert client.get(f"/api/v1/stores/{store.id}/").status_code == 404

    def test_pending_invite_grants_nothing(self, client):
        _, owner_merchant = make_merchant("owner2@koraa.test")
        store = Store.objects.create(
            merchant=owner_merchant, name="Shop", slug="shop-2", currency="XAF"
        )
        invitee = make_plain_user("pending@koraa.test")
        MerchantStaff.objects.create(
            merchant=owner_merchant,
            store=store,
            user=invitee,
            status=MerchantStaff.Status.PENDING,
        )

        auth(client, "pending@koraa.test")
        assert listed_ids(client.get("/api/v1/stores/")) == []
        assert client.get(f"/api/v1/stores/{store.id}/").status_code == 404

    def test_rejected_invite_grants_nothing(self, client):
        _, owner_merchant = make_merchant("owner3@koraa.test")
        store = Store.objects.create(
            merchant=owner_merchant, name="Shop", slug="shop-3", currency="XAF"
        )
        invitee = make_plain_user("rejected@koraa.test")
        MerchantStaff.objects.create(
            merchant=owner_merchant,
            store=store,
            user=invitee,
            status=MerchantStaff.Status.REJECTED,
        )

        auth(client, "rejected@koraa.test")
        assert listed_ids(client.get("/api/v1/stores/")) == []

    def test_accepted_invite_shows_store_in_menu(self, client):
        _, owner_merchant = make_merchant("owner4@koraa.test", business="Owner Co")
        store = Store.objects.create(
            merchant=owner_merchant, name="Shared Shop", slug="shop-4", currency="XAF"
        )
        invitee = make_plain_user("teammate@koraa.test")
        MerchantStaff.objects.create(
            merchant=owner_merchant,
            store=store,
            user=invitee,
            role=MerchantStaff.Role.MANAGER,
            status=MerchantStaff.Status.ACCEPTED,
        )

        auth(client, "teammate@koraa.test")
        response = client.get("/api/v1/stores/")
        assert response.status_code == 200
        rows = response.data.get("results", response.data)
        assert [str(r["id"]) for r in rows] == [str(store.id)]

        shared = rows[0]
        assert shared["is_owner"] is False
        assert shared["access_role"] == "manager"
        assert shared["shared_by"] == "Owner Co"

        assert client.get(f"/api/v1/stores/{store.id}/").status_code == 200

    def test_invite_to_one_store_does_not_leak_the_others(self, client):
        """The point of per-store invites: the rest of the account stays private."""
        _, owner_merchant = make_merchant("owner5@koraa.test")
        shared = Store.objects.create(
            merchant=owner_merchant, name="Boutique", slug="boutique", currency="XAF"
        )
        private = Store.objects.create(
            merchant=owner_merchant, name="Bakery", slug="bakery", currency="XAF"
        )
        invitee = make_plain_user("boutique-only@koraa.test")
        MerchantStaff.objects.create(
            merchant=owner_merchant,
            store=shared,
            user=invitee,
            status=MerchantStaff.Status.ACCEPTED,
        )

        auth(client, "boutique-only@koraa.test")
        assert listed_ids(client.get("/api/v1/stores/")) == [str(shared.id)]
        assert client.get(f"/api/v1/stores/{private.id}/").status_code == 404

    def test_teammate_who_owns_a_shop_sees_both(self, client):
        """The original bug: owning a shop used to hide every shared one.

        Store access resolved through the caller's *own* merchant, so a user
        with a merchant profile always got their own stores back and an
        accepted invite showed nothing.
        """
        _, owner_merchant = make_merchant("owner6@koraa.test")
        shared = Store.objects.create(
            merchant=owner_merchant, name="Their Shop", slug="their-shop", currency="XAF"
        )
        helper, helper_merchant = make_merchant("both@koraa.test", business="Helper Co")
        mine = Store.objects.create(
            merchant=helper_merchant, name="My Shop", slug="my-shop", currency="XAF"
        )
        MerchantStaff.objects.create(
            merchant=owner_merchant,
            store=shared,
            user=helper,
            status=MerchantStaff.Status.ACCEPTED,
        )

        auth(client, "both@koraa.test")
        ids = set(listed_ids(client.get("/api/v1/stores/")))
        assert ids == {str(shared.id), str(mine.id)}

    def test_legacy_account_wide_invite_still_works(self, client):
        """Rows created before MerchantStaff.store existed have store=NULL."""
        _, owner_merchant = make_merchant("owner7@koraa.test")
        one = Store.objects.create(
            merchant=owner_merchant, name="One", slug="legacy-one", currency="XAF"
        )
        two = Store.objects.create(
            merchant=owner_merchant, name="Two", slug="legacy-two", currency="XAF"
        )
        invitee = make_plain_user("legacy@koraa.test")
        MerchantStaff.objects.create(
            merchant=owner_merchant,
            store=None,
            user=invitee,
            status=MerchantStaff.Status.ACCEPTED,
        )

        auth(client, "legacy@koraa.test")
        assert set(listed_ids(client.get("/api/v1/stores/"))) == {str(one.id), str(two.id)}


@pytest.mark.django_db
class TestTeammatePowers:
    """A teammate runs the shop; the account stays with the owner."""

    def setup_shared_store(self):
        owner, owner_merchant = make_merchant("powers-owner@koraa.test")
        store = Store.objects.create(
            merchant=owner_merchant, name="Shop", slug="powers-shop", currency="XAF"
        )
        mate = make_plain_user("powers-mate@koraa.test")
        MerchantStaff.objects.create(
            merchant=owner_merchant,
            store=store,
            user=mate,
            status=MerchantStaff.Status.ACCEPTED,
        )
        return owner_merchant, store

    def test_teammate_can_manage_products(self, client):
        _, store = self.setup_shared_store()
        auth(client, "powers-mate@koraa.test")
        assert client.get(f"/api/v1/stores/{store.id}/products/").status_code == 200

    def test_teammate_can_publish(self, client):
        _, store = self.setup_shared_store()
        auth(client, "powers-mate@koraa.test")
        assert client.post(f"/api/v1/stores/{store.id}/publish/").status_code == 200
        store.refresh_from_db()
        assert store.status == Store.Status.PUBLISHED

    def test_teammate_cannot_delete_the_store(self, client):
        _, store = self.setup_shared_store()
        auth(client, "powers-mate@koraa.test")
        assert client.delete(f"/api/v1/stores/{store.id}/").status_code == 403
        store.refresh_from_db()
        assert store.status != Store.Status.SUSPENDED

    def test_owner_can_delete_the_store(self, client):
        _, store = self.setup_shared_store()
        auth(client, "powers-owner@koraa.test")
        assert client.delete(f"/api/v1/stores/{store.id}/").status_code == 200
        store.refresh_from_db()
        assert store.status == Store.Status.SUSPENDED

    def test_teammate_cannot_invite_anyone(self, client):
        _, store = self.setup_shared_store()
        make_plain_user("outsider@koraa.test")
        auth(client, "powers-mate@koraa.test")
        response = client.post(
            "/api/v1/merchants/team/",
            {"email": "outsider@koraa.test", "role": "manager", "store_id": str(store.id)},
            format="json",
        )
        assert response.status_code == 403

    def test_teammate_cannot_spend_the_owners_store_quota(self, client):
        """Creating a store must land on the caller's own account, or nowhere."""
        owner_merchant, _ = self.setup_shared_store()
        before = owner_merchant.stores.count()

        auth(client, "powers-mate@koraa.test")
        response = client.post(
            "/api/v1/stores/",
            {"name": "Sneaky Shop", "currency": "XAF", "country": "CM"},
            format="json",
        )
        assert response.status_code == 403
        assert owner_merchant.stores.count() == before

    def test_teammate_does_not_see_the_owners_roster(self, client):
        """The team list must not hand a teammate everyone else's email."""
        owner_merchant, store = self.setup_shared_store()
        other = make_plain_user("colleague@koraa.test")
        MerchantStaff.objects.create(
            merchant=owner_merchant,
            store=store,
            user=other,
            status=MerchantStaff.Status.ACCEPTED,
        )

        auth(client, "powers-mate@koraa.test")
        response = client.get("/api/v1/merchants/team/")
        assert response.status_code == 200
        rows = response.data.get("results", response.data)
        emails = {row["email"] for row in rows}
        assert emails == {"powers-mate@koraa.test"}

    def test_teammate_stats_exclude_the_owners_other_stores(self, client):
        owner_merchant, store = self.setup_shared_store()
        Store.objects.create(
            merchant=owner_merchant, name="Hidden", slug="hidden-shop", currency="XAF"
        )

        auth(client, "powers-mate@koraa.test")
        response = client.get("/api/v1/merchants/stats/")
        assert response.status_code == 200
        assert response.data["total_stores"] == 1


@pytest.mark.django_db
class TestInviteEndpoint:
    """POST /merchants/team/ — the owner names one of their own stores."""

    def invite(self, client, **body):
        return client.post("/api/v1/merchants/team/", body, format="json")

    def test_owner_invites_to_one_store(self, client):
        _, owner_merchant = make_merchant("inv-owner@koraa.test", business="Owner Co")
        store = Store.objects.create(
            merchant=owner_merchant, name="Fashion Shop", slug="fashion", currency="XAF"
        )
        invitee = make_plain_user("inv-mate@koraa.test")

        auth(client, "inv-owner@koraa.test")
        response = self.invite(
            client, email="inv-mate@koraa.test", role="manager", store_id=str(store.id)
        )
        assert response.status_code == 201
        assert response.data["store_name"] == "Fashion Shop"

        staff = MerchantStaff.objects.get(user=invitee)
        assert staff.store_id == store.id
        assert staff.status == MerchantStaff.Status.PENDING

        notif = Notification.objects.get(recipient=invitee, type="team_invite")
        assert notif.data["store_id"] == str(store.id)
        assert notif.data["store_name"] == "Fashion Shop"

    def test_store_is_required(self, client):
        make_merchant("inv-owner2@koraa.test")
        make_plain_user("inv-mate2@koraa.test")

        auth(client, "inv-owner2@koraa.test")
        response = self.invite(client, email="inv-mate2@koraa.test", role="manager")
        assert response.status_code == 400

    def test_cannot_invite_to_someone_elses_store(self, client):
        _, other_merchant = make_merchant("inv-other@koraa.test")
        their_store = Store.objects.create(
            merchant=other_merchant, name="Not Mine", slug="not-mine", currency="XAF"
        )
        make_merchant("inv-owner3@koraa.test")
        make_plain_user("inv-mate3@koraa.test")

        auth(client, "inv-owner3@koraa.test")
        response = self.invite(
            client,
            email="inv-mate3@koraa.test",
            role="manager",
            store_id=str(their_store.id),
        )
        assert response.status_code == 404
        assert not MerchantStaff.objects.filter(store=their_store).exists()

    def test_malformed_store_id_is_a_bad_request(self, client):
        make_merchant("inv-owner4@koraa.test")
        make_plain_user("inv-mate4@koraa.test")

        auth(client, "inv-owner4@koraa.test")
        response = self.invite(
            client, email="inv-mate4@koraa.test", role="manager", store_id="not-a-uuid"
        )
        assert response.status_code == 400

    def test_same_person_can_hold_two_stores(self, client):
        _, owner_merchant = make_merchant("inv-owner5@koraa.test")
        first = Store.objects.create(
            merchant=owner_merchant, name="First", slug="first-shop", currency="XAF"
        )
        second = Store.objects.create(
            merchant=owner_merchant, name="Second", slug="second-shop", currency="XAF"
        )
        invitee = make_plain_user("inv-mate5@koraa.test")

        auth(client, "inv-owner5@koraa.test")
        assert self.invite(
            client, email="inv-mate5@koraa.test", role="manager", store_id=str(first.id)
        ).status_code == 201
        assert self.invite(
            client, email="inv-mate5@koraa.test", role="support", store_id=str(second.id)
        ).status_code == 201

        assert MerchantStaff.objects.filter(user=invitee).count() == 2


@pytest.mark.django_db
class TestAcceptInvite:
    """Accepting is what puts the store in the menu."""

    def build_invite(self):
        owner, owner_merchant = make_merchant("acc-owner@koraa.test", business="Owner Co")
        store = Store.objects.create(
            merchant=owner_merchant, name="Accept Shop", slug="accept-shop", currency="XAF"
        )
        invitee = make_plain_user("acc-mate@koraa.test")
        staff = MerchantStaff.objects.create(
            merchant=owner_merchant,
            store=store,
            user=invitee,
            status=MerchantStaff.Status.PENDING,
        )
        notif = Notification.objects.create(
            recipient=invitee,
            sender=owner,
            type=Notification.Type.TEAM_INVITE,
            title="Invite",
            body="Invite",
            data={
                "staff_id": str(staff.id),
                "merchant_id": str(owner_merchant.id),
                "merchant_name": owner_merchant.business_name,
                "store_id": str(store.id),
                "store_name": store.name,
                "role": staff.role,
            },
        )
        return store, staff, notif

    def test_accept_puts_the_store_in_the_menu(self, client):
        store, staff, notif = self.build_invite()

        auth(client, "acc-mate@koraa.test")
        assert listed_ids(client.get("/api/v1/stores/")) == []

        response = client.post(
            f"/api/v1/notifications/{notif.id}/respond/", {"action": "accept"}, format="json"
        )
        assert response.status_code == 200
        staff.refresh_from_db()
        assert staff.status == MerchantStaff.Status.ACCEPTED

        assert listed_ids(client.get("/api/v1/stores/")) == [str(store.id)]

    def test_reject_leaves_the_store_out(self, client):
        store, staff, notif = self.build_invite()

        auth(client, "acc-mate@koraa.test")
        response = client.post(
            f"/api/v1/notifications/{notif.id}/respond/", {"action": "reject"}, format="json"
        )
        assert response.status_code == 200
        staff.refresh_from_db()
        assert staff.status == MerchantStaff.Status.REJECTED
        assert listed_ids(client.get("/api/v1/stores/")) == []

    def test_cannot_answer_an_invite_addressed_to_someone_else(self, client):
        """The notification is scoped to its recipient, so this is a 404."""
        store, staff, notif = self.build_invite()
        make_plain_user("acc-outsider@koraa.test")

        auth(client, "acc-outsider@koraa.test")
        response = client.post(
            f"/api/v1/notifications/{notif.id}/respond/", {"action": "accept"}, format="json"
        )
        assert response.status_code == 404
        staff.refresh_from_db()
        assert staff.status == MerchantStaff.Status.PENDING

    def test_cannot_accept_a_staff_row_belonging_to_another_user(self, client):
        """A notification whose payload names someone else's membership.

        respond_to_invite trusts data["staff_id"], so it re-checks that the row
        is the caller's own before flipping it to accepted.
        """
        store, staff, _ = self.build_invite()
        thief = make_plain_user("acc-thief@koraa.test")
        planted = Notification.objects.create(
            recipient=thief,
            type=Notification.Type.TEAM_INVITE,
            title="Invite",
            body="Invite",
            data={"staff_id": str(staff.id)},
        )

        auth(client, "acc-thief@koraa.test")
        response = client.post(
            f"/api/v1/notifications/{planted.id}/respond/", {"action": "accept"}, format="json"
        )
        assert response.status_code == 403
        staff.refresh_from_db()
        assert staff.status == MerchantStaff.Status.PENDING
        assert listed_ids(client.get("/api/v1/stores/")) == []
