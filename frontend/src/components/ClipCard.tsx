import type { Clip } from "../types";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  clip: Clip;
}

export function ClipCard({ clip }: Props) {
  const duration = Math.round(clip.endTime - clip.startTime);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
      <div className="aspect-[9/16] bg-zinc-950 overflow-hidden">
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
            className="mt-auto bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors text-center"
          >
            Download MP4
          </a>
        ) : (
          <div className="mt-auto bg-zinc-800 text-zinc-500 text-sm px-4 py-2 rounded-lg text-center">
            Processing...
          </div>
        )}
      </div>
    </div>
  );
}
