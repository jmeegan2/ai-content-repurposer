import os
import subprocess
import re
from openai import OpenAI
from models import Transcript, WordTimestamp

_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
_FFMPEG = os.environ.get("FFMPEG_PATH", "/opt/homebrew/bin/ffmpeg")


def _extract_audio(video_path: str, audio_path: str) -> None:
    result = subprocess.run(
        [_FFMPEG, "-i", video_path, "-vn", "-ar", "16000", "-ac", "1", "-b:a", "64k", "-y", audio_path],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg audio extract failed: {result.stderr}")


def transcribe_video(video_path: str) -> Transcript:
    audio_path = re.sub(r"\.[^.]+$", ".mp3", video_path)
    _extract_audio(video_path, audio_path)

    try:
        with open(audio_path, "rb") as f:
            response = _client.audio.transcriptions.create(
                file=f,
                model="whisper-1",
                response_format="verbose_json",
                timestamp_granularities=["word"],
            )

        words = [
            WordTimestamp(word=w.word, start=w.start, end=w.end)
            for w in (response.words or [])
        ]
        return Transcript(text=response.text, words=words)
    finally:
        if os.path.exists(audio_path):
            os.unlink(audio_path)
