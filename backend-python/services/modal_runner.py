import modal

image = (
    modal.Image.debian_slim()
    .apt_install("ffmpeg")
    .pip_install(
        "openai>=1.0.0",
        "boto3",
        "supabase",
        "fastapi",
        "mediapipe==0.10.14",
        "opencv-python-headless==4.10.0.84",
        "numpy>=1.24,<2.0",
        "python-dotenv",
        "httpx",
    )
    .add_local_dir(
        "/Users/jamesmeegan/Desktop/Business /AI Content Repurposer/ai content repurposer code/backend-python",
        remote_path="/app",
    )
    .add_local_file("/Users/jamesmeegan/Downloads/cookies.txt", "/app/cookies.txt")
)

app = modal.App("ai-repurposer", image=image)


def _make_update_job(job_id: str):
    import os
    from supabase import create_client
    from services.db import update_job

    supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    return lambda _job_id, patch: update_job(supabase, _job_id, patch)


def _make_refund_credits(job_id: str, user_id: str):
    import os
    from supabase import create_client
    from services.credits import refund_job_credits

    supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    return lambda: refund_job_credits(supabase, job_id, user_id)


@app.function(
    cpu=4,
    timeout=2700,
    # No retries: pipeline deletes the raw S3 file and refunds credits in its finally block,
    # so a retry would fail on S3 download and corrupt the job error/credit state.
    secrets=[modal.Secret.from_name("ai-repurposer-secrets")],
)
def run_pipeline_from_s3_modal(job_id: str, s3_key: str, user_id: str):
    import os
    import sys
    import tempfile
    import boto3

    sys.path.insert(0, "/app")

    import logging
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s — %(message)s")
    logger = logging.getLogger(__name__)

    from services.pipeline import run_pipeline_from_file

    bucket = os.environ["AWS_S3_BUCKET"]
    temp_dir = tempfile.mkdtemp(prefix="repurposer-")
    file_name = os.path.basename(s3_key)
    file_path = os.path.join(temp_dir, file_name)

    update_job = _make_update_job(job_id)
    refund_credits = _make_refund_credits(job_id, user_id)
    update_job(job_id, {"status": "downloading"})

    try:
        boto3.client(
            "s3",
            region_name=os.environ.get("AWS_REGION", "us-east-1"),
            aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        ).download_file(bucket, s3_key, file_path)
    except Exception as exc:
        logger.error(f"[{job_id}] S3 download failed — {exc}")
        update_job(job_id, {"status": "failed", "error": f"S3 download failed: {exc}"})
        refund_credits()
        return

    run_pipeline_from_file(job_id, file_path, temp_dir, update_job, raw_s3_key=s3_key, refund_credits_fn=refund_credits)
