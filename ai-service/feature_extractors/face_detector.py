"""
Reality Firewall — Face Detection Module
Uses MTCNN (facenet-pytorch) for face detection and cropping.
Falls back to OpenCV Haar Cascade if MTCNN unavailable.
"""
import numpy as np
from PIL import Image
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Lazy-loaded detector
_mtcnn = None
_haar_cascade = None


def _get_mtcnn():
    """Lazy-load MTCNN detector."""
    global _mtcnn
    if _mtcnn is not None:
        return _mtcnn

    try:
        from facenet_pytorch import MTCNN
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        _mtcnn = MTCNN(
            keep_all=True,
            device=device,
            min_face_size=40,
            thresholds=[0.6, 0.7, 0.7],
            post_process=False,
        )
        logger.info(f"MTCNN face detector loaded on {device}")
        return _mtcnn
    except ImportError:
        logger.warning("facenet-pytorch not installed, falling back to OpenCV Haar Cascade")
        return None


def _get_haar_cascade():
    """Fallback: OpenCV Haar Cascade face detector."""
    global _haar_cascade
    if _haar_cascade is not None:
        return _haar_cascade

    try:
        import cv2
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        _haar_cascade = cv2.CascadeClassifier(cascade_path)
        logger.info("OpenCV Haar Cascade face detector loaded")
        return _haar_cascade
    except Exception as e:
        logger.error(f"Failed to load Haar Cascade: {e}")
        return None


def detect_faces(image: Image.Image, threshold: float = 0.9) -> list[dict]:
    """
    Detect faces in an image.

    Args:
        image: PIL Image (RGB)
        threshold: Confidence threshold for face detection

    Returns:
        List of dicts with 'box' (x1,y1,x2,y2), 'confidence', 'face_crop' (PIL Image)
    """
    rgb_image = image.convert("RGB")
    results = []

    # Try MTCNN first
    mtcnn = _get_mtcnn()
    if mtcnn is not None:
        try:
            boxes, probs = mtcnn.detect(rgb_image)

            if boxes is not None and probs is not None:
                for box, prob in zip(boxes, probs):
                    if prob is not None and prob >= threshold:
                        x1, y1, x2, y2 = [int(coord) for coord in box]

                        # Clamp to image bounds
                        w, h = rgb_image.size
                        x1 = max(0, x1)
                        y1 = max(0, y1)
                        x2 = min(w, x2)
                        y2 = min(h, y2)

                        # Add margin (10%)
                        margin_x = int((x2 - x1) * 0.1)
                        margin_y = int((y2 - y1) * 0.1)
                        x1 = max(0, x1 - margin_x)
                        y1 = max(0, y1 - margin_y)
                        x2 = min(w, x2 + margin_x)
                        y2 = min(h, y2 + margin_y)

                        face_crop = rgb_image.crop((x1, y1, x2, y2))
                        results.append({
                            "box": [x1, y1, x2, y2],
                            "confidence": float(prob),
                            "face_crop": face_crop,
                        })

            return results
        except Exception as e:
            logger.warning(f"MTCNN detection failed: {e}, falling back to Haar")

    # Fallback: Haar Cascade
    cascade = _get_haar_cascade()
    if cascade is not None:
        try:
            import cv2
            gray = cv2.cvtColor(np.array(rgb_image), cv2.COLOR_RGB2GRAY)
            faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))

            for (x, y, fw, fh) in faces:
                # Add margin
                margin_x = int(fw * 0.1)
                margin_y = int(fh * 0.1)
                x1 = max(0, x - margin_x)
                y1 = max(0, y - margin_y)
                x2 = min(rgb_image.size[0], x + fw + margin_x)
                y2 = min(rgb_image.size[1], y + fh + margin_y)

                face_crop = rgb_image.crop((x1, y1, x2, y2))
                results.append({
                    "box": [x1, y1, x2, y2],
                    "confidence": 0.8,  # Haar doesn't provide confidence
                    "face_crop": face_crop,
                })
        except Exception as e:
            logger.error(f"Haar Cascade detection failed: {e}")

    return results


def crop_faces_for_classification(
    image: Image.Image,
    target_size: tuple[int, int] = (224, 224),
    threshold: float = 0.9,
) -> list[dict]:
    """
    Detect faces and prepare cropped, resized face images for the deepfake classifier.

    Args:
        image: PIL Image
        target_size: Output size for face crops
        threshold: Detection confidence threshold

    Returns:
        List of dicts with 'face_tensor_ready' (PIL Image resized), 'box', 'confidence'
    """
    faces = detect_faces(image, threshold)

    for face in faces:
        face["face_tensor_ready"] = face["face_crop"].resize(target_size, Image.LANCZOS)

    return faces
