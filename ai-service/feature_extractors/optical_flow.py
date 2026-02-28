"""
Reality Firewall — Optical Flow Analysis (Improvement 5)
Computes Flow Acceleration Variance (FAV) from consecutive video frames.

Key insight: Real video has natural, smooth motion with camera jitter.
Deepfaked video has unnatural motion — either too smooth (interpolated) or
too jerky (fake face pasted frame-by-frame without motion consistency).
"""
import logging
from typing import Optional

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


def compute_flow_metrics(frames: list[Image.Image]) -> dict:
    """
    Compute optical flow-based metrics from consecutive video frames.

    Args:
        frames: List of PIL Images (video frames in order)

    Returns:
        dict with 'fav' (Flow Acceleration Variance), signals
    """
    if len(frames) < 3:
        return {
            "fav": None,
            "flow_stats": {},
            "signals": [],
        }

    try:
        import cv2
    except ImportError:
        logger.warning("OpenCV not available for optical flow")
        return {"fav": None, "flow_stats": {}, "signals": []}

    # Convert frames to grayscale numpy arrays
    gray_frames = []
    max_dim = 320  # Resize for speed
    for frame in frames[:15]:  # Cap at 15 frames
        arr = np.array(frame.convert("L"))
        h, w = arr.shape
        if max(h, w) > max_dim:
            scale = max_dim / max(h, w)
            arr = cv2.resize(arr, (int(w * scale), int(h * scale)))
        gray_frames.append(arr)

    # Compute dense optical flow between consecutive frames
    flows = []
    for i in range(len(gray_frames) - 1):
        flow = cv2.calcOpticalFlowFarneback(
            gray_frames[i],
            gray_frames[i + 1],
            None,
            pyr_scale=0.5,
            levels=3,
            winsize=15,
            iterations=3,
            poly_n=5,
            poly_sigma=1.2,
            flags=0,
        )
        flows.append(flow)

    if len(flows) < 2:
        return {"fav": None, "flow_stats": {}, "signals": []}

    # ---- Compute Flow Statistics ----

    # Flow magnitudes per frame-pair
    magnitudes = []
    for flow in flows:
        mag = np.sqrt(flow[..., 0] ** 2 + flow[..., 1] ** 2)
        magnitudes.append(float(np.mean(mag)))

    # Flow acceleration: difference between consecutive flow magnitudes
    accelerations = []
    for i in range(len(magnitudes) - 1):
        accelerations.append(magnitudes[i + 1] - magnitudes[i])

    # FAV: Flow Acceleration Variance
    # High variance → natural (camera shakes, real motion)
    # Very low variance → unnatural (interpolated deepfake)
    # Very high variance → unnatural (jerky face swap)
    fav = float(np.var(accelerations)) if accelerations else 0.0

    # Flow consistency: how similar flow directions are across frames
    angle_stds = []
    for flow in flows:
        angles = np.arctan2(flow[..., 1], flow[..., 0])
        # Only consider pixels with significant motion
        mag = np.sqrt(flow[..., 0] ** 2 + flow[..., 1] ** 2)
        moving = mag > 0.5
        if np.sum(moving) > 100:
            angle_stds.append(float(np.std(angles[moving])))

    flow_direction_consistency = float(np.mean(angle_stds)) if angle_stds else 0.0

    # Flow smoothness: L2 distance between consecutive flow fields
    flow_diffs = []
    for i in range(len(flows) - 1):
        diff = flows[i + 1] - flows[i]
        flow_diffs.append(float(np.mean(np.sqrt(diff[..., 0] ** 2 + diff[..., 1] ** 2))))
    temporal_smoothness = float(np.mean(flow_diffs)) if flow_diffs else 0.0

    # ---- Scoring ----
    score = 0.0

    # Very low FAV → over-smooth motion → likely deepfake
    if fav < 0.01:
        score += 0.35
    elif fav < 0.05:
        score += 0.15

    # Very high FAV → jerky motion → possibly frame-by-frame deepfake
    if fav > 2.0:
        score += 0.30
    elif fav > 1.0:
        score += 0.15

    # Low temporal smoothness → inconsistent motion
    if temporal_smoothness > 3.0:
        score += 0.20
    elif temporal_smoothness > 1.5:
        score += 0.10

    # Abnormal flow direction consistency
    if flow_direction_consistency < 0.3:
        score += 0.15  # Over-aligned flow → unnatural

    fav_score = min(1.0, max(0.0, score))

    # Signals
    signals = []
    if fav_score > 0.2:
        motion_desc = "over-smooth" if fav < 0.05 else "jerky" if fav > 1.0 else "inconsistent"
        signals.append({
            "id": "vid-flow-anomaly",
            "name": "Optical Flow Anomaly",
            "category": "temporal",
            "confidence": min(0.90, fav_score + 0.1),
            "description": (
                f"Flow acceleration variance (FAV={fav:.4f}) indicates {motion_desc} motion. "
                f"Temporal smoothness={temporal_smoothness:.3f}. "
                "Natural video has moderate, natural flow variation."
            ),
            "severity": "harmful" if fav_score > 0.5 else "suspicious",
            "metric_value": fav_score,
            "source": "heuristic",
        })

    return {
        "fav": fav_score,
        "fav_raw": fav,
        "flow_stats": {
            "magnitudes": magnitudes,
            "temporal_smoothness": temporal_smoothness,
            "flow_direction_consistency": flow_direction_consistency,
            "n_frames_analyzed": len(gray_frames),
        },
        "signals": signals,
    }
