"""
Blueprint tests — the guided storefront setup wizard.

Two things are worth locking down here. The catalogue makes a promise to
the frontend (every option it offers resolves to something real), and
``apply`` makes a promise to the merchant (re-running the wizard changes
how the shop looks without eating the words they wrote). Both are easy to
break from a distance: a palette renamed in ``blueprint.py`` or a preset
edited in ``presets.py`` can invalidate a recommendation that no other
test touches.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.merchants.models import Merchant
from apps.stores.models import Store
from apps.storefront import blueprint as bp
from apps.storefront.models import (
    StorefrontConfig,
    StorefrontSection,
    create_default_sections,
)
from apps.storefront.serializers import BlueprintApplySerializer

User = get_user_model()

SectionType = StorefrontSection.SectionType


def make_store(business_type="fashion", *, with_sections=True):
    """A merchant with one store, optionally already laid out from a preset."""
    user = User.objects.create_user(
        email=f"bp_{business_type}@koraa.test", full_name="BP", password="Koraa@2024!"
    )
    merchant = Merchant.objects.create(
        user=user,
        business_name="BP Probe",
        country="CM",
        business_type=business_type,
    )
    store = Store.objects.create(
        merchant=merchant,
        name="BP Probe Shop",
        currency="XAF",
        country="CM",
    )
    if with_sections:
        create_default_sections(store)
    return store


def rows(store):
    """``{type: section}`` for every row the store has, enabled or not."""
    return {s.type: s for s in store.storefront_sections.all()}


# ── Catalogue ─────────────────────────────────────────────────────────────────

class TestCatalogue:
    """No DB access: the catalogue is built from module tables alone."""

    def test_every_category_recommends_real_options(self):
        """A category's recommendation must resolve to an option on offer.

        The wizard re-seeds the palette, type and layout steps when the
        merchant changes their answer to "what do you sell?". A key that
        does not exist in the offered list leaves those steps with nothing
        selected and a preview that cannot render.
        """
        cat = bp.catalogue()
        palettes = {p["key"] for p in cat["palettes"]}
        pairings = {p["key"] for p in cat["pairings"]}
        kits = {k["key"] for k in cat["style_kits"]}
        offered = {s["type"] for s in cat["sections"]}

        for entry in cat["categories"]:
            rec = entry["recommends"]
            assert rec["palette"] in palettes, entry["key"]
            assert rec["pairing"] in pairings, entry["key"]
            assert rec["style_kit"] in kits, entry["key"]
            assert set(rec["sections"]) <= offered, entry["key"]

    def test_every_category_recommends_the_required_sections(self):
        for entry in bp.catalogue()["categories"]:
            assert bp.REQUIRED_SECTIONS <= set(entry["recommends"]["sections"])

    def test_never_offers_an_always_on_section_as_a_choice(self):
        """The navbar and footer are drawn unconditionally.

        Offering them would give the merchant a switch that does nothing.
        """
        offered = {s["type"] for s in bp.catalogue()["sections"]}
        assert not (offered & bp.ALWAYS_ON)

    def test_every_offered_section_carries_placeholder_copy(self):
        """The preview has to show a section the store has no row for yet."""
        for option in bp.catalogue()["sections"]:
            assert option["default_settings"], option["type"]

    def test_defaults_are_a_submittable_answer_set(self):
        """The merchant can click Continue six times and get a valid shop."""
        serializer = BlueprintApplySerializer(data=bp.catalogue("beauty")["defaults"])
        assert serializer.is_valid(), serializer.errors


# ── Apply ─────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestApply:
    def test_writes_the_chosen_palette_type_and_style(self):
        store = make_store()
        bp.apply(
            store,
            category="electronics",
            palette="midnight",
            pairing="inter_inter",
            style_kit="direct",
            sections=[SectionType.HERO, SectionType.CATALOG],
        )
        config = StorefrontConfig.objects.get(store=store)
        expected = bp.config_patch("midnight", "inter_inter", "direct")
        for field, value in expected.items():
            assert getattr(config, field) == value, field

    def test_records_the_category_on_the_merchant(self):
        """The answer drives presets for every store created afterwards."""
        store = make_store(business_type="fashion")
        bp.apply(
            store,
            category="food",
            palette="terracotta",
            pairing="poppins_inter",
            style_kit="soft",
            sections=[SectionType.HERO, SectionType.CATALOG],
        )
        store.merchant.refresh_from_db()
        assert store.merchant.business_type == "food"

    def test_keeps_copy_the_merchant_wrote(self):
        """Re-running the wizard is a look change, not a content reset."""
        store = make_store()
        hero = rows(store)[SectionType.HERO]
        hero.settings = {**hero.settings, "headline": "MY OWN WORDS"}
        hero.save()

        bp.apply(
            store,
            category="beauty",
            palette="rose_clay",
            pairing="raleway_lato",
            style_kit="boutique",
            sections=[SectionType.HERO, SectionType.CATALOG],
        )
        assert rows(store)[SectionType.HERO].settings["headline"] == "MY OWN WORDS"

    def test_seeds_copy_only_for_sections_that_have_none(self):
        store = make_store(with_sections=False)
        bp.apply(
            store,
            category="retail",
            palette="violet_ink",
            pairing="outfit_inter",
            style_kit="soft",
            sections=[SectionType.HERO, SectionType.CATALOG],
        )
        assert rows(store)[SectionType.HERO].settings

    def test_disables_deselected_sections_instead_of_deleting_them(self):
        """Switching a section back on later must bring its copy back."""
        store = make_store()
        about = rows(store).get(SectionType.ABOUT)
        if about is None:  # not present in every preset
            about = StorefrontSection.objects.create(
                store=store,
                type=SectionType.ABOUT,
                order=9,
                enabled=True,
                settings={"body": "KEEP ME"},
            )
        else:
            about.settings = {**about.settings, "body": "KEEP ME"}
            about.save()

        bp.apply(
            store,
            category="retail",
            palette="violet_ink",
            pairing="outfit_inter",
            style_kit="soft",
            sections=[SectionType.HERO, SectionType.CATALOG],
        )
        after = rows(store)[SectionType.ABOUT]
        assert after.enabled is False
        assert after.settings["body"] == "KEEP ME"

    def test_never_disables_the_navbar_or_footer(self):
        store = make_store()
        bp.apply(
            store,
            category="retail",
            palette="violet_ink",
            pairing="outfit_inter",
            style_kit="soft",
            sections=[SectionType.HERO, SectionType.CATALOG],
        )
        current = rows(store)
        for section_type in bp.ALWAYS_ON:
            row = current.get(section_type)
            if row is not None:
                assert row.enabled is True, section_type

    def test_never_disables_the_enquiry_form(self):
        """A service business's quote request is not the wizard's to remove.

        The homepage step offers no switch for the enquiry form — the row is
        created by the enquiry-form builder, and the services preset ships one
        enabled. So it can never appear in the posted ``sections``, and an apply
        that read that absence as "deselected" switched off the only way a
        photographer gets asked to price a wedding.
        """
        store = make_store(business_type="services")
        assert rows(store)[SectionType.CONTACT_FORM].enabled is True

        bp.apply(
            store,
            category="services",
            palette="ocean",
            pairing="outfit_nunito",
            style_kit="soft",
            sections=[SectionType.HERO, SectionType.CATALOG],
        )
        assert rows(store)[SectionType.CONTACT_FORM].enabled is True

    def test_forces_required_sections_on_even_if_omitted(self):
        """A homepage with nothing to buy is not a shop."""
        store = make_store()
        bp.apply(
            store,
            category="retail",
            palette="violet_ink",
            pairing="outfit_inter",
            style_kit="soft",
            sections=[SectionType.HERO],
        )
        current = rows(store)
        for section_type in bp.REQUIRED_SECTIONS:
            assert current[section_type].enabled is True, section_type

    def test_creates_a_footer_row_when_the_store_has_none(self):
        """The renderer reads footer copy from the section list."""
        store = make_store(with_sections=False)
        bp.apply(
            store,
            category="retail",
            palette="violet_ink",
            pairing="outfit_inter",
            style_kit="soft",
            sections=[SectionType.HERO, SectionType.CATALOG],
        )
        assert SectionType.FOOTER in rows(store)

    def test_announcement_bar_sits_above_everything_else(self):
        store = make_store()
        bp.apply(
            store,
            category="retail",
            palette="violet_ink",
            pairing="outfit_inter",
            style_kit="soft",
            sections=[
                SectionType.HERO,
                SectionType.CATALOG,
                SectionType.ANNOUNCEMENT_BAR,
            ],
        )
        current = rows(store)
        bar = current[SectionType.ANNOUNCEMENT_BAR].order
        assert bar < current[SectionType.HERO].order
        assert bar < current[SectionType.CATALOG].order

    def test_order_follows_the_posted_sequence(self):
        """The list the wizard posts back is already the homepage layout."""
        store = make_store()
        wanted = [SectionType.CATALOG, SectionType.ABOUT, SectionType.HERO]
        bp.apply(
            store,
            category="retail",
            palette="violet_ink",
            pairing="outfit_inter",
            style_kit="soft",
            sections=wanted,
        )
        current = rows(store)
        orders = [current[t].order for t in wanted]
        assert orders == sorted(orders), orders

    def test_applies_a_draft_and_does_not_publish(self):
        """Nothing reaches shoppers until the merchant presses Publish."""
        store = make_store()
        bp.apply(
            store,
            category="retail",
            palette="violet_ink",
            pairing="outfit_inter",
            style_kit="soft",
            sections=[SectionType.HERO, SectionType.CATALOG],
        )
        config = StorefrontConfig.objects.get(store=store)
        assert not config.published_config
        assert config.published_at is None

    def test_is_idempotent(self):
        store = make_store()
        answers = dict(
            category="beauty",
            palette="rose_clay",
            pairing="raleway_lato",
            style_kit="boutique",
            sections=[SectionType.HERO, SectionType.ABOUT, SectionType.CATALOG],
        )
        bp.apply(store, **answers)
        first = {t: (s.order, s.enabled) for t, s in rows(store).items()}
        bp.apply(store, **answers)
        assert {t: (s.order, s.enabled) for t, s in rows(store).items()} == first

    def test_works_on_a_store_with_no_config_or_sections_yet(self):
        store = make_store(with_sections=False)
        assert not StorefrontConfig.objects.filter(store=store).exists()
        bp.apply(
            store,
            category="digital",
            palette="ocean",
            pairing="outfit_inter",
            style_kit="soft",
            sections=[SectionType.HERO, SectionType.CATALOG],
        )
        assert StorefrontConfig.objects.filter(store=store).exists()
        assert rows(store)

    def test_every_catalogue_default_applies_cleanly(self):
        """Whatever the wizard opens on must survive being submitted."""
        for category in bp.CATEGORIES:
            store = make_store(business_type=category)
            bp.apply(store, **bp.catalogue(category)["defaults"])
            current = rows(store)
            for section_type in bp.REQUIRED_SECTIONS:
                assert current[section_type].enabled is True, (category, section_type)


# ── Answer validation ─────────────────────────────────────────────────────────

class TestApplySerializer:
    """Answers are checked against the curated catalogue, not the model.

    The model would accept any hex colour with any button shape. Blueprint
    promises that no answer set produces an ugly shop, which only holds if
    the answers stay inside the combinations it curated.
    """

    def _answers(self, **overrides):
        return {**bp.catalogue("retail")["defaults"], **overrides}

    @pytest.mark.parametrize(
        "field,value",
        [
            ("category", "aerospace"),
            ("palette", "#ff00ff"),
            ("pairing", "comic_sans"),
            ("style_kit", "brutalist"),
        ],
    )
    def test_rejects_an_option_it_does_not_offer(self, field, value):
        serializer = BlueprintApplySerializer(data=self._answers(**{field: value}))
        assert not serializer.is_valid()
        assert field in serializer.errors

    def test_rejects_a_section_it_does_not_offer(self):
        serializer = BlueprintApplySerializer(
            data=self._answers(sections=[SectionType.HERO, "testimonials"])
        )
        assert not serializer.is_valid()
        assert "sections" in serializer.errors

    def test_rejects_an_always_on_section_as_an_answer(self):
        serializer = BlueprintApplySerializer(
            data=self._answers(sections=[SectionType.HERO, SectionType.FOOTER])
        )
        assert not serializer.is_valid()

    def test_rejects_a_repeated_section(self):
        """Order becomes the layout, so a repeat is ambiguous."""
        serializer = BlueprintApplySerializer(
            data=self._answers(sections=[SectionType.HERO, SectionType.HERO])
        )
        assert not serializer.is_valid()
        assert "sections" in serializer.errors

    def test_accepts_an_empty_section_list(self):
        """apply() adds the required sections back; this is not an error."""
        serializer = BlueprintApplySerializer(data=self._answers(sections=[]))
        assert serializer.is_valid(), serializer.errors


# ── Endpoints ─────────────────────────────────────────────────────────────────

CATALOGUE_URL = "/api/v1/storefront/blueprint/"
APPLY_URL = "/api/v1/storefront/blueprint/apply/"


def as_merchant(store):
    """An APIClient authenticated as ``store``'s owner."""
    client = APIClient()
    client.force_authenticate(user=store.merchant.user)
    return client


@pytest.mark.django_db
class TestBlueprintEndpoints:
    def test_catalogue_requires_authentication(self):
        assert APIClient().get(CATALOGUE_URL).status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

    def test_apply_requires_authentication(self):
        assert APIClient().post(APPLY_URL, {}, format="json").status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

    def test_catalogue_returns_everything_the_wizard_renders(self):
        store = make_store()
        response = as_merchant(store).get(f"{CATALOGUE_URL}?store_id={store.id}")
        assert response.status_code == status.HTTP_200_OK
        for key in ("categories", "palettes", "pairings", "style_kits", "sections",
                    "defaults", "current"):
            assert key in response.data, key
        assert response.data["categories"][0]["recommends"]["palette"]

    def test_catalogue_creates_the_config_before_the_wizard_reads_sections(self):
        """The wizard loads the catalogue first and relies on this.

        A store with no config would otherwise open the homepage step on an
        empty list, so this endpoint has to be the one that seeds it.
        """
        store = make_store(with_sections=False)
        assert not StorefrontConfig.objects.filter(store=store).exists()
        as_merchant(store).get(f"{CATALOGUE_URL}?store_id={store.id}")
        assert StorefrontConfig.objects.filter(store=store).exists()
        assert store.storefront_sections.exists()

    def test_apply_writes_a_draft(self):
        store = make_store()
        answers = bp.catalogue("beauty")["defaults"]
        response = as_merchant(store).post(
            f"{APPLY_URL}?store_id={store.id}", answers, format="json"
        )
        assert response.status_code == status.HTTP_200_OK, response.data
        config = StorefrontConfig.objects.get(store=store)
        assert config.primary_color == bp.PALETTES[answers["palette"]]["colors"]["primary_color"]
        assert not config.published_config

    def test_a_services_store_can_click_straight_through_the_wizard(self):
        """The frontend seeds the homepage step from ``current`` and posts it back.

        A services store opens with an enquiry form its preset switched on and
        the menu has no switch for, so echoing the endpoint's own answer used to
        come back a 400 naming ``contact_form`` — the wizard refused a section
        the merchant was never shown, on the pass where they changed nothing.
        """
        store = make_store(business_type="services")
        client = as_merchant(store)

        read = client.get(f"{CATALOGUE_URL}?store_id={store.id}")
        assert read.status_code == status.HTTP_200_OK
        current = read.data["current"]
        assert SectionType.CONTACT_FORM not in current["sections"]

        answers = {**read.data["defaults"], "sections": current["sections"]}
        applied = client.post(
            f"{APPLY_URL}?store_id={store.id}", answers, format="json"
        )
        assert applied.status_code == status.HTTP_200_OK, applied.data
        # And the form itself is still there to be filled in.
        assert rows(store)[SectionType.CONTACT_FORM].enabled is True

    def test_apply_rejects_an_uncurated_answer(self):
        store = make_store()
        response = as_merchant(store).post(
            f"{APPLY_URL}?store_id={store.id}",
            {**bp.catalogue("retail")["defaults"], "palette": "#ff00ff"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "palette" in response.data

    def test_cannot_apply_to_another_merchants_store(self):
        """store_id is scoped to the caller's own stores."""
        mine = make_store(business_type="fashion")
        theirs = make_store(business_type="beauty")
        response = as_merchant(mine).post(
            f"{APPLY_URL}?store_id={theirs.id}",
            bp.catalogue("retail")["defaults"],
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not StorefrontConfig.objects.filter(store=theirs).exists()

    def test_cannot_read_the_catalogue_for_another_merchants_store(self):
        mine = make_store(business_type="fashion")
        theirs = make_store(business_type="beauty")
        response = as_merchant(mine).get(f"{CATALOGUE_URL}?store_id={theirs.id}")
        assert response.status_code == status.HTTP_403_FORBIDDEN
