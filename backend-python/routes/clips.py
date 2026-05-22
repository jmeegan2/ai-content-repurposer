from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from pydantic import BaseModel
from middleware.auth import require_auth
from services.supabase_client import supabase
from services.youtube import upload_to_youtube

router = APIRouter()


class UploadYouTubeBody(BaseModel):
    title: str = ""
    description: str = ""


def _do_upload(user_id: str, clip_id: str, s3_key: str, title: str, description: str = "") -> None:
    try:
        video_id = upload_to_youtube(user_id, s3_key, title, description)
        supabase.table("clips").update(
            {"youtube_video_id": video_id, "youtube_upload_status": "uploaded"}
        ).eq("id", clip_id).execute()
    except Exception as e:
        print(f"YouTube upload failed for clip {clip_id}: {e}")
        supabase.table("clips").update(
            {"youtube_upload_status": "failed"}
        ).eq("id", clip_id).execute()


@router.post("/{clip_id}/upload-youtube", status_code=202)
async def upload_clip_to_youtube(
    clip_id: str,
    body: UploadYouTubeBody,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(require_auth),
):
    clip_result = (
        supabase.table("clips").select("*").eq("id", clip_id).maybe_single().execute()
    )
    if not clip_result.data:
        raise HTTPException(status_code=404, detail="Clip not found")

    clip = clip_result.data

    job_result = (
        supabase.table("jobs")
        .select("id")
        .eq("id", clip["job_id"])
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not job_result.data:
        raise HTTPException(status_code=404, detail="Clip not found")

    upload_title = (body.title or clip.get("title") or "Clip")[:100]
    upload_description = body.description[:5000]

    supabase.table("clips").update(
        {"youtube_upload_status": "pending"}
    ).eq("id", clip_id).execute()

    background_tasks.add_task(_do_upload, user_id, clip_id, clip["s3_key"], upload_title, upload_description)

    return {"status": "pending"}
