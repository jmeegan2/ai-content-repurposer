import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Clip, WordTimestamp } from "../types/index.js";

const FFMPEG = process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";
const WORDS_PER_CAPTION = 4;

function pad(n: number, digits = 2): string {
  return String(Math.floor(n)).padStart(digits, "0");
}

function toSrtTime(seconds: number): string {
  const h = seconds / 3600;
  const m = (seconds % 3600) / 60;
  const s = seconds % 60;
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function buildSrt(words: WordTimestamp[], clipStart: number): string {
  const entries: string[] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_CAPTION) {
    const phrase = words.slice(i, i + WORDS_PER_CAPTION);
    const start = Math.max(0, phrase[0].start - clipStart);
    const end = phrase[phrase.length - 1].end - clipStart;
    const text = phrase.map((w) => w.word.trim()).join(" ");
    entries.push(
      `${i / WORDS_PER_CAPTION + 1}\n${toSrtTime(start)} --> ${toSrtTime(end)}\n${text}\n`,
    );
  }
  return entries.join("\n");
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        const reason = signal
          ? `killed by signal ${signal}`
          : `exited with code ${code}`;
        reject(
          new Error(
            `ffmpeg ${reason}\n--- stderr ---\n${stderr.trimEnd()}\n--------------`,
          ),
        );
      }
    });
    proc.on("error", (err) => {
      const hint =
        (err as NodeJS.ErrnoException).code === "ENOENT"
          ? ` (ffmpeg not found at ${FFMPEG} — check FFMPEG_PATH or install via Homebrew)`
          : "";
      reject(new Error(`Failed to spawn ffmpeg${hint}: ${err.message}`));
    });
  });
}

export async function processClip(
  videoPath: string,
  clip: Clip,
  words: WordTimestamp[],
  outputDir: string,
): Promise<string> {
  const clipWords = words.filter(
    (w) => w.start >= clip.startTime && w.end <= clip.endTime,
  );
  // SRT (SubRip Text) is a plain-text subtitle format: numbered cues, each with a timestamp range and caption text
  const srtPath = path.join(outputDir, `${clip.id}.srt`);
  await writeFile(srtPath, buildSrt(clipWords, clip.startTime), "utf8");

  const outputPath = path.join(outputDir, `${clip.id}.mp4`);

  // Center-crop a vertical 9:16 strip from the landscape source, scale to 1080×1920,
  // then burn captions in TikTok style (white text, black outline, bottom-center).
  const subtitleStyle =
    "FontName=Arial\\,FontSize=22\\,PrimaryColour=&H00FFFFFF\\,OutlineColour=&H00000000\\,Outline=2\\,Alignment=2\\,MarginV=80";
  const vf = `crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920,subtitles=${srtPath}:force_style=${subtitleStyle}`;

  const duration = String(clip.endTime - clip.startTime);

  // -ss before -i = fast input seek; -t = output duration from that point
  await runFfmpeg([
    "-ss",
    String(clip.startTime),
    "-i",
    videoPath,
    "-t",
    duration,
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23", // CRF 23 = x264 default; lower (18-20) = sharper for social upload

    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-y",
    outputPath,
  ]);

  return outputPath;
}
