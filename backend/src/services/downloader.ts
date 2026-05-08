import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface DownloadResult {
  filePath: string;
  tempDir: string;
}

export async function downloadYouTubeVideo(
  youtubeUrl: string,
): Promise<DownloadResult> {
  const tempDir = await mkdtemp(join(tmpdir(), "repurposer-"));
  const outputTemplate = join(tempDir, "%(id)s.%(ext)s");

  const args = [
    "--format",
    "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
    "--output",
    outputTemplate,
    "--print",
    "after_move:filepath",
    "--no-playlist",
    youtubeUrl,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(
      process.env.YTDLP_PATH ?? "/opt/homebrew/bin/yt-dlp",
      args,
    );

    let filePath = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line) filePath = line;
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
        return;
      }
      if (!filePath) {
        reject(new Error("yt-dlp did not return a file path"));
        return;
      }
      resolve({ filePath, tempDir });
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}
