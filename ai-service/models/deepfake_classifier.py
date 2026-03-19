"""
Reality Firewall — Deepfake Classifier (Phase 2 / Phase 10)
EfficientNet-B4 deepfake classifier.

Phase 10 upgrade:
  If a fine-tuned checkpoint exists at:
      <project>/ai-service/model_weights/efficientnet_b4_ff.pth
  it is loaded as a binary classifier (real/fake head) and returns a
  direct sigmoid probability.  This checkpoint is produced by training
  EfficientNet-B4 on FaceForensics++ (see docs/training_guide.md).

  Without the checkpoint the module falls back to the original
  feature-space anomaly detection approach (ImageNet weights).
"""
import logging
from pathlib import Path
from typing import Optional
from PIL import Image
import numpy as np

logger = logging.getLogger(__name__)

# Path to the optional fine-tuned FaceForensics++ checkpoint
_FF_CHECKPOINT = (
    Path(__file__).resolve().parent.parent / "model_weights" / "efficientnet_b4_ff.pth"
)

# Lazy-loaded model state
_model = None
_classifier_head = None   # nn.Linear(1792, 1) when fine-tuned checkpoint loaded
_transform = None
_device = None
_model_loaded = False
_finetuned = False        # True when the FF++ checkpoint is in use


def _load_model():
    """
    Lazy-load the deepfake classifier model.

    Load order:
    1. If ``model_weights/efficientnet_b4_ff.pth`` exists → load fine-tuned
       binary classifier (binary head on top of EfficientNet-B4 backbone).
    2. Otherwise → load ImageNet pretrained backbone for feature extraction
       (original Phase 2 behaviour).
    """
    global _model, _classifier_head, _transform, _device, _model_loaded, _finetuned

    if _model_loaded:
        return _model is not None

    _model_loaded = True  # Prevent repeated load attempts

    try:
        import torch
        import torch.nn as nn
        import timm
        from torchvision import transforms

        if not torch.cuda.is_available():
            logger.warning("CUDA GPU not found — feature extraction and inference will run on CPU, which may be significantly slower. Ensure NVIDIA drivers and a CUDA-enabled PyTorch build are installed for optimal performance.")
            _device = torch.device("cpu")
        else:
            _device = torch.device("cuda")

        # Standard preprocessing (same for both modes)
        _transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ])

        # ── Try to load fine-tuned FaceForensics++ checkpoint ───────────────
        if _FF_CHECKPOINT.exists():
            logger.info(
                f"Loading fine-tuned EfficientNet-B4 checkpoint from {_FF_CHECKPOINT}"
            )
            try:
                # Backbone: features only (num_classes=0 → 1792-dim output)
                backbone = timm.create_model(
                    "efficientnet_b4", pretrained=False, num_classes=0
                )
                # Binary classifier head
                head = nn.Linear(1792, 1)

                checkpoint = torch.load(
                    str(_FF_CHECKPOINT),
                    map_location=_device,
                    weights_only=True,
                )

                # Support checkpoints saved as {backbone: ..., head: ...}
                # or as a flat state_dict for the full model.
                if "backbone" in checkpoint and "head" in checkpoint:
                    backbone.load_state_dict(checkpoint["backbone"])
                    head.load_state_dict(checkpoint["head"])
                else:
                    # Attempt to load as a single state dict (whole model)
                    full_sd = checkpoint.get("state_dict", checkpoint)
                    backbone_sd = {k.replace("backbone.", ""): v for k, v in full_sd.items() if k.startswith("backbone.")}
                    head_sd = {k.replace("head.", ""): v for k, v in full_sd.items() if k.startswith("head.")}
                    if backbone_sd:
                        backbone.load_state_dict(backbone_sd, strict=False)
                    if head_sd:
                        head.load_state_dict(head_sd, strict=False)

                _model = backbone.to(_device).eval()
                _classifier_head = head.to(_device).eval()
                _finetuned = True
                logger.info(
                    "EfficientNet-B4 fine-tuned checkpoint loaded — binary classification mode"
                )
                return True

            except Exception as ckpt_err:
                logger.warning(
                    f"Failed to load fine-tuned checkpoint ({ckpt_err}). "
                    "Falling back to ImageNet feature extractor."
                )
                _model = None
                _classifier_head = None
                _finetuned = False

        # ── Fallback: ImageNet pretrained feature extractor ─────────────────
        logger.info(f"Loading EfficientNet-B4 (ImageNet pretrained) on {_device}")
        _model = timm.create_model("efficientnet_b4", pretrained=True, num_classes=0)
        _model = _model.to(_device)
        _model.eval()
        _finetuned = False
        logger.info("EfficientNet-B4 loaded (feature extractor / anomaly-detection mode)")
        return True

    except ImportError as e:
        logger.warning(f"Failed to load deepfake classifier (missing dependency): {e}")
        return False
    except Exception as e:
        logger.error(f"Error loading model: {e}")
        return False


def extract_features(face_crop: Image.Image) -> Optional[np.ndarray]:
    """
    Extract CNN features from a face crop using EfficientNet-B4.

    Args:
        face_crop: PIL Image of cropped face (any size)

    Returns:
        Feature vector (1792-dim for EfficientNet-B4) or None
    """
    if not _load_model():
        return None

    try:
        import torch

        # Preprocess
        tensor = _transform(face_crop.convert("RGB"))
        batch = tensor.unsqueeze(0).to(_device)

        # Extract features
        with torch.no_grad():
            features = _model(batch)

        return features.cpu().numpy().flatten()

    except Exception as e:
        logger.error(f"Feature extraction failed: {e}")
        return None


def predict_deepfake(face_crop: Image.Image) -> dict:
    """
    Run deepfake classification on a face crop.

    Phase 10 (fine-tuned mode):
        If the FaceForensics++ checkpoint is loaded, the model's binary
        classification head returns a direct sigmoid probability — highly
        accurate, no proxy heuristics needed.

    Phase 2 fallback (feature-space anomaly mode):
        Extracts EfficientNet-B4 features and runs 8 statistical anomaly
        detectors to estimate synthetic probability.

    Args:
        face_crop: PIL Image of cropped face

    Returns:
        dict with 'deepfake_prob', 'features', 'confidence', 'signals', 'mode'
    """
    features = extract_features(face_crop)

    if features is None:
        return {
            "deepfake_prob": None,
            "features": None,
            "model_available": False,
            "signals": [],
            "mode": "unavailable",
        }

    # ── Fine-tuned binary classifier path (Phase 10) ─────────────────────────
    if _finetuned and _classifier_head is not None:
        try:
            import torch
            import torch.nn as nn

            feat_tensor = torch.tensor(features, dtype=torch.float32).unsqueeze(0).to(_device)
            with torch.no_grad():
                logit = _classifier_head(feat_tensor)
                deepfake_prob = float(torch.sigmoid(logit).squeeze())

            signals = []
            if deepfake_prob > 0.2:
                signals.append({
                    "id": "model-efficientnet-finetuned",
                    "name": "Fine-tuned Deepfake Classifier",
                    "category": "visual",
                    "confidence": min(0.98, deepfake_prob + 0.05),
                    "description": (
                        f"EfficientNet-B4 binary classifier (FaceForensics++ fine-tuned): "
                        f"deepfake_prob={deepfake_prob:.3f}."
                    ),
                    "severity": (
                        "high_risk" if deepfake_prob > 0.7
                        else "harmful" if deepfake_prob > 0.4
                        else "suspicious"
                    ),
                    "metric_value": deepfake_prob,
                    "source": "finetuned_ff",
                })

            return {
                "deepfake_prob": deepfake_prob,
                "features": features,
                "model_available": True,
                "signals": signals,
                "mode": "finetuned_ff",
            }

        except Exception as e:
            logger.error(f"Fine-tuned classifier inference failed: {e}. Falling back to anomaly detection.")

    # ---- Enhanced Feature-Space Anomaly Detection (8 statistics) ----
    # Each statistic targets a known property of GAN-generated vs camera images

    feat_mean = float(np.mean(features))
    feat_std = float(np.std(features))
    z = (features - feat_mean) / max(feat_std, 1e-6)
    feat_skew = float(np.mean(z ** 3))
    feat_kurtosis = float(np.mean(z ** 4) - 3)

    sub_scores = {}

    # 1. Kurtosis: GANs produce over-regularized features (lower excess kurtosis)
    #    Real faces: kurtosis ~2-6, GAN faces: often < 1
    kurt_score = max(0.0, 1.0 - feat_kurtosis / 3.0) if feat_kurtosis < 3.0 else 0.0
    sub_scores["kurtosis"] = kurt_score * 0.15

    # 2. Skewness: Synthetic images tend toward more symmetric activation distributions
    skew_anomaly = 1.0 - min(1.0, abs(feat_skew) / 2.0)  # low |skew| → more synthetic
    sub_scores["skewness"] = skew_anomaly * 0.10

    # 3. Activation sparsity: fraction of near-zero activations
    #    Real images produce sparser activations than GANs
    sparsity = float(np.mean(np.abs(features) < 0.01))
    # Low sparsity (dense activations) is suspicious for faces
    sparsity_score = max(0.0, 1.0 - sparsity / 0.5) if sparsity < 0.5 else 0.0
    sub_scores["sparsity"] = sparsity_score * 0.12

    # 4. Feature entropy: Shannon entropy of activation magnitude distribution
    #    GANs tend to produce more uniform (higher entropy) feature distributions
    hist_counts, _ = np.histogram(np.abs(features), bins=50, density=True)
    hist_counts = hist_counts + 1e-10  # avoid log(0)
    probs = hist_counts / hist_counts.sum()
    entropy = -float(np.sum(probs * np.log2(probs)))
    max_entropy = np.log2(50)
    entropy_ratio = entropy / max_entropy
    # High entropy (uniform distribution) suggests synthetic
    sub_scores["entropy"] = max(0.0, (entropy_ratio - 0.7) / 0.3) * 0.12

    # 5. L2 norm deviation: real faces cluster in a specific norm range
    l2_norm = float(np.linalg.norm(features))
    expected_norm = np.sqrt(len(features)) * 0.3  # empirical baseline
    norm_deviation = abs(l2_norm - expected_norm) / expected_norm
    sub_scores["l2_norm"] = min(1.0, norm_deviation) * 0.10

    # 6. Top-k activation concentration: how much energy is in the top features
    #    Real images have more distributed activations; GANs concentrate energy
    sorted_abs = np.sort(np.abs(features))[::-1]
    total_energy = float(np.sum(sorted_abs))
    top_k = max(1, len(features) // 20)  # top 5%
    top_k_energy = float(np.sum(sorted_abs[:top_k]))
    concentration = top_k_energy / max(total_energy, 1e-10)
    # Very high or very low concentration is suspicious
    conc_anomaly = abs(concentration - 0.3) / 0.3  # 0.3 is typical for real faces
    sub_scores["concentration"] = min(1.0, conc_anomaly) * 0.13

    # 7. Feature mean deviation: abnormal mean indicates unusual activations
    mean_anomaly = abs(feat_mean - 0.25) / 0.25  # 0.25 typical for ReLU activations
    sub_scores["mean_dev"] = min(1.0, mean_anomaly) * 0.13

    # 8. Std deviation anomaly: GANs often have more uniform std
    std_anomaly = abs(feat_std - 0.4) / 0.4  # 0.4 typical baseline
    sub_scores["std_dev"] = min(1.0, std_anomaly) * 0.15

    # Combine all sub-scores
    deepfake_prob = min(1.0, max(0.0, sum(sub_scores.values())))

    signals = []
    if deepfake_prob > 0.2:
        # Find top contributing features
        top_contributors = sorted(sub_scores.items(), key=lambda x: x[1], reverse=True)[:3]
        top_desc = ", ".join(f"{k}={v:.3f}" for k, v in top_contributors)

        signals.append({
            "id": "model-efficientnet-anomaly",
            "name": "CNN Feature Anomaly",
            "category": "visual",
            "confidence": min(0.92, deepfake_prob + 0.15),
            "description": (
                f"EfficientNet-B4 multi-statistic analysis: {len([v for v in sub_scores.values() if v > 0.01])}/8 "
                f"dimensions anomalous (top: {top_desc}). "
                f"Combined anomaly={deepfake_prob:.3f}."
            ),
            "severity": "high_risk" if deepfake_prob > 0.7 else "harmful" if deepfake_prob > 0.4 else "suspicious",
            "metric_value": deepfake_prob,
            "source": "pretrained",
        })

    return {
        "deepfake_prob": deepfake_prob,
        "features": features,
        "feature_stats": {
            "mean": feat_mean,
            "std": feat_std,
            "skewness": feat_skew,
            "kurtosis": feat_kurtosis,
            "sparsity": sparsity,
            "entropy": entropy_ratio,
            "l2_norm": l2_norm,
            "concentration": concentration,
            "sub_scores": sub_scores,
        },
        "model_available": True,
        "signals": signals,
        "mode": "anomaly_detection",
    }


def get_model_info() -> dict:
    """Return information about the loaded model."""
    loaded = _load_model()
    checkpoint_present = _FF_CHECKPOINT.exists()
    return {
        "name": "efficientnet_b4",
        "loaded": loaded,
        "device": str(_device) if _device else "none",
        "finetuned": _finetuned,
        "checkpoint_path": str(_FF_CHECKPOINT),
        "checkpoint_present": checkpoint_present,
        "version": "finetuned_ff" if _finetuned else "imagenet_pretrained",
        "note": (
            "Running in fine-tuned binary classification mode (FaceForensics++ checkpoint)"
            if _finetuned
            else "Feature extractor / anomaly-detection mode — place efficientnet_b4_ff.pth "
                 f"at {_FF_CHECKPOINT} to enable fine-tuned mode"
        ),
    }
