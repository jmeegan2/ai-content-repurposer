import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getJob, getJobs, cancelJob, getCredits, getClipYoutubeStatus } from "../api";
import type { Job } from "../types";
import { UrlForm } from "../components/UrlForm";
import { JobSection } from "../components/JobSection";
import { useSession } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { useUpload } from "../hooks/useUpload";

const TERMINAL = new Set(["done", "failed", "cancelled"]);

function isProcessing(job: Job) {
  return !TERMINAL.has(job.status);
}

function pendingYoutubeClipIds(job: Job): string[] {
  if (!TERMINAL.has(job.status)) return [];
  return job.clips.filter((c) => c.youtubeUploadStatus === "pending").map((c) => c.id);
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

export function DashboardPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | undefined>(undefined);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const { submit, submitting, uploadProgress, abortUpload, error } = useUpload((job) =>
    setJobs((prev) => [job, ...prev])
  );

  useEffect(() => {
    if (!session) return;
    setLoadingJobs(true);
    getJobs()
      .then(setJobs)
      .catch(() => {})
      .finally(() => setLoadingJobs(false));
    getCredits()
      .then((data) => {
        setSubscriptionStatus(data.subscriptionStatus);
        setCreditsRemaining(data.creditsRemaining);
      })
      .catch(() => {});
  }, [session?.user.id]);

  // Poll full job data only while the job is still processing
  const processingIds = jobs.filter(isProcessing).map((j) => j.id);
  useEffect(() => {
    if (processingIds.length === 0) return;
    const interval = setInterval(async () => {
      let shouldRefreshCredits = false;
      await Promise.all(
        processingIds.map(async (id) => {
          try {
            const updated = await getJob(id);
            setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
            if (updated.status === "done" || updated.status === "failed") {
              shouldRefreshCredits = true;
            }
          } catch {}
        }),
      );
      if (shouldRefreshCredits) {
        getCredits()
          .then((data) => {
            setSubscriptionStatus(data.subscriptionStatus);
            setCreditsRemaining(data.creditsRemaining);
          })
          .catch(() => {});
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [processingIds.join(",")]);

  // Poll only YouTube status for done jobs with pending uploads — never regenerates S3 URLs
  const pendingYoutubeIds = jobs.flatMap(pendingYoutubeClipIds);
  useEffect(() => {
    if (pendingYoutubeIds.length === 0) return;
    const interval = setInterval(async () => {
      await Promise.all(
        pendingYoutubeIds.map(async (clipId) => {
          try {
            const { youtubeUploadStatus, youtubeVideoId } = await getClipYoutubeStatus(clipId);
            setJobs((prev) =>
              prev.map((j) => ({
                ...j,
                clips: j.clips.map((c) =>
                  c.id === clipId
                    ? { ...c, youtubeUploadStatus: youtubeUploadStatus ?? undefined, youtubeVideoId: youtubeVideoId ?? undefined }
                    : c
                ),
              }))
            );
          } catch {}
        }),
      );
    }, 2000);
    return () => clearInterval(interval);
  }, [pendingYoutubeIds.join(",")]);

  function updateJob(updated: Job) {
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
  }

  async function handleCancel(jobId: string) {
    try {
      await cancelJob(jobId);
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: "cancelled" } : j))
      );
      getCredits().then((data) => setCreditsRemaining(data.creditsRemaining));
    } catch {}
  }

  const isRunning = submitting || jobs.some((j) => !TERMINAL.has(j.status));

  return (
    <div className="min-h-screen bg-surface text-white antialiased">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-zinc-800 bg-surface/90 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-bold text-base tracking-tight">ClipCraft</span>
          <div className="flex items-center gap-3">
            {creditsRemaining !== null && (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-white tabular-nums">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                  <path d="M7.5 1L2 7.5h4.5L5 12l6.5-6.5H7L7.5 1z" fill="#f59e0b" stroke="#f59e0b" strokeWidth="0.5" strokeLinejoin="round"/>
                </svg>
                {creditsRemaining}
              </span>
            )}
            {subscriptionStatus && (
              <button
                onClick={() => navigate("/pricing")}
                className="text-xs text-white font-medium bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                {subscriptionStatus === "active" ? "Add more credits" : "Upgrade"}
              </button>
            )}
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* Upload section */}
      <section className="relative pt-12 pb-8 px-6 overflow-hidden">
        {/* Ambient glow */}
        <div
          aria-hidden
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[320px] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(103,35,255,0.13) 0%, transparent 65%)",
          }}
        />

        <div className="relative max-w-lg mx-auto flex flex-col items-center text-center gap-6">
          <div>
            <h1
              className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight mb-2"
              style={{
                background: "linear-gradient(175deg, #ffffff 40%, #71717a 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Upload a video
            </h1>
            <p className="text-zinc-500 text-sm">
              Drop an MP4. Get face-tracked 9:16 clips with captions.
            </p>
          </div>

          <div className="w-full">
            <UrlForm
              onFileSubmit={submit}
              disabled={isRunning}
              uploadProgress={uploadProgress}
              onCancelUpload={abortUpload ?? undefined}
            />
            {error && (
              <p className="text-red-400 text-xs mt-2 text-left">{error}</p>
            )}
          </div>
        </div>
      </section>

      {/* Jobs section */}
      <div className="max-w-3xl mx-auto px-6 pb-16 flex flex-col gap-8">
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
