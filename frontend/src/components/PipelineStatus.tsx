import type { JobStatus } from "../types";

const STEPS: { key: JobStatus; label: string }[] = [
  { key: "downloading", label: "Download" },
  { key: "transcribing", label: "Transcribe" },
  { key: "detecting", label: "Detect clips" },
  { key: "processing", label: "Process" },
  { key: "done", label: "Done" },
];

const STATUS_INDEX: Record<JobStatus, number> = {
  queued: -1,
  downloading: 0,
  transcribing: 1,
  detecting: 2,
  processing: 3,
  done: 4,
  failed: -1,
};

interface Props {
  status: JobStatus;
  error?: string;
}

export function PipelineStatus({ status, error }: Props) {
  const currentIndex = STATUS_INDEX[status];

  if (status === "failed") {
    return (
      <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
        {error ?? "Something went wrong. Please try again."}
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between">
        {STEPS.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          const pending = i > currentIndex;

          return (
            <div key={step.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                    done
                      ? "bg-indigo-600 text-white"
                      : active
                        ? "bg-indigo-600 text-white ring-4 ring-indigo-600/20"
                        : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {done ? (
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : active ? (
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span
                  className={`text-xs whitespace-nowrap ${active ? "text-white" : pending ? "text-zinc-600" : "text-zinc-400"}`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px mx-2 mb-5 ${i < currentIndex ? "bg-indigo-600" : "bg-zinc-800"}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
