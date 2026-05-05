import { rm } from 'node:fs/promises';
import type { Job } from '../types/index.js';
import { downloadYouTubeVideo } from './downloader.js';
import { uploadFile } from './s3.js';
import { transcribeVideo } from './transcriber.js';

type UpdateJobFn = (id: string, patch: Partial<Job>) => void;

export async function runPipeline(jobId: string, youtubeUrl: string, updateJob: UpdateJobFn) {
  let tempDir: string | undefined;
  try {
    updateJob(jobId, { status: 'downloading' });
    const { filePath, tempDir: dir } = await downloadYouTubeVideo(youtubeUrl);
    tempDir = dir;

    const fileName = filePath.split('/').pop()!;
    const s3Key = `raw/${jobId}/${fileName}`;
    await uploadFile(s3Key, filePath);

    updateJob(jobId, { status: 'transcribing' });
    const transcript = await transcribeVideo(filePath);
    updateJob(jobId, { transcript });

    updateJob(jobId, { status: 'done' });
  } catch (err) {
    updateJob(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  }
}
