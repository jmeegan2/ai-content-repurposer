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

# Webhook handler inputs (event["data"]["object"]):
#   checkout.session.completed      → Session object  (metadata.type: "topup" | "subscription")
#   invoice.payment_succeeded       → Invoice object  (billing_reason: "subscription_cycle" resets credits; others skipped)
#   customer.subscription.updated   → Subscription object  (status: "active" | "paused" | "past_due" etc.)
#   customer.subscription.deleted   → Subscription object  (always sets status → "inactive")
#   charge.refunded                 → Charge object   (metadata.type: "topup" claws back 100 credits; else revokes sub)

NOW = "2026-01-01T00:00:00+00:00"


# ── Helpers ───────────────────────────────────────────────────────────────────

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


# ── Fixtures ──────────────────────────────────────────────────────────────────

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

REAL_SUBSCRIPTION_CYCLE_INVOICE = _stripe_obj({
    "id": "in_1TcE07QKNvFJtytDlaoegiQM",
    "object": "invoice",
    "amount_due": 999,
    "amount_paid": 999,
    "amount_remaining": 0,
    "attempt_count": 1,
    "attempted": True,
    "billing_reason": "subscription_cycle",
    "collection_method": "charge_automatically",
    "currency": "usd",
    "customer": "cus_UbQm52JUdAnWxI",
    "livemode": False,
    "metadata": {},
    "status": "paid",
    "subtotal": 999,
    "total": 999,
    "parent": {
        "type": "subscription_details",
        "subscription_details": {
            "metadata": {},
            "subscription": "sub_1TcDxHQKNvFJtytDmZsDtK6d",
        },
        "quote_details": None,
    },
    "test_clock": "clock_1TcDteQKNvFJtytD2ncxcVSs",
})

REAL_SUBSCRIPTION_UPDATED = _stripe_obj({
    "id": "sub_1TcDqNQKNvFJtytDo4Ok1MCd",
    "object": "subscription",
    "customer": "cus_UbNrp9HtCUOk8C",
    "status": "paused",
    "collection_method": "charge_automatically",
    "currency": "usd",
    "livemode": False,
    "metadata": {},
    "cancel_at_period_end": False,
    "canceled_at": None,
    "ended_at": None,
    "pause_collection": None,
    "start_date": 1780012805,
})

REAL_TOPUP_CHARGE = _stripe_obj({
    "id": "ch_3TcDQTQKNvFJtytD1vBVIKY6",
    "object": "charge",
    "amount": 799,
    "amount_captured": 799,
    "amount_refunded": 799,
    "captured": True,
    "currency": "usd",
    "customer": "cus_UbNrp9HtCUOk8C",
    "description": None,
    "livemode": False,
    "metadata": {"type": "topup"},  # key discriminator — set via payment_intent_data at checkout
    "paid": True,
    "payment_intent": "pi_3TcDQTQKNvFJtytD1ZtHMpan",
    "payment_method": "pm_1TcDQSQKNvFJtytDU9z8nosh",
    "refunded": True,
    "status": "succeeded",
})

REAL_SUBSCRIPTION_CHARGE = _stripe_obj({
    "id": "ch_3TcCv2QKNvFJtytD18lWyBmZ",
    "object": "charge",
    "amount": 999,
    "amount_captured": 999,
    "amount_refunded": 999,
    "captured": True,
    "currency": "usd",
    "customer": "cus_UbNrp9HtCUOk8C",
    "description": "Subscription creation",
    "livemode": False,
    "metadata": {},
    "paid": True,
    "payment_intent": "pi_3TcCv2QKNvFJtytD1HZSvRk8",
    "payment_method": "pm_1TcCv1QKNvFJtytDSJCtX6eG",
    "refunded": True,
    "status": "succeeded",
})


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestIsDuplicateEvent:
    def test_duplicate_event_returns_true(self):
        supabase, events_table, _ = _make_supabase(event_exists=True)
        with patch("routes.stripe.supabase", supabase):
            assert _is_duplicate_event("evt_1") is True
        events_table.insert.assert_not_called()

    def test_new_event_inserts_and_returns_false(self):
        supabase, events_table, _ = _make_supabase(event_exists=False)
        with patch("routes.stripe.supabase", supabase):
            assert _is_duplicate_event("evt_1") is False
        events_table.insert.assert_called_once_with({"event_id": "evt_1"})


class TestHandleCheckoutSessionCompleted:
    def test_topup_adds_credits(self):
        session = {"id": "cs_test_1", "metadata": {"userId": "user-1", "type": "topup"}}
        with patch("routes.stripe.add_credits") as mock_add:
            _handle_checkout_session_completed(session, NOW)
        mock_add.assert_called_once_with(mock_add.call_args[0][0], "user-1", 100)

    def test_topup_real_session_adds_100_credits(self):
        with patch("routes.stripe.add_credits") as mock_add:
            _handle_checkout_session_completed(REAL_TOPUP_SESSION, NOW)
        mock_add.assert_called_once_with(
            mock_add.call_args[0][0],
            "5537947d-581b-409d-af14-588981d2d1c7",
            100,
        )

    def test_subscription_real_session_sets_active_and_resets_credits(self):
        supabase, _, profiles_table = _make_supabase()
        with patch("routes.stripe.supabase", supabase), \
             patch("routes.stripe.reset_monthly_credits") as mock_reset:
            _handle_checkout_session_completed(REAL_SUBSCRIPTION_SESSION, NOW)
        mock_reset.assert_called_once_with(supabase, "5537947d-581b-409d-af14-588981d2d1c7")
        profiles_table.upsert.assert_called_once()
        assert profiles_table.upsert.call_args[0][0]["subscription_status"] == "active"

    def test_subscription_resets_credits_and_sets_active(self):
        supabase, _, profiles_table = _make_supabase()
        session = {"id": "cs_test_2", "metadata": {"userId": "user-1", "type": "subscription"}}
        with patch("routes.stripe.supabase", supabase), \
             patch("routes.stripe.reset_monthly_credits") as mock_reset:
            _handle_checkout_session_completed(session, NOW)
        mock_reset.assert_called_once()
        profiles_table.upsert.assert_called_once()
        assert profiles_table.upsert.call_args[0][0]["subscription_status"] == "active"

    def test_no_user_id_does_nothing(self):
        session = {"id": "cs_test_3", "metadata": {}}
        with patch("routes.stripe.add_credits") as mock_add, \
             patch("routes.stripe.reset_monthly_credits") as mock_reset:
            _handle_checkout_session_completed(session, NOW)
        mock_add.assert_not_called()
        mock_reset.assert_not_called()


class TestHandleInvoicePaymentSucceeded:
    def test_subscription_cycle_resets_credits(self):
        supabase, _, _ = _make_supabase()
        invoice = {"id": "in_test", "billing_reason": "subscription_cycle", "customer": "cus_1"}
        with patch("routes.stripe.supabase", supabase), \
             patch("routes.stripe.reset_monthly_credits") as mock_reset:
            _handle_invoice_payment_succeeded(invoice)
        mock_reset.assert_called_once_with(supabase, "user-1")

    def test_subscription_cycle_real_invoice_resets_credits(self):
        supabase, _, _ = _make_supabase()
        with patch("routes.stripe.supabase", supabase), \
             patch("routes.stripe.reset_monthly_credits") as mock_reset:
            _handle_invoice_payment_succeeded(REAL_SUBSCRIPTION_CYCLE_INVOICE)
        mock_reset.assert_called_once_with(supabase, "user-1")

    def test_non_renewal_does_nothing(self):
        invoice = {"id": "in_test", "billing_reason": "subscription_create", "customer": "cus_1"}
        with patch("routes.stripe.reset_monthly_credits") as mock_reset:
            _handle_invoice_payment_succeeded(invoice)
        mock_reset.assert_not_called()


class TestHandleSubscriptionUpdated:
    def test_sets_status(self):
        supabase, _, profiles_table = _make_supabase()
        sub = {"id": "sub_test", "customer": "cus_1", "status": "past_due"}
        with patch("routes.stripe.supabase", supabase):
            _handle_subscription_updated(sub, NOW)
        profiles_table.update.assert_called_once()
        assert profiles_table.update.call_args[0][0]["subscription_status"] == "past_due"

    def test_real_paused_subscription_sets_status(self):
        supabase, _, profiles_table = _make_supabase()
        with patch("routes.stripe.supabase", supabase):
            _handle_subscription_updated(REAL_SUBSCRIPTION_UPDATED, NOW)
        profiles_table.update.assert_called_once()
        assert profiles_table.update.call_args[0][0]["subscription_status"] == "paused"


class TestHandleSubscriptionDeleted:
    def test_sets_inactive(self):
        supabase, _, profiles_table = _make_supabase()
        sub = {"id": "sub_test", "customer": "cus_1"}
        with patch("routes.stripe.supabase", supabase):
            _handle_subscription_deleted(sub, NOW)
        profiles_table.update.assert_called_once()
        assert profiles_table.update.call_args[0][0]["subscription_status"] == "inactive"


class TestHandleChargeRefunded:
    def test_subscription_refund_zeroes_credits(self):
        supabase, _, profiles_table = _make_supabase(credits_remaining=150)
        charge = {"id": "ch_test", "customer": "cus_1", "invoice": "in_1", "metadata": {}}
        with patch("routes.stripe.supabase", supabase):
            _handle_charge_refunded(charge, NOW)
        update_data = profiles_table.update.call_args[0][0]
        assert update_data["subscription_status"] == "inactive"
        assert update_data["credits_remaining"] == 0

    def test_topup_refund_claws_back_100(self):
        supabase, _, profiles_table = _make_supabase(credits_remaining=200)
        charge = {"id": "ch_test", "customer": "cus_1", "invoice": None, "metadata": {"type": "topup"}}
        with patch("routes.stripe.supabase", supabase):
            _handle_charge_refunded(charge, NOW)
        assert profiles_table.update.call_args[0][0]["credits_remaining"] == 100

    def test_topup_refund_floors_at_zero(self):
        supabase, _, profiles_table = _make_supabase(credits_remaining=50)
        charge = {"id": "ch_test", "customer": "cus_1", "invoice": None, "metadata": {"type": "topup"}}
        with patch("routes.stripe.supabase", supabase):
            _handle_charge_refunded(charge, NOW)
        assert profiles_table.update.call_args[0][0]["credits_remaining"] == 0

    def test_no_customer_does_nothing(self):
        supabase, _, profiles_table = _make_supabase()
        charge = {"id": "ch_test", "customer": None, "invoice": None}
        with patch("routes.stripe.supabase", supabase):
            _handle_charge_refunded(charge, NOW)
        profiles_table.update.assert_not_called()
