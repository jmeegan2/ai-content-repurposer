import { useState } from "react";
import type { Job } from "../types";
import { statusToPercent, calcEta } from "../utils/progress";

const TERMINAL = new Set(["done", "failed", "cancelled"]);

interface Props {
  job: Job;
  onCancel: (id: string) => void;
  localThumbnailUrl?: string;
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function ProcessingJobCard({ job, onCancel, localThumbnailUrl }: Props) {
  const percent = statusToPercent(job.status);
  const isFailed = job.status === "failed" || job.status === "cancelled";
  const filename = job.youtubeUrl.replace(/^upload:/, "");
  const [imgLoaded, setImgLoaded] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-900">
        <div className={`absolute inset-0 bg-zinc-800 transition-opacity duration-300 ${imgLoaded ? "opacity-0" : "opacity-100"}`} />
        {(localThumbnailUrl ?? job.sourceThumbnailUrl) && (
          <img
            src={localThumbnailUrl ?? job.sourceThumbnailUrl}
            alt=""
            onLoad={() => setImgLoaded(true)}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
          />
        )}
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute inset-0 flex items-center justify-center">
          {isFailed ? (
            <div className="flex items-center gap-2 bg-red-950/90 border border-red-800 rounded-full px-4 py-2 text-red-300">
              <XIcon />
              <span className="text-sm font-semibold">
                {job.status === "cancelled" ? "Cancelled" : "Failed"}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-zinc-900/90 border border-zinc-700 rounded-full px-4 py-2 text-emerald-400">
              <ClockIcon />
              <span className="text-sm font-semibold">
                {percent}%
                {job.creditsDeducted != null && (
                  <> (ETA {calcEta(job.creditsDeducted, percent)})</>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      <p className="text-sm text-zinc-300 truncate">{filename}</p>

      {!TERMINAL.has(job.status) && (
        <button
          onClick={() => onCancel(job.id)}
          className="text-xs text-zinc-500 hover:text-red-400 transition-colors self-start"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
