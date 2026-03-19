"""
Smoke tests for AMAF feature extractor fixes.
Run from ai-service directory with the venv active.
"""
import sys
import os
from pathlib import Path

# Ensure ai-service root is on the path so feature_extractors/models are importable
_ai_root = Path(__file__).resolve().parent.parent
if str(_ai_root) not in sys.path:
    sys.path.insert(0, str(_ai_root))

import numpy as np
from PIL import Image


PASS = "✅ PASS"
FAIL = "❌ FAIL"
results = []


def check(name, condition, detail=""):
    status = PASS if condition else FAIL
    results.append((name, condition, detail))
    print(f"  {status}  {name}" + (f"  [{detail}]" if detail else ""))


# ─── Test 1: PDI adaptive grid — small frame must not return early ────────────
print("\n[1] PDI adaptive grid size")
from feature_extractors.texture import compute_texture_metrics

img_tiny = Image.new("RGB", (32, 32), color=(128, 128, 128))
r = compute_texture_metrics(img_tiny)
check("tiny 32x32 frame — pdi not None", r["pdi"] is not None, f"pdi={r['pdi']}")

img_normal = Image.fromarray(np.random.randint(0, 255, (224, 224, 3), dtype="uint8"))
r2 = compute_texture_metrics(img_normal)
check("random 224x224 — pdi > 0", r2["pdi"] > 0, f"pdi={r2['pdi']:.6f}")


# ─── Test 2: noise_analysis video_mode relaxed thresholds ─────────────────────
print("\n[2] noise_analysis video_mode")
from feature_extractors.noise_analysis import analyze_noise

# Create an H.264-like compressed-looking frame (moderate spatial correlation)
arr = np.zeros((256, 256, 3), dtype="uint8")
for i in range(0, 256, 8):
    arr[i:i+8, :] = np.random.randint(80, 180, (8, 256, 3), dtype="uint8")

r_normal = analyze_noise(arr, video_mode=False)
r_video  = analyze_noise(arr, video_mode=True)
check("noise_score returned", r_normal["noise_score"] is not None,
      f"score={r_normal['noise_score']:.4f}")
check("video_mode accepted (no crash)", r_video["noise_score"] is not None,
      f"normal={r_normal['noise_score']:.3f} video={r_video['noise_score']:.3f}")
check("video_mode <= normal mode score (relaxed thresholds)",
      r_video["noise_score"] <= r_normal["noise_score"] + 0.01,  # +0.01 tolerance
      f"normal={r_normal['noise_score']:.3f} video={r_video['noise_score']:.3f}")


# ─── Test 3: deepfake_prob dynamic range ──────────────────────────────────────
print("\n[3] deepfake_prob dynamic range (anomaly-detection mode)")
try:
    from models.deepfake_classifier import predict_deepfake

    probs = []
    for seed in range(5):
        np.random.seed(seed * 42)
        arr_face = np.random.randint(50, 200, (224, 224, 3), dtype="uint8")
        img_face = Image.fromarray(arr_face)
        r_df = predict_deepfake(img_face)
        if r_df.get("deepfake_prob") is not None:
            probs.append(r_df["deepfake_prob"])

    if probs:
        std_prob = float(np.std(probs))
        check("deepfake_prob has non-trivial std across samples",
              std_prob > 0.001,
              f"std={std_prob:.5f} over {len(probs)} samples")
        check("deepfake_prob all in [0,1]",
              all(0 <= p <= 1 for p in probs),
              f"values={[round(p,3) for p in probs]}")
    else:
        check("deepfake_prob model available", False, "all returned None")
except Exception as e:
    check("deepfake_prob import", False, str(e))


# ─── Test 4: Diagnose script runs on existing CSV ─────────────────────────────
print("\n[4] diagnose_features.py on experiment CSV")
import subprocess, sys as _sys, os as _os
_scripts = _ai_root / "scripts" / "diagnose_features.py"
_csv = _ai_root / "experiments" / "results" / "experiment_features.csv"
_env = {**_os.environ, "PYTHONUTF8": "1"}
proc = subprocess.run(
    [_sys.executable, str(_scripts), str(_csv)],
    capture_output=True, text=True, cwd=str(_ai_root), env=_env, encoding="utf-8"
)
check("exit code 0", proc.returncode == 0, f"rc={proc.returncode}")
check("ALIVE in output", "ALIVE" in proc.stdout, proc.stdout[-300:] if proc.stdout else proc.stderr[-300:])




# ─── Summary ──────────────────────────────────────────────────────────────────
print("\n" + "=" * 50)
n_pass = sum(1 for _, ok, _ in results if ok)
n_total = len(results)
print(f"  Result: {n_pass}/{n_total} passed")
if n_pass < n_total:
    print("  FAILED:")
    for name, ok, detail in results:
        if not ok:
            print(f"    - {name}: {detail}")
print("=" * 50)
sys.exit(0 if n_pass == n_total else 1)
