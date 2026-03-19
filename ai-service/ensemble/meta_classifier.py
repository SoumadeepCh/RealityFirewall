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


def generate_synthetic_dataset(n_samples: int = 5000, seed: int = 42) -> tuple:
    """
    Generate synthetic training data with realistic, overlapping distributions.

    Key fix vs. previous version:
    - Real and fake distributions OVERLAP significantly (both within 0-1 range)
    - Fake data is not trivially separable — model must learn feature COMBINATIONS
    - Added per-sample noise to avoid overfit
    - Bootstrap approach: replace with FaceForensics++/Celeb-DF data when available

    Returns:
        (X, y) where X is (n_samples, n_features) and y is (n_samples,) binary labels
    """
    rng = np.random.default_rng(seed)
    n_real = n_samples // 2
    n_fake = n_samples - n_real

    # ---- Real samples: naturally low forensic scores, some noise ----
    real = np.column_stack([
        rng.beta(2, 6, n_real),           # deepfake_prob: low (0.15-0.30 typical)
        rng.beta(2, 6, n_real),           # audio_spoof_prob: low
        rng.beta(1.5, 15, n_real),        # identity_drift: very low
        rng.beta(5, 3, n_real),           # hfer: higher (real preserves hi-freq)
        rng.beta(2, 6, n_real),           # svd: lower spectral variance
        rng.beta(1.5, 12, n_real),        # pdi: very low patch drift
        rng.beta(3, 5, n_real),           # etk: moderate energy transitions
        rng.beta(5, 3, n_real),           # pvss: higher pitch consistency (real voice)
        rng.beta(2, 7, n_real),           # frd: low spectral flatness deviation
        rng.beta(2, 8, n_real),           # metadata_score: mostly low
        rng.beta(2, 8, n_real),           # noise_score: low for real (consistent noise)
        rng.beta(1.5, 8, n_real),         # spectral_peak_score: low for real
        rng.beta(2, 8, n_real),           # fav: low optical flow variance for real
        rng.beta(1.5, 10, n_real),        # frame_consistency: low for real
    ])

    # ---- Fake samples: elevated forensic scores but overlapping with real ----
    fake = np.column_stack([
        rng.beta(5, 3, n_fake),           # deepfake_prob: higher (0.50-0.75)
        rng.beta(4, 4, n_fake),           # audio_spoof_prob: moderate-high
        rng.beta(4, 6, n_fake),           # identity_drift: elevated but overlaps
        rng.beta(2, 5, n_fake),           # hfer: lower (GAN suppresses hi-freq)
        rng.beta(5, 3, n_fake),           # svd: higher spectral variance
        rng.beta(4, 6, n_fake),           # pdi: elevated patch drift
        rng.beta(5, 3, n_fake),           # etk: higher energy transitions (artifacts)
        rng.beta(2, 5, n_fake),           # pvss: lower pitch consistency (TTS artifacts)
        rng.beta(5, 3, n_fake),           # frd: higher spectral flatness dev.
        rng.beta(4, 4, n_fake),           # metadata_score: elevated
        rng.beta(5, 3, n_fake),           # noise_score: elevated for GAN
        rng.beta(4, 4, n_fake),           # spectral_peak_score: moderate-high
        rng.beta(4, 4, n_fake),           # fav: elevated for deepfake video
        rng.beta(4, 4, n_fake),           # frame_consistency: elevated variation
    ])

    # Add realistic noise (±5%) to all samples to prevent overfit
    noise = rng.normal(0, 0.05, real.shape)
    real = np.clip(real + noise[:n_real], 0.0, 1.0)
    noise = rng.normal(0, 0.05, fake.shape)
    fake = np.clip(fake + noise[:n_fake], 0.0, 1.0)

    # Randomly set some values to -1 (missing) — 15% chance per feature
    for data in [real, fake]:
        mask = rng.random(data.shape) < 0.15
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

    # Train/val split — stratify ensures class ratio is preserved in both splits
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    logger.info(f"Training: {X_train.shape[0]} samples, Validation: {X_val.shape[0]} samples")
    logger.info(f"Features: {FEATURE_KEYS}")

    # Auto-compute scale_pos_weight to correct for any remaining class imbalance
    # (n_real / n_fake) — if perfectly balanced this equals 1.0
    n_real_train = int((y_train == 0).sum())
    n_fake_train = int((y_train == 1).sum())
    scale_pos_weight = n_real_train / max(n_fake_train, 1)
    logger.info(
        f"Class balance — real: {n_real_train}, fake: {n_fake_train}, "
        f"scale_pos_weight: {scale_pos_weight:.3f}"
    )

    # LightGBM parameters
    # - scale_pos_weight: corrects residual class imbalance automatically
    # - num_leaves=31: safe for real data (more complex patterns than synthetic)
    # - 200 rounds + early stopping: real data warrants more iterations
    params = {
        "objective": "binary",
        "metric": "binary_logloss",
        "boosting_type": "gbdt",
        "num_leaves": 31,
        "learning_rate": 0.05,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        "min_child_samples": 20,
        "lambda_l1": 0.1,
        "lambda_l2": 0.1,
        "scale_pos_weight": scale_pos_weight,
        "verbose": -1,
        "n_jobs": -1,
        "seed": 42,
    }

    train_data = lgb.Dataset(X_train, label=y_train, feature_name=FEATURE_KEYS)
    val_data = lgb.Dataset(X_val, label=y_val, reference=train_data, feature_name=FEATURE_KEYS)

    callbacks = [
        lgb.early_stopping(stopping_rounds=20, verbose=True),
        lgb.log_evaluation(period=20),
    ]

    # Up to 200 rounds for real data; early stopping kicks in to prevent overfit
    model = lgb.train(
        params,
        train_data,
        num_boost_round=200,
        valid_sets=[val_data],
        callbacks=callbacks,
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
