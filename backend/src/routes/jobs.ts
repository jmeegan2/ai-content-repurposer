import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import type { Job, Clip } from "../types/index.js";
import { runPipeline } from "../services/pipeline.js";
import { getPresignedUrl } from "../services/s3.js";
import { supabase } from "../services/supabase.js";

const router = Router();

function dbJobToJob(row: Record<string, unknown>, clips: Clip[] = []): Job {
  return {
    id: row.id as string,
    youtubeUrl: row.youtube_url as string,
    status: row.status as Job["status"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    transcript: row.transcript as Job["transcript"],
    error: row.error as string | undefined,
    clips,
  };
}

function dbClipToClip(row: Record<string, unknown>): Clip {
  return {
    id: row.id as string,
    startTime: row.start_time as number,
    endTime: row.end_time as number,
    title: row.title as string,
    s3Key: row.s3_key as string,
    thumbnailKey: row.thumbnail_key as string | undefined,
  };
}

async function updateJob(id: string, patch: Partial<Job>) {
  const { clips, ...rest } = patch;

  const dbPatch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (rest.status !== undefined) dbPatch.status = rest.status;
  if (rest.transcript !== undefined) dbPatch.transcript = rest.transcript;
  if (rest.error !== undefined) dbPatch.error = rest.error;

  if (Object.keys(dbPatch).length > 1) {
    await supabase.from("jobs").update(dbPatch).eq("id", id);
  }

  // Only upsert clips once they have s3Keys (after processing)
  if (clips && clips.length > 0 && clips.some((c) => c.s3Key)) {
    const clipRows = clips.map((c) => ({
      id: c.id,
      job_id: id,
      start_time: c.startTime,
      end_time: c.endTime,
      title: c.title,
      s3_key: c.s3Key,
      thumbnail_key: c.thumbnailKey ?? null,
    }));
    await supabase.from("clips").upsert(clipRows, { onConflict: "id" });
  }
}

router.post("/", async (req, res) => {
  const { youtubeUrl } = req.body as { youtubeUrl?: string };

  if (
    !youtubeUrl ||
    (!youtubeUrl.includes("youtube.com") && !youtubeUrl.includes("youtu.be"))
  ) {
    res.status(400).json({ error: "Valid YouTube URL required" });
    return;
  }

  const jobId = uuidv4();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      id: jobId,
      user_id: req.userId,
      youtube_url: youtubeUrl,
      status: "queued",
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error || !data) {
    res.status(500).json({ error: "Failed to create job" });
    return;
  }

  runPipeline(jobId, youtubeUrl, updateJob);

  res.status(201).json(dbJobToJob(data));
});

router.get("/:id", async (req, res) => {
  const { data: jobRow, error: jobError } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", req.params.id)
    .eq("user_id", req.userId)
    .single();

  if (jobError || !jobRow) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const { data: clipRows } = await supabase
    .from("clips")
    .select("*")
    .eq("job_id", req.params.id);

  let clips = (clipRows ?? []).map(dbClipToClip);

  if (jobRow.status === "done" && clips.length > 0) {
    clips = await Promise.all(
      clips.map(async (clip) => ({
        ...clip,
        s3Url: clip.s3Key
          ? await getPresignedUrl(
              clip.s3Key,
              3600,
              `${clip.title
                .replace(/[^\x00-\x7F]/g, "")
                .replace(/[^\w\s-]/g, "")
                .trim()}.mp4`,
            )
          : undefined,
        thumbnailUrl: clip.thumbnailKey
          ? await getPresignedUrl(clip.thumbnailKey)
          : undefined,
      })),
    );
  }

  res.json(dbJobToJob(jobRow, clips));
});

router.get("/", async (req, res) => {
  const { data: jobRows, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("user_id", req.userId)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: "Failed to fetch jobs" });
    return;
  }

  res.json((jobRows ?? []).map((row) => dbJobToJob(row)));
});

export default router;
