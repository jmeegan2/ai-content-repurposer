import { describe, it, expect, vi, beforeEach } from "vitest";

const ffmpegControl = vi.hoisted(() => ({
  outcomes: [] as Array<"success" | string>,
  seekInputCalls: [] as number[],
  durationCalls: [] as number[],
  videoFilterCalls: [] as string[]
}));

vi.mock("fluent-ffmpeg", () => {
  const createCmd = () => {
    let endCb: (() => void) | undefined;
    let errorCb:
      | ((err: Error, stdout: string, stderr: string) => void)
      | undefined;

    const cmd: any = {
      seekInput: (v: number) => {
        ffmpegControl.seekInputCalls.push(v);
        return cmd;
      },
      duration: (v: number) => {
        ffmpegControl.durationCalls.push(v);
        return cmd;
      },
      videoFilters: (v: string) => {
        ffmpegControl.videoFilterCalls.push(v);
        return cmd;
      },
      videoCodec: () => cmd,
      addOption: () => cmd,
      audioCodec: () => cmd,
      audioBitrate: () => cmd,
      output: () => cmd,
      frames: () => cmd,
      on: (event: string, cb: Function) => {
        if (event === "end") endCb = cb as () => void;
        if (event === "error") errorCb = cb as any;
        return cmd;
      },
      run: () => {
        const outcome = ffmpegControl.outcomes.shift() ?? "success";
        if (outcome === "success") endCb?.();
        else errorCb?.(new Error(outcome), "", outcome);
      }
    };
    return cmd;
  };

  const ffmpegFn: any = vi.fn(() => createCmd());
  ffmpegFn.setFfmpegPath = vi.fn();
  return { default: ffmpegFn };
});

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined)
}));

import { writeFile } from "node:fs/promises";
import { processClip } from "./clipper.js";
import type { Clip, WordTimestamp } from "../types/index.js";

const clip: Clip = {
  id: "clip-1",
  startTime: 10,
  endTime: 40,
  title: "Test Clip",
  s3Key: ""
};

const words: WordTimestamp[] = [
  { word: "Hello", start: 10, end: 11 },
  { word: "world", start: 11, end: 12 },
  { word: "this", start: 12, end: 13 },
  { word: "is", start: 13, end: 14 },
  { word: "outside", start: 50, end: 51 } // outside clip range — should be excluded
];

beforeEach(() => {
  ffmpegControl.outcomes = [];
  ffmpegControl.seekInputCalls = [];
  ffmpegControl.durationCalls = [];
  ffmpegControl.videoFilterCalls = [];
  vi.clearAllMocks();
});

describe("processClip", () => {
  it("resolves with clipPath and thumbnailPath on success", async () => {
    const result = await processClip("/tmp/video.mp4", clip, words, "/tmp/out");
    expect(result).toEqual({
      clipPath: "/tmp/out/clip-1.mp4",
      thumbnailPath: "/tmp/out/clip-1.jpg"
    });
  });

  it("writes an SRT file before invoking ffmpeg", async () => {
    await processClip("/tmp/video.mp4", clip, words, "/tmp/out");
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/out/clip-1.srt",
      expect.any(String),
      "utf8"
    );
  });

  it("only includes words within the clip time range in the SRT", async () => {
    await processClip("/tmp/video.mp4", clip, words, "/tmp/out");
    const srtContent = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(srtContent).toContain("Hello");
    expect(srtContent).not.toContain("outside");
  });

  it("passes input seek, duration, and crop/scale filter to ffmpeg", async () => {
    await processClip("/tmp/video.mp4", clip, words, "/tmp/out");
    expect(ffmpegControl.seekInputCalls[0]).toBe(10); // clip.startTime
    expect(ffmpegControl.durationCalls[0]).toBe(30); // endTime - startTime
    expect(ffmpegControl.videoFilterCalls[0]).toContain("crop=ih*9/16:ih");
    expect(ffmpegControl.videoFilterCalls[0]).toContain("scale=1080:1920");
    expect(ffmpegControl.videoFilterCalls[0]).toContain("subtitles=");
  });

  it("rejects when ffmpeg exits with a non-zero code", async () => {
    ffmpegControl.outcomes = ["exited with code 1"];
    await expect(
      processClip("/tmp/video.mp4", clip, words, "/tmp/out")
    ).rejects.toThrow("ffmpeg error");
  });

  it("rejects when ffmpeg cannot be spawned", async () => {
    ffmpegControl.outcomes = ["spawn ffmpeg ENOENT"];
    await expect(
      processClip("/tmp/video.mp4", clip, words, "/tmp/out")
    ).rejects.toThrow("ffmpeg error");
  });

  it("adjusts caption timestamps relative to clip start", async () => {
    await processClip("/tmp/video.mp4", clip, words, "/tmp/out");
    const srtContent = vi.mocked(writeFile).mock.calls[0][1] as string;
    // word starts at 10s, clip starts at 10s → caption should start at 00:00:00
    expect(srtContent).toContain("00:00:00,000");
  });
});
