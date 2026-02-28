"""
Reality Firewall — Texture Consistency Feature Extractor
Implements PDI (Patch Drift Index) for detecting compositing artifacts.
"""
import numpy as np
from PIL import Image


def compute_texture_metrics(image: Image.Image, grid_size: int = 8) -> dict:
    """
    Compute Patch Drift Index (PDI): measures texture consistency across image patches.
    Real images have smooth texture gradients; fakes show abrupt patch-level inconsistency.

    Args:
        image: PIL Image (RGB)
        grid_size: Number of patches per axis (NxN grid)

    Returns:
        dict with 'pdi', 'patch_scores', and diagnostic signals
    """
    arr = np.array(image.convert("RGB"), dtype=np.float64)
    h, w, _ = arr.shape

    patch_h = h // grid_size
    patch_w = w // grid_size

    if patch_h < 4 or patch_w < 4:
        return {"pdi": 0.0, "patch_scores": [], "signals": []}

    # Compute 48-dim color histogram per patch (16 bins × 3 channels)
    bins = 16
    histograms = []

    for gy in range(grid_size):
        for gx in range(grid_size):
            patch = arr[
                gy * patch_h : (gy + 1) * patch_h,
                gx * patch_w : (gx + 1) * patch_w,
            ]
            hist = np.zeros(bins * 3)
            pixel_count = patch.shape[0] * patch.shape[1]

            for ch in range(3):
                channel = patch[:, :, ch].ravel()
                h_vals, _ = np.histogram(channel, bins=bins, range=(0, 256))
                hist[ch * bins : (ch + 1) * bins] = h_vals / pixel_count

            histograms.append(hist)

    histograms = np.array(histograms)

    # Compute cosine similarity between adjacent patches
    def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a < 1e-10 or norm_b < 1e-10:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))

    similarities = []
    for gy in range(grid_size):
        for gx in range(grid_size):
            idx = gy * grid_size + gx
            # Right neighbor
            if gx + 1 < grid_size:
                similarities.append(cosine_sim(histograms[idx], histograms[idx + 1]))
            # Bottom neighbor
            if gy + 1 < grid_size:
                similarities.append(cosine_sim(histograms[idx], histograms[idx + grid_size]))

    if not similarities:
        return {"pdi": 0.0, "patch_scores": [], "signals": []}

    sims = np.array(similarities)
    pdi = float(np.var(sims))

    signals = []
    if pdi > 0.02:
        signals.append({
            "id": "tex-pdi-high",
            "name": "Texture Consistency Drift",
            "category": "visual",
            "confidence": min(0.85, 0.5 + pdi * 10),
            "description": (
                f"Patch Drift Index of {pdi:.4f} indicates inconsistent texture "
                "across image regions, suggesting compositing or generation artifacts."
            ),
            "severity": "harmful" if pdi > 0.05 else "suspicious",
            "metric_value": pdi,
            "source": "heuristic",
        })

    return {
        "pdi": pdi,
        "patch_scores": similarities,
        "signals": signals,
    }
