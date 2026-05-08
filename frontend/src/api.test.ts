import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createJob, getJob } from './api';

const mockJob = {
  id: 'job-1',
  youtubeUrl: 'https://youtube.com/watch?v=abc',
  status: 'queued',
  clips: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('createJob', () => {
  it('posts youtube url and returns job', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockJob), { status: 201 }),
    );

    const result = await createJob('https://youtube.com/watch?v=abc');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/jobs',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ youtubeUrl: 'https://youtube.com/watch?v=abc' }),
      }),
    );
    expect(result).toEqual(mockJob);
  });

  it('throws with server error message on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Invalid URL' }), { status: 400 }),
    );

    await expect(createJob('bad-url')).rejects.toThrow('Invalid URL');
  });
});

describe('getJob', () => {
  it('fetches job by id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockJob), { status: 200 }),
    );

    const result = await getJob('550e8400-e29b-41d4-a716-446655440000');

    expect(fetch).toHaveBeenCalledWith('http://localhost:3001/jobs/550e8400-e29b-41d4-a716-446655440000');
    expect(result).toEqual(mockJob);
  });

  it('throws for invalid job id', async () => {
    await expect(getJob('not-a-uuid')).rejects.toThrow('Invalid job ID');
  });

  it('throws on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('', { status: 404 }),
    );

    await expect(getJob('550e8400-e29b-41d4-a716-446655440000')).rejects.toThrow('Failed to fetch job');
  });
});
