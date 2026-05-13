"""
Integration test: yt-dlp download + OpenAI Whisper transcription.
Requires OPENAI_API_KEY and yt-dlp in .env. Run with: pytest tests/test_transcriber_integration.py -s -v
"""
import sys
import os
import shutil

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv()

from services.downloader import download_youtube_video
from services.transcriber import transcribe_video

# "Me at the zoo" — first YouTube video ever, 19 seconds
TEST_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw"


def test_transcribes_real_youtube_video():
    file_path, temp_dir = download_youtube_video(TEST_URL)

    try:
        transcript = transcribe_video(file_path)

        assert len(transcript.text) > 0
        assert len(transcript.words) > 0

        for word in transcript.words:
            assert isinstance(word.word, str)
            assert isinstance(word.start, float)
            assert isinstance(word.end, float)
            assert word.end >= word.start
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
