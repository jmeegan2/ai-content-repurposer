import os
import subprocess
from models import Clip, WordTimestamp
from services import autoframe

_FFMPEG = os.environ.get("FFMPEG_PATH", "/opt/homebrew/bin/ffmpeg")
_WORDS_PER_CAPTION = 4


def _pad(n: float, digits: int = 2) -> str:
    return str(int(n)).zfill(digits)


def _to_srt_time(seconds: float) -> str:
    h = seconds / 3600
    m = (seconds % 3600) / 60
    s = seconds % 60
    ms = round((seconds % 1) * 1000)
    return f"{_pad(h)}:{_pad(m)}:{_pad(s)},{_pad(ms, 3)}"


def _build_srt(words: list[WordTimestamp], clip_start: float) -> str:
    entries = []
    for i in range(0, len(words), _WORDS_PER_CAPTION):
        phrase = words[i : i + _WORDS_PER_CAPTION]
        start = max(0.0, phrase[0].start - clip_start)
        end = phrase[-1].end - clip_start
        text = " ".join(w.word.strip() for w in phrase)
        index = i // _WORDS_PER_CAPTION + 1
        entries.append(f"{index}\n{_to_srt_time(start)} --> {_to_srt_time(end)}\n{text}\n")
    return "\n".join(entries)


def process_clip(
    video_path: str,
    clip: Clip,
    words: list[WordTimestamp],
    output_dir: str,
) -> tuple[str, str]:
    """Returns (clip_path, thumbnail_path)."""
    clip_words = [w for w in words if w.start >= clip.start_time and w.end <= clip.end_time]

    srt_path = os.path.join(output_dir, f"{clip.id}.srt")
    with open(srt_path, "w", encoding="utf-8") as f:
        f.write(_build_srt(clip_words, clip.start_time))

    tracked_path = os.path.join(output_dir, f"{clip.id}-tracked.mp4")
    clip_path = os.path.join(output_dir, f"{clip.id}.mp4")
    thumbnail_path = os.path.join(output_dir, f"{clip.id}.jpg")
    duration = clip.end_time - clip.start_time

    # Pass 1: face-tracked crop → 1080x1920, no subtitles
    autoframe.process_clip(video_path, clip.start_time, clip.end_time, tracked_path)

    # Pass 2: burn subtitles onto tracked video
    # Commas inside force_style must be escaped with \, so ffmpeg doesn't treat them as filter separators
    subtitle_style = r"FontName=Arial\,FontSize=22\,PrimaryColour=&H00FFFFFF\,OutlineColour=&H00000000\,Outline=2\,Alignment=2\,MarginV=80"
    result = subprocess.run(
        [
            _FFMPEG, "-y",
            "-i", tracked_path,
            "-vf", f"subtitles={srt_path}:force_style={subtitle_style}",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            clip_path,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg subtitle burn failed:\n{result.stderr}")

    # Clean up intermediate tracked file
    if os.path.exists(tracked_path):
        os.unlink(tracked_path)

    # Thumbnail: grab frame at clip midpoint
    result = subprocess.run(
        [
            _FFMPEG, "-y",
            "-ss", str(duration / 2),
            "-i", clip_path,
            "-frames:v", "1",
            thumbnail_path,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg thumbnail failed:\n{result.stderr}")

    return clip_path, thumbnail_path
