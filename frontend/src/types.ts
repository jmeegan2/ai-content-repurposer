export type JobStatus =
  | "queued"
  | "downloading"
  | "transcribing"
  | "detecting"
  | "processing"
  | "done"
  | "failed";

export interface Clip {
  id: string;
  startTime: number;
  endTime: number;
  title: string;
  s3Key: string;
  s3Url?: string;
  thumbnailUrl?: string;
  youtubeVideoId?: string;
  youtubeUploadStatus?: "pending" | "uploaded" | "failed";
}

export interface Job {
  id: string;
  youtubeUrl: string;
  status: JobStatus;
  clips: Clip[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}
