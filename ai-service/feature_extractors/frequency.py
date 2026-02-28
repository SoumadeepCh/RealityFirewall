"""
Reality Firewall — Frequency Domain Feature Extractor
Implements HFER (High Frequency Energy Ratio) and SVD (Spectral Variance Deviation).
Production version using numpy FFT.
"""
import numpy as np
from PIL import Image


def compute_frequency_metrics(image: Image.Image) -> dict:
    """
    Compute frequency-domain anomaly metrics from an image.

    HFER: High Frequency Energy Ratio — GAN images suppress high-freq noise.
    SVD: Spectral Variance Deviation — synthetic images have abnormal spectral distribution.

    Args:
        image: PIL Image (RGB or grayscale)

    Returns:
        dict with 'hfer', 'svd', and diagnostic signals
    """
    # Convert to grayscale numpy array
    gray = np.array(image.convert("L"), dtype=np.float64)

    # Resize to max 512x512 for performance
    h, w = gray.shape
    if max(h, w) > 512:
        scale = 512.0 / max(h, w)
        new_h, new_w = int(h * scale), int(w * scale)
        # Simple resize via nearest neighbor (fast, preserves frequency content)
        from scipy.ndimage import zoom
        gray = zoom(gray, (new_h / h, new_w / w), order=1)
        h, w = gray.shape

    # 2D FFT
    f_transform = np.fft.fft2(gray)
    f_shifted = np.fft.fftshift(f_transform)

    # Magnitude spectrum: M(u,v) = log(1 + |F(u,v)|)
    magnitude = np.log1p(np.abs(f_shifted))

    # Center coordinates
    cy, cx = h // 2, w // 2

    # Create distance map from center
    y_coords, x_coords = np.ogrid[:h, :w]
    distance = np.sqrt((y_coords - cy) ** 2 + (x_coords - cx) ** 2)

    # High frequency threshold: 30% of max radius
    max_radius = np.sqrt(cy ** 2 + cx ** 2)
    hf_threshold = max_radius * 0.3

    # Energy calculations
    energy = magnitude ** 2
    total_energy = np.sum(energy)
    high_freq_mask = distance > hf_threshold
    high_freq_energy = np.sum(energy[high_freq_mask])

    # HFER: High Frequency Energy Ratio
    hfer = float(high_freq_energy / total_energy) if total_energy > 0 else 0.5

    # SVD: Spectral Variance Deviation
    variance = float(np.var(magnitude))
    baseline_variance = 3.2  # Empirical baseline for natural images
    svd = abs(variance - baseline_variance) / baseline_variance

    # ---- GAN Spectral Fingerprint (Improvement 4) ----
    # GANs (especially StyleGAN, ProGAN) produce periodic peaks in the FFT
    # We compute a radial profile and detect anomalous peaks

    # Compute radial average profile
    max_r = int(max_radius)
    radial_bins = min(max_r, 200)
    radial_profile = np.zeros(radial_bins)
    radial_counts = np.zeros(radial_bins)

    for iy in range(h):
        for ix in range(w):
            r = int(np.sqrt((iy - cy) ** 2 + (ix - cx) ** 2))
            if r < radial_bins:
                radial_profile[r] += magnitude[iy, ix]
                radial_counts[r] += 1

    # Avoid division by zero
    radial_counts[radial_counts == 0] = 1
    radial_profile = radial_profile / radial_counts

    # Detect peaks: compute residual from smoothed profile
    if len(radial_profile) > 10:
        # Simple smoothing (moving average, window=5)
        kernel_size = 5
        kernel = np.ones(kernel_size) / kernel_size
        smoothed = np.convolve(radial_profile, kernel, mode="same")

        # Residual: how much each radial bin deviates from smooth trend
        residual = np.abs(radial_profile - smoothed)
        residual_std = float(np.std(residual))
        residual_mean = float(np.mean(residual))

        # Count significant peaks (>2σ above mean residual)
        if residual_std > 1e-6:
            peak_threshold = residual_mean + 2.0 * residual_std
            peaks = residual > peak_threshold
            n_peaks = int(np.sum(peaks))

            # Peak energy ratio: energy in peaks vs total residual energy
            peak_energy = float(np.sum(residual[peaks])) if n_peaks > 0 else 0.0
            total_residual_energy = float(np.sum(residual))
            peak_ratio = peak_energy / max(total_residual_energy, 1e-10)

            # High number of periodic peaks with concentrated energy → GAN fingerprint
            spectral_peak_score = 0.0
            if n_peaks >= 5 and peak_ratio > 0.3:
                spectral_peak_score = min(1.0, peak_ratio * 1.2)
            elif n_peaks >= 3 and peak_ratio > 0.2:
                spectral_peak_score = min(0.7, peak_ratio * 0.8)
            elif n_peaks >= 2 and peak_ratio > 0.15:
                spectral_peak_score = min(0.4, peak_ratio * 0.5)
        else:
            spectral_peak_score = 0.0
            n_peaks = 0
            peak_ratio = 0.0
    else:
        spectral_peak_score = 0.0
        n_peaks = 0
        peak_ratio = 0.0

    # Generate signals
    signals = []

    if hfer < 0.15:
        signals.append({
            "id": "freq-hfer-low",
            "name": "Suppressed High-Frequency Energy",
            "category": "visual",
            "confidence": min(0.95, 0.6 + (0.15 - hfer) * 3),
            "description": (
                f"High-frequency energy ratio is {hfer * 100:.1f}%, well below natural baseline. "
                "GAN-generated images typically show suppressed high-frequency noise."
            ),
            "severity": "high_risk" if hfer < 0.08 else "harmful",
            "metric_value": hfer,
            "source": "heuristic",
        })

    if svd > 0.5:
        signals.append({
            "id": "freq-svd-high",
            "name": "Spectral Variance Anomaly",
            "category": "visual",
            "confidence": min(0.9, 0.5 + svd * 0.3),
            "description": (
                f"Spectral variance deviates {svd * 100:.0f}% from natural image baseline. "
                "Synthetic images show abnormal spectral distribution."
            ),
            "severity": "high_risk" if svd > 1.0 else "suspicious",
            "metric_value": svd,
            "source": "heuristic",
        })

    if spectral_peak_score > 0.2:
        signals.append({
            "id": "freq-gan-spectral-fingerprint",
            "name": "GAN Spectral Fingerprint",
            "category": "visual",
            "confidence": min(0.93, spectral_peak_score + 0.1),
            "description": (
                f"Detected {n_peaks} periodic peaks in FFT radial profile "
                f"(peak_ratio={peak_ratio:.3f}). "
                "GAN architectures leave characteristic periodic artifacts in the frequency domain."
            ),
            "severity": "high_risk" if spectral_peak_score > 0.6 else "harmful",
            "metric_value": spectral_peak_score,
            "source": "heuristic",
        })

    return {
        "hfer": hfer,
        "svd": svd,
        "spectral_peak_score": spectral_peak_score,
        "signals": signals,
    }
