"""
Reality Firewall — AI Service Configuration
"""
import os
from pathlib import Path

# ---- Paths ----
BASE_DIR = Path(__file__).parent
MODELS_DIR = BASE_DIR / "model_weights"
LOGS_DIR = BASE_DIR / "logs"

# Create directories
MODELS_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

# ---- Server ----
HOST = os.getenv("RF_HOST", "0.0.0.0")
PORT = int(os.getenv("RF_PORT", "8000"))
CORS_ORIGINS = os.getenv("RF_CORS_ORIGINS", "http://localhost:3000,http://localhost:3001").split(",")

# ---- Device ----
DEVICE = os.getenv("RF_DEVICE", "auto")  # "auto", "cpu", "cuda"

# ---- Analysis ----
# Frame sampling rate for video (frames per second)
VIDEO_FPS_SAMPLE = float(os.getenv("RF_VIDEO_FPS", "1.0"))
# Max frames to extract from a video
MAX_VIDEO_FRAMES = int(os.getenv("RF_MAX_FRAMES", "60"))
# Max image dimension (resize larger images)
MAX_IMAGE_DIM = int(os.getenv("RF_MAX_IMAGE_DIM", "1024"))
# Face detection confidence threshold
FACE_DETECTION_THRESHOLD = float(os.getenv("RF_FACE_THRESHOLD", "0.9"))

# ---- Scoring Thresholds ----
# False positive governance: wider inconclusive zone for forensic safety
INCONCLUSIVE_LOW = 0.35
INCONCLUSIVE_HIGH = 0.65

# Risk level thresholds
RISK_HIGH_THRESHOLD = 0.78
RISK_HARMFUL_THRESHOLD = 0.52
RISK_SUSPICIOUS_THRESHOLD = 0.28

# ---- Feature Baselines (for z-score normalization) ----
FEATURE_BASELINES = {
    "hfer": {"mean": 0.25, "std": 0.08, "weight": 0.10, "higher_suspicious": False},
    "svd": {"mean": 0.15, "std": 0.12, "weight": 0.08, "higher_suspicious": True},
    "pdi": {"mean": 0.008, "std": 0.005, "weight": 0.08, "higher_suspicious": True},
    "etk": {"mean": 3.0, "std": 2.0, "weight": 0.06, "higher_suspicious": True},
    "pvss": {"mean": 50.0, "std": 30.0, "weight": 0.06, "higher_suspicious": False},
    "frd": {"mean": 0.15, "std": 0.1, "weight": 0.06, "higher_suspicious": True},
    # Phase 2: pretrained model outputs weighted much higher
    "deepfake_prob": {"mean": 0.5, "std": 0.25, "weight": 0.25, "higher_suspicious": True},
    "identity_drift": {"mean": 0.02, "std": 0.015, "weight": 0.10, "higher_suspicious": True},
    "metadata_score": {"mean": 0.0, "std": 0.3, "weight": 0.07, "higher_suspicious": True},
    # Phase 4: pretrained audio model
    "audio_spoof_prob": {"mean": 0.5, "std": 0.25, "weight": 0.20, "higher_suspicious": True},
    # Prediction improvements: new forensic features
    "noise_score": {"mean": 0.1, "std": 0.15, "weight": 0.10, "higher_suspicious": True},
    "spectral_peak_score": {"mean": 0.05, "std": 0.10, "weight": 0.08, "higher_suspicious": True},
    "fav": {"mean": 0.1, "std": 0.15, "weight": 0.08, "higher_suspicious": True},
    "frame_consistency": {"mean": 0.05, "std": 0.10, "weight": 0.06, "higher_suspicious": True},
}

# ---- Platt Scaling Calibration Parameters ----
# B=0.0 removes the previously-biasing negative offset that pushed scores low
PLATT_A = 2.5
PLATT_B = 0.0

# ---- Signal confidence boost ----
# When forensic signals fire above this threshold, blend into final probability
SIGNAL_BOOST_WEIGHT = 0.35   # fraction of final score from signal confidence
SIGNAL_BOOST_THRESHOLD = 0.4  # minimum signal confidence to trigger boost

# ---- Logging ----
LOG_ANALYSIS = True
LOG_FILE = LOGS_DIR / "analysis_log.jsonl"

