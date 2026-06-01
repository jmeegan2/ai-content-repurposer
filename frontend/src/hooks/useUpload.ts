import { useState } from "react";
import { requestUploadUrl, uploadToS3, completeUpload, cancelJob } from "../api";
import type { Job } from "../types";

function getVideoMetadata(file: File): Promise<{ durationSeconds: number; thumbnailBlob: Blob | null }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const duration = Math.ceil(video.duration);
      video.currentTime = video.duration * 0.1;
      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) { URL.revokeObjectURL(url); resolve({ durationSeconds: duration, thumbnailBlob: null }); return; }
          ctx.drawImage(video, 0, 0);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            resolve({ durationSeconds: duration, thumbnailBlob: blob });
          }, "image/jpeg", 0.8);
        } catch {
          URL.revokeObjectURL(url);
          resolve({ durationSeconds: duration, thumbnailBlob: null });
        }
      };
    };
    video.onerror = () => { URL.revokeObjectURL(url); resolve({ durationSeconds: 0, thumbnailBlob: null }); };
    video.src = url;
  });
}

interface PendingJob {
  jobId: string;
  s3Key: string;
  durationSeconds: number;
  localThumbUrl: string | null;
}

export function useUpload(onJobCreated: (job: Job) => void) {
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [abortUpload, setAbortUpload] = useState<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingJob, setPendingJob] = useState<PendingJob | null>(null);
  const [localThumbnails, setLocalThumbnails] = useState<Map<string, string>>(new Map());

  async function startUpload(file: File) {
    setUploading(true);
    setError(null);
    setUploadProgress(0);
    let jobId: string | null = null;
    let localThumbUrl: string | null = null;
    try {
      const { durationSeconds, thumbnailBlob } = await getVideoMetadata(file);
      const { job_id, upload_url, s3_key, thumbnail_upload_url } = await requestUploadUrl(file.name, durationSeconds);
      jobId = job_id;

      if (thumbnailBlob) {
        localThumbUrl = URL.createObjectURL(thumbnailBlob);
        setLocalThumbnails((prev) => new Map(prev).set(job_id, localThumbUrl!));
        fetch(thumbnail_upload_url, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          body: thumbnailBlob,
        }).catch(() => {});
      }

      const { promise, abort } = uploadToS3(upload_url, file, setUploadProgress);
      setAbortUpload(() => abort);
      await promise;
      setAbortUpload(null);
      setUploadProgress(null);
      setPendingJob({ jobId: job_id, s3Key: s3_key, durationSeconds, localThumbUrl });
    } catch (err) {
      const aborted = err instanceof Error && err.message === "upload_aborted";
      if (jobId) {
        await cancelJob(jobId).catch(() => {});
        if (localThumbUrl) {
          URL.revokeObjectURL(localThumbUrl);
          setLocalThumbnails((prev) => { const m = new Map(prev); m.delete(jobId!); return m; });
        }
      }
      if (!aborted) setError(err instanceof Error ? err.message : "Something went wrong");
      setAbortUpload(null);
      setUploadProgress(null);
    } finally {
      setUploading(false);
    }
  }

  async function generateClips() {
    if (!pendingJob) return;
    setProcessing(true);
    setError(null);
    const { jobId, s3Key, durationSeconds, localThumbUrl } = pendingJob;
    try {
      const newJob = await completeUpload(jobId, s3Key, durationSeconds);
      setPendingJob(null);
      onJobCreated(newJob);
    } catch (err) {
      await cancelJob(jobId).catch(() => {});
      if (localThumbUrl) {
        URL.revokeObjectURL(localThumbUrl);
        setLocalThumbnails((prev) => { const m = new Map(prev); m.delete(jobId); return m; });
      }
      setPendingJob(null);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setProcessing(false);
    }
  }

  async function cancelPendingUpload() {
    if (!pendingJob) return;
    await cancelJob(pendingJob.jobId).catch(() => {});
    if (pendingJob.localThumbUrl) {
      URL.revokeObjectURL(pendingJob.localThumbUrl);
      setLocalThumbnails((prev) => { const m = new Map(prev); m.delete(pendingJob.jobId); return m; });
    }
    setPendingJob(null);
  }

  return {
    startUpload,
    generateClips,
    cancelPendingUpload,
    uploading,
    processing,
    uploadProgress,
    abortUpload,
    uploadDone: pendingJob !== null,
    pendingThumbnailUrl: pendingJob?.localThumbUrl ?? null,
    creditsNeeded: pendingJob ? Math.ceil(pendingJob.durationSeconds / 60) : null,
    error,
    clearError: () => setError(null),
    localThumbnails,
  };
}
