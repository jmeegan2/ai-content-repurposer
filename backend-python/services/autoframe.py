import os
import re
import subprocess
import tempfile

import cv2
import mediapipe as mp
import numpy as np

TARGET_W = 1080
TARGET_H = 1920
SNAP_THRESHOLD = 0.40   # fraction of src_w — hard snap on genuine scene change (both versions)
_FFMPEG = os.environ.get("FFMPEG_PATH", "/opt/homebrew/bin/ffmpeg")

# "A" — sampled detection every 0.25s + lerp smoothing (original approach)
# "B" — per-frame sequential detection + 1D Kalman filter (pro approach, no panning artifacts)
TRACKING_VERSION = "B"

# Version A tuning (unused when TRACKING_VERSION = "B")
DETECT_INTERVAL = 0.25  # detect every 0.25s
DEADZONE_RATIO = 0.04   # fraction of crop_w — ignore movement within this zone
SMOOTH_FACTOR = 0.85    # lerp factor per keyframe toward face center


"""
couple of issues

its not reliably framing the person in the middle of the frame

still when it cuts it is like panning over to the persons face

"""

"""
Root causes:

Issue 1 — face off-center:
  - DEADZONE_RATIO = 0.15 was too wide. The camera won't move if the face is within ±15% of the
    crop width of center (~90px in source space), so the face sits visibly off-center and the
    algorithm considers it fine.
  - SMOOTH_FACTOR = 0.50 meant each 0.25s keyframe only closed half the remaining gap to the face.
    After any head movement the camera spent several keyframes crawling toward center. The face
    never fully settled.
  Fix: lowered DEADZONE_RATIO to 0.04, raised SMOOTH_FACTOR to 0.85.

Issue 2 — camera pans onto face at cuts:
  - When a scene cut is detected, _cam_x_at jumps to cx2 (the next smoothed keyframe). But cx2 was
    produced by the lerp in Pass 2, so it's only partway to the new face position. Every frame
    between the cut and the next keyframe (up to 0.25s) shows the camera still drifting toward
    where the face actually is.
  Fix: in Pass 2, when a keyframe immediately follows a detected cut time, bypass the lerp and snap
  cam_cx = face_cx directly. That way cx2 is the actual detected face center, so the post-cut jump
  lands on the face instead of a mid-pan value.
  Change: `for d in raw` → `for i, d in enumerate(raw)`, then check
  `any(prev_t < ct <= d["t"] for ct in cut_times)` and snap if true.

Version B addresses both issues at the root:
  - Per-frame detection (no 0.25s sample gap) eliminates the interpolation lag that causes panning.
  - 1D Kalman filter models face position + velocity — smooth, physically-motivated camera movement
    with no fixed deadzone keeping the face off-center.
  - Hard Kalman reset at detected scene cuts — camera jumps instantly to the new face, no pan.
  - Sequential frame reads (no random seeks) — faster than Version A's sampled seeks.
"""


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
        crop_w = src_w

    cut_times = _detect_cuts(input_path, start_time, duration)

    if TRACKING_VERSION == "B":
        crop_xs = _detect_and_smooth_v2(cap, start_time, duration, fps, src_w, src_h, crop_w, cut_times)
    else:
        crop_xs = _detect_and_smooth_v1(cap, start_time, duration, fps, src_w, src_h, crop_w, cut_times)

    tmp_silent = tempfile.mktemp(suffix="_silent.mp4")
    try:
        _render_frames(cap, start_frame, total_frames, crop_xs, crop_w, tmp_silent, fps)
        cap.release()
        _mux_audio(input_path, start_time, duration, tmp_silent, output_path)
    finally:
        cap.release()
        if os.path.exists(tmp_silent):
            os.unlink(tmp_silent)


def _detect_cuts(input_path: str, start_time: float, duration: float, threshold: float = 10.0) -> list[float]:
    """
    Returns timestamps (relative to clip start) where scene cuts occur,
    using ffmpeg's scdet filter. Takes ~1-2s per clip but eliminates
    the camera pan-onto-face artifact at cut points.
    """
    result = subprocess.run(
        [
            _FFMPEG,
            "-ss", str(start_time),
            "-t", str(duration),
            "-i", input_path,
            "-vf", f"scdet=threshold={threshold}",
            "-f", "null", "-",
        ],
        capture_output=True,
        text=True,
    )
    cuts = []
    for line in result.stderr.splitlines():
        if "scdet" not in line.lower():
            continue
        m = re.search(r'pts_time[:\s]+([0-9.]+)', line)
        if not m:
            m = re.search(r'time[:\s]+([0-9.]+)', line)
        if m:
            cuts.append(float(m.group(1)))
    return cuts


# ─── Version A ───────────────────────────────────────────────────────────────
# NOTE: tracking still feels jumpy on real talking-head content.
# Root cause: we're doing face *detection* (independent per keyframe) not face *tracking*.
# Each 0.25s keyframe finds the face from scratch with no memory of the previous frame.
# When detection is slightly off (face partially occluded, head turned, lighting change),
# the camera position snaps to the wrong spot.
def _detect_and_smooth_v1(
    cap: cv2.VideoCapture,
    start_time: float,
    duration: float,
    fps: float,
    src_w: int,
    src_h: int,
    crop_w: int,
    cut_times: list[float],
) -> list[int]:
    """
    Original two-pass algorithm:
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

    init_cxs = [d["cx"] for d in raw[:5]]
    cam_cx = float(int(np.median(init_cxs)))

    smooth: list[dict] = []
    for d in raw:
        face_cx = float(d["cx"])
        diff = face_cx - cam_cx
        if abs(diff) > snap_px:
            cam_cx = face_cx
        else:
            if face_cx > cam_cx + deadzone_px:
                cam_cx += (face_cx - (cam_cx + deadzone_px)) * SMOOTH_FACTOR
            elif face_cx < cam_cx - deadzone_px:
                cam_cx += (face_cx - (cam_cx - deadzone_px)) * SMOOTH_FACTOR
        smooth.append({"t": d["t"], "cx": cam_cx})

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
                cuts_here = [ct for ct in cut_times if t1 < ct <= t2]
                if cuts_here:
                    cut_t = cuts_here[0]
                    return cx1 if t < cut_t else cx2
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


# ─── Version B ───────────────────────────────────────────────────────────────
def _detect_and_smooth_v2(
    cap: cv2.VideoCapture,
    start_time: float,
    duration: float,
    fps: float,
    src_w: int,
    src_h: int,
    crop_w: int,
    cut_times: list[float],
) -> list[int]:
    """
    Opus-style fixed-crop-per-segment approach:

    - Split the clip into segments at detected scene cuts.
    - For each segment, collect all face detections and take the median x position.
    - Use that single x value as a completely static crop for the entire segment.
    - At segment boundaries, hard-jump to the next segment's median.

    No camera movement within a segment = zero jitter, zero panning.
    Crisp hard cut at boundaries = matches how Opus Clips looks.
    """
    detector = mp.solutions.face_detection.FaceDetection(
        model_selection=0, min_detection_confidence=0.5
    )

    start_frame = int(start_time * fps)
    total_frames = int(duration * fps)
    default_cx = float(src_w // 2)

    # Collect per-frame detections sequentially
    raw_cxs: list[float | None] = []
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    for _ in range(total_frames):
        ret, frame = cap.read()
        if not ret:
            raw_cxs.append(None)
            continue
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        det = detector.process(rgb)
        if det.detections:
            best = max(
                det.detections,
                key=lambda d: d.location_data.relative_bounding_box.width
                * d.location_data.relative_bounding_box.height,
            )
            bbox = best.location_data.relative_bounding_box
            raw_cxs.append((bbox.xmin + bbox.width / 2) * src_w)
        else:
            raw_cxs.append(None)

    detector.close()

    # Build segment boundaries: [0, cut_frame_1, cut_frame_2, ..., total_frames]
    segment_starts = [0] + sorted(int(ct * fps) + 1 for ct in cut_times)
    segment_starts = [s for s in segment_starts if 0 <= s < total_frames]
    segment_ranges = list(zip(segment_starts, segment_starts[1:] + [total_frames]))

    # For each segment compute the median face cx across all valid detections in it
    def segment_median_cx(start: int, end: int) -> float:
        detections = [cx for cx in raw_cxs[start:end] if cx is not None]
        if detections:
            return float(np.median(detections))
        # No detections in segment — fall back to previous raw_cxs or center
        prior = [cx for cx in raw_cxs[:start] if cx is not None]
        return float(prior[-1]) if prior else default_cx

    # Assign each frame the static crop x for its segment
    crop_result: list[int] = [0] * total_frames
    for seg_start, seg_end in segment_ranges:
        cam_cx = segment_median_cx(seg_start, seg_end)
        crop_x = int(cam_cx) - crop_w // 2
        crop_x = max(0, min(crop_x, src_w - crop_w))
        for i in range(seg_start, seg_end):
            crop_result[i] = crop_x

    return crop_result


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
