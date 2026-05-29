import logging
import os
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from middleware.auth import require_auth
from services.credits import add_credits, get_profile, reset_monthly_credits
from services.stripe_service import (
    create_checkout_session,
    create_portal_session,
    create_topup_checkout_session,
    get_or_create_customer,
)
from services.supabase_client import supabase

logger = logging.getLogger(__name__)

# NOTE: Webhook payloads are StripeObjects — use [] not .get()
# WARNING: Claude will hallucinate Stripe field names — always verify against the docs links below.
# Claude can fetch them directly by appending ".md" to any link (e.g. WebFetch url.md).
#
# Event                            Object        Docs
# -------------------------------- ------------- ------------------------------------------------
# checkout.session.completed       Session       https://docs.stripe.com/api/checkout/sessions/object
#   metadata.type = "topup"        → add 100 credits
#   metadata.type = "subscription" → set active, reset credits
#
# invoice.payment_succeeded        Invoice       https://docs.stripe.com/api/invoices/object
#   billing_reason = "subscription_cycle" → reset credits (others skipped)
#
# customer.subscription.updated    Subscription  https://docs.stripe.com/api/subscriptions/object
#   status = active | paused | past_due | ...
#
# customer.subscription.deleted    Subscription  (same object, always → inactive)
#
# charge.refunded                  Charge        https://docs.stripe.com/api/charges/object
#   metadata.type = "topup"        → claw back 100 credits
#   else                           → inactive + zero credits

webhook_router = APIRouter()
router = APIRouter()

_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")


def _customer_id(value) -> str:
    return value if isinstance(value, str) else value["id"]


def _profile_by_customer(customer_id: str):
    return supabase.table("profiles").select("id, credits_remaining").eq("stripe_customer_id", customer_id).single().execute()


def _is_duplicate_event(event_id: str) -> bool:
    existing = supabase.table("stripe_webhook_events").select("event_id").eq("event_id", event_id).execute()
    if existing.data:
        logger.info("Duplicate event skipped event_id=%s", event_id)
        return True
    try:
        supabase.table("stripe_webhook_events").insert({"event_id": event_id}).execute()
        logger.info("New event recorded event_id=%s", event_id)
    except Exception:
        logger.exception("Failed to record event_id=%s in stripe_webhook_events", event_id)
    return False


def _handle_checkout_session_completed(session, now: str) -> None:
    try:
        metadata = session["metadata"] or {}
        user_id = metadata["userId"]

        if "type" in metadata and metadata["type"] == "topup":
            logger.info("Adding 100 credits (topup) to user_id=%s session_id=%s", user_id, session["id"])
            try:
                add_credits(supabase, user_id, 100)
                logger.info("Successfully added 100 credits to user_id=%s", user_id)
            except Exception:
                logger.exception("Failed to add credits to user_id=%s session_id=%s", user_id, session["id"])
            return

        logger.info("Setting subscription to active for user_id=%s session_id=%s", user_id, session["id"])
        try:
            supabase.table("profiles").upsert({
                "id": user_id,
                "subscription_status": "active",
                "updated_at": now,
            }).execute()
            logger.info("Successfully set subscription_status=active for user_id=%s", user_id)
        except Exception:
            logger.exception("Failed to set subscription_status=active for user_id=%s", user_id)

        logger.info("Resetting monthly credits for user_id=%s", user_id)
        try:
            reset_monthly_credits(supabase, user_id)
            logger.info("Successfully reset monthly credits for user_id=%s", user_id)
        except Exception:
            logger.exception("Failed to reset monthly credits for user_id=%s", user_id)

    except Exception:
        logger.exception(
            "Error handling checkout.session.completed session_id=%s",
            session["id"],
        )

def _handle_invoice_payment_succeeded(invoice) -> None:
    # Only reset on subscription renewals; initial charge is covered by checkout.session.completed.
    if invoice["billing_reason"] != "subscription_cycle":
        logger.info(
            "Skipping invoice.payment_succeeded billing_reason=%s invoice_id=%s",
            invoice["billing_reason"],
            invoice["id"],
        )
        return
    customer_id = _customer_id(invoice["customer"])
    logger.info("Processing subscription renewal for customer_id=%s invoice_id=%s", customer_id, invoice["id"])
    try:
        profile = supabase.table("profiles").select("id").eq("stripe_customer_id", customer_id).single().execute()
    except Exception:
        logger.exception("Failed to look up profile for customer_id=%s", customer_id)
        return
    if profile.data:
        user_id = profile.data["id"]
        logger.info("Resetting monthly credits for user_id=%s (subscription renewal)", user_id)
        try:
            reset_monthly_credits(supabase, user_id)
            logger.info("Successfully reset monthly credits for user_id=%s", user_id)
        except Exception:
            logger.exception("Failed to reset monthly credits for user_id=%s", user_id)
    else:
        logger.warning("No profile found for customer_id=%s — skipping credit reset", customer_id)


def _handle_subscription_updated(sub: dict, now: str) -> None:
    customer_id = _customer_id(sub["customer"])
    logger.info(
        "Setting subscription_status=%s for customer_id=%s sub_id=%s",
        sub["status"],
        customer_id,
        sub["id"],
    )
    try:
        supabase.table("profiles").update({
            "subscription_status": sub["status"],
            "updated_at": now,
        }).eq("stripe_customer_id", customer_id).execute()
        logger.info("Successfully updated subscription_status=%s for customer_id=%s", sub["status"], customer_id)
    except Exception:
        logger.exception(
            "Failed to update subscription_status=%s for customer_id=%s",
            sub["status"],
            customer_id,
        )


def _handle_subscription_deleted(sub: dict, now: str) -> None:
    customer_id = _customer_id(sub["customer"])
    logger.info("Setting subscription to inactive for customer_id=%s sub_id=%s", customer_id, sub["id"])
    try:
        supabase.table("profiles").update({
            "subscription_status": "inactive",
            "updated_at": now,
        }).eq("stripe_customer_id", customer_id).execute()
        logger.info("Successfully set subscription_status=inactive for customer_id=%s", customer_id)
    except Exception:
        logger.exception("Failed to set subscription_status=inactive for customer_id=%s", customer_id)


def _handle_charge_refunded(charge, now: str) -> None:
    """
    will come back to this later and change it to so we have a table for payments and can easily refund charges instead of using a metadata hack
    """

    customer_id = charge["customer"]
    if not customer_id:
        logger.info("charge.refunded has no customer — skipping charge_id=%s", charge["id"])
        return
    try:
        profile = _profile_by_customer(_customer_id(customer_id))
    except Exception:
        logger.exception("Failed to look up profile for customer_id=%s charge_id=%s", customer_id, charge["id"])
        return
    if not profile.data:
        logger.warning("No profile found for customer_id=%s — skipping refund charge_id=%s", customer_id, charge["id"])
        return
    user_id = profile.data["id"]
    if "type" in charge["metadata"] and charge["metadata"]["type"] == "topup":
        # Top-up refund — claw back 100 credits (floor at 0).
        new_credits = max(0, profile.data["credits_remaining"] - 100)
        logger.info(
            "Clawing back 100 credits (topup refund) from user_id=%s credits_remaining=%d→%d charge_id=%s",
            user_id,
            profile.data["credits_remaining"],
            new_credits,
            charge["id"],
        )
        try:
            supabase.table("profiles").update({
                "credits_remaining": new_credits,
                "updated_at": now,
            }).eq("id", user_id).execute()
            logger.info("Successfully clawed back credits for user_id=%s new_credits=%d", user_id, new_credits)
        except Exception:
            logger.exception("Failed to claw back credits for user_id=%s charge_id=%s", user_id, charge["id"])
    else:
        # Subscription refund — revoke subscription and zero out credits.
        logger.info(
            "Revoking subscription and zeroing credits (subscription refund) for user_id=%s charge_id=%s",
            user_id,
            charge["id"],
        )
        try:
            supabase.table("profiles").update({
                "subscription_status": "inactive",
                "credits_remaining": 0,
                "updated_at": now,
            }).eq("id", user_id).execute()
            logger.info("Successfully revoked subscription for user_id=%s", user_id)
        except Exception:
            logger.exception("Failed to revoke subscription for user_id=%s charge_id=%s", user_id, charge["id"])


@webhook_router.post("/webhook")
async def stripe_webhook(request: Request) -> dict:
    payload = await request.body()
    sig = request.headers.get("stripe-signature")

    if not sig:
        raise HTTPException(status_code=400, detail="Missing stripe-signature header")

    try:
        event = stripe.Webhook.construct_event(payload, sig, _WEBHOOK_SECRET)
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    event_type = event["type"]
    event_id = event["id"]
    obj = event["data"]["object"]
    customer_id = _customer_id(obj["customer"]) if obj.get("customer") else "n/a"
    logger.info(
        "Received Stripe event type=%s event_id=%s customer_id=%s",
        event_type,
        event_id,
        customer_id,
    )

    if _is_duplicate_event(event_id):
        return {"received": True}

    now = datetime.now(timezone.utc).isoformat()

    if event_type == "checkout.session.completed":
        _handle_checkout_session_completed(obj, now)
    elif event_type == "invoice.payment_succeeded":
        _handle_invoice_payment_succeeded(obj)
    elif event_type == "customer.subscription.updated":
        _handle_subscription_updated(obj, now)
    elif event_type == "customer.subscription.deleted":
        _handle_subscription_deleted(obj, now)
    elif event_type == "charge.refunded":
        _handle_charge_refunded(obj, now)
    else:
        logger.info("Unhandled event type=%s event_id=%s — ignoring", event_type, event_id)

    return {"received": True}


class CheckoutRequest(BaseModel):
    email: str


@router.post("/create-checkout-session")
def create_checkout(body: CheckoutRequest, user_id: str = Depends(require_auth)) -> dict:
    if not body.email:
        raise HTTPException(status_code=400, detail="Email required")
    profile = supabase.table("profiles").select("subscription_status").eq("id", user_id).single().execute()
    if profile.data and profile.data.get("subscription_status") == "active":
        raise HTTPException(status_code=400, detail="Already have an active subscription")
    try:
        customer_id = get_or_create_customer(user_id, body.email)
        url = create_checkout_session(customer_id, user_id)
        return {"url": url}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to create checkout session")


@router.post("/create-portal-session")
def create_portal(user_id: str = Depends(require_auth)) -> dict:
    profile = supabase.table("profiles").select("stripe_customer_id").eq("id", user_id).single().execute()

    if not profile.data or not profile.data.get("stripe_customer_id"):
        raise HTTPException(status_code=400, detail="No Stripe customer found for this user")

    try:
        url = create_portal_session(profile.data["stripe_customer_id"])
        return {"url": url}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to create portal session")


@router.get("/credits")
def get_credits(user_id: str = Depends(require_auth)) -> dict:
    profile = get_profile(supabase, user_id)
    return {
        "credits_remaining": profile["credits_remaining"],
        "credits_used": profile["credits_used"],
        "subscription_status": profile["subscription_status"],
    }


@router.post("/create-topup-session")
def create_topup(body: CheckoutRequest, user_id: str = Depends(require_auth)) -> dict:
    if not body.email:
        raise HTTPException(status_code=400, detail="Email required")
    try:
        customer_id = get_or_create_customer(user_id, body.email)
        url = create_topup_checkout_session(customer_id, user_id)
        return {"url": url}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to create top-up session")
