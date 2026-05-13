import os
import shutil
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable

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


def run_pipeline(job_id: str, youtube_url: str, update_job: UpdateJobFn) -> None:
    # Block here if max concurrent jobs are running — job stays "queued" in DB
    _JOB_QUEUE.acquire()
    temp_dir = None
    try:
        update_job(job_id, {"status": "downloading"})
        file_path, temp_dir = download_youtube_video(youtube_url)

        file_name = os.path.basename(file_path)
        upload_file(f"raw/{job_id}/{file_name}", file_path)

        update_job(job_id, {"status": "transcribing"})
        transcript = transcribe_video(file_path)
        update_job(job_id, {"transcript": transcript.model_dump()})

        update_job(job_id, {"status": "detecting"})
        detected = detect_clips(transcript)
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

        # Process all clips in parallel
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
                future.result()  # re-raises any exception from the worker

        update_job(job_id, {"clips": [c.model_dump() for c in clips], "status": "done"})

    except Exception as exc:
        update_job(job_id, {"status": "failed", "error": str(exc)})
    finally:
        _JOB_QUEUE.release()
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
