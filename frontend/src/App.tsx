import { useEffect, useState } from "react";
import { createJob, getJob } from "./api";
import type { Job } from "./types";
import { UrlForm } from "./components/UrlForm";
import { PipelineStatus } from "./components/PipelineStatus";
import { ClipCard } from "./components/ClipCard";

const TERMINAL = new Set(["done", "failed"]);

export default function App() {
  const [job, setJob] = useState<Job | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const isRunning = submitting || (job !== null && !TERMINAL.has(job.status));

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-12 flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            AI Repurposer
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Paste a YouTube URL. Get 9:16 clips with captions.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <UrlForm onSubmit={handleSubmit} disabled={isRunning} />
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
