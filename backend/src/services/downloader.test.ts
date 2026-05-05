import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/repurposer-abc123'),
}));

import { spawn } from 'child_process';
import { downloadYouTubeVideo } from './downloader.js';

function makeMockProcess(stdoutLines: string[], exitCode: number) {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();

  setTimeout(() => {
    for (const line of stdoutLines) {
      proc.stdout.emit('data', Buffer.from(line + '\n'));
    }
    proc.emit('close', exitCode);
  }, 0);

  return proc;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('downloadYouTubeVideo', () => {
  it('resolves with filePath and tempDir on success', async () => {
    const mockProc = makeMockProcess(['/tmp/repurposer-abc123/dQw4w9WgXcQ.mp4'], 0);
    vi.mocked(spawn).mockReturnValue(mockProc);

    const result = await downloadYouTubeVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(result.filePath).toBe('/tmp/repurposer-abc123/dQw4w9WgXcQ.mp4');
    expect(result.tempDir).toBe('/tmp/repurposer-abc123');
  });

  it('rejects when yt-dlp exits with non-zero code', async () => {
    const mockProc = makeMockProcess([], 1);
    mockProc.stderr.emit = (event: string, data: Buffer) => {
      if (event === 'data') mockProc.stderr.listeners('data').forEach((l: Function) => l(data));
      return true;
    };
    vi.mocked(spawn).mockReturnValue(mockProc);

    await expect(
      downloadYouTubeVideo('https://www.youtube.com/watch?v=bad')
    ).rejects.toThrow('yt-dlp exited with code 1');
  });

  it('rejects when yt-dlp emits an error event', async () => {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    setTimeout(() => proc.emit('error', new Error('spawn yt-dlp ENOENT')), 0);
    vi.mocked(spawn).mockReturnValue(proc);

    await expect(
      downloadYouTubeVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    ).rejects.toThrow('Failed to spawn yt-dlp');
  });

  it('passes correct flags to yt-dlp', async () => {
    const mockProc = makeMockProcess(['/tmp/repurposer-abc123/dQw4w9WgXcQ.mp4'], 0);
    vi.mocked(spawn).mockReturnValue(mockProc);

    await downloadYouTubeVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    const [cmd, args] = vi.mocked(spawn).mock.calls[0];
    expect(cmd).toBe('/opt/homebrew/bin/yt-dlp');
    expect(args).toContain('--no-playlist');
    expect(args).toContain('--output');
    expect(args).toContain('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});
