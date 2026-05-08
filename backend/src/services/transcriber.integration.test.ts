import "dotenv/config";
import { describe, it, expect } from "vitest";
import { rm } from "fs/promises";
import { downloadYouTubeVideo } from "./downloader.js";
import { transcribeVideo } from "./transcriber.js";

// Hits real yt-dlp + OpenAI Whisper — requires valid .env credentials
// Excluded from CI via test:ci script
describe("transcriber integration", () => {
  // "Me at the zoo" — first YouTube video ever, 19 seconds
  const TEST_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

  it("transcribes a real YouTube video and returns word timestamps", async () => {
    const { filePath, tempDir } = await downloadYouTubeVideo(TEST_URL);

    try {
      const transcript = await transcribeVideo(filePath);

      expect(transcript.text.length).toBeGreaterThan(0);
      expect(transcript.words.length).toBeGreaterThan(0);

      for (const w of transcript.words) {
        expect(typeof w.word).toBe("string");
        expect(typeof w.start).toBe("number");
        expect(typeof w.end).toBe("number");
        expect(w.end).toBeGreaterThanOrEqual(w.start);
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 60000);
});
