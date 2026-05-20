from datetime import datetime, timezone
from fastapi import HTTPException


def get_profile(supabase, user_id: str) -> dict:
    resp = supabase.table("profiles").select("credits_remaining, credits_used, subscription_status").eq("id", user_id).single().execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return resp.data


def deduct_credits(supabase, user_id: str, amount: int) -> None:
    profile = get_profile(supabase, user_id)
    remaining = profile["credits_remaining"]
    if remaining < amount:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "insufficient_credits",
                "credits_needed": amount,
                "credits_remaining": remaining,
            },
        )
    supabase.table("profiles").update({
        "credits_remaining": remaining - amount,
        "credits_used": profile["credits_used"] + amount,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", user_id).execute()


def add_credits(supabase, user_id: str, amount: int) -> None:
    profile = get_profile(supabase, user_id)
    supabase.table("profiles").update({
        "credits_remaining": profile["credits_remaining"] + amount,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", user_id).execute()


def reset_monthly_credits(supabase, user_id: str) -> None:
    supabase.table("profiles").update({
        "credits_remaining": 150,
        "credits_used": 0,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", user_id).execute()
