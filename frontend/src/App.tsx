import { useEffect, useState } from "react";
import { requestUploadUrl, uploadToS3, completeUpload, getJob, getJobs, cancelJob } from "./api";
import type { Job } from "./types";
import { UrlForm } from "./components/UrlForm";
import { JobSection } from "./components/JobSection";
import { LoginPage } from "./components/LoginPage";
import { PricingPage } from "./components/PricingPage";
import { useSession } from "./lib/auth";
import { supabase } from "./lib/supabase";

const TERMINAL = new Set(["done", "failed", "cancelled"]);

function isActive(job: Job) {
  return (
    !TERMINAL.has(job.status) ||
    job.clips.some((c) => c.youtubeUploadStatus === "pending")
  );
}

function ClipCardSkeleton() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col animate-pulse">
      <div className="aspect-[9/16] bg-zinc-800" />
      <div className="p-4 flex flex-col gap-3">
        <div className="h-3 bg-zinc-800 rounded w-3/4" />
        <div className="h-3 bg-zinc-800 rounded w-1/2" />
        <div className="h-8 bg-zinc-800 rounded mt-auto" />
      </div>
    </div>
  );
}

export default function App() {
  const session = useSession();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [abortUpload, setAbortUpload] = useState<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"dashboard" | "pricing">("dashboard");

  // Load job history on mount
  useEffect(() => {
    if (!session) return;
    setLoadingJobs(true);
    getJobs()
      .then(setJobs)
      .catch(() => {})
      .finally(() => setLoadingJobs(false));
  }, [session?.user.id]);

  // Poll all active jobs every 2s
  const activeIds = jobs.filter(isActive).map((j) => j.id);
  useEffect(() => {
    if (activeIds.length === 0) return;
    const interval = setInterval(async () => {
      await Promise.all(
        activeIds.map(async (id) => {
          try {
            const updated = await getJob(id);
            setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
          } catch {}
        }),
      );
    }, 2000);
    return () => clearInterval(interval);
  }, [activeIds.join(",")]);

  function updateJob(updated: Job) {
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
  }

  async function handleCancel(jobId: string) {
    try {
      await cancelJob(jobId);
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: "cancelled" } : j))
      );
    } catch {}
  }

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

  async function handleFileSubmit(file: File) {
    setSubmitting(true);
    setError(null);
    setUploadProgress(0);
    let jobId: string | null = null;
    try {
      const [{ job_id, upload_url, s3_key }, durationSeconds] = await Promise.all([
        requestUploadUrl(file.name),
        getVideoDuration(file),
      ]);
      jobId = job_id;
      const { promise, abort } = uploadToS3(upload_url, file, setUploadProgress);
      setAbortUpload(() => abort);
      await promise;
      setAbortUpload(null);
      setUploadProgress(null);
      const newJob = await completeUpload(job_id, s3_key, durationSeconds);
      setJobs((prev) => [newJob, ...prev]);
    } catch (err) {
      const aborted = err instanceof Error && err.message === "upload_aborted";
      if (aborted && jobId) await cancelJob(jobId).catch(() => {});
      if (!aborted) setError(err instanceof Error ? err.message : "Something went wrong");
      setAbortUpload(null);
      setUploadProgress(null);
    } finally {
      setSubmitting(false);
    }
  }

  const isRunning = submitting || jobs.some((j) => !TERMINAL.has(j.status));

  if (!session) return <LoginPage />;
  if (view === "pricing") return <PricingPage onBack={() => setView("dashboard")} />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-12 flex flex-col gap-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">AI Repurposer</h1>
            <p className="text-zinc-500 text-sm mt-1">
              Upload an MP4. Get 9:16 clips with captions.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView("pricing")}
              className="text-zinc-400 text-sm hover:text-zinc-200"
            >
              Upgrade
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-zinc-500 text-sm hover:text-zinc-300"
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <UrlForm onFileSubmit={handleFileSubmit} disabled={isRunning} uploadProgress={uploadProgress} onCancelUpload={abortUpload ?? undefined} />
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        {loadingJobs && (
          <div className="flex flex-col gap-4">
            <div className="h-4 bg-zinc-800 rounded w-24 animate-pulse" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => <ClipCardSkeleton key={i} />)}
            </div>
          </div>
        )}

        {!loadingJobs && jobs.length > 0 && (
          <div className="flex flex-col gap-12">
            {jobs.map((job) => (
              <JobSection key={job.id} job={job} onJobUpdate={updateJob} onCancel={handleCancel} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
