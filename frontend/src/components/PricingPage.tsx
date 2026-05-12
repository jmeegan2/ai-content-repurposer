import { useState } from "react";
import { createCheckoutSession } from "../api";
import { useSession } from "../lib/auth";

interface Props {
  onBack: () => void;
}

export function PricingPage({ onBack }: Props) {
  const session = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade() {
    const email = session?.user.email;
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      const url = await createCheckoutSession(email);
      window.location.href = url;
    } catch {
      setError("Failed to start checkout. Try again.");
      setLoading(false);
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

        <div className="border border-zinc-800 rounded-lg p-8 flex flex-col gap-6 max-w-sm">
          <div>
            <p className="text-sm text-zinc-400 uppercase tracking-wider">Pro</p>
            <p className="text-4xl font-bold mt-1">
              $29
              <span className="text-lg font-normal text-zinc-400">/mo</span>
            </p>
          </div>

          <ul className="flex flex-col gap-2 text-sm text-zinc-300">
            <li>Unlimited clips</li>
            <li>9:16 crop + burned captions</li>
            <li>TikTok, Reels & Shorts ready</li>
          </ul>

          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="bg-white text-zinc-950 font-medium py-2 px-4 rounded hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading ? "Redirecting..." : "Upgrade"}
          </button>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
      </div>
    </div>
  );
}
