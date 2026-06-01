from unittest.mock import MagicMock
from services.credits import refund_job_credits


def _make_supabase(credits_deducted: int):
    """Return (supabase, jobs_table, profiles_table) with independent mocks per table."""
    supabase = MagicMock()

    jobs_table = MagicMock()
    jobs_table.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "credits_deducted": credits_deducted
    }

    profiles_table = MagicMock()
    profiles_table.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "credits_remaining": 10,
        "credits_used": 5,
        "subscription_status": "active",
    }

    supabase.table.side_effect = lambda name: jobs_table if name == "jobs" else profiles_table
    return supabase, jobs_table, profiles_table


def test_refund_returns_amount_and_zeros_job():
    supabase, jobs_table, _ = _make_supabase(credits_deducted=5)

    result = refund_job_credits(supabase, "job-1", "user-1")

    assert result == 5
    supabase.rpc.assert_called_once_with("refund_credits", {"p_user_id": "user-1", "p_amount": 5})
    jobs_table.update.assert_called_with({"credits_deducted": 0})


def test_refund_idempotent_when_already_zero():
    supabase, _, _ = _make_supabase(credits_deducted=0)

    result = refund_job_credits(supabase, "job-1", "user-1")

    assert result == 0
    supabase.rpc.assert_not_called()
