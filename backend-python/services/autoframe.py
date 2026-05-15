import os
import re
import subprocess
import tempfile

import cv2
import mediapipe as mp
import numpy as np

# Output dimensions for 9:16 vertical video (TikTok / Reels / Shorts)
TARGET_W = 1080
TARGET_H = 1920

# If the face jumps more than 40% of the source width between frames, treat it as a
# hard scene cut rather than movement — avoids the camera chasing a false detection.
SNAP_THRESHOLD = 0.40

_FFMPEG = os.environ.get("FFMPEG_PATH", "/opt/homebrew/bin/ffmpeg")


def process_clip(input_path: str, start_time: float, end_time: float, output_path: str) -> None:
    """
    Main entry point. Given a source video and a time range, produces a face-tracked
    9:16 crop at output_path with audio intact.

    High-level flow:
      1. Find scene cuts within the clip (so we never pan across a hard cut).
      2. Run face detection on every frame and compute a static crop per scene segment.
      3. Render the cropped frames to a silent temp file.
      4. Mux the original audio back in and write the final output.
    """
    duration = end_time - start_time
    cap = cv2.VideoCapture(input_path)

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    source_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    source_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    start_frame = int(start_time * fps)
    total_frames = int(duration * fps)

    # The crop window is as wide as a 9:16 slice of the source height.
    # Capped at source_width so we never try to crop wider than the video itself.
    crop_width = int(source_height * 9 / 16)
    if crop_width > source_width:
        crop_width = source_width

    # Step 1: find timestamps (relative to clip start) where a scene cut happens
    cut_times = _detect_cuts(input_path, start_time, duration)

    # Step 2: for each frame, decide where to place the left edge of the crop window
    per_frame_crop_x = _detect_and_smooth(
        cap, start_time, duration, fps, source_width, source_height, crop_width, cut_times
    )

    # Steps 3 & 4: render to a silent temp file, then mux audio from the source
    tmp_silent = tempfile.mktemp(suffix="_silent.mp4")
    try:
        _render_frames(cap, start_frame, total_frames, per_frame_crop_x, crop_width, tmp_silent, fps)
        cap.release()
        _mux_audio(input_path, start_time, duration, tmp_silent, output_path)
    finally:
        cap.release()
        if os.path.exists(tmp_silent):
            os.unlink(tmp_silent)


def _detect_cuts(input_path: str, start_time: float, duration: float, threshold: float = 10.0) -> list[float]:
    """
    Uses ffmpeg's scene-change detector (scdet) to find hard cuts in the clip.
    Returns timestamps in seconds, relative to the clip's start_time.

    We need these so _detect_and_smooth can treat each scene as its own independent
    segment — otherwise the crop would try to pan smoothly across a jump cut.
    """
    result = subprocess.run(
        [
            _FFMPEG,
            "-ss", str(start_time),
            "-t", str(duration),
            "-i", input_path,
            "-vf", f"scdet=threshold={threshold}",
            "-f", "null", "-",   # no output file — we only care about the stderr log
        ],
        capture_output=True,
        text=True,
    )

    cut_timestamps = []
    for line in result.stderr.splitlines():
        if "scdet" not in line.lower():
            continue
        # ffmpeg logs cut timestamps in slightly different formats depending on version
        match = re.search(r'pts_time[:\s]+([0-9.]+)', line)
        if not match:
            match = re.search(r'time[:\s]+([0-9.]+)', line)
        if match:
            cut_timestamps.append(float(match.group(1)))

    return cut_timestamps


def _detect_and_smooth(
    cap: cv2.VideoCapture,
    start_time: float,
    duration: float,
    fps: float,
    source_width: int,
    source_height: int,
    crop_width: int,
    cut_times: list[float],
) -> list[int]:
    """
    Computes the crop x position for every frame in the clip.

    Strategy — per-segment static crop:
      - Scan every frame and record where the face center is (in pixels from the left).
      - Split the clip into segments at detected scene cuts.
      - For each segment, take the median face-center x across all frames in that segment.
        Median is used instead of mean so a few bad detections don't skew the position.
      - Every frame in a segment gets the same static crop x — no camera movement within
        a scene, which eliminates jitter and panning artifacts.
      - At a scene cut the crop hard-jumps to the next segment's position, matching
        how Opus Clips and similar tools look.

    Returns a list of crop_x values (left edge of the crop window), one per frame.
    """
    # This is where the ML happens — MediaPipe runs a lightweight on-device face detection
    # model on every frame to find the face's bounding box. No API call, runs locally.
    # It's not making editorial decisions (that was GPT-4o upstream) — it's just answering
    # "where is the face in this frame?" so we know where to point the crop window.
    face_detector = mp.solutions.face_detection.FaceDetection(
        model_selection=0, min_detection_confidence=0.5
    )

    start_frame = int(start_time * fps)
    total_frames = int(duration * fps)
    fallback_center_x = float(source_width // 2)  # used when no face is detected at all

    # Pass 1 — collect the face center x for every frame (None when no face found)
    face_center_x_per_frame: list[float | None] = []
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    for _ in range(total_frames):
        ret, frame = cap.read()
        if not ret:
            face_center_x_per_frame.append(None)
            continue

        # MediaPipe requires RGB; OpenCV gives us BGR
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        detection_result = face_detector.process(rgb_frame)

        if detection_result.detections:
            # If multiple faces detected, use the largest one (most likely the main subject)
            largest_face = max(
                detection_result.detections,
                key=lambda d: d.location_data.relative_bounding_box.width
                * d.location_data.relative_bounding_box.height,
            )
            bbox = largest_face.location_data.relative_bounding_box
            # bbox values are 0–1 fractions of the frame; convert to pixel x coordinate
            face_cx_pixels = (bbox.xmin + bbox.width / 2) * source_width
            face_center_x_per_frame.append(face_cx_pixels)
        else:
            face_center_x_per_frame.append(None)

    face_detector.close()

    # Pass 2 — build segment boundaries from cut timestamps, then assign a static
    # crop x to every frame based on the median face position within its segment.

    # Convert cut timestamps (seconds) → frame indices, then build (start, end) pairs
    # e.g. cuts at frames 40 and 90 in a 120-frame clip → [(0,40), (41,90), (91,120)]
    segment_start_frames = [0] + sorted(int(ct * fps) + 1 for ct in cut_times)
    segment_start_frames = [s for s in segment_start_frames if 0 <= s < total_frames]
    segments = list(zip(segment_start_frames, segment_start_frames[1:] + [total_frames]))

    def median_face_x_for_segment(frame_start: int, frame_end: int) -> float:
        """Returns the median detected face center x for the given frame range."""
        detections_in_segment = [
            cx for cx in face_center_x_per_frame[frame_start:frame_end] if cx is not None
        ]
        if detections_in_segment:
            return float(np.median(detections_in_segment))
        # No detections in this segment — use the last known face position, or center
        prior_detections = [cx for cx in face_center_x_per_frame[:frame_start] if cx is not None]
        return float(prior_detections[-1]) if prior_detections else fallback_center_x

    per_frame_crop_x: list[int] = [0] * total_frames

    for seg_frame_start, seg_frame_end in segments:
        # The crop window is centered on the median face x for this segment
        face_center = median_face_x_for_segment(seg_frame_start, seg_frame_end)
        crop_left_edge = int(face_center) - crop_width // 2
        # Clamp so the window stays within the source frame boundaries
        crop_left_edge = max(0, min(crop_left_edge, source_width - crop_width))

        for frame_idx in range(seg_frame_start, seg_frame_end):
            per_frame_crop_x[frame_idx] = crop_left_edge

    return per_frame_crop_x


# Note: cv2.VideoWriter encodes to mp4v here, which then gets re-encoded to libx264
# in the subtitle burn pass in clipper.py. Two encodes instead of one. In practice
# not visibly worse for social media clips (platforms re-encode anyway), but if we
# ever want to fix it: use ffmpeg's sendcmd filter to apply per-frame crop x positions
# directly, eliminating this intermediate encode entirely.
def _render_frames(
    cap: cv2.VideoCapture,
    start_frame: int,
    total_frames: int,
    per_frame_crop_x: list[int],
    crop_width: int,
    output_path: str,
    fps: float,
) -> None:
    """
    Reads each source frame, slices out the crop window, scales it to TARGET_W x TARGET_H,
    and writes it to a silent mp4. Audio is added separately in _mux_audio.
    """
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (TARGET_W, TARGET_H))

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    for frame_idx in range(total_frames):
        ret, frame = cap.read()
        if not ret:
            break

        # Slice the crop window horizontally; keep full height (cropped to 9:16 by scaling)
        left = per_frame_crop_x[frame_idx]
        cropped = frame[:, left : left + crop_width]

        # Upscale/downscale to the target 1080x1920 output resolution
        scaled = cv2.resize(cropped, (TARGET_W, TARGET_H), interpolation=cv2.INTER_LANCZOS4)
        writer.write(scaled)

    writer.release()


def _mux_audio(source_video: str, start_time: float, duration: float, silent_mp4: str, output_path: str) -> None:
    """
    Takes the silent cropped video and grafts the original audio track back on.
    Video stream comes from silent_mp4 (already cropped/scaled).
    Audio stream is extracted from source_video at the matching time range.
    """
    cmd = [
        _FFMPEG, "-y",
        "-i", silent_mp4,                                        # input 0: cropped silent video
        "-ss", str(start_time), "-t", str(duration), "-i", source_video,  # input 1: original with audio
        "-map", "0:v:0",   # use video from input 0
        "-map", "1:a:0",   # use audio from input 1
        "-c:v", "copy",    # don't re-encode the video — just copy the stream
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",  # move metadata to front so the file is streamable
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg audio mux failed:\n{result.stderr}")
