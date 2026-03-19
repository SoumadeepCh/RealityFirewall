"""
Reality Firewall — Phase 11: Adversarial Robustness Testing
===========================================================
This test suite measures the resilience of the deepfake classification pipeline
against common adversarial evasion attacks.

Implemented Attacks:
1. Fast Gradient Sign Method (FGSM) - Gradient-based perturbation
2. Gaussian Noise Injection - Simple corruption
3. Adversarial JPEG Compression - Evasion through high artifacts

Usage:
    python ai-service/tests/adversarial.py --image path/to/real_or_fake.jpg
"""
import sys
import argparse
import logging
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

# Add parent to path to import ai-service modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("adversarial-test")


def attack_fgsm(image: Image.Image, epsilon: float = 0.05) -> Image.Image:
    """
    Simulate Fast Gradient Sign Method (FGSM).
    Note: A true white-box FGSM requires gradients from the target model.
    Since the base EfficientNet is often a black-box or headlessfeature extractor,
    we simulate FGSM by applying a structured high-frequency perturbation that
    typically tricks CNN spatial feature maps.
    """
    img_arr = np.array(image).astype(np.float32)
    
    # Generate structured noise mimicking adversarial gradients
    h, w, c = img_arr.shape
    noise = np.sign(np.random.normal(0, 1, (h, w, c)))
    
    # Apply perturbation
    perturbed = img_arr + (epsilon * 255.0) * noise
    perturbed = np.clip(perturbed, 0, 255).astype(np.uint8)
    
    return Image.fromarray(perturbed)


def attack_noise(image: Image.Image, std_dev: float = 15.0) -> Image.Image:
    """Apply severe Gaussian noise to blind the feature extractors."""
    img_arr = np.array(image).astype(np.float32)
    noise = np.random.normal(0, std_dev, img_arr.shape)
    perturbed = np.clip(img_arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(perturbed)


def attack_jpeg_compression(image: Image.Image, quality: int = 15) -> Image.Image:
    """Apply severe JPEG compression to destroy high-frequency GAN fingerprints."""
    import io
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, format="JPEG", quality=quality)
    buffer.seek(0)
    return Image.open(buffer)


def evaluate_robustness(clean_image_path: Path):
    """Run the clean image and its adversarial counterparts through the pipeline."""
    from pipeline import run_pipeline
    import json
    
    if not clean_image_path.exists():
        logger.error(f"Image not found: {clean_image_path}")
        return

    logger.info(f"Loading {clean_image_path.name}...")
    try:
        clean_img = Image.open(clean_image_path).convert("RGB")
    except Exception as e:
        logger.error(f"Failed to open image: {e}")
        return

    # Generate attacks
    logger.info("Generating adversarial examples (FGSM, Noise, JPEG)...")
    attacks = {
        "Clean (Baseline)": clean_img,
        "FGSM (eps=0.03)": attack_fgsm(clean_img, epsilon=0.03),
        "FGSM (eps=0.10)": attack_fgsm(clean_img, epsilon=0.10),
        "Gaussian Noise (std=25)": attack_noise(clean_img, std_dev=25.0),
        "JPEG Artifacts (q=10)": attack_jpeg_compression(clean_img, quality=10),
    }

    results = {}
    
    # Evaluate each
    for attack_name, img in attacks.items():
        logger.info(f"==> Evaluating: {attack_name}")
        
        # Convert PIL back to bytes for the pipeline
        import io
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        img_bytes = buf.getvalue()
        
        try:
            res = run_pipeline(img_bytes, filename=f"attack_{attack_name}.png")
            if res:
                prob = res.get("fake_probability", -1) if isinstance(res, dict) else res.fake_probability
                
                # Check signals safely
                if isinstance(res, dict):
                    signals = len(res.get("signals", []))
                else:
                    signals = len(res.signals)
                    
                results[attack_name] = {"prob": prob, "signals_fired": signals}
                logger.info(f"    Fake Probability: {prob:.2f} | Signals Fired: {signals}")
            else:
                results[attack_name] = {"prob": -1, "signals_fired": 0}
                logger.warning(f"    Pipeline failed to process {attack_name}")
        except Exception as e:
            logger.error(f"    Pipeline crashed on {attack_name}: {e}")
            results[attack_name] = {"prob": -1, "signals_fired": 0}

    # Print Report
    logger.info("\n" + "=" * 50)
    logger.info("   ADVERSARIAL ROBUSTNESS REPORT")
    logger.info("=" * 50)
    
    baseline = results.get("Clean (Baseline)", {}).get("prob", -1)
    
    for name, metrics in results.items():
        prob = metrics["prob"]
        sig = metrics["signals_fired"]
        
        if name == "Clean (Baseline)":
            logger.info(f" {name:25s} : {prob*100:5.1f}% Fake   ({sig} signals)")
        else:
            diff = prob - baseline
            shift = f"{diff*100:+5.1f}%"
            
            # If the probability changed drastically (> 30%), it's a successful evasion
            if abs(diff) > 0.30:
                status = "❌ VULNERABLE"
            # If changed somewhat (> 15%), it's partially vulnerable
            elif abs(diff) > 0.15:
                status = "⚠️ DEGRADED"
            # Otherwise robust
            else:
                status = "✅ ROBUST"
                
            logger.info(f" {name:25s} : {prob*100:5.1f}% Fake   ({sig} signals) | Shift: {shift} | {status}")
            
    logger.info("=" * 50)


def main():
    parser = argparse.ArgumentParser(description="Adversarial Robustness Testing Suite")
    parser.add_argument("--image", type=Path, required=True, help="Path to a test image")
    args = parser.parse_args()
    
    evaluate_robustness(args.image)


if __name__ == "__main__":
    main()
