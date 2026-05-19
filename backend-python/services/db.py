from datetime import datetime, timezone


def update_job(supabase_client, job_id: str, patch: dict) -> None:
    clips = patch.pop("clips", None)

    db_patch: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    for field in ("status", "transcript", "error"):
        if field in patch:
            db_patch[field] = patch[field]

    if len(db_patch) > 1:
        supabase_client.table("jobs").update(db_patch).eq("id", job_id).execute()

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
            if c.get("s3_key")
        ]
        supabase_client.table("clips").upsert(clip_rows, on_conflict="job_id,start_time,end_time").execute()
