import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createCheckoutSession, createTopupSession, createPortalSession, getCredits } from "../api";
import { useSession } from "../lib/auth";
import {
  isActiveSubscription,
  isPausedSubscription,
  pricingSubscriptionBadge,
} from "../subscriptionStatus";

const PRO_FEATURES = [
  "150 credits per month",
  "Credits reset on renewal",
  "9:16 crop + burned captions",
  "YouTube Shorts ready",
];

const TOPUP_FEATURES = [
  "100 credits added instantly",
  "No subscription required",
  "Credits never expire",
];

export function PricingPage() {
  const session = useSession();
  const userId = session?.user.id;
  const navigate = useNavigate();
  const [loadingPro, setLoadingPro] = useState(false);
  const [loadingTopup, setLoadingTopup] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!userId) return;
    getCredits()
      .then((data) => setSubscriptionStatus(data.subscriptionStatus))
      .catch(() => {});
  }, [userId]);

  const isSubscribed = isActiveSubscription(subscriptionStatus);
  const isPaused = isPausedSubscription(subscriptionStatus);
  const subscriptionBadge = pricingSubscriptionBadge(subscriptionStatus);

  async function handleUpgrade() {
    const email = session?.user.email;
    if (!email) return;
    setLoadingPro(true);
    setError(null);
    try {
      const url = await createCheckoutSession(email);
      window.location.href = url;
    } catch {
      setError("Failed to start checkout. Try again.");
      setLoadingPro(false);
    }
  }

  async function handleTopup() {
    const email = session?.user.email;
    if (!email) return;
    setLoadingTopup(true);
    setError(null);
    try {
      const url = await createTopupSession(email);
      window.location.href = url;
    } catch {
      setError("Failed to start top-up. Try again.");
      setLoadingTopup(false);
    }
  }

  async function handleManageBilling() {
    setLoadingPortal(true);
    setError(null);
    try {
      const url = await createPortalSession();
      window.location.href = url;
    } catch {
      setError("Failed to open billing portal. Try again.");
      setLoadingPortal(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface text-white antialiased">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-zinc-800 bg-surface/90 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-bold text-base tracking-tight">ClipCraft</span>
          <button
            onClick={() => navigate(-1)}
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            ← Back
          </button>
        </div>
      </nav>

      {/* Header */}
      <section className="relative pt-14 pb-10 px-6 text-center overflow-hidden">
        <div
          aria-hidden
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(103,35,255,0.13) 0%, transparent 65%)",
          }}
        />
        <p className="relative text-zinc-600 text-xs uppercase tracking-widest font-semibold mb-3">
          Pricing
        </p>
        <h1
          className="relative text-3xl sm:text-4xl font-bold tracking-tight"
          style={{
            background: "linear-gradient(175deg, #ffffff 40%, #71717a 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Start free. Scale as you grow.
        </h1>
      </section>

      {/* Cards */}
      <div className="max-w-3xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Pro */}
          <div
            className="rounded-2xl p-8 flex flex-col gap-6"
            style={{
              background:
                "linear-gradient(140deg, rgba(103,35,255,0.12) 0%, #18181b 55%)",
              border: "1px solid rgba(103,35,255,0.3)",
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-brand text-xs uppercase tracking-wider font-semibold">Pro</p>
                <p className="text-5xl font-bold mt-2">
                  $9.99
                  <span className="text-lg font-normal text-zinc-500">/mo</span>
                </p>
              </div>
              {subscriptionBadge && (
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(103,35,255,0.15)", color: "#a78bfa" }}
                >
                  {subscriptionBadge}
                </span>
              )}
            </div>
            <ul className="flex flex-col gap-2.5 text-sm text-zinc-300">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-brand">✓</span> {f}
                </li>
              ))}
            </ul>
            {isSubscribed || isPaused ? (
              <button
                onClick={handleManageBilling}
                disabled={loadingPortal}
                className="mt-auto w-full border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {loadingPortal ? "Redirecting…" : isPaused ? "Resume Billing" : "Manage Billing"}
              </button>
            ) : (
              <button
                onClick={handleUpgrade}
                disabled={loadingPro}
                className="mt-auto w-full bg-white hover:bg-zinc-100 text-black text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {loadingPro ? "Redirecting…" : "Upgrade"}
              </button>
            )}
          </div>

          {/* Top-up */}
          <div className="bg-panel border border-zinc-800 rounded-2xl p-8 flex flex-col gap-6">
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wider font-semibold">Top-up</p>
              <p className="text-5xl font-bold mt-2">
                $7.99
                <span className="text-lg font-normal text-zinc-500"> one-time</span>
              </p>
            </div>
            <ul className="flex flex-col gap-2.5 text-sm text-zinc-400">
              {TOPUP_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-zinc-600">—</span> {f}
                </li>
              ))}
            </ul>
            <button
              onClick={handleTopup}
              disabled={loadingTopup}
              className="mt-auto w-full bg-white hover:bg-zinc-100 text-black text-sm font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              {loadingTopup ? "Redirecting…" : "Buy Credits"}
            </button>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
      </div>
    </div>
  );
}
