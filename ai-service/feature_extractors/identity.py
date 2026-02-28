"""
Reality Firewall — Identity Embedding Extractor (Phase 3)
Uses InceptionResnetV1-based face recognition for identity stability analysis.
Computes 512-dim embeddings and measures temporal identity drift (TIIS).
"""
import logging
from typing import Optional

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# Lazy-loaded model
_face_encoder = None
_face_transform = None
_device = None
_model_loaded_attempted = False


def _load_face_encoder():
    """Load face recognition model for identity embeddings."""
    global _face_encoder, _face_transform, _device, _model_loaded_attempted

    if _model_loaded_attempted:
        return _face_encoder is not None

    _model_loaded_attempted = True

    try:
        import torch
        from torchvision import transforms

        _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        # Use InceptionV3 as identity feature extractor (widely available via torchvision)
        # In production, this would be replaced with a proper ArcFace model
        # fine-tuned on VGGFace2/MS1MV2
        import torchvision.models as models
        model = models.inception_v3(weights="DEFAULT")
        # Remove classification head — use as feature extractor
        model.fc = torch.nn.Identity()
        model.aux_logits = False
        model = model.to(_device)
        model.eval()

        _face_encoder = model

        _face_transform = transforms.Compose([
            transforms.Resize((299, 299)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ])

        logger.info(f"Face recognition model loaded on {_device} (InceptionV3 2048-dim)")
        return True

    except Exception as e:
        logger.warning(f"Failed to load face encoder: {e}")
        return False


def extract_embedding(face_crop: Image.Image) -> Optional[np.ndarray]:
    """
    Extract identity embedding from a face crop.

    Args:
        face_crop: PIL Image of cropped face

    Returns:
        Embedding vector (2048-dim) or None
    """
    if not _load_face_encoder():
        return None

    try:
        import torch

        tensor = _face_transform(face_crop.convert("RGB"))
        batch = tensor.unsqueeze(0).to(_device)

        with torch.no_grad():
            embedding = _face_encoder(batch)

        # L2 normalize
        emb = embedding.cpu().numpy().flatten()
        norm = np.linalg.norm(emb)
        if norm > 0:
            emb = emb / norm

        return emb

    except Exception as e:
        logger.error(f"Embedding extraction failed: {e}")
        return None


def _histogram_embedding(face_crop: Image.Image) -> np.ndarray:
    """Fallback: lightweight 48-dim color histogram embedding."""
    arr = np.array(face_crop.resize((64, 64)).convert("RGB"), dtype=np.float64)
    hist = np.zeros(48)
    for ch in range(3):
        h, _ = np.histogram(arr[:, :, ch].ravel(), bins=16, range=(0, 256))
        hist[ch * 16 : (ch + 1) * 16] = h / (64 * 64)
    norm = np.linalg.norm(hist)
    return hist / norm if norm > 0 else hist


def compute_identity_drift(face_crops: list[Image.Image]) -> dict:
    """
    Compute identity embedding drift across face crops from video frames.

    Uses cosine distance between consecutive frame embeddings.
    Real video: low, stable drift.
    Deepfaked video: higher, erratic drift.

    Args:
        face_crops: List of face crop PIL Images (one per frame)

    Returns:
        dict with 'tiis', 'identity_drift', 'frame_drifts', 'embedding_dim', signals
    """
    if len(face_crops) < 2:
        return {
            "tiis": 0.0,
            "identity_drift": 0.0,
            "frame_drifts": [],
            "embedding_dim": 0,
            "model_used": "none",
            "signals": [],
        }

    # Try pretrained model first, fallback to histogram
    use_pretrained = _load_face_encoder()

    embeddings = []
    for fc in face_crops:
        if use_pretrained:
            emb = extract_embedding(fc)
            if emb is None:
                # Fallback for this frame
                emb = _histogram_embedding(fc)
        else:
            emb = _histogram_embedding(fc)
        embeddings.append(emb)

    embedding_dim = len(embeddings[0])
    model_used = "inception_v3_imagenet" if use_pretrained else "histogram_fallback"

    # Compute cosine distances between consecutive embeddings
    drifts = []
    for i in range(1, len(embeddings)):
        # Cosine distance = 1 - cosine_similarity
        cos_sim = float(np.dot(embeddings[i], embeddings[i - 1]))
        cos_distance = 1.0 - cos_sim
        drifts.append(max(0.0, cos_distance))

    if not drifts:
        return {
            "tiis": 0.0,
            "identity_drift": 0.0,
            "frame_drifts": [],
            "embedding_dim": embedding_dim,
            "model_used": model_used,
            "signals": [],
        }

    mean_drift = float(np.mean(drifts))
    std_drift = float(np.std(drifts))
    max_drift = float(np.max(drifts))

    # TIIS: weighted combination of mean drift and variance
    # Higher for deepfakes (erratic identity changes)
    tiis = mean_drift * 0.5 + std_drift * 0.3 + (max_drift - mean_drift) * 0.2

    signals = []

    # Threshold depends on embedding model
    threshold = 0.015 if use_pretrained else 0.05

    if tiis > threshold:
        confidence = min(0.95, 0.4 + tiis * (8 if use_pretrained else 5))
        signals.append({
            "id": "vid-tiis-high",
            "name": "Temporal Identity Instability",
            "category": "temporal",
            "confidence": confidence,
            "description": (
                f"Identity embedding drift of {tiis:.4f} ({embedding_dim}-dim {model_used}) "
                f"indicates frame-to-frame identity inconsistency (mean={mean_drift:.4f}, "
                f"std={std_drift:.4f}, max={max_drift:.4f}), characteristic of deepfaked faces."
            ),
            "severity": "high_risk" if tiis > threshold * 3 else "suspicious",
            "metric_value": tiis,
            "source": "pretrained" if use_pretrained else "heuristic",
        })

    # Spike detection: any single frame with very high drift
    drift_threshold = mean_drift + 3 * std_drift if std_drift > 0 else mean_drift * 2
    spike_frames = [i for i, d in enumerate(drifts) if d > drift_threshold and d > threshold]

    if spike_frames and len(spike_frames) <= len(drifts) * 0.3:
        signals.append({
            "id": "vid-identity-spike",
            "name": "Identity Embedding Spike",
            "category": "temporal",
            "confidence": min(0.85, 0.5 + len(spike_frames) * 0.1),
            "description": (
                f"Detected {len(spike_frames)} frame(s) with sudden identity embedding "
                f"jumps, suggesting face swap transition points."
            ),
            "severity": "harmful",
            "metric_value": max_drift,
            "source": "pretrained" if use_pretrained else "heuristic",
        })

    return {
        "tiis": tiis,
        "identity_drift": mean_drift,
        "frame_drifts": drifts,
        "embedding_dim": embedding_dim,
        "model_used": model_used,
        "signals": signals,
    }


def get_model_info() -> dict:
    """Return info about the loaded identity model."""
    loaded = _load_face_encoder()
    return {
        "name": "inception_v3_identity",
        "loaded": loaded,
        "device": str(_device) if _device else "none",
        "embedding_dim": 2048 if loaded else 48,
    }
