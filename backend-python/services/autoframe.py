import os
import subprocess
import tempfile
from collections import deque

import cv2
import mediapipe as mp
import numpy as np

TARGET_W = 1080
TARGET_H = 1920
SAMPLE_EVERY = 5
SMOOTH_WINDOW = 30
DEADZONE_RATIO = 0.05
_FFMPEG = os.environ.get("FFMPEG_PATH", "/opt/homebrew/bin/ffmpeg")


def process_clip(input_path: str, start_time: float, end_time: float, output_path: str) -> None:
    """Render a face-tracked 9:16 crop of input_path[start_time:end_time] to output_path."""
    duration = end_time - start_time
    cap = cv2.VideoCapture(input_path)

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    start_frame = int(start_time * fps)
    total_frames = int(duration * fps)

    crop_w = int(src_h * 9 / 16)
    if crop_w > src_w:
        crop_w = src_w  # source is already portrait

    centers = _detect_face_centers(cap, start_frame, total_frames, src_w)
    crop_xs = _smooth_and_clamp(centers, src_w, crop_w)

    tmp_silent = tempfile.mktemp(suffix="_silent.mp4")
    try:
        _render_frames(cap, start_frame, total_frames, crop_xs, crop_w, tmp_silent, fps)
        cap.release()
        _mux_audio(input_path, start_time, duration, tmp_silent, output_path)
    finally:
        cap.release()
        if os.path.exists(tmp_silent):
            os.unlink(tmp_silent)


def _detect_face_centers(cap: cv2.VideoCapture, start_frame: int, total_frames: int, src_w: int) -> list[int]:
    detector = mp.solutions.face_detection.FaceDetection(
        model_selection=0, min_detection_confidence=0.5
    )
    sampled: dict[int, int] = {}

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    for i in range(total_frames):
        ret, frame = cap.read()
        if not ret:
            break
        if i % SAMPLE_EVERY == 0:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = detector.process(rgb)
            if result.detections:
                bbox = result.detections[0].location_data.relative_bounding_box
                cx = int((bbox.xmin + bbox.width / 2) * src_w)
                sampled[i] = cx

    detector.close()
    return _interpolate_centers(sampled, total_frames, src_w // 2)


def _interpolate_centers(sampled: dict[int, int], n: int, default: int) -> list[int]:
    if not sampled:
        return [default] * n

    result = [default] * n
    keys = sorted(sampled.keys())

    for i in range(keys[0]):
        result[i] = sampled[keys[0]]

    for j in range(len(keys) - 1):
        a, b = keys[j], keys[j + 1]
        for i in range(a, b + 1):
            t = (i - a) / (b - a)
            result[i] = int(sampled[a] + t * (sampled[b] - sampled[a]))

    for i in range(keys[-1], n):
        result[i] = sampled[keys[-1]]

    return result


def _smooth_and_clamp(centers: list[int], src_w: int, crop_w: int) -> list[int]:
    buf: deque = deque(maxlen=SMOOTH_WINDOW)
    smoothed = []
    for c in centers:
        buf.append(c)
        smoothed.append(int(np.mean(buf)))

    deadzone_px = DEADZONE_RATIO * src_w
    committed = smoothed[0] if smoothed else src_w // 2
    result = []
    for s in smoothed:
        if abs(s - committed) > deadzone_px:
            committed = s
        crop_x = committed - crop_w // 2
        crop_x = max(0, min(crop_x, src_w - crop_w))
        result.append(crop_x)

    return result


# Note: cv2.VideoWriter encodes to mp4v here, which then gets re-encoded to libx264
# in the subtitle burn pass in clipper.py. Two encodes instead of one. In practice
# not visibly worse for social media clips (platforms re-encode anyway), but if we
# ever want to fix it: use ffmpeg's sendcmd filter to apply per-frame crop x positions
# directly, eliminating this intermediate encode entirely.
def _render_frames(
    cap: cv2.VideoCapture,
    start_frame: int,
    total_frames: int,
    crop_xs: list[int],
    crop_w: int,
    tmp_path: str,
    fps: float,
) -> None:
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(tmp_path, fourcc, fps, (TARGET_W, TARGET_H))

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    for i in range(total_frames):
        ret, frame = cap.read()
        if not ret:
            break
        x = crop_xs[i]
        cropped = frame[:, x : x + crop_w]
        scaled = cv2.resize(cropped, (TARGET_W, TARGET_H), interpolation=cv2.INTER_LANCZOS4)
        writer.write(scaled)

    writer.release()


def _mux_audio(source_video: str, start_time: float, duration: float, silent_mp4: str, output_path: str) -> None:
    cmd = [
        _FFMPEG, "-y",
        "-i", silent_mp4,
        "-ss", str(start_time), "-t", str(duration), "-i", source_video,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg audio mux failed:\n{result.stderr}")
