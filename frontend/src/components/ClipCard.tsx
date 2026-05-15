import { useState } from "react";
import type { Clip, Job } from "../types";
import { getYoutubeStatus, uploadClipToYoutube, getJob } from "../api";
import { ConnectYoutubeModal } from "./ConnectYoutubeModal";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  clip: Clip;
  jobId: string;
  onJobUpdate: (job: Job) => void;
}

export function ClipCard({ clip, jobId, onJobUpdate }: Props) {
  const duration = Math.round(clip.endTime - clip.startTime);
  const [uiState, setUiState] = useState<"idle" | "checking" | "connecting" | "editing">("idle");
  const [title, setTitle] = useState(clip.title);
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [playing, setPlaying] = useState(false);

  const uploadStatus = clip.youtubeUploadStatus;

  async function handleUploadClick() {
    setUiState("checking");
    try {
      const { connected } = await getYoutubeStatus();
      setUiState(connected ? "editing" : "connecting");
    } catch {
      setUiState("idle");
    }
  }

  async function handleUploadConfirm() {
    setUploading(true);
    try {
      await uploadClipToYoutube(clip.id, title, description);
      const updated = await getJob(jobId);
      onJobUpdate(updated);
      setUiState("idle");
    } catch {
      setUiState("idle");
    } finally {
      setUploading(false);
    }
  }

  function renderUploadSection() {
    // Inline editing takes priority so retry can reach the title input
    if (uiState === "editing") {
      return (
        <div className="mt-auto flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-zinc-500 text-xs">Title</label>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={3}
              maxLength={100}
              className="bg-zinc-800 border border-zinc-700 text-white text-xs px-3 py-2 rounded-lg w-full focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-zinc-500 text-xs">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
              className="bg-zinc-800 border border-zinc-700 text-white text-xs px-3 py-2 rounded-lg w-full focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setUiState("idle")}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs px-3 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleUploadConfirm}
              disabled={uploading || !title.trim()}
              className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
            >
              {uploading ? "Starting…" : "Upload"}
            </button>
          </div>
        </div>
      );
    }

    // Status driven by DB polling
    if (uploadStatus === "pending") {
      return (
        <div className="mt-auto flex items-center justify-center gap-2 bg-zinc-800 text-zinc-400 text-sm px-4 py-2 rounded-lg">
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
          </svg>
          Uploading…
        </div>
      );
    }

    if (uploadStatus === "uploaded" && clip.youtubeVideoId) {
      return (
        <a
          href={`https://youtube.com/shorts/${clip.youtubeVideoId}`}
          target="_blank"
          rel="noreferrer"
          className="mt-auto flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          View on YouTube
        </a>
      );
    }

    if (uploadStatus === "failed") {
      return (
        <div className="mt-auto flex flex-col gap-1">
          <p className="text-red-400 text-xs text-center">Upload failed</p>
          <button
            onClick={handleUploadClick}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }

    // Default: Upload to YouTube button (checking = loading state on button)
    if (!clip.s3Url) return null;

    return (
      <button
        onClick={handleUploadClick}
        disabled={uiState === "checking"}
        className="mt-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-zinc-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors w-full"
      >
        {uiState === "checking" ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
            </svg>
            Checking…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
            Upload to YouTube
          </>
        )}
      </button>
    );
  }

  return (
    <>
      {uiState === "connecting" && (
        <ConnectYoutubeModal onClose={() => setUiState("idle")} />
      )}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
        <div className="aspect-[9/16] bg-zinc-950 overflow-hidden relative">
          {playing && clip.s3Url ? (
            <video
              src={clip.s3Url}
              autoPlay
              controls
              className="w-full h-full object-cover"
            />
          ) : (
            <>
              {clip.thumbnailUrl ? (
                <img
                  src={clip.thumbnailUrl}
                  alt={clip.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg
                    className="w-10 h-10 text-zinc-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
                    />
                  </svg>
                </div>
              )}
              {clip.s3Url && (
                <button
                  onClick={() => setPlaying(true)}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors group"
                >
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/30 transition-colors">
                    <svg className="w-5 h-5 text-white translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </button>
              )}
            </>
          )}
        </div>
        <div className="p-4 flex flex-col gap-3 flex-1">
          <p className="text-white text-sm font-medium leading-snug line-clamp-2">
            {clip.title}
          </p>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>
              {formatTime(clip.startTime)} – {formatTime(clip.endTime)}
            </span>
            <span>·</span>
            <span>{duration}s</span>
          </div>
          {clip.s3Url ? (
            <a
              href={clip.s3Url}
              target="_blank"
              rel="noreferrer"
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors text-center"
            >
              Download MP4
            </a>
          ) : (
            <div className="bg-zinc-800 text-zinc-500 text-sm px-4 py-2 rounded-lg text-center">
              Processing...
            </div>
          )}
          {renderUploadSection()}
        </div>
      </div>
    </>
  );
}
