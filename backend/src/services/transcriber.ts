import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import OpenAI from "openai";
import type { Transcript, WordTimestamp } from "../types/index.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg", [
      "-i",
      videoPath,
      "-vn",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-b:a",
      "64k",
      "-y",
      audioPath,
    ]);

    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
    });

    proc.on("error", (err) =>
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`)),
    );
  });
}

export async function transcribeVideo(videoPath: string): Promise<Transcript> {
  const audioPath = videoPath.replace(/\.[^.]+$/, ".mp3");

  await extractAudio(videoPath, audioPath);

  try {
    const response = await openai.audio.transcriptions.create({
      file: createReadStream(audioPath),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });

    const words: WordTimestamp[] = (response.words ?? []).map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
    }));

    return { text: response.text, words };
  } finally {
    await unlink(audioPath).catch(() => {});
  }
}
