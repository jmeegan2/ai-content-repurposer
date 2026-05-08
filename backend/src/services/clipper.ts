import ffmpeg from "fluent-ffmpeg";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Clip, WordTimestamp } from "../types/index.js";

const FFMPEG_PATH = process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";
ffmpeg.setFfmpegPath(FFMPEG_PATH);

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

function runFfmpeg(cmd: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    cmd
      .on("end", () => resolve())
      .on("error", (err, _stdout, stderr) =>
        reject(new Error(`ffmpeg error: ${err.message}\n${stderr ?? ""}`)),
      )
      .run();
  });
}

export async function processClip(
  videoPath: string,
  clip: Clip,
  words: WordTimestamp[],
  outputDir: string,
): Promise<{ clipPath: string; thumbnailPath: string }> {
  const clipWords = words.filter(
    (w) => w.start >= clip.startTime && w.end <= clip.endTime,
  );

  // SRT (SubRip Text) is a plain-text subtitle format: numbered cues, each with a timestamp range and caption text
  const srtPath = path.join(outputDir, `${clip.id}.srt`);
  await writeFile(srtPath, buildSrt(clipWords, clip.startTime), "utf8");

  const clipPath = path.join(outputDir, `${clip.id}.mp4`);
  const thumbnailPath = path.join(outputDir, `${clip.id}.jpg`);
  const duration = clip.endTime - clip.startTime;

  const subtitleStyle =
    "FontName=Arial\\,FontSize=22\\,PrimaryColour=&H00FFFFFF\\,OutlineColour=&H00000000\\,Outline=2\\,Alignment=2\\,MarginV=80";

  await runFfmpeg(
    ffmpeg(videoPath)
      .seekInput(clip.startTime)
      .duration(duration)
      .videoFilters(
        `crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920,subtitles=${srtPath}:force_style=${subtitleStyle}`,
      )
      .videoCodec("libx264")
      .addOption("-preset", "fast")
      .addOption("-crf", "23")
      .audioCodec("aac")
      .audioBitrate("128k")
      .addOption("-movflags", "+faststart")
      .addOption("-y")
      .output(clipPath),
  );

  await runFfmpeg(
    ffmpeg(clipPath)
      .seekInput(duration / 2)
      .frames(1)
      .output(thumbnailPath),
  );

  return { clipPath, thumbnailPath };
}
