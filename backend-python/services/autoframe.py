import os
import subprocess
import tempfile

import cv2
import mediapipe as mp
import numpy as np

TARGET_W = 1080
TARGET_H = 1920
DETECT_INTERVAL = 0.25  # run face detection every 0.25s (time-based, not frame-based)
DEADZONE_RATIO = 0.15   # 15% of crop width — camera ignores movement within this zone
SMOOTH_FACTOR = 0.50    # lerp per keyframe toward face — higher = follows faster, less lag
SNAP_THRESHOLD = 0.40   # 40% of src width — only snap on genuine scene cuts, not head movement
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

    crop_xs = _detect_and_smooth(cap, start_time, duration, fps, src_w, src_h, crop_w)

    tmp_silent = tempfile.mktemp(suffix="_silent.mp4")
    try:
        _render_frames(cap, start_frame, total_frames, crop_xs, crop_w, tmp_silent, fps)
        cap.release()
        _mux_audio(input_path, start_time, duration, tmp_silent, output_path)
    finally:
        cap.release()
        if os.path.exists(tmp_silent):
            os.unlink(tmp_silent)


# NOTE: tracking still feels jumpy on real talking-head content.
# Root cause: we're doing face *detection* (independent per keyframe) not face *tracking*.
# Each 0.25s keyframe finds the face from scratch with no memory of the previous frame.
# When detection is slightly off (face partially occluded, head turned, lighting change),
# the camera position snaps to the wrong spot.
#
# Real fix: swap MediaPipe FaceDetection for a proper tracker like ByteTrack or DeepSORT.
# A tracker detects once then follows the bounding box across frames using motion prediction —
# much more stable because it doesn't lose the face between samples.
# Opus Clips and similar tools almost certainly use this approach.
#
# Secondary option: YOLOv8-face instead of MediaPipe BlazeFace — more accurate detections
# means fewer bad keyframes to smooth over.
def _detect_and_smooth(
    cap: cv2.VideoCapture,
    start_time: float,
    duration: float,
    fps: float,
    src_w: int,
    src_h: int,
    crop_w: int,
) -> list[int]:
    """
    Two-pass algorithm (ported from opensource-clipping/studio/core.py):
      Pass 1 — collect raw face-center keyframes every DETECT_INTERVAL seconds
      Pass 2 — smooth keyframes with deadzone + lerp + snap detection
      Then linearly interpolate keyframes to per-frame crop positions.
    """
    detector = mp.solutions.face_detection.FaceDetection(
        model_selection=0, min_detection_confidence=0.5
    )
    default_cx = src_w // 2
    default_cy = src_h // 2
    total_frames = int(duration * fps)

    # Pass 1: raw detection at time-based intervals
    raw: list[dict] = []
    t = 0.0
    while t <= duration:
        frame_idx = int(start_time * fps) + int(t * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        cx, cy = default_cx, default_cy
        if ret:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = detector.process(rgb)
            if result.detections:
                # Pick largest face by bounding box area
                best = max(
                    result.detections,
                    key=lambda d: d.location_data.relative_bounding_box.width
                    * d.location_data.relative_bounding_box.height,
                )
                bbox = best.location_data.relative_bounding_box
                cx = int((bbox.xmin + bbox.width / 2) * src_w)
                cy = int((bbox.ymin + bbox.height / 2) * src_h)
        raw.append({"t": t, "cx": cx, "cy": cy})
        t += DETECT_INTERVAL

    detector.close()

    # Pass 2: smooth keyframes
    deadzone_px = crop_w * DEADZONE_RATIO
    snap_px = src_w * SNAP_THRESHOLD

    # Initialise camera at median of first 5 detections
    init_cxs = [d["cx"] for d in raw[:5]]
    cam_cx = float(int(np.median(init_cxs)))

    smooth: list[dict] = []
    for d in raw:
        face_cx = float(d["cx"])
        diff = face_cx - cam_cx
        if abs(diff) > snap_px:
            cam_cx = face_cx  # hard cut — face jumped (scene change)
        else:
            if face_cx > cam_cx + deadzone_px:
                cam_cx += (face_cx - (cam_cx + deadzone_px)) * SMOOTH_FACTOR
            elif face_cx < cam_cx - deadzone_px:
                cam_cx += (face_cx - (cam_cx - deadzone_px)) * SMOOTH_FACTOR
        smooth.append({"t": d["t"], "cx": cam_cx})

    # Interpolate smoothed keyframes to per-frame crop positions
    def _cam_x_at(t: float) -> float:
        if t <= smooth[0]["t"]:
            return smooth[0]["cx"]
        if t >= smooth[-1]["t"]:
            return smooth[-1]["cx"]
        for i in range(len(smooth) - 1):
            t1, t2 = smooth[i]["t"], smooth[i + 1]["t"]
            if t1 <= t <= t2:
                if t1 == t2:
                    return smooth[i]["cx"]
                cx1, cx2 = smooth[i]["cx"], smooth[i + 1]["cx"]
                # At snap points, hold previous position until the keyframe boundary
                # instead of panning — makes scene cuts look like cuts, not pans
                if abs(cx2 - cx1) > snap_px:
                    return cx1
                alpha = (t - t1) / (t2 - t1)
                return cx1 + alpha * (cx2 - cx1)
        return smooth[-1]["cx"]

    result = []
    for i in range(total_frames):
        t = i / fps
        cam_cx_now = _cam_x_at(t)
        crop_x = int(cam_cx_now) - crop_w // 2
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
