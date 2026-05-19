import logging
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
        transcript=row.get("transcript"),
        error=row.get("error"),
        clips=clips,
    )


def _update_job(job_id: str, patch: dict) -> None:
    clips = patch.pop("clips", None)

    db_patch: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    for field in ("status", "transcript", "error"):
        if field in patch:
            db_patch[field] = patch[field]

    if len(db_patch) > 1:
        supabase.table("jobs").update(db_patch).eq("id", job_id).execute()

    if clips and any(c.get("s3_key") for c in clips):
        clip_rows = [
            {
                "id": c["id"],
                "job_id": job_id,
                "start_time": c["start_time"],
                "end_time": c["end_time"],
                "title": c["title"],
                "s3_key": c["s3_key"],
                "thumbnail_key": c.get("thumbnail_key"),
            }
            for c in clips
        ]
        supabase.table("clips").upsert(clip_rows, on_conflict="id").execute()


class UploadUrlRequest(BaseModel):
    filename: str


class UploadCompleteRequest(BaseModel):
    job_id: str
    s3_key: str


@router.post("/upload-url", status_code=201)
def request_upload_url(
    body: UploadUrlRequest,
    user_id: str = Depends(require_auth),
):
    if not body.filename.lower().endswith(".mp4"):
        raise HTTPException(status_code=400, detail="Only .mp4 files are supported")

    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    s3_key = f"raw/{job_id}/{body.filename}"

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
    logger.info(f"[{job_id}] upload-url issued (user={user_id})")
    return {"job_id": job_id, "upload_url": upload_url, "s3_key": s3_key}


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

    try:
        modal_fn = modal.Function.from_name("ai-repurposer", "run_pipeline_from_s3_modal")
        modal_fn.spawn(body.job_id, body.s3_key, user_id)
        logger.info(f"[{body.job_id}] spawned on Modal (file upload)")
    except Exception as e:
        logger.error(f"[{body.job_id}] Modal spawn failed — {e}")
        supabase.table("jobs").update({"status": "failed", "error": str(e)}).eq("id", body.job_id).execute()
        raise HTTPException(status_code=500, detail=f"Failed to start pipeline: {e}")

    return JSONResponse(content=jsonable_encoder(_db_job_to_job(job_resp.data), by_alias=True))


@router.get("/{job_id}")
async def get_job(job_id: str, user_id: str = Depends(require_auth)) -> Job:
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

    clip_resp = supabase.table("clips").select("*").eq("job_id", job_id).execute()
    clips = [_db_clip_to_clip(row) for row in (clip_resp.data or [])]

    if job_resp.data["status"] == "done" and clips:
        for clip in clips:
            if clip.s3_key:
                safe_title = re.sub(r"[^\w\s-]", "", re.sub(r"[^\x00-\x7F]", "", clip.title)).strip()
                clip.s3_url = get_presigned_url(clip.s3_key, 3600, f"{safe_title}.mp4")
            if clip.thumbnail_key:
                clip.thumbnail_url = get_presigned_url(clip.thumbnail_key)

    return JSONResponse(content=jsonable_encoder(_db_job_to_job(job_resp.data, clips), by_alias=True))


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
            .execute()
        )
        for row in clips_resp.data or []:
            clip = _db_clip_to_clip(row)
            if clip.s3_key:
                safe_title = re.sub(r"[^\w\s-]", "", re.sub(r"[^\x00-\x7F]", "", clip.title)).strip()
                clip.s3_url = get_presigned_url(clip.s3_key, 3600, f"{safe_title}.mp4")
            if clip.thumbnail_key:
                clip.thumbnail_url = get_presigned_url(clip.thumbnail_key)
            clips_by_job.setdefault(row["job_id"], []).append(clip)

    return JSONResponse(
        content=jsonable_encoder(
            [_db_job_to_job(row, clips_by_job.get(row["id"], [])) for row in job_rows],
            by_alias=True,
        )
    )
