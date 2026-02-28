"""
Reality Firewall — Media Router
Detects media type and preprocesses for the detection pipeline.
"""
import io
import logging
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

from config import MAX_IMAGE_DIM, VIDEO_FPS_SAMPLE, MAX_VIDEO_FRAMES

logger = logging.getLogger(__name__)


def detect_media_type(filename: str, content_type: Optional[str] = None) -> str:
    """
    Detect media type from filename extension and content type.

    Returns: 'image', 'video', 'audio', or 'unknown'
    """
    ext = Path(filename).suffix.lower()

    image_exts = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff"}
    video_exts = {".mp4", ".webm", ".avi", ".mov", ".mkv", ".flv", ".wmv"}
    audio_exts = {".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".wma"}

    if ext in image_exts:
        return "image"
    if ext in video_exts:
        return "video"
    if ext in audio_exts:
        return "audio"

    # Fallback to content type
    if content_type:
        if content_type.startswith("image/"):
            return "image"
        if content_type.startswith("video/"):
            return "video"
        if content_type.startswith("audio/"):
            return "audio"

    return "unknown"


def preprocess_image(raw_bytes: bytes) -> dict:
    """
    Load and preprocess an image.

    Returns:
        dict with 'image' (PIL), 'width', 'height', 'raw_bytes'
    """
    image = Image.open(io.BytesIO(raw_bytes))
    original_size = image.size

    # Resize if too large (preserve aspect ratio)
    w, h = image.size
    if max(w, h) > MAX_IMAGE_DIM:
        scale = MAX_IMAGE_DIM / max(w, h)
        new_w = int(w * scale)
        new_h = int(h * scale)
        image = image.resize((new_w, new_h), Image.LANCZOS)
        logger.info(f"Image resized from {original_size} to {image.size}")

    return {
        "image": image.convert("RGB"),
        "width": image.size[0],
        "height": image.size[1],
        "original_size": original_size,
        "raw_bytes": raw_bytes,
    }


def preprocess_video(raw_bytes: bytes, filename: str) -> dict:
    """
    Extract frames and audio from video using OpenCV.

    Returns:
        dict with 'frames' (list of PIL Images), 'audio_samples', 'duration', etc.
    """
    import tempfile
    import os

    frames = []
    duration = 0.0
    fps = 0.0
    total_frames_count = 0

    try:
        import cv2

        # Write to temp file for OpenCV
        with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix, delete=False) as tmp:
            tmp.write(raw_bytes)
            tmp_path = tmp.name

        try:
            cap = cv2.VideoCapture(tmp_path)

            if not cap.isOpened():
                logger.error("Failed to open video")
                return {"frames": [], "audio_samples": None, "duration": 0, "fps": 0}

            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            total_frames_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            duration = total_frames_count / fps if fps > 0 else 0

            # Calculate frame sampling interval
            sample_interval = max(1, int(fps / VIDEO_FPS_SAMPLE))
            frame_idx = 0

            while len(frames) < MAX_VIDEO_FRAMES:
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx % sample_interval == 0:
                    # Convert BGR → RGB → PIL
                    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    pil_frame = Image.fromarray(rgb_frame)

                    # Resize if too large
                    w, h = pil_frame.size
                    if max(w, h) > MAX_IMAGE_DIM:
                        scale = MAX_IMAGE_DIM / max(w, h)
                        pil_frame = pil_frame.resize(
                            (int(w * scale), int(h * scale)), Image.LANCZOS
                        )

                    frames.append(pil_frame)

                frame_idx += 1

            cap.release()
            logger.info(f"Extracted {len(frames)} frames from {total_frames_count} total (fps={fps:.1f})")

        finally:
            os.unlink(tmp_path)

    except ImportError:
        logger.error("OpenCV not installed — cannot process video")

    # Audio extraction (placeholder — full implementation in Phase 4)
    audio_samples = None

    return {
        "frames": frames,
        "audio_samples": audio_samples,
        "duration": duration,
        "fps": fps,
        "total_frames": total_frames_count,
    }


def preprocess_audio(raw_bytes: bytes, filename: str) -> dict:
    """
    Load audio file using librosa.

    Returns:
        dict with 'samples' (numpy array), 'sr', 'duration'
    """
    try:
        import librosa
        import soundfile as sf

        # Load audio
        samples, sr = librosa.load(io.BytesIO(raw_bytes), sr=22050, mono=True)
        duration = len(samples) / sr

        logger.info(f"Audio loaded: {duration:.1f}s, sr={sr}")

        return {
            "samples": samples,
            "sr": sr,
            "duration": duration,
        }

    except ImportError:
        logger.error("librosa not installed — cannot process audio")
        return {"samples": None, "sr": 22050, "duration": 0}
    except Exception as e:
        logger.error(f"Audio loading failed: {e}")
        return {"samples": None, "sr": 22050, "duration": 0}


def route_media(raw_bytes: bytes, filename: str, content_type: Optional[str] = None) -> dict:
    """
    Main routing function: detect type → preprocess → return structured data.

    Returns:
        dict with 'media_type', processed data, and metadata
    """
    media_type = detect_media_type(filename, content_type)
    file_size = len(raw_bytes)

    result = {
        "media_type": media_type,
        "filename": filename,
        "file_size": file_size,
        "mime_type": content_type or "application/octet-stream",
    }

    if media_type == "image":
        img_data = preprocess_image(raw_bytes)
        result.update(img_data)
    elif media_type == "video":
        vid_data = preprocess_video(raw_bytes, filename)
        result.update(vid_data)
    elif media_type == "audio":
        aud_data = preprocess_audio(raw_bytes, filename)
        result.update(aud_data)
    else:
        logger.warning(f"Unknown media type for file: {filename}")

    return result
