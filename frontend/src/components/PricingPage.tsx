import { useState } from "react";
import { createCheckoutSession, createTopupSession, createPortalSession } from "../api";
import { useSession } from "../lib/auth";

interface Props {
  onBack: () => void;
  subscriptionStatus?: string;
}

export function PricingPage({ onBack, subscriptionStatus }: Props) {
  const session = useSession();
  const [loadingPro, setLoadingPro] = useState(false);
  const [loadingTopup, setLoadingTopup] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSubscribed = subscriptionStatus === "active";

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
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-12 flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
          <button
            onClick={onBack}
            className="text-zinc-500 text-sm hover:text-zinc-300"
          >
            ← Back
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          {/* Pro Subscription */}
          <div className="border border-zinc-800 rounded-lg p-8 flex flex-col gap-6 flex-1">
            <div>
              <p className="text-sm text-zinc-400 uppercase tracking-wider">Pro</p>
              <p className="text-4xl font-bold mt-1">
                $9.99
                <span className="text-lg font-normal text-zinc-400">/mo</span>
              </p>
            </div>

            <ul className="flex flex-col gap-2 text-sm text-zinc-300">
              <li>150 credits per month</li>
              <li>Credits reset on renewal</li>
              <li>9:16 crop + burned captions</li>
              <li>TikTok, Reels &amp; Shorts ready</li>
            </ul>

            {isSubscribed ? (
              <button
                onClick={handleManageBilling}
                disabled={loadingPortal}
                className="bg-zinc-800 text-white font-medium py-2 px-4 rounded hover:bg-zinc-700 disabled:opacity-50"
              >
                {loadingPortal ? "Redirecting..." : "Manage Billing"}
              </button>
            ) : (
              <button
                onClick={handleUpgrade}
                disabled={loadingPro}
                className="bg-white text-zinc-950 font-medium py-2 px-4 rounded hover:bg-zinc-200 disabled:opacity-50"
              >
                {loadingPro ? "Redirecting..." : "Upgrade"}
              </button>
            )}
          </div>

          {/* Credits Top-up */}
          <div className="border border-zinc-800 rounded-lg p-8 flex flex-col gap-6 flex-1">
            <div>
              <p className="text-sm text-zinc-400 uppercase tracking-wider">Top-up</p>
              <p className="text-4xl font-bold mt-1">
                $7.99
                <span className="text-lg font-normal text-zinc-400"> one-time</span>
              </p>
            </div>

            <ul className="flex flex-col gap-2 text-sm text-zinc-300">
              <li>100 credits added instantly</li>
              <li>No subscription required</li>
              <li>Credits never expire</li>
            </ul>

            <button
              onClick={handleTopup}
              disabled={loadingTopup}
              className="bg-white text-zinc-950 font-medium py-2 px-4 rounded hover:bg-zinc-200 disabled:opacity-50"
            >
              {loadingTopup ? "Redirecting..." : "Buy Credits"}
            </button>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    </div>
  );
}
