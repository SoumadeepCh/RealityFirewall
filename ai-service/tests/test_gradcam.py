"""Quick test of the Grad-CAM heatmap generator."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from feature_extractors.gradcam import generate_gradcam

# Create a tiny 64x64 RGB PNG with random pixels using PIL
from PIL import Image, ImageDraw
import io

img = Image.new("RGB", (224, 224), color=(120, 80, 200))
draw = ImageDraw.Draw(img)
draw.ellipse([50, 50, 170, 170], fill=(250, 100, 50))
buf = io.BytesIO()
img.save(buf, format="PNG")
raw_bytes = buf.getvalue()

result = generate_gradcam(raw_bytes, "test.png", fake_probability=0.7)
if result:
    print(f"SUCCESS: Got Grad-CAM base64 PNG ({len(result)} chars)")
else:
    print("FAILED: generate_gradcam returned None")
