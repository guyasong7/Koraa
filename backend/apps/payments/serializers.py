"""Request shapes for the billing endpoints.

Only the mobile money fields live here. ``plan`` and ``billing_cycle`` stay in
``InitiatePaymentView``: the free plan is not a purchase and short-circuits
before any of this is read, so validating it as one field set would either
demand a phone number to cancel a subscription or make ``phone`` optional on the
path where it is mandatory.
"""

from rest_framework import serializers

from . import fapshi


class SubscriptionChargeRequestSerializer(serializers.Serializer):
    """The mobile money number to charge for a plan.

    Deliberately the same shape as ``orders.OrderChargeRequestSerializer`` —
    both post to ``fapshi.direct_pay`` and the dashboard and the storefront send
    an identical payload, so a divergence here would be two spellings of one
    contract.

    ``phone`` is normalised here rather than in the view so a mistyped number
    comes back as a 400 against the field that caused it, before anything
    reaches Fapshi.
    """

    phone = serializers.CharField(max_length=20)
    #: Omitted means "let Fapshi work it out from the prefix", which its own docs
    #: recommend over a caller-supplied guess. Sent only when the merchant
    #: overrode the pre-selection, so a stale prefix table of ours cannot
    #: misroute a charge.
    medium = serializers.ChoiceField(
        choices=[
            (fapshi.MEDIUM_MTN, "MTN MoMo"),
            (fapshi.MEDIUM_ORANGE, "Orange Money"),
        ],
        required=False,
        allow_blank=True,
    )

    def validate_phone(self, raw):
        try:
            return fapshi.normalise_msisdn(raw)
        except fapshi.FapshiRejected as exc:
            # The message names what is wrong with the number and is written for
            # a person to read; see ``normalise_msisdn``.
            raise serializers.ValidationError(str(exc)) from exc
