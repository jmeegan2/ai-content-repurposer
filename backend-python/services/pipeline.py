import logging
import os
import shutil
import subprocess
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable

logger = logging.getLogger(__name__)

from services.ffmpeg import FFMPEG, run_ffmpeg


def _ensure_h264(file_path: str, temp_dir: str) -> str:
    """Transcode to H.264 1080p if not already H.264. OpenCV cannot decode AV1/VP9."""
    probe = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=codec_name",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file_path,
        ],
        capture_output=True, text=True,
    )
    codec = probe.stdout.strip()
    if codec == "h264":
        return file_path

    logger.info(f"video codec is {codec!r} — transcoding to H.264 1080p for OpenCV compatibility")
    base = os.path.splitext(os.path.basename(file_path))[0]
    out_path = os.path.join(temp_dir, f"{base}-h264.mp4")
    run_ffmpeg(
        [
            FFMPEG, "-y", "-i", file_path,
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-vf", "scale=-2:min(ih\\,1080)",
            "-c:a", "copy",
            out_path,
        ],
        "H.264 transcode failed",
    )
    return out_path

from models import Clip
from services.transcriber import transcribe_video
from services.clip_detector import detect_clips
from services.clipper import process_clip
from services.s3 import upload_file, delete_file
from services.supabase_client import supabase

UpdateJobFn = Callable[[str, dict], None]

# Max clips processed in parallel within a single job
_CLIP_WORKERS = 4


def _process_and_upload_clip(
    file_path: str,
    clip: Clip,
    words: list,
    temp_dir: str,
    job_id: str,
) -> Clip:
    clip_path, thumbnail_path = process_clip(file_path, clip, words, temp_dir)
    clip_s3_key = f"clips/{job_id}/{clip.id}.mp4"
    thumbnail_s3_key = f"thumbnails/{job_id}/{clip.id}.jpg"
    upload_file(clip_s3_key, clip_path)
    upload_file(thumbnail_s3_key, thumbnail_path, "image/jpeg")
    clip.s3_key = clip_s3_key
    clip.thumbnail_key = thumbnail_s3_key
    return clip


def run_pipeline_from_file(job_id: str, file_path: str, temp_dir: str, update_job: UpdateJobFn, raw_s3_key: str | None = None, refund_credits_fn: Callable[[], None] | None = None) -> None:
    """File is already on disk (downloaded from S3 by Modal). Raw S3 object is deleted in finally; lifecycle rule is the fallback if Modal crashes."""
    t_start = time.time()
    def elapsed() -> str:
        return f"{time.time() - t_start:.1f}s"
    try:
        logger.info(f"[{job_id}] pipeline start")

        t = time.time()
        file_path = _ensure_h264(file_path, temp_dir)
        logger.info(f"[{job_id}] h264 check done ({time.time() - t:.1f}s)")

        update_job(job_id, {"status": "transcribing"})
        t = time.time()
        transcript = transcribe_video(file_path)
        logger.info(f"[{job_id}] transcribe done ({time.time() - t:.1f}s)")
        update_job(job_id, {"transcript": transcript.model_dump()})

        update_job(job_id, {"status": "detecting"})
        t = time.time()
        detected = detect_clips(transcript)
        logger.info(f"[{job_id}] clip detection done — {len(detected)} clips ({time.time() - t:.1f}s)")
        clips = [
            Clip(
                id=str(uuid.uuid4()),
                start_time=dc.start_time,
                end_time=dc.end_time,
                title=dc.title,
                s3_key="",
            )
            for dc in detected
        ]

        if not clips:
            update_job(job_id, {"clips": [], "status": "done"})
            logger.info(f"[{job_id}] no clips detected — pipeline done — total {elapsed()}")
            return

        update_job(job_id, {"status": "processing"})
        t = time.time()
        workers = min(_CLIP_WORKERS, len(clips))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(
                    _process_and_upload_clip,
                    file_path, clip, transcript.words, temp_dir, job_id,
                ): clip
                for clip in clips
            }
            for future in as_completed(futures):
                future.result()
        logger.info(f"[{job_id}] all clips processed ({time.time() - t:.1f}s)")

        update_job(job_id, {"clips": [c.model_dump() for c in clips], "status": "done"})
        logger.info(f"[{job_id}] pipeline done — total {elapsed()}")

    except Exception as exc:
        logger.error(f"[{job_id}] pipeline failed at {elapsed()} — {exc}")
        update_job(job_id, {"status": "failed", "error": str(exc)})
        if refund_credits_fn:
            refund_credits_fn()
    finally:
        if raw_s3_key:
            delete_file(raw_s3_key)
            logger.info(f"[{job_id}] raw video deleted from S3")
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)

