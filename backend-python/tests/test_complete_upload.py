import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from main import app
from middleware.auth import require_auth

USER_ID = "user-1"
JOB_ID = "job-1"

job_row = {
    "id": JOB_ID, "user_id": USER_ID, "status": "queued",
    "youtube_url": "upload:test.mp4",
    "created_at": "2024-01-01T00:00:00+00:00",
    "updated_at": "2024-01-01T00:00:00+00:00",
    "transcript": None, "error": None,
}


@pytest.fixture(autouse=True)
def override_auth():
    app.dependency_overrides[require_auth] = lambda: USER_ID
    yield
    app.dependency_overrides.clear()


def test_spawn_failure_triggers_refund():
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = job_row

    with patch("routes.jobs.supabase", mock_supabase), \
         patch("routes.jobs.deduct_credits"), \
         patch("routes.jobs.refund_job_credits") as mock_refund, \
         patch("modal.Function.from_name", side_effect=Exception("modal unreachable")):

        client = TestClient(app)
        response = client.post(
            "/jobs/upload-complete",
            json={"job_id": JOB_ID, "s3_key": "raw/job-1/test.mp4", "duration_seconds": 120},
        )

    assert response.status_code == 500
    mock_refund.assert_called_once_with(mock_supabase, JOB_ID, USER_ID)
