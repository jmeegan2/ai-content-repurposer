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

export async function createJob(youtubeUrl: string): Promise<Job> {
  const res = await fetch(`${BASE}/jobs`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ youtubeUrl }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Failed to create job");
  }
  return res.json();
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

export async function createJobFromFile(file: File): Promise<Job> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/jobs/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Failed to create job");
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
