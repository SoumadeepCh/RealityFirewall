"""
Reality Firewall — Meta-Classifier (Phase 5)
LightGBM gradient-boosted meta-classifier operating on the full feature vector.

This is the forensic engine core: combines all pretrained model outputs
and heuristic features into a single calibrated decision.
"""
import json
import logging
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Feature vector keys in canonical order (must match training)
FEATURE_KEYS = [
    "deepfake_prob",
    "audio_spoof_prob",
    "identity_drift",
    "hfer",
    "svd",
    "pdi",
    "etk",
    "pvss",
    "frd",
    "metadata_score",
    "noise_score",
    "spectral_peak_score",
    "fav",
    "frame_consistency",
]

# Default model path
MODEL_PATH = Path(__file__).parent.parent / "model_weights" / "meta_classifier.lgb"
METADATA_PATH = Path(__file__).parent.parent / "model_weights" / "meta_classifier_meta.json"

# Lazy-loaded model
_model = None
_model_loaded_attempted = False


def _feature_vector_to_array(feature_dict: dict) -> np.ndarray:
    """
    Convert feature dict to numpy array in canonical order.
    Missing values are replaced with -1 (LightGBM handles missing natively).
    """
    values = []
    for key in FEATURE_KEYS:
        val = feature_dict.get(key)
        if val is None:
            values.append(-1.0)  # Sentinel for missing
        else:
            values.append(float(val))
    return np.array(values, dtype=np.float64)


def _load_model():
    """Load trained meta-classifier from disk."""
    global _model, _model_loaded_attempted

    if _model_loaded_attempted:
        return _model is not None

    _model_loaded_attempted = True

    if not MODEL_PATH.exists():
        logger.info("No trained meta-classifier found — using weighted ensemble fallback")
        return False

    try:
        import lightgbm as lgb
        _model = lgb.Booster(model_file=str(MODEL_PATH))
        logger.info(f"Meta-classifier loaded from {MODEL_PATH}")

        # Load metadata if available
        if METADATA_PATH.exists():
            with open(METADATA_PATH, "r") as f:
                meta = json.load(f)
            logger.info(f"Meta-classifier metadata: {meta}")

        return True

    except Exception as e:
        logger.error(f"Failed to load meta-classifier: {e}")
        return False


def predict(feature_dict: dict) -> Optional[float]:
    """
    Predict fake probability using the trained meta-classifier.

    Args:
        feature_dict: Feature vector dict with keys matching FEATURE_KEYS

    Returns:
        Calibrated fake probability (0-1), or None if model unavailable
    """
    if not _load_model():
        return None

    try:
        X = _feature_vector_to_array(feature_dict).reshape(1, -1)
        prob = _model.predict(X)[0]
        return float(np.clip(prob, 0.0, 1.0))

    except Exception as e:
        logger.error(f"Meta-classifier prediction failed: {e}")
        return None


def generate_synthetic_dataset(n_samples: int = 2000, seed: int = 42) -> tuple:
    """
    Generate synthetic training data using known feature distributions.

    Real samples: drawn from "natural" distributions.
    Fake samples: drawn from "manipulated" distributions.

    This is a bootstrap approach — should be replaced with real labeled data
    from FaceForensics++, Celeb-DF, ASVspoof when available.

    Returns:
        (X, y) where X is (n_samples, n_features) and y is (n_samples,) binary labels
    """
    rng = np.random.default_rng(seed)
    n_real = n_samples // 2
    n_fake = n_samples - n_real

    # ---- Real samples distribution ----
    real = np.column_stack([
        rng.beta(2, 5, n_real),           # deepfake_prob: low (mostly real)
        rng.beta(2, 5, n_real),           # audio_spoof_prob: low
        rng.exponential(0.005, n_real),   # identity_drift: very low
        rng.normal(0.25, 0.05, n_real),   # hfer: around 0.25 (natural)
        rng.normal(0.15, 0.08, n_real),   # svd: around 0.15 (natural)
        rng.exponential(0.005, n_real),   # pdi: very low
        rng.normal(3.0, 1.5, n_real),     # etk: around 3.0
        rng.normal(50.0, 20.0, n_real),   # pvss: around 50 (natural variation)
        rng.normal(0.1, 0.05, n_real),    # frd: around 0.1
        rng.beta(2, 8, n_real),           # metadata_score: mostly low
        rng.beta(2, 8, n_real),           # noise_score: low for real
        rng.beta(1.5, 10, n_real),        # spectral_peak_score: very low for real
        rng.beta(2, 8, n_real),           # fav: low for real video
        rng.beta(1.5, 10, n_real),        # frame_consistency: very low for real
    ])

    # ---- Fake samples distribution ----
    fake = np.column_stack([
        rng.beta(5, 2, n_fake),           # deepfake_prob: high (mostly fake)
        rng.beta(4, 3, n_fake),           # audio_spoof_prob: elevated
        rng.exponential(0.03, n_fake),    # identity_drift: higher
        rng.normal(0.12, 0.06, n_fake),   # hfer: lower (GAN suppression)
        rng.normal(0.35, 0.15, n_fake),   # svd: higher variance
        rng.exponential(0.02, n_fake),    # pdi: higher
        rng.normal(8.0, 4.0, n_fake),     # etk: higher (sharp transitions)
        rng.normal(10.0, 8.0, n_fake),    # pvss: lower (over-smooth)
        rng.normal(0.35, 0.15, n_fake),   # frd: higher
        rng.beta(5, 3, n_fake),           # metadata_score: elevated
        rng.beta(5, 3, n_fake),           # noise_score: elevated for fake
        rng.beta(4, 4, n_fake),           # spectral_peak_score: moderate-high
        rng.beta(4, 3, n_fake),           # fav: elevated for deepfake video
        rng.beta(3, 3, n_fake),           # frame_consistency: moderate (varies per frame)
    ])

    # Clip to valid ranges
    real = np.clip(real, 0, None)
    fake = np.clip(fake, 0, None)

    # Randomly set some values to -1 (missing) — 10% chance per feature
    for data in [real, fake]:
        mask = rng.random(data.shape) < 0.10
        data[mask] = -1.0

    X = np.vstack([real, fake])
    y = np.concatenate([np.zeros(n_real), np.ones(n_fake)])

    # Shuffle
    perm = rng.permutation(len(y))
    X = X[perm]
    y = y[perm]

    return X, y


def train_model(
    X: Optional[np.ndarray] = None,
    y: Optional[np.ndarray] = None,
    n_synthetic: int = 5000,
    save_path: Optional[Path] = None,
) -> dict:
    """
    Train the LightGBM meta-classifier.

    Args:
        X: Feature matrix (n_samples, n_features). If None, uses synthetic data.
        y: Labels (0=real, 1=fake). If None, uses synthetic data.
        n_synthetic: Number of synthetic samples if generating data.
        save_path: Where to save the trained model. Defaults to MODEL_PATH.

    Returns:
        dict with training metrics
    """
    import lightgbm as lgb
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import roc_auc_score, accuracy_score

    if save_path is None:
        save_path = MODEL_PATH

    # Generate synthetic data if not provided
    synthetic = False
    if X is None or y is None:
        logger.info(f"Generating synthetic training data ({n_synthetic} samples)...")
        X, y = generate_synthetic_dataset(n_synthetic)
        synthetic = True

    # Train/val split
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    logger.info(f"Training: {X_train.shape[0]} samples, Validation: {X_val.shape[0]} samples")
    logger.info(f"Features: {FEATURE_KEYS}")

    # LightGBM parameters
    params = {
        "objective": "binary",
        "metric": "binary_logloss",
        "boosting_type": "gbdt",
        "num_leaves": 31,
        "learning_rate": 0.05,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        "verbose": -1,
        "n_jobs": -1,
        "seed": 42,
    }

    train_data = lgb.Dataset(X_train, label=y_train, feature_name=FEATURE_KEYS)
    val_data = lgb.Dataset(X_val, label=y_val, reference=train_data, feature_name=FEATURE_KEYS)

    # Train
    model = lgb.train(
        params,
        train_data,
        num_boost_round=300,
        valid_sets=[val_data],
    )

    # Evaluate
    y_pred = model.predict(X_val)
    auc = roc_auc_score(y_val, y_pred)
    accuracy = accuracy_score(y_val, (y_pred > 0.5).astype(int))

    # FPR at threshold 0.5
    fp = np.sum((y_pred > 0.5) & (y_val == 0))
    tn = np.sum((y_pred <= 0.5) & (y_val == 0))
    fpr = fp / max(fp + tn, 1)

    # Feature importance
    importance = dict(zip(FEATURE_KEYS, model.feature_importance().tolist()))

    metrics = {
        "auc": round(auc, 4),
        "accuracy": round(accuracy, 4),
        "fpr_at_0.5": round(fpr, 4),
        "n_train": X_train.shape[0],
        "n_val": X_val.shape[0],
        "n_features": len(FEATURE_KEYS),
        "synthetic_data": synthetic,
        "feature_importance": importance,
    }

    # Save model
    save_path.parent.mkdir(parents=True, exist_ok=True)
    model.save_model(str(save_path))
    logger.info(f"Model saved to {save_path}")

    # Save metadata
    meta_path = save_path.with_suffix(".lgb").with_name(save_path.stem + "_meta.json")
    with open(meta_path, "w") as f:
        json.dump({
            "feature_keys": FEATURE_KEYS,
            "metrics": metrics,
            "model_path": str(save_path),
        }, f, indent=2)

    logger.info(f"Training complete: AUC={auc:.4f}, Accuracy={accuracy:.4f}, FPR={fpr:.4f}")

    # Reset model cache so it reloads
    global _model, _model_loaded_attempted
    _model = None
    _model_loaded_attempted = False

    return metrics


def is_available() -> bool:
    """Check if a trained meta-classifier is available."""
    return MODEL_PATH.exists()


def get_model_info() -> dict:
    """Return info about the meta-classifier."""
    available = is_available()
    loaded = _load_model() if available else False

    info = {
        "name": "lightgbm_meta_classifier",
        "available": available,
        "loaded": loaded,
        "model_path": str(MODEL_PATH),
        "feature_keys": FEATURE_KEYS,
    }

    if METADATA_PATH.exists():
        try:
            with open(METADATA_PATH, "r") as f:
                info["metadata"] = json.load(f)
        except Exception:
            pass

    return info
