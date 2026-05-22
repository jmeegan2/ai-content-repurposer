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

    now = datetime.now(timezone.utc).isoformat()

    # BUG: no idempotency check — Stripe retries webhooks on timeout/5xx, so this
    # handler can fire multiple times for the same event, adding credits repeatedly.
    # Fix: store processed event IDs (event["id"]) in a DB table and skip duplicates.
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("metadata", {}).get("userId")
        session_type = session.get("metadata", {}).get("type")
        if user_id:
            if session_type == "topup":
                add_credits(supabase, user_id, 100)
            else:
                supabase.table("profiles").upsert({
                    "id": user_id,
                    "subscription_status": "active",
                    "updated_at": now,
                }).execute()
                reset_monthly_credits(supabase, user_id)

    elif event["type"] == "invoice.payment_succeeded":
        invoice = event["data"]["object"]
        # Only reset on subscription renewals, not the initial charge (covered by checkout.session.completed)
        if invoice.get("billing_reason") == "subscription_cycle":
            customer_id = invoice["customer"] if isinstance(invoice["customer"], str) else invoice["customer"]["id"]
            profile = supabase.table("profiles").select("id").eq("stripe_customer_id", customer_id).single().execute()
            if profile.data:
                reset_monthly_credits(supabase, profile.data["id"])

    elif event["type"] == "customer.subscription.updated":
        sub = event["data"]["object"]
        customer_id = sub["customer"] if isinstance(sub["customer"], str) else sub["customer"]["id"]
        supabase.table("profiles").update({
            "subscription_status": sub["status"],
            "updated_at": now,
        }).eq("stripe_customer_id", customer_id).execute()

    # MISSING: no handler for charge.refunded — if a user gets a monetary refund via
    # the customer portal or support, their credits are not clawed back.
    elif event["type"] == "customer.subscription.deleted":
        sub = event["data"]["object"]
        customer_id = sub["customer"] if isinstance(sub["customer"], str) else sub["customer"]["id"]
        supabase.table("profiles").update({
            "subscription_status": "inactive",
            "updated_at": now,
        }).eq("stripe_customer_id", customer_id).execute()

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
