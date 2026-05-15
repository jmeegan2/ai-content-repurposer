"""
reqs for test 

* s3 clip video raw 

we are gonna have the raw clip, then we'll run the autoframe against it to see if it can 
clip it correctly and make tweeks as needed

to run test "cd backend-python && pytest tests/test_autoframe.py"


"""
import os
import subprocess
from services import autoframe

_FFMPEG = os.environ.get("FFMPEG_PATH", "/opt/homebrew/bin/ffmpeg")
_MEDIA_DIR = os.path.join(os.path.dirname(__file__), "media for testing")

def test_autoframe():
    video_path = os.path.join(_MEDIA_DIR, "huberman-1min.mp4")
    framed_path = os.path.join(_MEDIA_DIR, "huberman-1min-framed.mp4")
    playable_path = os.path.join(_MEDIA_DIR, "huberman-1min-framed-h264.mp4")

    print("\nRunning autoframe...")
    # will run the 30 - 45 section
    autoframe.process_clip(video_path, 30.0, 45.0, framed_path)
    assert os.path.exists(framed_path)
    print("Autoframe done. Converting to H.264...")

    result = subprocess.run(
        [_FFMPEG, "-y", "-i", framed_path, "-c:v", "libx264", "-c:a", "copy", playable_path],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"ffmpeg failed:\n{result.stderr}"
    print(f"Playable output: {playable_path}")
    

    
