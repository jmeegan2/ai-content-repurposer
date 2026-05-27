from unittest.mock import MagicMock, patch

import stripe

from routes.stripe import (
    _handle_charge_refunded,
    _handle_checkout_session_completed,
    _handle_invoice_payment_succeeded,
    _handle_subscription_deleted,
    _handle_subscription_updated,
    _is_duplicate_event,
)

NOW = "2026-01-01T00:00:00+00:00"

# Only used for REAL_TOPUP_SESSION to validate against the exact SDK object shape.
def _stripe_obj(data: dict) -> stripe.StripeObject:
    return stripe.StripeObject.construct_from(data, key=None)


def _make_supabase(credits_remaining=100, event_exists=False, profile_exists=True):
    supabase = MagicMock()

    events_table = MagicMock()
    events_table.select.return_value.eq.return_value.execute.return_value.data = (
        [{"event_id": "evt_1"}] if event_exists else []
    )

    profiles_table = MagicMock()
    profiles_table.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
        {"id": "user-1", "credits_remaining": credits_remaining} if profile_exists else None
    )

    def _table(name):
        if name == "stripe_webhook_events":
            return events_table
        return profiles_table

    supabase.table.side_effect = _table
    return supabase, events_table, profiles_table


# --- _is_duplicate_event ---

def test_duplicate_event_returns_true():
    supabase, events_table, _ = _make_supabase(event_exists=True)
    with patch("routes.stripe.supabase", supabase):
        assert _is_duplicate_event("evt_1") is True
    events_table.insert.assert_not_called()


def test_new_event_inserts_and_returns_false():
    supabase, events_table, _ = _make_supabase(event_exists=False)
    with patch("routes.stripe.supabase", supabase):
        assert _is_duplicate_event("evt_1") is False
    events_table.insert.assert_called_once_with({"event_id": "evt_1"})


# --- _handle_checkout_session_completed ---

REAL_TOPUP_SESSION = _stripe_obj({
    "id": "cs_test_a1UlMtkLlCrCl17Vwab4MEBb0fMrDGJsXBbH4D7aDmXTH0cYQL4kQk32HI",
    "object": "checkout.session",
    "mode": "payment",
    "payment_status": "paid",
    "status": "complete",
    "customer": "cus_UVMZiCDQoJGaia",
    "customer_details": {
        "email": "jmeegan8@gmail.com",
        "name": "James Meegan",
    },
    "metadata": {
        "type": "topup",
        "userId": "5537947d-581b-409d-af14-588981d2d1c7",
    },
    "amount_total": 799,
    "currency": "usd",
    "payment_intent": "pi_3TbUAqQKNvFJtytD18CgULjm",
    "subscription": None,
})


REAL_SUBSCRIPTION_SESSION = _stripe_obj({
    "id": "cs_test_b2VmNuLlDsHk18WxbC5NFCc1gNsDHKtYCciJ5E8bEnYUI1dZRM5lRr43JJ",
    "object": "checkout.session",
    "mode": "subscription",
    "payment_status": "paid",
    "status": "complete",
    "customer": "cus_UVMZiCDQoJGaia",
    "customer_details": {
        "email": "jmeegan8@gmail.com",
        "name": "James Meegan",
    },
    "metadata": {
        "type": "subscription",
        "userId": "5537947d-581b-409d-af14-588981d2d1c7",
    },
    "amount_total": 1999,
    "currency": "usd",
    "payment_intent": None,
    "subscription": "sub_1TbUAqQKNvFJtytD18CgULjm",
})


def test_checkout_topup_adds_credits():
    session = {"id": "cs_test_1", "metadata": {"userId": "user-1", "type": "topup"}}
    with patch("routes.stripe.add_credits") as mock_add:
        _handle_checkout_session_completed(session, NOW)
    mock_add.assert_called_once_with(mock_add.call_args[0][0], "user-1", 100)


def test_checkout_topup_real_session_adds_100_credits():
    with patch("routes.stripe.add_credits") as mock_add:
        _handle_checkout_session_completed(REAL_TOPUP_SESSION, NOW)
    mock_add.assert_called_once_with(
        mock_add.call_args[0][0],
        "5537947d-581b-409d-af14-588981d2d1c7",
        100,
    )


def test_checkout_subscription_real_session_sets_active_and_resets_credits():
    supabase, _, profiles_table = _make_supabase()
    with patch("routes.stripe.supabase", supabase), \
         patch("routes.stripe.reset_monthly_credits") as mock_reset:
        _handle_checkout_session_completed(REAL_SUBSCRIPTION_SESSION, NOW)
    mock_reset.assert_called_once_with(supabase, "5537947d-581b-409d-af14-588981d2d1c7")
    profiles_table.upsert.assert_called_once()
    assert profiles_table.upsert.call_args[0][0]["subscription_status"] == "active"


def test_checkout_subscription_resets_credits_and_sets_active():
    supabase, _, profiles_table = _make_supabase()
    session = {"id": "cs_test_2", "metadata": {"userId": "user-1", "type": "subscription"}}
    with patch("routes.stripe.supabase", supabase), \
         patch("routes.stripe.reset_monthly_credits") as mock_reset:
        _handle_checkout_session_completed(session, NOW)
    mock_reset.assert_called_once()
    profiles_table.upsert.assert_called_once()
    assert profiles_table.upsert.call_args[0][0]["subscription_status"] == "active"


def test_checkout_no_user_id_does_nothing():
    session = {"id": "cs_test_3", "metadata": {}}
    with patch("routes.stripe.add_credits") as mock_add, \
         patch("routes.stripe.reset_monthly_credits") as mock_reset:
        _handle_checkout_session_completed(session, NOW)
    mock_add.assert_not_called()
    mock_reset.assert_not_called()


# --- _handle_invoice_payment_succeeded ---

def test_invoice_subscription_cycle_resets_credits():
    supabase, _, _ = _make_supabase()
    invoice = {"billing_reason": "subscription_cycle", "customer": "cus_1"}
    with patch("routes.stripe.supabase", supabase), \
         patch("routes.stripe.reset_monthly_credits") as mock_reset:
        _handle_invoice_payment_succeeded(invoice)
    mock_reset.assert_called_once_with(supabase, "user-1")


def test_invoice_non_renewal_does_nothing():
    invoice = {"billing_reason": "subscription_create", "customer": "cus_1"}
    with patch("routes.stripe.reset_monthly_credits") as mock_reset:
        _handle_invoice_payment_succeeded(invoice)
    mock_reset.assert_not_called()


# --- _handle_subscription_updated ---

def test_subscription_updated_sets_status():
    supabase, _, profiles_table = _make_supabase()
    sub = {"customer": "cus_1", "status": "past_due"}
    with patch("routes.stripe.supabase", supabase):
        _handle_subscription_updated(sub, NOW)
    profiles_table.update.assert_called_once()
    assert profiles_table.update.call_args[0][0]["subscription_status"] == "past_due"


# --- _handle_subscription_deleted ---

def test_subscription_deleted_sets_inactive():
    supabase, _, profiles_table = _make_supabase()
    sub = {"customer": "cus_1"}
    with patch("routes.stripe.supabase", supabase):
        _handle_subscription_deleted(sub, NOW)
    profiles_table.update.assert_called_once()
    assert profiles_table.update.call_args[0][0]["subscription_status"] == "inactive"


# --- _handle_charge_refunded ---

def test_charge_refunded_subscription_zeroes_credits():
    supabase, _, profiles_table = _make_supabase(credits_remaining=150)
    charge = {"customer": "cus_1", "invoice": "in_1"}
    with patch("routes.stripe.supabase", supabase):
        _handle_charge_refunded(charge, NOW)
    update_data = profiles_table.update.call_args[0][0]
    assert update_data["subscription_status"] == "inactive"
    assert update_data["credits_remaining"] == 0


def test_charge_refunded_topup_claws_back_100():
    supabase, _, profiles_table = _make_supabase(credits_remaining=200)
    charge = {"customer": "cus_1", "invoice": None}
    with patch("routes.stripe.supabase", supabase):
        _handle_charge_refunded(charge, NOW)
    assert profiles_table.update.call_args[0][0]["credits_remaining"] == 100


def test_charge_refunded_topup_floors_at_zero():
    supabase, _, profiles_table = _make_supabase(credits_remaining=50)
    charge = {"customer": "cus_1", "invoice": None}
    with patch("routes.stripe.supabase", supabase):
        _handle_charge_refunded(charge, NOW)
    assert profiles_table.update.call_args[0][0]["credits_remaining"] == 0


def test_charge_refunded_no_customer_does_nothing():
    supabase, _, profiles_table = _make_supabase()
    charge = {"customer": None, "invoice": None}
    with patch("routes.stripe.supabase", supabase):
        _handle_charge_refunded(charge, NOW)
    profiles_table.update.assert_not_called()
