import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./downloader.js', () => ({
  downloadYouTubeVideo: vi.fn(),
}));

vi.mock('./s3.js', () => ({
  uploadFile: vi.fn(),
}));

vi.mock('./transcriber.js', () => ({
  transcribeVideo: vi.fn(),
}));

vi.mock('./clipDetector.js', () => ({
  detectClips: vi.fn(),
}));

vi.mock('./clipper.js', () => ({
  processClip: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  rm: vi.fn().mockResolvedValue(undefined),
}));

import { downloadYouTubeVideo } from './downloader.js';
import { uploadFile } from './s3.js';
import { transcribeVideo } from './transcriber.js';
import { detectClips } from './clipDetector.js';
import { processClip } from './clipper.js';
import { rm } from 'fs/promises';
import { runPipeline } from './pipeline.js';

const mockTranscript = { text: 'Hello world', words: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(downloadYouTubeVideo).mockResolvedValue({
    filePath: '/tmp/repurposer-abc/video.mp4',
    tempDir: '/tmp/repurposer-abc',
  });
  vi.mocked(uploadFile).mockResolvedValue('raw/job-1/video.mp4');
  vi.mocked(transcribeVideo).mockResolvedValue(mockTranscript);
  vi.mocked(detectClips).mockResolvedValue([
    { title: 'Great Clip', startTime: 0, endTime: 60 },
  ]);
  vi.mocked(processClip).mockResolvedValue({ clipPath: '/tmp/repurposer-abc/clip-1.mp4', thumbnailPath: '/tmp/repurposer-abc/clip-1.jpg' });
});

describe('runPipeline', () => {
  it('transitions through downloading → transcribing → done on success', async () => {
    const updateJob = vi.fn();
    await runPipeline('job-1', 'https://youtube.com/watch?v=abc', updateJob);

    const statuses = updateJob.mock.calls.map((c) => c[1].status).filter(Boolean);
    expect(statuses).toEqual(['downloading', 'transcribing', 'detecting', 'processing', 'done']);
  });

  it('sets transcript on the job after transcription', async () => {
    const updateJob = vi.fn();
    await runPipeline('job-1', 'https://youtube.com/watch?v=abc', updateJob);

    const transcriptCall = updateJob.mock.calls.find((c) => c[1].transcript);
    expect(transcriptCall).toBeDefined();
    expect(transcriptCall![1].transcript).toEqual(mockTranscript);
  });

  it('uploads to the correct S3 key', async () => {
    const updateJob = vi.fn();
    await runPipeline('job-1', 'https://youtube.com/watch?v=abc', updateJob);

    expect(uploadFile).toHaveBeenCalledWith('raw/job-1/video.mp4', '/tmp/repurposer-abc/video.mp4');
  });

  it('sets status to failed and records error message when a step throws', async () => {
    vi.mocked(downloadYouTubeVideo).mockRejectedValue(new Error('yt-dlp failed'));
    const updateJob = vi.fn();

    await runPipeline('job-1', 'https://youtube.com/watch?v=abc', updateJob);

    const failCall = updateJob.mock.calls.find((c) => c[1].status === 'failed');
    expect(failCall).toBeDefined();
    expect(failCall![1].error).toBe('yt-dlp failed');
  });

  it('handles non-Error thrown values', async () => {
    vi.mocked(uploadFile).mockRejectedValue('S3 network error');
    const updateJob = vi.fn();

    await runPipeline('job-1', 'https://youtube.com/watch?v=abc', updateJob);

    const failCall = updateJob.mock.calls.find((c) => c[1].status === 'failed');
    expect(failCall![1].error).toBe('S3 network error');
  });

  it('always cleans up the temp directory on success', async () => {
    const updateJob = vi.fn();
    await runPipeline('job-1', 'https://youtube.com/watch?v=abc', updateJob);

    expect(rm).toHaveBeenCalledWith('/tmp/repurposer-abc', { recursive: true, force: true });
  });

  it('always cleans up the temp directory on failure', async () => {
    vi.mocked(transcribeVideo).mockRejectedValue(new Error('Whisper error'));
    const updateJob = vi.fn();

    await runPipeline('job-1', 'https://youtube.com/watch?v=abc', updateJob);

    expect(rm).toHaveBeenCalledWith('/tmp/repurposer-abc', { recursive: true, force: true });
  });

  it('skips cleanup if download never set a tempDir', async () => {
    vi.mocked(downloadYouTubeVideo).mockRejectedValue(new Error('spawn failed'));
    const updateJob = vi.fn();

    await runPipeline('job-1', 'https://youtube.com/watch?v=abc', updateJob);

    expect(rm).not.toHaveBeenCalled();
  });
});
