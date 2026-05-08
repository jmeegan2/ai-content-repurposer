import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { processClip } from "./clipper.js";
import type { Clip, WordTimestamp } from "../types/index.js";

const clip: Clip = {
  id: "clip-1",
  startTime: 10,
  endTime: 40,
  title: "Test Clip",
  s3Key: "",
};

const words: WordTimestamp[] = [
  { word: "Hello", start: 10, end: 11 },
  { word: "world", start: 11, end: 12 },
  { word: "this", start: 12, end: 13 },
  { word: "is", start: 13, end: 14 },
  { word: "outside", start: 50, end: 51 }, // outside clip range — should be excluded
];

function makeMockProcess(exitCode: number, stderrOutput = "") {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  setTimeout(() => {
    if (stderrOutput) proc.stderr.emit("data", Buffer.from(stderrOutput));
    proc.emit("close", exitCode);
  }, 0);
  return proc;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processClip", () => {
  it("resolves with the output mp4 path on success", async () => {
    vi.mocked(spawn).mockReturnValue(makeMockProcess(0));

    const result = await processClip("/tmp/video.mp4", clip, words, "/tmp/out");

    expect(result).toBe("/tmp/out/clip-1.mp4");
  });

  it("writes an SRT file before invoking ffmpeg", async () => {
    vi.mocked(spawn).mockReturnValue(makeMockProcess(0));

    await processClip("/tmp/video.mp4", clip, words, "/tmp/out");

    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/out/clip-1.srt",
      expect.any(String),
      "utf8",
    );
  });

  it("only includes words within the clip time range in the SRT", async () => {
    vi.mocked(spawn).mockReturnValue(makeMockProcess(0));

    await processClip("/tmp/video.mp4", clip, words, "/tmp/out");

    const srtContent = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(srtContent).toContain("Hello");
    expect(srtContent).not.toContain("outside");
  });

  it("passes input seek, duration, and crop/scale filter to ffmpeg", async () => {
    vi.mocked(spawn).mockReturnValue(makeMockProcess(0));

    await processClip("/tmp/video.mp4", clip, words, "/tmp/out");

    const [, args] = vi.mocked(spawn).mock.calls[0] as unknown as [
      string,
      string[],
    ];
    expect(args).toContain("-ss");
    expect(args).toContain("10"); // clip.startTime
    expect(args).toContain("-t");
    expect(args).toContain("30"); // endTime - startTime
    const vfArg = args[args.indexOf("-vf") + 1];
    expect(vfArg).toContain("crop=ih*9/16:ih");
    expect(vfArg).toContain("scale=1080:1920");
    expect(vfArg).toContain("subtitles=");
  });

  it("rejects when ffmpeg exits with a non-zero code", async () => {
    vi.mocked(spawn).mockReturnValue(makeMockProcess(1, "Invalid option"));

    await expect(
      processClip("/tmp/video.mp4", clip, words, "/tmp/out"),
    ).rejects.toThrow("ffmpeg exited with code 1");
  });

  it("rejects when ffmpeg cannot be spawned", async () => {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    setTimeout(() => proc.emit("error", new Error("spawn ffmpeg ENOENT")), 0);
    vi.mocked(spawn).mockReturnValue(proc);

    await expect(
      processClip("/tmp/video.mp4", clip, words, "/tmp/out"),
    ).rejects.toThrow("Failed to spawn ffmpeg");
  });

  it("adjusts caption timestamps relative to clip start", async () => {
    vi.mocked(spawn).mockReturnValue(makeMockProcess(0));

    await processClip("/tmp/video.mp4", clip, words, "/tmp/out");

    const srtContent = vi.mocked(writeFile).mock.calls[0][1] as string;
    // word starts at 10s, clip starts at 10s → caption should start at 00:00:00
    expect(srtContent).toContain("00:00:00,000");
  });
});
