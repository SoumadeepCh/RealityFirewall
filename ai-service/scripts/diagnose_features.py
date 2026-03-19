"""
Reality Firewall — Feature Health Diagnostic
=============================================
Reads a features CSV (output of extract_dataset_features.py or run_experiment.py)
and prints a per-feature health table.

Flags:
  ALIVE    — std > 0.01, missing < 95 %
  LOW STD  — std <= 0.01 (likely constant / broken extractor)
  MISSING  — > 95 % of rows are the -1 sentinel (absent for this dataset)
  DEAD     — both low std AND all-missing

Usage
-----
    python scripts/diagnose_features.py experiments/results/experiment_features.csv
    python scripts/diagnose_features.py D:\\RFW_Data\\features\\ff_features.csv
"""
import sys
import csv
import argparse
from pathlib import Path

# Ensure stdout handles Unicode on Windows (cp1252 terminals crash on emoji)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Try to import numpy for richer stats; fall back to stdlib if not available
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False


# Features that the pipeline expects (must match FEATURE_KEYS in meta_classifier.py)
FEATURE_KEYS = [
    "hfer", "svd", "pdi", "fav", "tiis",
    "etk", "pvss", "frd",
    "deepfake_prob", "identity_drift",
    "metadata_score", "audio_spoof_prob",
    "noise_score", "spectral_peak_score", "frame_consistency",
]


def load_csv(path: Path) -> tuple[list[str], list[dict]]:
    """Return (fieldnames, rows) from CSV."""
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    return reader.fieldnames or [], rows


def feature_stats(rows: list[dict], key: str) -> dict:
    """Compute summary stats for one feature column."""
    raw = []
    for r in rows:
        v = r.get(key, "")
        try:
            raw.append(float(v))
        except (ValueError, TypeError):
            raw.append(None)

    total = len(raw)
    valid = [v for v in raw if v is not None]
    missing_sentinel = [v for v in valid if v == -1.0]   # -1 = sentinel
    real_values = [v for v in valid if v != -1.0]

    missing_pct = len(missing_sentinel) / max(total, 1) * 100

    if real_values:
        if HAS_NUMPY:
            arr = np.array(real_values)
            mean = float(np.mean(arr))
            std = float(np.std(arr))
            mn = float(np.min(arr))
            mx = float(np.max(arr))
        else:
            mean = sum(real_values) / len(real_values)
            variance = sum((x - mean) ** 2 for x in real_values) / len(real_values)
            std = variance ** 0.5
            mn = min(real_values)
            mx = max(real_values)
    else:
        mean = std = mn = mx = float("nan")

    return {
        "total": total,
        "n_valid": len(valid),
        "n_real": len(real_values),
        "missing_pct": missing_pct,
        "mean": mean,
        "std": std,
        "min": mn,
        "max": mx,
    }


def classify(stats: dict) -> str:
    low_std = stats["std"] < 0.01 or (stats["std"] != stats["std"])  # NaN check
    all_missing = stats["missing_pct"] > 95.0

    if all_missing and low_std:
        return "[DEAD]"
    if all_missing:
        return "[MISSING]"
    if low_std:
        return "[LOW STD]"
    return "[ALIVE]"


def main():
    parser = argparse.ArgumentParser(description="Diagnose feature health from a features CSV")
    parser.add_argument("csv_path", type=Path, help="Path to features CSV")
    args = parser.parse_args()

    if not args.csv_path.exists():
        print(f"ERROR: file not found: {args.csv_path}", file=sys.stderr)
        sys.exit(1)

    print(f"\nLoading: {args.csv_path}")
    _, rows = load_csv(args.csv_path)
    print(f"Rows: {len(rows)}")

    n_real = sum(1 for r in rows if r.get("label") == "0")
    n_fake = sum(1 for r in rows if r.get("label") == "1")
    print(f"Labels: {n_real} real (0) / {n_fake} fake (1)\n")

    # Header
    col_w = [22, 7, 8, 8, 8, 8, 10, 12]
    header = f"{'Feature':<{col_w[0]}} {'N':>{col_w[1]}} {'Miss%':>{col_w[2]}} {'Mean':>{col_w[3]}} {'Std':>{col_w[4]}} {'Min':>{col_w[5]}} {'Max':>{col_w[6]}} {'Status':>{col_w[7]}}"
    sep = "-" * len(header)
    print(sep)
    print(header)
    print(sep)

    alive_count = 0
    for key in FEATURE_KEYS:
        s = feature_stats(rows, key)
        status = classify(s)
        if "ALIVE" in status:
            alive_count += 1

        def fmt(v):
            if v != v:   # NaN
                return "   NaN"
            return f"{v:>8.4f}"

        print(
            f"{key:<{col_w[0]}} "
            f"{s['n_real']:>{col_w[1]}} "
            f"{s['missing_pct']:>{col_w[2]}.1f} "
            f"{fmt(s['mean'])} "
            f"{fmt(s['std'])} "
            f"{fmt(s['min'])} "
            f"{fmt(s['max'])} "
            f"  {status}"
        )

    print(sep)
    print(f"\n{alive_count}/{len(FEATURE_KEYS)} features are ALIVE (std > 0.01, missing < 95%)\n")

    dead = []
    low = []
    missing = []
    for key in FEATURE_KEYS:
        s = feature_stats(rows, key)
        st = classify(s)
        if "DEAD" in st:
            dead.append(key)
        elif "LOW" in st:
            low.append(key)
        elif "MISSING" in st:
            missing.append(key)

    if dead:
        print(f"[DEAD] (constant + always missing): {', '.join(dead)}")
    if low:
        print(f"[LOW STD] (constant output - extractor broken?): {', '.join(low)}")
    if missing:
        print(f"[MISSING] (expected for video-only dataset): {', '.join(missing)}")
    print()


if __name__ == "__main__":
    main()
