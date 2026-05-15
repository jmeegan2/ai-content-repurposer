import { useState } from "react";
import { getYoutubeAuthUrl } from "../api";

interface Props {
  onClose: () => void;
}

export function ConnectYoutubeModal({ onClose }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    try {
      const url = await getYoutubeAuthUrl();
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-sm w-full flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </div>
            <h2 className="text-white font-semibold">Connect YouTube</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">×</button>
        </div>
        <p className="text-zinc-400 text-sm">
          Connect your YouTube account to publish clips directly as Shorts — no manual re-upload needed.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConnect}
            disabled={loading}
            className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {loading ? "Redirecting…" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
