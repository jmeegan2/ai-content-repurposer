import { useEffect, useState } from "react";
import { createJob, createJobFromFile, getJob } from "./api";
import type { Job } from "./types";
import { UrlForm } from "./components/UrlForm";
import { PipelineStatus } from "./components/PipelineStatus";
import { ClipCard } from "./components/ClipCard";
import { LoginPage } from "./components/LoginPage";
import { PricingPage } from "./components/PricingPage";
import { useSession } from "./lib/auth";
import { supabase } from "./lib/supabase";

const TERMINAL = new Set(["done", "failed"]);

export default function App() {
  const session = useSession();
  const [job, setJob] = useState<Job | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"dashboard" | "pricing">("dashboard");

  useEffect(() => {
    if (!job || TERMINAL.has(job.status)) return;
    const id = setInterval(async () => {
      try {
        const updated = await getJob(job.id);
        setJob(updated);
      } catch {
        // ignore transient fetch errors
      }
    }, 2000);
    return () => clearInterval(id);
  }, [job?.id, job?.status]);

  async function handleSubmit(url: string) {
    setSubmitting(true);
    setError(null);
    setJob(null);
    try {
      const newJob = await createJob(url);
      setJob(newJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFileSubmit(file: File) {
    setSubmitting(true);
    setError(null);
    setJob(null);
    try {
      const newJob = await createJobFromFile(file);
      setJob(newJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const isRunning = submitting || (job !== null && !TERMINAL.has(job.status));

  if (!session) return <LoginPage />;
  if (view === "pricing") return <PricingPage onBack={() => setView("dashboard")} />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-12 flex flex-col gap-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              AI Repurposer
            </h1>
            <p className="text-zinc-500 text-sm mt-1">
              Paste a YouTube URL. Get 9:16 clips with captions.
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
          <UrlForm onSubmit={handleSubmit} onFileSubmit={handleFileSubmit} disabled={isRunning} />
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        {job && <PipelineStatus status={job.status} error={job.error} />}

        {job?.clips && job.clips.length > 0 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
              {job.status === "done"
                ? `${job.clips.length} clips ready`
                : "Clips"}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {job.clips.map((clip) => (
                <ClipCard key={clip.id} clip={clip} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
