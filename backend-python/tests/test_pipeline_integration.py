"""
Integration test: full pipeline end-to-end.
Hits yt-dlp, OpenAI Whisper, OpenAI GPT, ffmpeg, MediaPipe, and S3.
Requires valid .env credentials. Run with: pytest tests/test_pipeline_integration.py -s -v
"""
import re
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv()

from services.pipeline import run_pipeline
from services.s3 import get_presigned_url

# "Me at the zoo" — first YouTube video ever, 19 seconds
TEST_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw"


def test_pipeline_runs_end_to_end():
    patches = []

    def update_job(job_id: str, patch: dict) -> None:
        patches.append(dict(patch))

    run_pipeline("integration-test-job", TEST_URL, update_job)

    # Log error if pipeline failed
    error_patch = next((p for p in patches if p.get("error")), None)
    if error_patch:
        print(f"\nPipeline error: {error_patch['error']}")

    # Status must progress through every stage in order
    statuses = [p["status"] for p in patches if "status" in p]
    assert statuses == ["downloading", "transcribing", "detecting", "processing", "done"], \
        f"Unexpected status progression: {statuses}"

    # Transcript must be populated
    transcript_patch = next((p for p in patches if "transcript" in p), None)
    assert transcript_patch is not None
    assert len(transcript_patch["transcript"]["text"]) > 0
    assert len(transcript_patch["transcript"]["words"]) > 0

    # Clips must be a non-empty array with valid shape
    clips_patch = next((p for p in patches if "clips" in p), None)
    assert clips_patch is not None
    clips = clips_patch["clips"]
    print(f"\nDetected clips: {clips}")

    assert isinstance(clips, list)
    assert len(clips) > 0

    # Print presigned URLs for manual inspection
    raw_patch = next((p for p in patches if "status" in p and p["status"] == "transcribing"), None)
    print("\n--- S3 Presigned URLs ---")
    for clip in clips:
        clip_url = get_presigned_url(clip["s3_key"], 3600)
        thumb_url = get_presigned_url(clip["thumbnail_key"], 3600) if clip.get("thumbnail_key") else None
        print(f"\nClip: {clip['title']}")
        print(f"  Video:     {clip_url}")
        if thumb_url:
            print(f"  Thumbnail: {thumb_url}")

    for clip in clips:
        assert isinstance(clip["id"], str)
        assert isinstance(clip["title"], str)
        assert isinstance(clip["start_time"], float)
        assert isinstance(clip["end_time"], float)
        assert clip["end_time"] > clip["start_time"]
        assert re.match(r"^clips/.+\.mp4$", clip["s3_key"]), \
            f"Unexpected s3_key format: {clip['s3_key']}"
