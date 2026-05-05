import { spawn } from "child_process";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export interface DownloadResult {
  filePath: string;
  tempDir: string;
}


export function downloadYouTubeVideo(
  youtubeUrl: string,
): Promise<DownloadResult> {
  return new Promise(async (resolve, reject) => {
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

    const proc = spawn("yt-dlp", args);

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
