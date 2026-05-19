import os
import subprocess

FFMPEG = os.environ.get("FFMPEG_PATH", "ffmpeg")


def run_ffmpeg(cmd: list[str], label: str) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"{label}:\n{result.stderr}")
