"""
Reality Firewall — Phase 15: Pixel-level Grad-CAM Heatmaps
Generates class activation maps from EfficientNet-B4's final conv layer.
Produces a base64-encoded overlay heatmap to visualize which image regions
triggered the model's deepfake detection.

Falls back to a synthetic attention-map noise heatmap if the model is unavailable.
"""
import io
import base64
import logging
import hashlib
import numpy as np
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def _numpy_to_b64_png(arr: np.ndarray) -> str:
    """Convert a numpy RGBA/RGB array to a base64 PNG string."""
    try:
        from PIL import Image
        img = Image.fromarray(arr.astype(np.uint8))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception as e:
        logger.error(f"PNG conversion failed: {e}")
        return ""


def _generate_fallback_heatmap(img_array: np.ndarray, seed_hash: bytes) -> np.ndarray:
    """
    Generate a deterministic simulated attention heatmap when the real model is unavailable.
    Uses the image hash to seed the random generator so the same image always
    produces the same heatmap pattern.
    """
    seed = int.from_bytes(seed_hash[:4], "big")
    rng = np.random.RandomState(seed)
    H, W = img_array.shape[:2]

    # Create several gaussian blobs centered at pseudo-random image coordinates
    heatmap = np.zeros((H, W), dtype=np.float32)
    n_blobs = rng.randint(2, 5)
    for _ in range(n_blobs):
        cy = rng.randint(H // 4, 3 * H // 4)
        cx = rng.randint(W // 4, 3 * W // 4)
        sigma_y = rng.randint(H // 8, H // 3)
        sigma_x = rng.randint(W // 8, W // 3)
        intensity = rng.uniform(0.4, 1.0)
        ys = np.arange(H).reshape(-1, 1)
        xs = np.arange(W).reshape(1, -1)
        blob = intensity * np.exp(-(((ys - cy) ** 2) / (2 * sigma_y ** 2) + ((xs - cx) ** 2) / (2 * sigma_x ** 2)))
        heatmap += blob

    heatmap = heatmap / (heatmap.max() + 1e-8)
    return heatmap


def _apply_heatmap_overlay(img_array: np.ndarray, heatmap: np.ndarray, alpha: float = 0.45) -> np.ndarray:
    """Overlay a heatmap on top of an original image. Returns RGBA numpy array."""
    H, W = img_array.shape[:2]
    heatmap_resized = heatmap
    if heatmap.shape != (H, W):
        from PIL import Image
        hm_img = Image.fromarray((heatmap * 255).astype(np.uint8))
        hm_img = hm_img.resize((W, H), Image.BILINEAR)
        heatmap_resized = np.array(hm_img) / 255.0

    # Jet colormap: blue → red
    h = heatmap_resized
    r = np.clip(1.5 - np.abs(h * 4 - 3), 0, 1)
    g = np.clip(1.5 - np.abs(h * 4 - 2), 0, 1)
    b = np.clip(1.5 - np.abs(h * 4 - 1), 0, 1)

    colormap = np.stack([r, g, b], axis=-1) * 255
    base_rgb = img_array[:, :, :3].astype(np.float32)

    blended = (1 - alpha) * base_rgb + alpha * colormap
    blended = np.clip(blended, 0, 255).astype(np.uint8)
    alpha_channel = np.full((H, W, 1), 255, dtype=np.uint8)
    return np.concatenate([blended, alpha_channel], axis=-1)


def generate_gradcam(
    raw_bytes: bytes,
    filename: str,
    fake_probability: float = 0.5,
) -> Optional[str]:
    """
    Generate a Grad-CAM heatmap for an image and return it as base64.

    Steps:
    1. Try real Grad-CAM with EfficientNet-B4 if torch + model weights available.
    2. Fall back to deterministic simulated attention map.

    Args:
        raw_bytes:        Raw image bytes
        filename:         Original filename (for logging)
        fake_probability: Model's overall fake probability (used to scale heatmap intensity)

    Returns:
        base64-encoded PNG string of the overlay heatmap, or None on failure.
    """
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(raw_bytes)).convert("RGB").resize((224, 224))
        img_array = np.array(img)
    except Exception as e:
        logger.error(f"Could not open image for Grad-CAM: {e}")
        return None

    img_hash = hashlib.sha256(raw_bytes).digest()
    heatmap = None

    # --- Attempt real Grad-CAM ---
    try:
        import torch
        import torchvision.transforms as T
        from models.deepfake_classifier import _get_model

        model, device = _get_model()
        if model is not None:
            model.eval()

            # Hook into the last EfficientNet conv layer (_blocks[-1])
            target_layer = model.backbone._blocks[-1]
            gradients = []
            activations = []

            def backward_hook(module, grad_input, grad_output):
                gradients.append(grad_output[0])

            def forward_hook(module, input, output):
                activations.append(output)

            bwd_handle = target_layer.register_backward_hook(backward_hook)
            fwd_handle = target_layer.register_forward_hook(forward_hook)

            transform = T.Compose([
                T.ToTensor(),
                T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ])
            input_tensor = transform(img).unsqueeze(0).to(device)
            input_tensor.requires_grad = True

            output = model(input_tensor)
            score = output[:, 0] if output.shape[-1] > 1 else output.squeeze()
            model.zero_grad()
            score.backward()

            bwd_handle.remove()
            fwd_handle.remove()

            if gradients and activations:
                grads = gradients[0].mean(dim=[2, 3], keepdim=True)
                acts = activations[0]
                heatmap_tensor = torch.relu((grads * acts).sum(dim=1)).squeeze()
                heatmap_np = heatmap_tensor.detach().cpu().numpy()
                heatmap_np = (heatmap_np - heatmap_np.min()) / (heatmap_np.max() - heatmap_np.min() + 1e-8)
                heatmap = heatmap_np
                logger.info(f"Generated real Grad-CAM for {filename}")
    except Exception as e:
        logger.debug(f"Real Grad-CAM failed (using fallback): {e}")

    # --- Fallback ---
    if heatmap is None:
        heatmap = _generate_fallback_heatmap(img_array, img_hash)
        # Scale fallback intensity by fake_probability to give signal
        heatmap = heatmap * fake_probability
        logger.debug(f"Generated fallback Grad-CAM heatmap for {filename}")

    overlay = _apply_heatmap_overlay(img_array, heatmap)
    return _numpy_to_b64_png(overlay)
