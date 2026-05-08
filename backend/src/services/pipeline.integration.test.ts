import "dotenv/config";
import { describe, it, expect, vi } from "vitest";
import { runPipeline } from "./pipeline.js";
import type { Job } from "../types/index.js";

// Hits yt-dlp, OpenAI Whisper, OpenAI gpt-5.4-mini, and S3 — requires valid .env credentials
// Excluded from CI via test:ci script
describe("pipeline integration", () => {
  // 2:15 talking-head video — long enough for real clip detection
  // const TEST_URL = 'https://www.youtube.com/watch?v=d6wRkzCW5qI'; // 2:15 minutes
  const TEST_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw"; //19 secs

  it(
    "runs all stages end-to-end and lands on done with clips",
    async () => {
      const patches: Partial<Job>[] = [];
      const updateJob = vi.fn((_id: string, patch: Partial<Job>) => {
        patches.push(patch);
      });

      await runPipeline("integration-test-job", TEST_URL, updateJob);

      // Log error if pipeline failed
      const errorPatch = patches.find((p) => p.error);
      if (errorPatch) console.error("Pipeline error:", errorPatch.error);

      // Status must progress through every stage in order
      const statuses = patches.map((p) => p.status).filter(Boolean);
      expect(statuses).toEqual([
        "downloading",
        "transcribing",
        "detecting",
        "processing",
        "done",
      ]);

      // Transcript must be populated
      const transcriptPatch = patches.find((p) => p.transcript);
      expect(transcriptPatch?.transcript?.text.length).toBeGreaterThan(0);
      expect(transcriptPatch?.transcript?.words.length).toBeGreaterThan(0);

      // Clips must be a non-empty array with valid shape
      const clipsPatch = patches.find((p) => p.clips);
      console.log(
        "Detected clips:",
        JSON.stringify(clipsPatch?.clips, null, 2),
      );
      expect(Array.isArray(clipsPatch?.clips)).toBe(true);
      expect(clipsPatch!.clips!.length).toBeGreaterThan(0);

      for (const clip of clipsPatch!.clips!) {
        expect(typeof clip.id).toBe("string");
        expect(typeof clip.title).toBe("string");
        expect(typeof clip.startTime).toBe("number");
        expect(typeof clip.endTime).toBe("number");
        expect(clip.endTime).toBeGreaterThan(clip.startTime);
        expect(clip.s3Key).toMatch(/^clips\/.+\.mp4$/);
      }
    },
    5 * 60 * 1000,
  ); // 5 minute timeout — extended for ffmpeg processing
});
