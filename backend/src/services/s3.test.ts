import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3Client {
    send = mockSend;
  },
  PutObjectCommand: class MockPutObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  },
  GetObjectCommand: class MockGetObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  },
  DeleteObjectCommand: class MockDeleteObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  },
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned?sig=abc'),
}));

vi.mock('node:fs', () => ({
  createReadStream: vi.fn().mockReturnValue('mock-stream'),
}));

import { uploadFile, getPresignedUrl, deleteFile } from './s3.js';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

beforeEach(() => {
  vi.clearAllMocks();
  mockSend.mockResolvedValue({});
});

describe('getPresignedUrl', () => {
  it('returns a presigned url for a given key', async () => {
    vi.mocked(getSignedUrl).mockResolvedValueOnce('https://s3.example.com/presigned?sig=abc');
    const url = await getPresignedUrl('clips/job-1/clip-1.mp4');
    expect(url).toBe('https://s3.example.com/presigned?sig=abc');
  });

  it('includes Content-Disposition when filename is provided', async () => {
    vi.mocked(getSignedUrl).mockResolvedValueOnce('https://s3.example.com/presigned');
    await getPresignedUrl('clips/job-1/clip-1.mp4', 3600, 'my-clip.mp4');
    const [, command] = vi.mocked(getSignedUrl).mock.calls[0] as [unknown, { input: { ResponseContentDisposition?: string } }];
    expect(command.input.ResponseContentDisposition).toBe('attachment; filename="my-clip.mp4"');
  });

  it('omits Content-Disposition when no filename provided', async () => {
    vi.mocked(getSignedUrl).mockResolvedValueOnce('https://s3.example.com/presigned');
    await getPresignedUrl('thumbnails/job-1/clip-1.jpg');
    const [, command] = vi.mocked(getSignedUrl).mock.calls[0] as [unknown, { input: { ResponseContentDisposition?: string } }];
    expect(command.input.ResponseContentDisposition).toBeUndefined();
  });
});

describe('uploadFile', () => {
  it('calls s3 send to upload the file', async () => {
    await uploadFile('raw/job-1/video.mp4', '/tmp/video.mp4');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});

describe('deleteFile', () => {
  it('calls s3 send to delete the file', async () => {
    await deleteFile('clips/job-1/clip-1.mp4');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
