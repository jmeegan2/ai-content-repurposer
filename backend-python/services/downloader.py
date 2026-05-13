import os
import subprocess
import tempfile


def download_youtube_video(youtube_url: str) -> tuple[str, str]:
    """Download a YouTube video. Returns (file_path, temp_dir)."""
    temp_dir = tempfile.mkdtemp(prefix="repurposer-")
    output_template = os.path.join(temp_dir, "%(id)s.%(ext)s")
    ytdlp = os.environ.get("YTDLP_PATH", "/opt/homebrew/bin/yt-dlp")

    args = [
        ytdlp,
        "--format", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "--output", output_template,
        "--print", "after_move:filepath",
        "--no-playlist",
        youtube_url,
    ]

    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp exited with code {result.returncode}: {result.stderr}")

    file_path = result.stdout.strip().splitlines()[-1]
    if not file_path:
        raise RuntimeError("yt-dlp did not return a file path")

    return file_path, temp_dir
