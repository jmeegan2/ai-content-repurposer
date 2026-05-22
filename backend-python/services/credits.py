from datetime import datetime, timezone
from fastapi import HTTPException


def get_profile(supabase, user_id: str) -> dict:
    resp = supabase.table("profiles").select("credits_remaining, credits_used, subscription_status").eq("id", user_id).single().execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return resp.data


def deduct_credits(supabase, user_id: str, amount: int) -> None:
    # BUG: race condition — read-then-write is not atomic. Two concurrent requests
    # can both read the same balance and both succeed, allowing double-spend.
    # Fix: use a Postgres RPC with UPDATE ... WHERE credits_remaining >= amount RETURNING *
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


def refund_job_credits(supabase, job_id: str, user_id: str) -> int:
    """Refund credits for a job. Idempotent — returns 0 if already refunded."""
    job = supabase.table("jobs").select("credits_deducted").eq("id", job_id).single().execute()
    amount = (job.data or {}).get("credits_deducted", 0)
    if amount <= 0:
        return 0
    add_credits(supabase, user_id, amount)
    supabase.table("jobs").update({"credits_deducted": 0}).eq("id", job_id).execute()
    return amount


def reset_monthly_credits(supabase, user_id: str) -> None:
    supabase.table("profiles").update({
        "credits_remaining": 150,
        "credits_used": 0,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", user_id).execute()
