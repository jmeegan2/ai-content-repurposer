from datetime import datetime, timezone
from fastapi import HTTPException


def get_profile(supabase, user_id: str) -> dict:
    try:
        resp = supabase.table("profiles").select("credits_remaining, credits_used, subscription_status").eq("id", user_id).single().execute()
        return resp.data
    except Exception:
        raise HTTPException(status_code=404, detail="Profile not found")


def check_credits(supabase, user_id: str, amount: int) -> None:
    profile = get_profile(supabase, user_id)
    if profile["credits_remaining"] < amount:
        raise HTTPException(
            status_code=402,
            detail=f"Not enough credits. You need {amount} but only have {profile['credits_remaining']} remaining.",
        )


def deduct_credits(supabase, user_id: str, amount: int) -> None:
    resp = supabase.rpc("deduct_credits", {"p_user_id": user_id, "p_amount": amount}).execute()
    if not resp.data:
        profile = get_profile(supabase, user_id)
        raise HTTPException(
            status_code=402,
            detail=f"Not enough credits. You need {amount} but only have {profile['credits_remaining']} remaining.",
        )


def add_credits(supabase, user_id: str, amount: int) -> None:
    profile = get_profile(supabase, user_id)
    supabase.table("profiles").update({
        "credits_remaining": profile["credits_remaining"] + amount,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", user_id).execute()


def refund_job_credits(supabase, job_id: str, user_id: str) -> int:
    """Refund credits for a job. Idempotent — returns 0 if already refunded."""
    job = supabase.table("jobs").select("credits_deducted").eq("id", job_id).single().execute()
    amount = (job.data or {}).get("credits_deducted", 0)
    if amount <= 0:
        return 0
    # atomic: increments credits_remaining and decrements credits_used in one statement
    supabase.rpc("refund_credits", {"p_user_id": user_id, "p_amount": amount}).execute()
    supabase.table("jobs").update({"credits_deducted": 0}).eq("id", job_id).execute()
    return amount


def reset_monthly_credits(supabase, user_id: str) -> None:
    supabase.table("profiles").update({
        "credits_remaining": 150,
        "credits_used": 0,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", user_id).execute()
