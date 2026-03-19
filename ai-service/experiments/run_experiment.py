"""
Reality Firewall — AMAF Pipeline Feasibility Experiment
========================================================
End-to-end test: extract AMAF features from real deepfake datasets,
train LightGBM meta-classifier, evaluate accuracy, and benchmark timing.

Datasets used:
  - Celeb-DF-v2: 50 real + 50 fake videos  (default; fast experiment)
  - FaceForensics++: 50 real + 50 fake videos (optional; add --use-ff)

Usage:
    cd C:\\Users\\SOUMADEEP\\Documents\\realityfirewall\\ai-service
    python experiments/run_experiment.py
    python experiments/run_experiment.py --limit 100 --use-ff
    python experiments/run_experiment.py --limit 25  # ultra-fast smoke test
"""
import sys
import os
import csv
import json
import time
import random
import argparse
import logging
from pathlib import Path
from datetime import datetime

# ── Setup paths ─────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = SCRIPT_DIR.parent
RESULTS_DIR = SCRIPT_DIR / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# Add ai-service to path so we can import pipeline modules
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

# ── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("experiment")

# ── Dataset Paths ───────────────────────────────────────────────────────────
DATA_ROOT = Path(r"D:\RFW_DATA")

DATASETS = {
    "celeb-df": {
        "real": DATA_ROOT / "Celeb-DF-v2" / "Celeb-real",
        "fake": DATA_ROOT / "Celeb-DF-v2" / "Celeb-synthesis",
    },
    "ff++": {
        "real": DATA_ROOT / "FaceForensics++" / "original_sequences" / "youtube" / "c23" / "videos",
        "fake": DATA_ROOT / "FaceForensics++" / "manipulated_sequences" / "Deepfakes" / "c23" / "videos",
    },
}

SUPPORTED_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}


def collect_videos(directory: Path, limit: int) -> list[Path]:
    """Collect video files from a directory, shuffled and capped at limit."""
    if not directory.exists():
        logger.error(f"Directory not found: {directory}")
        return []
    files = [f for f in directory.iterdir() if f.suffix.lower() in SUPPORTED_EXTS]
    random.shuffle(files)
    return files[:limit]


def extract_features_single(file_path: Path) -> tuple[dict | None, float]:
    """
    Run the full AMAF pipeline on a single video file.
    Returns (feature_dict, elapsed_seconds) or (None, elapsed_seconds) on failure.
    """
    import mimetypes
    from pipeline import run_pipeline

    start = time.perf_counter()
    try:
        with open(file_path, "rb") as f:
            raw_bytes = f.read()

        content_type, _ = mimetypes.guess_type(str(file_path))
        result = run_pipeline(raw_bytes, filename=file_path.name, content_type=content_type)

        if result is None:
            return None, time.perf_counter() - start

        # Extract feature vector from AnalysisResponse
        if hasattr(result, "model_dump"):
            rd = result.model_dump()
        elif hasattr(result, "dict"):
            rd = result.dict()
        else:
            rd = dict(result)

        fv_raw = rd.get("feature_vector", {})
        if hasattr(fv_raw, "model_dump"):
            fv = fv_raw.model_dump()
        elif hasattr(fv_raw, "dict"):
            fv = fv_raw.dict()
        elif isinstance(fv_raw, dict):
            fv = fv_raw
        else:
            fv = {}

        elapsed = time.perf_counter() - start
        return fv, elapsed

    except Exception as e:
        elapsed = time.perf_counter() - start
        logger.error(f"Extraction failed for {file_path.name}: {e}")
        return None, elapsed


def run_extraction(dataset_name: str, real_dir: Path, fake_dir: Path, limit: int) -> tuple[list[dict], list[float]]:
    """
    Extract features from real and fake video directories.
    Returns (rows, per_video_timings).
    """
    logger.info(f"\n{'='*60}")
    logger.info(f"  PHASE 1: FEATURE EXTRACTION — {dataset_name}")
    logger.info(f"{'='*60}")

    real_files = collect_videos(real_dir, limit)
    fake_files = collect_videos(fake_dir, limit)

    logger.info(f"  Real videos: {len(real_files)} from {real_dir}")
    logger.info(f"  Fake videos: {len(fake_files)} from {fake_dir}")

    rows = []
    timings = []

    # Process real videos
    for i, fpath in enumerate(real_files):
        logger.info(f"  [REAL {i+1}/{len(real_files)}] {fpath.name}")
        fv, elapsed = extract_features_single(fpath)
        timings.append(elapsed)
        if fv is not None:
            row = dict(fv)
            row["label"] = 0
            row["source_file"] = str(fpath)
            row["dataset"] = dataset_name
            row["extraction_time_s"] = round(elapsed, 3)
            rows.append(row)
            logger.info(f"    → {elapsed:.2f}s | deepfake_prob={fv.get('deepfake_prob', 'N/A')}")
        else:
            logger.warning(f"    → FAILED ({elapsed:.2f}s)")

    # Process fake videos
    for i, fpath in enumerate(fake_files):
        logger.info(f"  [FAKE {i+1}/{len(fake_files)}] {fpath.name}")
        fv, elapsed = extract_features_single(fpath)
        timings.append(elapsed)
        if fv is not None:
            row = dict(fv)
            row["label"] = 1
            row["source_file"] = str(fpath)
            row["dataset"] = dataset_name
            row["extraction_time_s"] = round(elapsed, 3)
            rows.append(row)
            logger.info(f"    → {elapsed:.2f}s | deepfake_prob={fv.get('deepfake_prob', 'N/A')}")
        else:
            logger.warning(f"    → FAILED ({elapsed:.2f}s)")

    return rows, timings


def train_and_evaluate(rows: list[dict]) -> dict:
    """
    Train LightGBM on extracted features and evaluate.
    Returns metrics dict.
    """
    import numpy as np
    from ensemble.meta_classifier import FEATURE_KEYS

    logger.info(f"\n{'='*60}")
    logger.info(f"  PHASE 2: TRAIN & EVALUATE LightGBM")
    logger.info(f"{'='*60}")

    # Build feature matrix
    X = []
    y = []
    for row in rows:
        feature_row = []
        for key in FEATURE_KEYS:
            val = row.get(key)
            if val is None:
                feature_row.append(-1.0)
            else:
                try:
                    feature_row.append(float(val))
                except (ValueError, TypeError):
                    feature_row.append(-1.0)
        X.append(feature_row)
        y.append(float(row["label"]))

    X = np.array(X, dtype=np.float64)
    y = np.array(y, dtype=np.float64)

    logger.info(f"  Feature matrix: {X.shape}")
    logger.info(f"  Labels: {int((y==0).sum())} real, {int((y==1).sum())} fake")

    # Train/test split
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import (
        roc_auc_score, accuracy_score, precision_score,
        recall_score, f1_score, confusion_matrix, classification_report
    )

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2 if len(y) > 10 else 1, random_state=42
    )

    logger.info(f"  Train: {len(y_train)} samples | Test: {len(y_test)} samples")

    # Train LightGBM
    import lightgbm as lgb

    n_real_train = int((y_train == 0).sum())
    n_fake_train = int((y_train == 1).sum())
    scale_pos_weight = n_real_train / max(n_fake_train, 1)

    params = {
        "objective": "binary",
        "metric": "binary_logloss",
        "boosting_type": "gbdt",
        "num_leaves": 31,
        "learning_rate": 0.05,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        "min_child_samples": 10,  # Smaller for small datasets
        "lambda_l1": 0.1,
        "lambda_l2": 0.1,
        "scale_pos_weight": scale_pos_weight,
        "verbose": -1,
        "n_jobs": -1,
        "seed": 42,
    }

    train_data = lgb.Dataset(X_train, label=y_train, feature_name=FEATURE_KEYS)
    val_data = lgb.Dataset(X_test, label=y_test, reference=train_data, feature_name=FEATURE_KEYS)

    callbacks = [
        lgb.early_stopping(stopping_rounds=20, verbose=True),
        lgb.log_evaluation(period=10),
    ]

    train_start = time.perf_counter()
    model = lgb.train(
        params,
        train_data,
        num_boost_round=200,
        valid_sets=[val_data],
        callbacks=callbacks,
    )
    train_time = time.perf_counter() - train_start

    # Evaluate
    y_pred_proba = model.predict(X_test)
    y_pred = (y_pred_proba > 0.5).astype(int)

    auc = roc_auc_score(y_test, y_pred_proba)
    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred, zero_division=0)
    recall = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    cm = confusion_matrix(y_test, y_pred)

    # Feature importance
    importance = dict(zip(FEATURE_KEYS, model.feature_importance().tolist()))

    metrics = {
        "auc_roc": round(auc, 4),
        "accuracy": round(accuracy, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1_score": round(f1, 4),
        "confusion_matrix": cm.tolist(),
        "train_samples": len(y_train),
        "test_samples": len(y_test),
        "train_time_s": round(train_time, 3),
        "feature_importance": importance,
        "classification_report": classification_report(y_test, y_pred, target_names=["REAL", "FAKE"]),
    }

    # Save model for this experiment
    model_path = RESULTS_DIR / "experiment_model.lgb"
    model.save_model(str(model_path))
    logger.info(f"  Experiment model saved to {model_path}")

    return metrics


def save_results(rows: list[dict], timings: list[float], metrics: dict, datasets_used: list[str]):
    """Save CSV, JSON report, and print summary."""
    from ensemble.meta_classifier import FEATURE_KEYS

    # ── Save CSV ────────────────────────────────────────────────────────────
    csv_path = RESULTS_DIR / "experiment_features.csv"
    meta_cols = ["label", "source_file", "dataset", "extraction_time_s"]
    fieldnames = FEATURE_KEYS + meta_cols

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            for key in FEATURE_KEYS:
                if key not in row or row[key] is None:
                    row[key] = -1.0
            writer.writerow(row)

    logger.info(f"  Features CSV saved: {csv_path}")

    # ── Timing statistics ───────────────────────────────────────────────────
    import numpy as np
    valid_timings = [t for t in timings if t > 0]
    timing_stats = {
        "total_videos": len(timings),
        "successful_extractions": len(rows),
        "failed_extractions": len(timings) - len(rows),
        "total_extraction_time_s": round(sum(valid_timings), 2),
        "mean_time_per_video_s": round(float(np.mean(valid_timings)), 3) if valid_timings else 0,
        "median_time_per_video_s": round(float(np.median(valid_timings)), 3) if valid_timings else 0,
        "min_time_per_video_s": round(float(np.min(valid_timings)), 3) if valid_timings else 0,
        "max_time_per_video_s": round(float(np.max(valid_timings)), 3) if valid_timings else 0,
        "std_time_per_video_s": round(float(np.std(valid_timings)), 3) if valid_timings else 0,
        "p95_time_per_video_s": round(float(np.percentile(valid_timings, 95)), 3) if valid_timings else 0,
    }

    # ── Full report ─────────────────────────────────────────────────────────
    report = {
        "experiment": "AMAF Pipeline Feasibility Test",
        "timestamp": datetime.now().isoformat(),
        "datasets_used": datasets_used,
        "timing": timing_stats,
        "model_metrics": {k: v for k, v in metrics.items() if k != "classification_report"},
        "classification_report": metrics.get("classification_report", ""),
    }

    report_path = RESULTS_DIR / "experiment_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=str)
    logger.info(f"  Report JSON saved: {report_path}")

    # ── Print Summary ───────────────────────────────────────────────────────
    print("\n")
    print("=" * 70)
    print("  AMAF PIPELINE FEASIBILITY EXPERIMENT — RESULTS")
    print("=" * 70)

    print("\n  ┌─────────────────────────────────────────────────────────────┐")
    print("  │                    TIMING BENCHMARK                        │")
    print("  ├─────────────────────────────────────────────────────────────┤")
    print(f"  │  Total videos processed:   {timing_stats['total_videos']:>8}                       │")
    print(f"  │  Successful extractions:   {timing_stats['successful_extractions']:>8}                       │")
    print(f"  │  Failed extractions:       {timing_stats['failed_extractions']:>8}                       │")
    print(f"  │  Total extraction time:    {timing_stats['total_extraction_time_s']:>8.1f}s                      │")
    print(f"  │                                                           │")
    print(f"  │  ⏱  Mean time per video:   {timing_stats['mean_time_per_video_s']:>8.3f}s                      │")
    print(f"  │  ⏱  Median time per video: {timing_stats['median_time_per_video_s']:>8.3f}s                      │")
    print(f"  │  ⏱  Min / Max:             {timing_stats['min_time_per_video_s']:.3f}s / {timing_stats['max_time_per_video_s']:.3f}s               │")
    print(f"  │  ⏱  P95 time:              {timing_stats['p95_time_per_video_s']:>8.3f}s                      │")
    print("  └─────────────────────────────────────────────────────────────┘")

    print("\n  ┌─────────────────────────────────────────────────────────────┐")
    print("  │                  MODEL PERFORMANCE                         │")
    print("  ├─────────────────────────────────────────────────────────────┤")
    print(f"  │  AUC-ROC:        {metrics['auc_roc']:.4f}                                   │")
    print(f"  │  Accuracy:       {metrics['accuracy']:.4f}                                   │")
    print(f"  │  Precision:      {metrics['precision']:.4f}                                   │")
    print(f"  │  Recall:         {metrics['recall']:.4f}                                   │")
    print(f"  │  F1-Score:       {metrics['f1_score']:.4f}                                   │")
    print(f"  │  Train time:     {metrics['train_time_s']:.3f}s                                  │")
    print("  └─────────────────────────────────────────────────────────────┘")

    print("\n  Confusion Matrix:")
    cm = metrics["confusion_matrix"]
    print(f"                    Predicted REAL   Predicted FAKE")
    print(f"    Actual REAL     {cm[0][0]:>8}         {cm[0][1]:>8}")
    print(f"    Actual FAKE     {cm[1][0]:>8}         {cm[1][1]:>8}")

    print("\n  Feature Importance (top 10):")
    importance = metrics["feature_importance"]
    sorted_imp = sorted(importance.items(), key=lambda x: x[1], reverse=True)
    max_imp = max(importance.values()) if importance.values() else 1
    for feat, imp in sorted_imp[:10]:
        bar = "█" * int(imp / max(max_imp, 1) * 30)
        print(f"    {feat:22s} {imp:5d}  {bar}")

    print(f"\n  Classification Report:")
    print(metrics["classification_report"])

    # ── Feasibility Assessment ──────────────────────────────────────────────
    print("  ┌─────────────────────────────────────────────────────────────┐")
    print("  │                FEASIBILITY ASSESSMENT                      │")
    print("  ├─────────────────────────────────────────────────────────────┤")

    if metrics["auc_roc"] > 0.7:
        print("  │  ✅ AUC-ROC > 0.70 — Model learns meaningful patterns     │")
    elif metrics["auc_roc"] > 0.55:
        print("  │  ⚠️  AUC-ROC 0.55-0.70 — Weak signal, needs more data     │")
    else:
        print("  │  ❌ AUC-ROC < 0.55 — No meaningful discrimination          │")

    mean_t = timing_stats["mean_time_per_video_s"]
    if mean_t < 30:
        print(f"  │  ✅ {mean_t:.1f}s/video — Fast enough for batch processing    │")
    elif mean_t < 120:
        print(f"  │  ⚠️  {mean_t:.1f}s/video — Acceptable, consider optimization  │")
    else:
        print(f"  │  ❌ {mean_t:.1f}s/video — Too slow, needs optimization        │")

    est_1000 = mean_t * 1000 / 3600
    print(f"  │                                                           │")
    print(f"  │  Estimated time for 1000 videos: {est_1000:.1f} hours               │")
    print("  └─────────────────────────────────────────────────────────────┘")

    print("\n" + "=" * 70)
    print(f"  Output files:")
    print(f"    {csv_path}")
    print(f"    {report_path}")
    print("=" * 70)


def main():
    parser = argparse.ArgumentParser(
        description="AMAF Pipeline Feasibility Experiment"
    )
    parser.add_argument(
        "--limit", type=int, default=50,
        help="Videos per class (real/fake) per dataset (default: 50 → 100 total per dataset)"
    )
    parser.add_argument(
        "--use-ff", action="store_true",
        help="Also include FaceForensics++ dataset (doubles the experiment size)"
    )
    parser.add_argument(
        "--dataset", choices=["celeb-df", "ff++", "both"], default="celeb-df",
        help="Which dataset to use (default: celeb-df)"
    )
    parser.add_argument(
        "--seed", type=int, default=42,
        help="Random seed for reproducibility"
    )
    args = parser.parse_args()

    if args.use_ff:
        args.dataset = "both"

    random.seed(args.seed)

    logger.info("=" * 60)
    logger.info("  AMAF PIPELINE FEASIBILITY EXPERIMENT")
    logger.info("=" * 60)
    logger.info(f"  Dataset:    {args.dataset}")
    logger.info(f"  Limit:      {args.limit} per class per dataset")
    logger.info(f"  Seed:       {args.seed}")
    logger.info(f"  Results:    {RESULTS_DIR}")
    logger.info("")

    all_rows = []
    all_timings = []
    datasets_used = []

    # ── Extract from Celeb-DF ──
    if args.dataset in ("celeb-df", "both"):
        ds = DATASETS["celeb-df"]
        if ds["real"].exists() and ds["fake"].exists():
            rows, timings = run_extraction("Celeb-DF-v2", ds["real"], ds["fake"], args.limit)
            all_rows.extend(rows)
            all_timings.extend(timings)
            datasets_used.append("Celeb-DF-v2")
        else:
            logger.error(f"Celeb-DF-v2 not found at expected paths")

    # ── Extract from FaceForensics++ ──
    if args.dataset in ("ff++", "both"):
        ds = DATASETS["ff++"]
        if ds["real"].exists() and ds["fake"].exists():
            rows, timings = run_extraction("FF++", ds["real"], ds["fake"], args.limit)
            all_rows.extend(rows)
            all_timings.extend(timings)
            datasets_used.append("FF++")
        else:
            logger.error(f"FaceForensics++ not found at expected paths")

    if not all_rows:
        logger.error("No features extracted. Check dataset paths.")
        sys.exit(1)

    logger.info(f"\n  Total extracted: {len(all_rows)} samples from {datasets_used}")

    # ── Train & Evaluate ──
    metrics = train_and_evaluate(all_rows)

    # ── Save & Report ──
    save_results(all_rows, all_timings, metrics, datasets_used)


if __name__ == "__main__":
    main()
