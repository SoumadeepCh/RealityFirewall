"""
Reality Firewall — Noise Residual Analysis
Extracts and analyzes noise patterns to discriminate camera vs GAN images.

Key insight: Camera sensor noise follows Poisson+Gaussian distribution with
spatial correlation. GAN noise is more uniform and lacks sensor-specific patterns.
"""
import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


def _denoise_image(gray: np.ndarray, strength: int = 10) -> np.ndarray:
    """
    Apply Gaussian blur denoising.
    We use a simple method that works without extra dependencies.
    For better results, cv2.fastNlMeansDenoising could be used.
    """
    try:
        import cv2
        return cv2.GaussianBlur(gray, (0, 0), sigmaX=strength / 5.0)
    except ImportError:
        # Pure numpy fallback: simple averaging kernel
        from scipy.ndimage import uniform_filter
        return uniform_filter(gray.astype(np.float64), size=5).astype(gray.dtype)


def analyze_noise(image_array: np.ndarray) -> dict:
    """
    Extract and analyze noise residuals from an image.

    Args:
        image_array: NumPy array (H, W, 3) BGR or RGB uint8

    Returns:
        dict with noise_score, noise statistics, and signals
    """
    try:
        # Convert to grayscale
        if len(image_array.shape) == 3:
            gray = np.mean(image_array.astype(np.float64), axis=2)
        else:
            gray = image_array.astype(np.float64)

        # Resize for performance
        h, w = gray.shape
        max_dim = 512
        if max(h, w) > max_dim:
            scale = max_dim / max(h, w)
            new_h, new_w = int(h * scale), int(w * scale)
            try:
                import cv2
                gray = cv2.resize(gray, (new_w, new_h))
            except ImportError:
                # Simple downsampling
                step_h = max(1, h // new_h)
                step_w = max(1, w // new_w)
                gray = gray[::step_h, ::step_w]

        # Extract noise residual: original - denoised
        denoised = _denoise_image(gray.astype(np.uint8)).astype(np.float64)
        noise = gray - denoised

        # ---- Noise Statistics ----

        # 1. Noise standard deviation
        noise_std = float(np.std(noise))

        # 2. Noise entropy (uniformity measure)
        # Quantize noise to bins and compute Shannon entropy
        noise_clipped = np.clip(noise, -30, 30)
        hist, _ = np.histogram(noise_clipped.flatten(), bins=64, density=True)
        hist = hist + 1e-10
        probs = hist / hist.sum()
        noise_entropy = -float(np.sum(probs * np.log2(probs)))
        max_entropy = np.log2(64)
        noise_entropy_ratio = noise_entropy / max_entropy

        # 3. Spatial autocorrelation of noise
        # Camera noise is spatially correlated; GAN noise is more uniform
        noise_h, noise_w = noise.shape
        if noise_h > 10 and noise_w > 10:
            # Horizontal autocorrelation (1-pixel shift)
            h_corr = float(np.corrcoef(
                noise[:, :-1].flatten(),
                noise[:, 1:].flatten()
            )[0, 1])
            # Vertical autocorrelation
            v_corr = float(np.corrcoef(
                noise[:-1, :].flatten(),
                noise[1:, :].flatten()
            )[0, 1])
            spatial_corr = (abs(h_corr) + abs(v_corr)) / 2
        else:
            spatial_corr = 0.0

        # 4. Noise kurtosis — camera noise is more Gaussian (kurtosis ~0)
        noise_flat = noise.flatten()
        if len(noise_flat) > 100:
            z = (noise_flat - np.mean(noise_flat)) / max(np.std(noise_flat), 1e-6)
            noise_kurtosis = float(np.mean(z ** 4) - 3)
        else:
            noise_kurtosis = 0.0

        # 5. Block-wise noise variance consistency
        # Split into 8x8 blocks and measure variance of per-block noise std
        block_size = 32
        block_stds = []
        for i in range(0, noise_h - block_size + 1, block_size):
            for j in range(0, noise_w - block_size + 1, block_size):
                block = noise[i:i + block_size, j:j + block_size]
                block_stds.append(float(np.std(block)))

        if len(block_stds) > 4:
            block_std_variance = float(np.std(block_stds) / max(np.mean(block_stds), 1e-6))
        else:
            block_std_variance = 0.0

        # ---- Compute Noise Score (0 = likely real, 1 = likely fake) ----
        score = 0.0

        # High noise entropy → uniform noise → likely GAN
        if noise_entropy_ratio > 0.85:
            score += 0.25
        elif noise_entropy_ratio > 0.75:
            score += 0.10

        # Low spatial correlation → no sensor pattern → likely GAN
        if spatial_corr < 0.1:
            score += 0.25
        elif spatial_corr < 0.2:
            score += 0.12

        # Abnormal noise std (too low or too high)
        if noise_std < 1.0:
            score += 0.15  # Suspiciously clean
        elif noise_std > 15.0:
            score += 0.10  # Possibly over-sharpened

        # Low block variance consistency → uniform noise → GAN
        if block_std_variance < 0.1:
            score += 0.20
        elif block_std_variance < 0.2:
            score += 0.08

        # Non-Gaussian noise kurtosis
        if abs(noise_kurtosis) > 3.0:
            score += 0.15

        noise_score = min(1.0, max(0.0, score))

        # Signals
        signals = []
        if noise_score > 0.25:
            signals.append({
                "id": "noise-residual-anomaly",
                "name": "Noise Pattern Anomaly",
                "category": "visual",
                "confidence": min(0.88, noise_score + 0.15),
                "description": (
                    f"Noise residual analysis: entropy={noise_entropy_ratio:.2f}, "
                    f"spatial_corr={spatial_corr:.3f}, block_var={block_std_variance:.3f}. "
                    "Pattern inconsistent with camera sensor noise."
                ),
                "severity": "harmful" if noise_score > 0.5 else "suspicious",
                "metric_value": noise_score,
                "source": "heuristic",
            })

        return {
            "noise_score": noise_score,
            "noise_stats": {
                "std": noise_std,
                "entropy_ratio": noise_entropy_ratio,
                "spatial_corr": spatial_corr,
                "kurtosis": noise_kurtosis,
                "block_std_variance": block_std_variance,
            },
            "signals": signals,
        }

    except Exception as e:
        logger.error(f"Noise analysis failed: {e}")
        return {
            "noise_score": None,
            "noise_stats": {},
            "signals": [],
        }
