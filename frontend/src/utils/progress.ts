import type { JobStatus } from "../types";

const STATUS_PERCENT: Record<JobStatus, number> = {
  queued: 5,
  downloading: 15,
  transcribing: 35,
  detecting: 65,
  processing: 80,
  done: 100,
  failed: 0,
  cancelled: 0,
};

export function statusToPercent(status: JobStatus): number {
  return STATUS_PERCENT[status] ?? 5;
}

export function calcEta(creditsDeducted: number, percent: number): string {
  const totalMin = 2 + creditsDeducted * 0.4;
  const remainMin = totalMin * (1 - percent / 100);
  if (remainMin < 1) return "< 1m";
  return `${Math.round(remainMin)}m`;
}
