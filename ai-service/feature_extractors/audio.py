"""
Reality Firewall — Audio Feature Extractor
Implements ETK, PVSS, FRD using librosa for production-grade spectral analysis.
"""
import numpy as np
from typing import Optional


def _safe_import_librosa():
    """Lazy import librosa — it's heavy and only needed for audio."""
    try:
        import librosa
        return librosa
    except ImportError:
        return None


def compute_energy_transition(samples: np.ndarray, sr: int = 22050, frame_length: int = 1024) -> dict:
    """
    Energy Transition Kurtosis (ETK).
    Sharp artificial energy transitions in TTS → high kurtosis.

    Args:
        samples: Audio waveform (1D numpy array)
        sr: Sample rate
        frame_length: STFT frame length

    Returns:
        dict with 'etk', 'energy_deltas', and signals
    """
    librosa = _safe_import_librosa()
    if librosa is None:
        return {"etk": 0.0, "energy_deltas": [], "signals": []}

    hop_length = frame_length // 2

    # Compute STFT
    stft = librosa.stft(samples, n_fft=frame_length, hop_length=hop_length)
    magnitudes = np.abs(stft)

    # Per-frame energy
    energies = np.sum(magnitudes ** 2, axis=0)

    # Energy deltas
    if len(energies) < 3:
        return {"etk": 0.0, "energy_deltas": [], "signals": []}

    deltas = np.diff(energies)

    # Kurtosis of energy deltas (excess kurtosis)
    mean_d = np.mean(deltas)
    var_d = np.var(deltas)
    if var_d < 1e-10:
        etk = 0.0
    else:
        m4 = np.mean((deltas - mean_d) ** 4)
        etk = float(m4 / (var_d ** 2) - 3)

    etk = abs(etk)

    signals = []
    if etk > 5:
        signals.append({
            "id": "audio-etk-high",
            "name": "Sharp Energy Transitions",
            "category": "spectral",
            "confidence": min(0.85, 0.4 + etk * 0.05),
            "description": (
                f"Energy Transition Kurtosis of {etk:.2f} indicates sharp, artificial "
                "energy transitions typical of synthesized audio."
            ),
            "severity": "high_risk" if etk > 15 else "suspicious",
            "metric_value": etk,
            "source": "heuristic",
        })

    return {
        "etk": etk,
        "energy_deltas": deltas.tolist()[:100],  # Cap for response size
        "signals": signals,
    }


def compute_pitch_metrics(samples: np.ndarray, sr: int = 22050) -> dict:
    """
    Pitch Variance Smoothness Score (PVSS).
    Over-smooth pitch contour = suspicious TTS.

    Args:
        samples: Audio waveform
        sr: Sample rate

    Returns:
        dict with 'pvss', 'pitch_contour', and signals
    """
    librosa = _safe_import_librosa()
    if librosa is None:
        return {"pvss": 0.0, "pitch_contour": [], "signals": []}

    # Extract pitch using pyin (probabilistic YIN)
    try:
        f0, voiced_flag, _ = librosa.pyin(
            samples,
            fmin=60,
            fmax=500,
            sr=sr,
            frame_length=2048,
        )
    except Exception:
        return {"pvss": 0.0, "pitch_contour": [], "signals": []}

    # Filter to voiced frames only
    valid_pitch = f0[voiced_flag & ~np.isnan(f0)]

    if len(valid_pitch) < 6:
        return {"pvss": 0.0, "pitch_contour": f0.tolist() if f0 is not None else [], "signals": []}

    # Second derivative of pitch contour
    d2 = np.diff(valid_pitch, n=2)
    pvss = float(np.var(d2))

    signals = []
    voiced_ratio = np.sum(voiced_flag) / len(voiced_flag) if len(voiced_flag) > 0 else 0

    if pvss < 5 and len(valid_pitch) > 10 and voiced_ratio > 0.3:
        signals.append({
            "id": "audio-pvss-smooth",
            "name": "Over-Smooth Pitch Contour",
            "category": "spectral",
            "confidence": min(0.8, 0.5 + (5 - pvss) * 0.05),
            "description": (
                f"Pitch variance smoothness of {pvss:.2f} is unusually low, suggesting "
                "text-to-speech synthesis with over-regularized prosody."
            ),
            "severity": "harmful" if pvss < 1 else "suspicious",
            "metric_value": pvss,
            "source": "heuristic",
        })

    pitch_contour = []
    if f0 is not None:
        pitch_contour = [float(x) if not np.isnan(x) else 0.0 for x in f0[:200]]

    return {
        "pvss": pvss,
        "pitch_contour": pitch_contour,
        "signals": signals,
    }


def compute_spectral_flatness(samples: np.ndarray, sr: int = 22050, frame_length: int = 1024) -> dict:
    """
    Spectral Flatness Deviation (FRD).
    TTS over-regularizes spectrum → abnormal flatness.

    Args:
        samples: Audio waveform
        sr: Sample rate
        frame_length: Analysis frame length

    Returns:
        dict with 'frd', 'flatness_values', and signals
    """
    librosa = _safe_import_librosa()
    if librosa is None:
        return {"frd": 0.0, "flatness_values": [], "signals": []}

    # Compute spectral flatness per frame
    flatness = librosa.feature.spectral_flatness(
        y=samples, n_fft=frame_length, hop_length=frame_length // 2
    )
    flatness_values = flatness.flatten()

    if len(flatness_values) == 0:
        return {"frd": 0.0, "flatness_values": [], "signals": []}

    mean_flatness = float(np.mean(flatness_values))
    natural_baseline = 0.1
    frd = abs(mean_flatness - natural_baseline) / natural_baseline

    signals = []
    if frd > 0.5:
        signals.append({
            "id": "audio-frd-anomaly",
            "name": "Spectral Flatness Anomaly",
            "category": "spectral",
            "confidence": min(0.75, 0.3 + frd * 0.3),
            "description": (
                f"Spectral Flatness Deviation of {frd:.3f} deviates significantly "
                "from natural speech patterns."
            ),
            "severity": "harmful" if frd > 1.0 else "suspicious",
            "metric_value": frd,
            "source": "heuristic",
        })

    return {
        "frd": frd,
        "flatness_values": flatness_values.tolist()[:200],
        "signals": signals,
    }


def analyze_audio(samples: np.ndarray, sr: int = 22050) -> dict:
    """
    Run the full audio analysis suite.

    Args:
        samples: Audio waveform (mono, float32)
        sr: Sample rate

    Returns:
        Combined results dict
    """
    etk_result = compute_energy_transition(samples, sr)
    pitch_result = compute_pitch_metrics(samples, sr)
    flatness_result = compute_spectral_flatness(samples, sr)

    signals = etk_result["signals"] + pitch_result["signals"] + flatness_result["signals"]

    return {
        "etk": etk_result["etk"],
        "pvss": pitch_result["pvss"],
        "frd": flatness_result["frd"],
        "signals": signals,
        "details": {
            "energy_transition": etk_result,
            "pitch": pitch_result,
            "spectral_flatness": flatness_result,
        },
    }
