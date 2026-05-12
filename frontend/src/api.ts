import type { Job } from "./types";
import { supabase } from "./lib/supabase";

const BASE = "http://localhost:3001";
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
