from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

import stripe

from app.config import settings


@dataclass
class PaymentIntentData:
    intent_id: str
    client_secret: str


def _is_stripe_backend() -> bool:
    return settings.PAYMENT_BACKEND == "stripe"


def _set_stripe_api_key() -> None:
    stripe.api_key = settings.STRIPE_SECRET_KEY


def create_payment_intent(
    *,
    amount_cents: int,
    currency: str,
    booking_id: str,
    user_email: str,
) -> PaymentIntentData:
    if _is_stripe_backend():
        _set_stripe_api_key()
        intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency=currency.lower(),
            receipt_email=user_email,
            metadata={"booking_id": booking_id},
            automatic_payment_methods={"enabled": True},
        )
        return PaymentIntentData(intent_id=intent["id"], client_secret=intent["client_secret"])

    intent_suffix = uuid4().hex[:18]
    return PaymentIntentData(
        intent_id=f"pi_stub_{intent_suffix}",
        client_secret=f"pi_client_secret_stub_{intent_suffix}",
    )


def get_payment_intent_session(
    *,
    payment_intent_id: str | None,
    amount_cents: int,
    currency: str,
    booking_id: str,
    user_email: str,
) -> PaymentIntentData:
    if _is_stripe_backend():
        _set_stripe_api_key()
        if payment_intent_id:
            intent = stripe.PaymentIntent.retrieve(payment_intent_id)
        else:
            intent = stripe.PaymentIntent.create(
                amount=amount_cents,
                currency=currency.lower(),
                receipt_email=user_email,
                metadata={"booking_id": booking_id},
                automatic_payment_methods={"enabled": True},
            )
        return PaymentIntentData(intent_id=intent["id"], client_secret=intent["client_secret"])

    if payment_intent_id and payment_intent_id.startswith("pi_stub_"):
        suffix = payment_intent_id.removeprefix("pi_stub_")
    else:
        suffix = uuid4().hex[:18]
    return PaymentIntentData(
        intent_id=f"pi_stub_{suffix}",
        client_secret=f"pi_client_secret_stub_{suffix}",
    )


def create_refund(*, payment_intent_id: str | None, amount_cents: int) -> str:
    if _is_stripe_backend():
        if not payment_intent_id:
            raise ValueError("Payment intent is required for Stripe refunds")
        _set_stripe_api_key()
        intent = stripe.PaymentIntent.retrieve(payment_intent_id, expand=["latest_charge"])
        latest_charge = intent.get("latest_charge")
        charge_id = latest_charge.get("id") if isinstance(latest_charge, dict) else latest_charge
        if not charge_id:
            raise ValueError("Stripe charge not found for refund")
        refund = stripe.Refund.create(charge=charge_id, amount=amount_cents)
        return refund["id"]

    return f"re_stub_{uuid4().hex[:18]}"
