import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transcribeVideo } from './transcriber.js';

vi.mock('openai', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    text: 'Hello world this is a test.',
    words: [
      { word: 'Hello', start: 0.0, end: 0.5 },
      { word: 'world', start: 0.6, end: 1.0 },
    ],
  });
  class MockOpenAI {
    audio = { transcriptions: { create: mockCreate } };
  }
  return { default: MockOpenAI };
});

vi.mock('child_process', () => ({
  spawn: vi.fn().mockImplementation(() => {
    const { EventEmitter } = require('events');
    const proc = new EventEmitter() as any;
    proc.stderr = new EventEmitter();
    process.nextTick(() => proc.emit('close', 0));
    return proc;
  }),
}));

vi.mock('fs', () => ({
  createReadStream: vi.fn().mockReturnValue('mock-stream'),
}));

vi.mock('fs/promises', () => ({
  unlink: vi.fn().mockResolvedValue(undefined),
}));

describe('transcribeVideo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns text and word timestamps', async () => {
    const result = await transcribeVideo('/tmp/test.mp4');
    expect(result.text).toBe('Hello world this is a test.');
    expect(result.words).toHaveLength(2);
    expect(result.words[0]).toEqual({ word: 'Hello', start: 0.0, end: 0.5 });
  });

  it('maps word timestamp fields correctly', async () => {
    const result = await transcribeVideo('/tmp/test.mp4');
    for (const w of result.words) {
      expect(w).toHaveProperty('word');
      expect(w).toHaveProperty('start');
      expect(w).toHaveProperty('end');
    }
  });
});
