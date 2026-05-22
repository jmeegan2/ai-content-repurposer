import tempfile
import os
from unittest.mock import MagicMock, patch
from services.pipeline import run_pipeline_from_file


def test_pipeline_failure_calls_refund_fn():
    update_job = MagicMock()
    refund_credits_fn = MagicMock()

    with tempfile.TemporaryDirectory() as temp_dir:
        fake_video = os.path.join(temp_dir, "video.mp4")
        open(fake_video, "wb").close()

        with patch("services.pipeline._ensure_h264", return_value=fake_video), \
             patch("services.pipeline.transcribe_video", side_effect=RuntimeError("whisper failed")):
            run_pipeline_from_file(
                job_id="job-1",
                file_path=fake_video,
                temp_dir=temp_dir,
                update_job=update_job,
                refund_credits_fn=refund_credits_fn,
            )

    refund_credits_fn.assert_called_once()
    update_job.assert_any_call("job-1", {"status": "failed", "error": "whisper failed"})


def test_pipeline_success_does_not_call_refund_fn():
    update_job = MagicMock()
    refund_credits_fn = MagicMock()

    with tempfile.TemporaryDirectory() as temp_dir:
        fake_video = os.path.join(temp_dir, "video.mp4")
        open(fake_video, "wb").close()

        with patch("services.pipeline._ensure_h264", return_value=fake_video), \
             patch("services.pipeline.transcribe_video", return_value=MagicMock(words=[])), \
             patch("services.pipeline.detect_clips", return_value=[]), \
             patch("services.pipeline.delete_file"):
            run_pipeline_from_file(
                job_id="job-1",
                file_path=fake_video,
                temp_dir=temp_dir,
                update_job=update_job,
                refund_credits_fn=refund_credits_fn,
            )

    refund_credits_fn.assert_not_called()
    update_job.assert_any_call("job-1", {"clips": [], "status": "done"})
