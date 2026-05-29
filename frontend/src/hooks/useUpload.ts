import { useState } from "react";
import { requestUploadUrl, uploadToS3, completeUpload, cancelJob } from "../api";
import type { Job } from "../types";

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(Math.ceil(video.duration));
    };
    video.onerror = () => resolve(0);
    video.src = URL.createObjectURL(file);
  });
}

export function useUpload(onJobCreated: (job: Job) => void) {
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [abortUpload, setAbortUpload] = useState<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(file: File) {
    setSubmitting(true);
    setError(null);
    setUploadProgress(0);
    let jobId: string | null = null;
    try {
      const durationSeconds = await getVideoDuration(file);
      const { job_id, upload_url, s3_key } = await requestUploadUrl(file.name, durationSeconds);
      jobId = job_id;
      const { promise, abort } = uploadToS3(upload_url, file, setUploadProgress);
      setAbortUpload(() => abort);
      await promise;
      setAbortUpload(null);
      setUploadProgress(null);
      const newJob = await completeUpload(job_id, s3_key, durationSeconds);
      onJobCreated(newJob);
    } catch (err) {
      const aborted = err instanceof Error && err.message === "upload_aborted";
      if (jobId) await cancelJob(jobId).catch(() => {});
      if (!aborted) setError(err instanceof Error ? err.message : "Something went wrong");
      setAbortUpload(null);
      setUploadProgress(null);
    } finally {
      setSubmitting(false);
    }
  }


  return { submit, submitting, uploadProgress, abortUpload, error, clearError: () => setError(null) };
}
