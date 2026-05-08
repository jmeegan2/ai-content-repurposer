import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";
import { spawn } from "child_process";
import { transcribeVideo } from "./transcriber.js";

const mockCreate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    text: "Hello world this is a test.",
    words: [
      { word: "Hello", start: 0.0, end: 0.5 },
      { word: "world", start: 0.6, end: 1.0 },
    ],
  }),
);

vi.mock("openai", () => {
  class MockOpenAI {
    audio = { transcriptions: { create: mockCreate } };
  }
  return { default: MockOpenAI };
});

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("fs", () => ({
  createReadStream: vi.fn().mockReturnValue("mock-stream"),
}));

vi.mock("fs/promises", () => ({
  unlink: vi.fn().mockResolvedValue(undefined),
}));

function makeSpawnMock(exitCode: number, emitError?: Error) {
  const proc = new EventEmitter() as any;
  proc.stderr = new EventEmitter();
  process.nextTick(() => {
    if (emitError) proc.emit("error", emitError);
    else proc.emit("close", exitCode);
  });
  return proc;
}

describe("transcribeVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawn).mockReturnValue(makeSpawnMock(0));
    mockCreate.mockResolvedValue({
      text: "Hello world this is a test.",
      words: [
        { word: "Hello", start: 0.0, end: 0.5 },
        { word: "world", start: 0.6, end: 1.0 },
      ],
    });
  });

  it("returns text and word timestamps", async () => {
    const result = await transcribeVideo("/tmp/test.mp4");
    expect(result.text).toBe("Hello world this is a test.");
    expect(result.words).toHaveLength(2);
    expect(result.words[0]).toEqual({ word: "Hello", start: 0.0, end: 0.5 });
  });

  it("maps word timestamp fields correctly", async () => {
    const result = await transcribeVideo("/tmp/test.mp4");
    for (const w of result.words) {
      expect(w).toHaveProperty("word");
      expect(w).toHaveProperty("start");
      expect(w).toHaveProperty("end");
    }
  });

  it("returns empty words array when Whisper response omits words", async () => {
    mockCreate.mockResolvedValueOnce({ text: "Hello.", words: undefined });
    const result = await transcribeVideo("/tmp/test.mp4");
    expect(result.words).toEqual([]);
  });

  it("rejects when ffmpeg exits with non-zero code", async () => {
    vi.mocked(spawn).mockReturnValue(makeSpawnMock(1));
    await expect(transcribeVideo("/tmp/test.mp4")).rejects.toThrow(
      "ffmpeg exited with code 1",
    );
  });

  it("rejects when ffmpeg fails to spawn", async () => {
    vi.mocked(spawn).mockReturnValue(makeSpawnMock(0, new Error("ENOENT")));
    await expect(transcribeVideo("/tmp/test.mp4")).rejects.toThrow(
      "Failed to spawn ffmpeg",
    );
  });
});
