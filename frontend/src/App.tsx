import { useEffect, useState } from "react";
import { getJob, getJobs, cancelJob, getCredits } from "./api";
import type { Job } from "./types";
import { UrlForm } from "./components/UrlForm";
import { JobSection } from "./components/JobSection";
import { LoginPage } from "./components/LoginPage";
import { SignupPage } from "./components/SignupPage";
import { PricingPage } from "./components/PricingPage";
import { ResetPasswordPage } from "./components/ResetPasswordPage";
import { useSession, useAuthEvent } from "./lib/auth";
import { supabase } from "./lib/supabase";
import { useUpload } from "./hooks/useUpload";

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
  const authEvent = useAuthEvent();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [view, setView] = useState<"dashboard" | "pricing">("dashboard");
  const [authView, setAuthView] = useState<"login" | "signup">("login");
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | undefined>(undefined);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const { submit, submitting, uploadProgress, abortUpload, error } = useUpload((job) =>
    setJobs((prev) => [job, ...prev])
  );

  // Load job history and subscription status on mount
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

  // Poll all active jobs every 2s
  const activeIds = jobs.filter(isActive).map((j) => j.id);
  useEffect(() => {
    if (activeIds.length === 0) return;
    const interval = setInterval(async () => {
      let shouldRefreshCredits = false;
      await Promise.all(
        activeIds.map(async (id) => {
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

  const isRunning = submitting || jobs.some((j) => !TERMINAL.has(j.status));

  if (authEvent === "PASSWORD_RECOVERY") return <ResetPasswordPage />;
  if (!session) {
    if (authView === "signup") return <SignupPage onSignIn={() => setAuthView("login")} />;
    return <LoginPage onSignUp={() => setAuthView("signup")} />;
  }
  if (view === "pricing") return <PricingPage onBack={() => setView("dashboard")} subscriptionStatus={subscriptionStatus} />;

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
            {creditsRemaining !== null && (
              <span className="text-zinc-500 text-sm">
                {creditsRemaining} credits
              </span>
            )}
            <button
              onClick={() => setView("pricing")}
              className="text-zinc-400 text-sm hover:text-zinc-200"
            >
              {subscriptionStatus && (subscriptionStatus === "active" ? "Top-up" : "Upgrade")}
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
          <UrlForm onFileSubmit={submit} disabled={isRunning} uploadProgress={uploadProgress} onCancelUpload={abortUpload ?? undefined} />
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
