import logging
import math
import re

logger = logging.getLogger(__name__)
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from models import Job, Clip
from middleware.auth import require_auth
from services.supabase_client import supabase
from services.s3 import get_presigned_url, generate_presigned_upload_url
from services.credits import deduct_credits, refund_job_credits, check_credits
import modal

router = APIRouter()


def _db_clip_to_clip(row: dict) -> Clip:
    return Clip(
        id=row["id"],
        start_time=row["start_time"],
        end_time=row["end_time"],
        title=row["title"],
        s3_key=row["s3_key"],
        thumbnail_key=row.get("thumbnail_key"),
        youtube_video_id=row.get("youtube_video_id"),
        youtube_upload_status=row.get("youtube_upload_status"),
    )


def _db_job_to_job(row: dict, clips: list[Clip] = []) -> Job:
    return Job(
        id=row["id"],
        youtube_url=row["youtube_url"],
        status=row["status"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        credits_deducted=row.get("credits_deducted"),
        transcript=row.get("transcript"),
        error=row.get("error"),
        clips=clips,
        source_thumbnail_key=row.get("source_thumbnail_key"),
    )


def _attach_source_thumbnail_url(job: Job) -> None:
    if job.source_thumbnail_key:
        job.source_thumbnail_url = get_presigned_url(job.source_thumbnail_key, _PRESIGNED_URL_TTL)


_PRESIGNED_URL_TTL = 3600


def _attach_clip_urls(clip: Clip) -> None:
    if clip.s3_key:
        safe_title = re.sub(r"[^\w\s-]", "", re.sub(r"[^\x00-\x7F]", "", clip.title)).strip()
        clip.s3_url = get_presigned_url(clip.s3_key, _PRESIGNED_URL_TTL, f"{safe_title}.mp4")
    if clip.thumbnail_key:
        clip.thumbnail_url = get_presigned_url(clip.thumbnail_key, _PRESIGNED_URL_TTL)


class UploadUrlRequest(BaseModel):
    filename: str
    duration_seconds: int


class UploadCompleteRequest(BaseModel):
    job_id: str
    s3_key: str
    duration_seconds: int


@router.post("/upload-url", status_code=201)
def request_upload_url(
    body: UploadUrlRequest,
    user_id: str = Depends(require_auth),
):
    if not body.filename.lower().endswith(".mp4"):
        raise HTTPException(status_code=400, detail="Only .mp4 files are supported")

    credits_needed = math.ceil(body.duration_seconds / 60)
    check_credits(supabase, user_id, credits_needed)

    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    s3_key = f"raw/{job_id}/{body.filename}"
    thumbnail_s3_key = f"thumbnails/{job_id}/source.jpg"

    try:
        response = (
            supabase.table("jobs")
            .insert({
                "id": job_id,
                "user_id": user_id,
                "youtube_url": f"upload:{body.filename}",
                "status": "queued",
                "created_at": now,
                "updated_at": now,
                "source_thumbnail_key": thumbnail_s3_key,
            })
            .execute()
        )
    except Exception as e:
        if "one_active_job_per_user" in str(e):
            raise HTTPException(status_code=409, detail="You already have a job processing")
        raise

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create job")

    upload_url = generate_presigned_upload_url(s3_key)
    thumbnail_upload_url = generate_presigned_upload_url(thumbnail_s3_key, content_type="image/jpeg")
    logger.info(f"[{job_id}] upload-url issued (user={user_id})")
    return {"job_id": job_id, "upload_url": upload_url, "s3_key": s3_key, "thumbnail_upload_url": thumbnail_upload_url}


@router.post("/upload-complete")
def complete_upload(
    body: UploadCompleteRequest,
    user_id: str = Depends(require_auth),
) -> Job:
    job_resp = (
        supabase.table("jobs")
        .select("*")
        .eq("id", body.job_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not job_resp.data:
        raise HTTPException(status_code=404, detail="Job not found")
    if job_resp.data["status"] != "queued":
        raise HTTPException(status_code=409, detail="Job is not in queued state")

    credits_needed = math.ceil(body.duration_seconds / 60) # not sure if this is right way of going about it
    deduct_credits(supabase, user_id, credits_needed)
    supabase.table("jobs").update({"credits_deducted": credits_needed}).eq("id", body.job_id).execute()

    try:
        modal_fn = modal.Function.from_name("ai-repurposer", "run_pipeline_from_s3_modal")
        call = modal_fn.spawn(body.job_id, body.s3_key, user_id)
        supabase.table("jobs").update({"modal_call_id": call.object_id}).eq("id", body.job_id).execute()
        logger.info(f"[{body.job_id}] spawned on Modal (call={call.object_id}), credits_used={credits_needed}")
    except Exception as e:
        logger.error(f"[{body.job_id}] Modal spawn failed — {e}")
        refund_job_credits(supabase, body.job_id, user_id)
        supabase.table("jobs").update({"status": "failed", "error": str(e)}).eq("id", body.job_id).execute()
        raise HTTPException(status_code=500, detail=f"Failed to start pipeline: {e}")

    return JSONResponse(content=jsonable_encoder(_db_job_to_job(job_resp.data), by_alias=True))


@router.delete("/{job_id}", status_code=204)
def cancel_job(job_id: str, user_id: str = Depends(require_auth)):
    job_resp = (
        supabase.table("jobs")
        .select("status, modal_call_id")
        .eq("id", job_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not job_resp.data:
        raise HTTPException(status_code=404, detail="Job not found")

    call_id = job_resp.data.get("modal_call_id")
    if call_id:
        try:
            modal.FunctionCall.from_id(call_id).cancel()
            logger.info(f"[{job_id}] Modal call {call_id} cancelled")
        except Exception as e:
            logger.warning(f"[{job_id}] Modal cancel failed — {e}")

    # Atomically claim the cancellation — only succeeds if job is not already terminal.
    # This prevents concurrent cancel requests from each refunding credits.
    update_resp = (
        supabase.table("jobs")
        .update({"status": "cancelled"})
        .eq("id", job_id)
        .eq("user_id", user_id)
        .not_.in_("status", ["done", "failed", "cancelled"])
        .execute()
    )
    if not update_resp.data:
        raise HTTPException(status_code=409, detail="Job is already in a terminal state")

    refund_job_credits(supabase, job_id, user_id)
    logger.info(f"[{job_id}] cancelled by user={user_id}")


@router.get("/{job_id}")
def get_job(job_id: str, user_id: str = Depends(require_auth)) -> Job:
    job_resp = (
        supabase.table("jobs")
        .select("*")
        .eq("id", job_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not job_resp.data:
        raise HTTPException(status_code=404, detail="Job not found")

    clip_resp = supabase.table("clips").select("*").eq("job_id", job_id).order("start_time", desc=False).execute()
    clips = [_db_clip_to_clip(row) for row in (clip_resp.data or [])]

    if job_resp.data["status"] == "done" and clips:
        for clip in clips:
            _attach_clip_urls(clip)

    job = _db_job_to_job(job_resp.data, clips)
    _attach_source_thumbnail_url(job)
    return JSONResponse(content=jsonable_encoder(job, by_alias=True))


@router.get("/")
def list_jobs(user_id: str = Depends(require_auth)) -> list[Job]:
    response = (
        supabase.table("jobs")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to fetch jobs")

    job_rows = response.data
    done_job_ids = [j["id"] for j in job_rows if j["status"] == "done"]

    clips_by_job: dict[str, list[Clip]] = {}
    if done_job_ids:
        clips_resp = (
            supabase.table("clips")
            .select("*")
            .in_("job_id", done_job_ids)
            .order("start_time", desc=False)
            .execute()
        )
        for row in clips_resp.data or []:
            clip = _db_clip_to_clip(row)
            _attach_clip_urls(clip)
            clips_by_job.setdefault(row["job_id"], []).append(clip)

    jobs = [_db_job_to_job(row, clips_by_job.get(row["id"], [])) for row in job_rows]
    for job in jobs:
        _attach_source_thumbnail_url(job)
    return JSONResponse(content=jsonable_encoder(jobs, by_alias=True))
