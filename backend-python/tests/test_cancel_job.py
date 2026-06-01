import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from main import app
from middleware.auth import require_auth

USER_ID = "user-1"
JOB_ID = "job-1"


@pytest.fixture(autouse=True)
def override_auth():
    app.dependency_overrides[require_auth] = lambda: USER_ID
    yield
    app.dependency_overrides.clear()


def _make_supabase(job_row, atomic_update_data):
    """Build a mock supabase where the initial select returns job_row
    and the atomic status update returns atomic_update_data."""
    mock = MagicMock()
    # Initial select: table().select().eq().eq().single().execute()
    mock.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = job_row
    # Atomic update: table().update().eq().eq().not_.in_().execute()
    mock.table.return_value.update.return_value.eq.return_value.eq.return_value.not_.in_.return_value.execute.return_value.data = atomic_update_data
    return mock


def test_cancel_triggers_refund():
    job_row = {"status": "processing", "modal_call_id": "modal-call-123"}
    mock_supabase = _make_supabase(job_row, atomic_update_data=[{"id": JOB_ID}])

    with patch("routes.jobs.supabase", mock_supabase), \
         patch("routes.jobs.refund_job_credits") as mock_refund, \
         patch("modal.FunctionCall.from_id"):

        response = TestClient(app).delete(f"/jobs/{JOB_ID}")

    assert response.status_code == 204
    mock_refund.assert_called_once_with(mock_supabase, JOB_ID, USER_ID)


def test_cancel_calls_modal_cancel():
    job_row = {"status": "processing", "modal_call_id": "modal-call-123"}
    mock_supabase = _make_supabase(job_row, atomic_update_data=[{"id": JOB_ID}])

    with patch("routes.jobs.supabase", mock_supabase), \
         patch("routes.jobs.refund_job_credits"), \
         patch("modal.FunctionCall.from_id") as mock_modal:

        TestClient(app).delete(f"/jobs/{JOB_ID}")

    mock_modal.assert_called_once_with("modal-call-123")
    mock_modal.return_value.cancel.assert_called_once()


def test_cancel_already_terminal_returns_409():
    """Atomic update matches no rows (job already terminal) → 409, no refund."""
    job_row = {"status": "cancelled", "modal_call_id": None}
    mock_supabase = _make_supabase(job_row, atomic_update_data=[])

    with patch("routes.jobs.supabase", mock_supabase), \
         patch("routes.jobs.refund_job_credits") as mock_refund, \
         patch("modal.FunctionCall.from_id"):

        response = TestClient(app).delete(f"/jobs/{JOB_ID}")

    assert response.status_code == 409
    mock_refund.assert_not_called()


def test_cancel_double_request_second_gets_409():
    """Simulates a second concurrent cancel — atomic update returns no rows,
    so the second request gets 409 and credits are not refunded again."""
    job_row = {"status": "processing", "modal_call_id": None}
    # First request: update succeeds
    mock_first = _make_supabase(job_row, atomic_update_data=[{"id": JOB_ID}])
    # Second request: update returns empty (first already set it to cancelled)
    mock_second = _make_supabase(job_row, atomic_update_data=[])

    with patch("routes.jobs.supabase", mock_first), \
         patch("routes.jobs.refund_job_credits") as mock_refund, \
         patch("modal.FunctionCall.from_id"):
        r1 = TestClient(app).delete(f"/jobs/{JOB_ID}")

    with patch("routes.jobs.supabase", mock_second), \
         patch("routes.jobs.refund_job_credits") as mock_refund2, \
         patch("modal.FunctionCall.from_id"):
        r2 = TestClient(app).delete(f"/jobs/{JOB_ID}")

    assert r1.status_code == 204
    assert r2.status_code == 409
    mock_refund.assert_called_once()
    mock_refund2.assert_not_called()


def test_cancel_job_not_found_returns_404():
    mock_supabase = _make_supabase(job_row=None, atomic_update_data=None)

    with patch("routes.jobs.supabase", mock_supabase), \
         patch("modal.FunctionCall.from_id"):

        response = TestClient(app).delete(f"/jobs/{JOB_ID}")

    assert response.status_code == 404


def test_cancel_modal_failure_still_cancels():
    """Modal cancel failing should not block the job cancellation or refund."""
    job_row = {"status": "processing", "modal_call_id": "modal-call-123"}
    mock_supabase = _make_supabase(job_row, atomic_update_data=[{"id": JOB_ID}])

    with patch("routes.jobs.supabase", mock_supabase), \
         patch("routes.jobs.refund_job_credits") as mock_refund, \
         patch("modal.FunctionCall.from_id") as mock_modal:

        mock_modal.return_value.cancel.side_effect = Exception("Modal unreachable")
        response = TestClient(app).delete(f"/jobs/{JOB_ID}")

    assert response.status_code == 204
    mock_refund.assert_called_once_with(mock_supabase, JOB_ID, USER_ID)
