import os
from datetime import datetime, timezone
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from middleware.auth import require_auth
from services.supabase_client import supabase
from services.stripe_service import get_or_create_customer, create_checkout_session, create_portal_session, create_topup_checkout_session
from services.credits import reset_monthly_credits, add_credits

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
        return True
    supabase.table("stripe_webhook_events").insert({"event_id": event_id}).execute()
    return False


def _handle_checkout_session_completed(session: dict, now: str) -> None:
    user_id = session.get("metadata", {}).get("userId")
    if not user_id:
        return
    if session.get("metadata", {}).get("type") == "topup":
        add_credits(supabase, user_id, 100)
    else:
        supabase.table("profiles").upsert({
            "id": user_id,
            "subscription_status": "active",
            "updated_at": now,
        }).execute()
        reset_monthly_credits(supabase, user_id)


def _handle_invoice_payment_succeeded(invoice: dict) -> None:
    # Only reset on subscription renewals; initial charge is covered by checkout.session.completed.
    if invoice.get("billing_reason") != "subscription_cycle":
        return
    customer_id = _customer_id(invoice["customer"])
    profile = supabase.table("profiles").select("id").eq("stripe_customer_id", customer_id).single().execute()
    if profile.data:
        reset_monthly_credits(supabase, profile.data["id"])


def _handle_subscription_updated(sub: dict, now: str) -> None:
    customer_id = _customer_id(sub["customer"])
    supabase.table("profiles").update({
        "subscription_status": sub["status"],
        "updated_at": now,
    }).eq("stripe_customer_id", customer_id).execute()


def _handle_subscription_deleted(sub: dict, now: str) -> None:
    customer_id = _customer_id(sub["customer"])
    supabase.table("profiles").update({
        "subscription_status": "inactive",
        "updated_at": now,
    }).eq("stripe_customer_id", customer_id).execute()


def _handle_charge_refunded(charge: dict, now: str) -> None:
    customer_id = charge.get("customer")
    if not customer_id:
        return
    profile = _profile_by_customer(_customer_id(customer_id))
    if not profile.data:
        return
    user_id = profile.data["id"]
    if charge.get("invoice"):
        # Subscription refund — revoke subscription and zero out credits.
        supabase.table("profiles").update({
            "subscription_status": "inactive",
            "credits_remaining": 0,
            "updated_at": now,
        }).eq("id", user_id).execute()
    else:
        # Top-up refund — claw back 100 credits (floor at 0).
        new_credits = max(0, profile.data["credits_remaining"] - 100)
        supabase.table("profiles").update({
            "credits_remaining": new_credits,
            "updated_at": now,
        }).eq("id", user_id).execute()


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

    if _is_duplicate_event(event["id"]):
        return {"received": True}

    now = datetime.now(timezone.utc).isoformat()
    obj = event["data"]["object"]

    if event["type"] == "checkout.session.completed":
        _handle_checkout_session_completed(obj, now)
    elif event["type"] == "invoice.payment_succeeded":
        _handle_invoice_payment_succeeded(obj)
    elif event["type"] == "customer.subscription.updated":
        _handle_subscription_updated(obj, now)
    elif event["type"] == "customer.subscription.deleted":
        _handle_subscription_deleted(obj, now)
    elif event["type"] == "charge.refunded":
        _handle_charge_refunded(obj, now)

    return {"received": True}


class CheckoutRequest(BaseModel):
    email: str


@router.post("/create-checkout-session")
def create_checkout(body: CheckoutRequest, user_id: str = Depends(require_auth)) -> dict:
    if not body.email:
        raise HTTPException(status_code=400, detail="Email required")
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
    from services.credits import get_profile
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
