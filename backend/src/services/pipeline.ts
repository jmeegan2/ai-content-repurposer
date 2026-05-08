import { rm } from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';
import type { Job, Clip } from '../types/index.js';
import { downloadYouTubeVideo } from './downloader.js';
import { uploadFile } from './s3.js';
import { transcribeVideo } from './transcriber.js';
import { detectClips } from './clipDetector.js';
import { processClip } from './clipper.js';

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

    updateJob(jobId, { status: 'detecting' });
    const detectedClips = await detectClips(transcript);
    const clips: Clip[] = detectedClips.map(dc => ({
      id: uuidv4(),
      startTime: dc.startTime,
      endTime: dc.endTime,
      title: dc.title,
      s3Key: '',
    }));
    updateJob(jobId, { clips });

    updateJob(jobId, { status: 'processing' });
    for (const clip of clips) {
      const { clipPath, thumbnailPath } = await processClip(filePath, clip, transcript.words, tempDir);

      const clipS3Key = `clips/${jobId}/${clip.id}.mp4`;
      const thumbnailS3Key = `thumbnails/${jobId}/${clip.id}.jpg`;

      await Promise.all([
        uploadFile(clipS3Key, clipPath),
        uploadFile(thumbnailS3Key, thumbnailPath, 'image/jpeg'),
      ]);

      clip.s3Key = clipS3Key;
      clip.thumbnailKey = thumbnailS3Key;
    }
    updateJob(jobId, { clips: [...clips] });

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
