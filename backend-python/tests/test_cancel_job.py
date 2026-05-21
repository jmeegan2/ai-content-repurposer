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


def test_cancel_triggers_refund():
    job_row = {"status": "processing", "modal_call_id": "modal-call-123"}

    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = job_row

    with patch("routes.jobs.supabase", mock_supabase), \
         patch("routes.jobs.refund_job_credits") as mock_refund, \
         patch("modal.FunctionCall.from_id") as mock_modal_call:

        mock_modal_call.return_value.cancel.return_value = None
        client = TestClient(app)
        response = client.delete(f"/jobs/{JOB_ID}")

    assert response.status_code == 204
    mock_refund.assert_called_once_with(mock_supabase, JOB_ID, USER_ID)

    # verify status was also set to cancelled
    update_calls = [str(c) for c in mock_supabase.table.return_value.update.call_args_list]
    assert any("cancelled" in c for c in update_calls)
