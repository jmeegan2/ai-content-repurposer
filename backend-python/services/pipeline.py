import logging
import os
import shutil
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable

logger = logging.getLogger(__name__)

from models import Clip
from services.downloader import download_youtube_video
from services.transcriber import transcribe_video
from services.clip_detector import detect_clips
from services.clipper import process_clip
from services.s3 import upload_file

UpdateJobFn = Callable[[str, dict], None]

# Max concurrent jobs — jobs beyond this wait in "queued" status
# until a slot opens. Prevents OOM on limited Railway instances.
_JOB_QUEUE = threading.Semaphore(2)

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


def run_pipeline_from_file(job_id: str, file_path: str, temp_dir: str, update_job: UpdateJobFn) -> None:
    """Same as run_pipeline but skips the download step — file is already on disk."""
    _JOB_QUEUE.acquire()
    t_start = time.time()
    def elapsed() -> str:
        return f"{time.time() - t_start:.1f}s"
    try:
        logger.info(f"[{job_id}] pipeline start (file upload)")

        t = time.time()
        file_name = os.path.basename(file_path)
        upload_file(f"raw/{job_id}/{file_name}", file_path)
        logger.info(f"[{job_id}] raw upload done ({time.time() - t:.1f}s)")

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
    finally:
        _JOB_QUEUE.release()
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


def run_pipeline(job_id: str, youtube_url: str, update_job: UpdateJobFn) -> None:
    _JOB_QUEUE.acquire()
    t_start = time.time()
    def elapsed() -> str:
        return f"{time.time() - t_start:.1f}s"
    temp_dir = None
    try:
        logger.info(f"[{job_id}] pipeline start (youtube)")

        update_job(job_id, {"status": "downloading"})
        t = time.time()
        file_path, temp_dir = download_youtube_video(youtube_url)
        logger.info(f"[{job_id}] download done ({time.time() - t:.1f}s)")

        file_name = os.path.basename(file_path)
        upload_file(f"raw/{job_id}/{file_name}", file_path)

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
    finally:
        _JOB_QUEUE.release()
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
