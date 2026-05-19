import type { Job } from "./types";
import { supabase } from "./lib/supabase";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function getJob(id: string): Promise<Job> {
  if (!UUID_RE.test(id)) throw new Error("Invalid job ID");
  const res = await fetch(`${BASE}/jobs/${id}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch job");
  return res.json();
}

export async function getJobs(): Promise<Job[]> {
  const res = await fetch(`${BASE}/jobs`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch jobs");
  return res.json();
}

export async function requestUploadUrl(
  filename: string,
): Promise<{ job_id: string; upload_url: string; s3_key: string }> {
  const res = await fetch(`${BASE}/jobs/upload-url`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ filename }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? "Failed to initialize upload");
  }
  return res.json();
}

export function uploadToS3(
  uploadUrl: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", "video/mp4");
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => (xhr.status === 200 ? resolve() : reject(new Error(`S3 upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("S3 upload network error"));
    xhr.send(file);
  });
}

export async function completeUpload(jobId: string, s3Key: string): Promise<Job> {
  const res = await fetch(`${BASE}/jobs/upload-complete`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ job_id: jobId, s3_key: s3Key }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? "Failed to start processing");
  }
  return res.json();
}

export async function createCheckoutSession(email: string): Promise<string> {
  const res = await fetch(`${BASE}/stripe/create-checkout-session`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error("Failed to create checkout session");
  const data = (await res.json()) as { url: string };
  return data.url;
}

export async function getYoutubeStatus(): Promise<{ connected: boolean }> {
  const res = await fetch(`${BASE}/auth/youtube/status`, {
    headers: await authHeaders(),
  });
  if (!res.ok) return { connected: false };
  return res.json();
}

export async function getYoutubeAuthUrl(): Promise<string> {
  const res = await fetch(`${BASE}/auth/youtube/url`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to get YouTube auth URL");
  const data = (await res.json()) as { url: string };
  return data.url;
}

export async function uploadClipToYoutube(
  clipId: string,
  title: string,
  description = "",
): Promise<void> {
  const res = await fetch(`${BASE}/clips/${clipId}/upload-youtube`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ title, description }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Failed to start YouTube upload");
  }
}
