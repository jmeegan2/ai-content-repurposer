import os
from datetime import datetime, timezone
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from middleware.auth import require_auth
from services.supabase_client import supabase
from services.stripe_service import get_or_create_customer, create_checkout_session, create_portal_session

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

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("metadata", {}).get("userId")
        if user_id:
            supabase.table("profiles").upsert({
                "id": user_id,
                "subscription_status": "active",
                "updated_at": now,
            }).execute()

    elif event["type"] == "customer.subscription.updated":
        sub = event["data"]["object"]
        customer_id = sub["customer"] if isinstance(sub["customer"], str) else sub["customer"]["id"]
        supabase.table("profiles").update({
            "subscription_status": sub["status"],
            "updated_at": now,
        }).eq("stripe_customer_id", customer_id).execute()

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
