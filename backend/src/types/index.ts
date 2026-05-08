export type JobStatus =
  | "queued"
  | "downloading"
  | "transcribing"
  | "detecting"
  | "processing"
  | "done"
  | "failed";

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface Transcript {
  text: string;
  words: WordTimestamp[];
}

export interface Clip {
  id: string;
  startTime: number;
  endTime: number;
  title: string;
  s3Key: string;
  s3Url?: string;
  thumbnailKey?: string;
  thumbnailUrl?: string;
}

export interface Job {
  id: string;
  youtubeUrl: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  clips: Clip[];
  transcript?: Transcript;
  error?: string;
}
