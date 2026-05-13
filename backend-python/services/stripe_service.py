import os
import stripe
from datetime import datetime, timezone
from services.supabase_client import supabase

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
_PRICE_ID = os.environ.get("STRIPE_PRICE_ID", "")
_FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")


def get_or_create_customer(user_id: str, email: str) -> str:
    profile = supabase.table("profiles").select("stripe_customer_id").eq("id", user_id).single().execute()

    if profile.data and profile.data.get("stripe_customer_id"):
        return profile.data["stripe_customer_id"]

    customer = stripe.Customer.create(email=email, metadata={"supabaseUserId": user_id})

    supabase.table("profiles").upsert({
        "id": user_id,
        "stripe_customer_id": customer.id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    return customer.id


def create_checkout_session(customer_id: str, user_id: str) -> str:
    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        payment_method_types=["card"],
        line_items=[{"price": _PRICE_ID, "quantity": 1}],
        success_url=f"{_FRONTEND_URL}/?checkout=success",
        cancel_url=f"{_FRONTEND_URL}/",
        metadata={"userId": user_id},
    )
    return session.url


def create_portal_session(customer_id: str) -> str:
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{_FRONTEND_URL}/",
    )
    return session.url
