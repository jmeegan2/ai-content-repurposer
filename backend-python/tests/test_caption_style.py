"""
Visual test for caption style — generates a blank 9:16 video with burned captions.

To run:
    cd backend-python && pytest tests/test_caption_style.py -s

Output: tests/media for testing/caption-style-test.mp4
Open it to preview the caption style without running the full pipeline.
"""
import os
import tempfile
import pytest
from services.ffmpeg import FFMPEG, run_ffmpeg
from services.clipper import _build_srt

_MEDIA_DIR = os.path.join(os.path.dirname(__file__), "media for testing")
_OUTPUT = os.path.join(_MEDIA_DIR, "ss", "caption-style-test.mp4")

_FAKE_WORDS = [
    {"word": "this", "start": 0.0, "end": 0.4},
    {"word": "is", "start": 0.4, "end": 0.6},
    {"word": "what", "start": 0.6, "end": 0.9},
    {"word": "your", "start": 0.9, "end": 1.2},
    {"word": "captions", "start": 1.2, "end": 1.8},
    {"word": "will", "start": 1.8, "end": 2.1},
    {"word": "look", "start": 2.1, "end": 2.4},
    {"word": "like", "start": 2.4, "end": 2.8},
    {"word": "on", "start": 2.8, "end": 3.0},
    {"word": "your", "start": 3.0, "end": 3.3},
    {"word": "clips", "start": 3.3, "end": 3.8},
    {"word": "right", "start": 3.8, "end": 4.1},
    {"word": "here", "start": 4.1, "end": 4.5},
]


@pytest.mark.skip(reason="visual test — run manually to preview caption style")
def test_caption_style():
    os.makedirs(os.path.join(_MEDIA_DIR, "ss"), exist_ok=True)

    from models import WordTimestamp
    words = [WordTimestamp(word=w["word"], start=w["start"], end=w["end"]) for w in _FAKE_WORDS]

    with tempfile.TemporaryDirectory(prefix="caption-test-") as tmp:
        blank_path = os.path.join(tmp, "blank.mp4")
        srt_path = os.path.join(tmp, "test.srt")

        # 5-second blank 1080x1920 black video
        run_ffmpeg(
            [
                FFMPEG, "-y",
                "-f", "lavfi", "-i", "color=c=black:s=1080x1920:r=30",
                "-t", "5",
                "-c:v", "libx264", "-preset", "fast",
                blank_path,
            ],
            "failed to generate blank video",
        )

        with open(srt_path, "w", encoding="utf-8") as f:
            f.write(_build_srt(words, 0.0))

        from services.clipper import _FONTS_DIR
        subtitle_style = r"FontName=Montserrat\,FontSize=14\,Bold=1\,PrimaryColour=&H00FFFFFF\,OutlineColour=&H00000000\,Outline=1\,Shadow=0\,BorderStyle=1\,Alignment=2\,MarginV=45"
        fonts_dir = os.path.abspath(_FONTS_DIR)
        run_ffmpeg(
            [
                FFMPEG, "-y",
                "-i", blank_path,
                "-vf", f"subtitles={srt_path}:fontsdir={fonts_dir}:force_style={subtitle_style}",
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-movflags", "+faststart",
                _OUTPUT,
            ],
            "failed to burn captions",
        )

    print(f"\nOutput: {_OUTPUT}")
