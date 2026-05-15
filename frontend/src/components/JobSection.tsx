import type { Job } from "../types";
import { ClipCard } from "./ClipCard";
import { PipelineStatus } from "./PipelineStatus";

interface Props {
  job: Job;
  onJobUpdate: (job: Job) => void;
}

const STATUS_LABEL: Record<string, string> = {
  done: "Done",
  failed: "Failed",
  queued: "Queued",
  downloading: "Downloading",
  transcribing: "Transcribing",
  detecting: "Detecting clips",
  processing: "Processing",
};

const STATUS_COLOR: Record<string, string> = {
  done: "bg-emerald-500/15 text-emerald-400",
  failed: "bg-red-500/15 text-red-400",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function JobSection({ job, onJobUpdate }: Props) {
  const colorClass =
    STATUS_COLOR[job.status] ?? "bg-zinc-700/40 text-zinc-400";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-zinc-500 text-sm">{timeAgo(job.createdAt)}</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colorClass}`}>
          {STATUS_LABEL[job.status] ?? job.status}
        </span>
      </div>

      {job.status !== "done" && job.status !== "failed" && (
        <PipelineStatus status={job.status} error={job.error} />
      )}

      {job.status === "failed" && job.error && (
        <p className="text-red-400 text-sm">{job.error}</p>
      )}

      {job.clips.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {job.clips.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              jobId={job.id}
              onJobUpdate={onJobUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
