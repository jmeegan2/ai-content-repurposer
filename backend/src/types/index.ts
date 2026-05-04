export type JobStatus = 'queued' | 'downloading' | 'transcribing' | 'detecting' | 'processing' | 'done' | 'failed';

export interface Clip {
  id: string;
  startTime: number;
  endTime: number;
  title: string;
  s3Key: string;
  s3Url?: string;
}

export interface Job {
  id: string;
  youtubeUrl: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  clips: Clip[];
  error?: string;
}
