"""
Reality Firewall — Meta-Classifier Training CLI
Train the LightGBM meta-classifier.

Usage:
    python train_meta.py                           # Train on synthetic data
    python train_meta.py --samples 10000           # More synthetic samples
    python train_meta.py --data features.csv       # Train on real labeled CSV
    python train_meta.py --ff-real /path/real \\   # Auto-extract + train from
                          --ff-fake /path/fake      # FaceForensics++ directories
    python train_meta.py --celebdf-real /path/r \\  # Auto-extract + train from
                          --celebdf-fake /path/f    # Celeb-DF directories
    python train_meta.py --data features.csv \\     # Mix real CSV with extra
                          --samples 2000            # synthetic augmentation
"""
import sys
import argparse
import logging
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-24s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("train-meta")


def load_csv_data(csv_path: str, feature_keys: list) -> tuple:
    """
    Load labeled feature data from a CSV file.

    The CSV must have columns matching FEATURE_KEYS followed by a 'label' column.
    Missing/unknown columns are filled with -1 (LightGBM handles natively).

    Args:
        csv_path: Path to the CSV file.
        feature_keys: Expected feature column names.

    Returns:
        (X, y) numpy arrays.
    """
    import csv as csv_module
    import numpy as np

    logger.info(f"Loading labeled data from {csv_path}...")

    rows = []
    labels = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv_module.DictReader(f)
        for row in reader:
            feature_row = []
            for key in feature_keys:
                val = row.get(key)
                try:
                    feature_row.append(float(val) if val is not None and val != "" else -1.0)
                except (ValueError, TypeError):
                    feature_row.append(-1.0)
            rows.append(feature_row)
            try:
                labels.append(float(row.get("label", -1)))
            except (ValueError, TypeError):
                labels.append(-1.0)

    X = np.array(rows, dtype=np.float64)
    y = np.array(labels, dtype=np.float64)

    # Drop rows with invalid labels
    valid_mask = (y == 0) | (y == 1)
    if not valid_mask.all():
        dropped = (~valid_mask).sum()
        logger.warning(f"Dropped {dropped} rows with invalid labels")
        X = X[valid_mask]
        y = y[valid_mask]

    logger.info(
        f"Loaded {len(y)} samples ({int(y.sum())} fake, {int((y == 0).sum())} real)"
    )
    return X, y


def extract_features_from_dirs(
    ff_real: Path = None,
    ff_fake: Path = None,
    celebdf_real: Path = None,
    celebdf_fake: Path = None,
    limit: int = None,
    tmp_csv: Path = Path("tmp_extracted_features.csv"),
) -> tuple:
    """
    Run the AMAF extraction pipeline on FaceForensics++ / Celeb-DF directories
    and return (X, y) arrays. Intermediate CSV is saved to `tmp_csv`.
    """
    import subprocess

    script = Path(__file__).parent / "scripts" / "extract_dataset_features.py"
    cmd = [sys.executable, str(script), "--output", str(tmp_csv)]

    if ff_real:
        cmd += ["--ff-real", str(ff_real)]
    if ff_fake:
        cmd += ["--ff-fake", str(ff_fake)]
    if celebdf_real:
        cmd += ["--celebdf-real", str(celebdf_real)]
    if celebdf_fake:
        cmd += ["--celebdf-fake", str(celebdf_fake)]
    if limit:
        cmd += ["--limit", str(limit)]

    logger.info(f"Running feature extraction: {' '.join(cmd)}")
    result = subprocess.run(cmd, check=True)

    if result.returncode != 0:
        logger.error("Feature extraction failed. Check logs above.")
        sys.exit(1)

    from ensemble.meta_classifier import FEATURE_KEYS
    return load_csv_data(str(tmp_csv), FEATURE_KEYS)


def main():
    parser = argparse.ArgumentParser(
        description="Train Reality Firewall meta-classifier",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    # Data sources (mutually exclusive-ish; CSV takes priority if provided with dirs)
    data_group = parser.add_argument_group("Data sources")
    data_group.add_argument(
        "--data",
        type=str,
        default=None,
        help="Path to CSV with pre-extracted labeled features (columns: FEATURE_KEYS..., label)",
    )
    data_group.add_argument(
        "--ff-real",
        type=Path,
        default=None,
        help="FaceForensics++ real/original sequences directory (auto-extracts features)",
    )
    data_group.add_argument(
        "--ff-fake",
        type=Path,
        default=None,
        help="FaceForensics++ manipulated sequences directory (auto-extracts features)",
    )
    data_group.add_argument(
        "--celebdf-real",
        type=Path,
        default=None,
        help="Celeb-DF real sequences directory (auto-extracts features)",
    )
    data_group.add_argument(
        "--celebdf-fake",
        type=Path,
        default=None,
        help="Celeb-DF synthesis directory (auto-extracts features)",
    )
    data_group.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max files per class per dataset (for quick testing)",
    )

    # Training options
    train_group = parser.add_argument_group("Training options")
    train_group.add_argument(
        "--samples",
        type=int,
        default=5000,
        help="Synthetic samples to generate (used when no real data, or as augmentation)",
    )
    train_group.add_argument(
        "--augment",
        action="store_true",
        default=False,
        help="When real data is provided, also mix in synthetic samples (--samples controls count)",
    )
    train_group.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output model path (default: model_weights/meta_classifier.lgb)",
    )

    args = parser.parse_args()

    from ensemble.meta_classifier import train_model, FEATURE_KEYS, MODEL_PATH

    logger.info("=" * 60)
    logger.info("  Reality Firewall — Meta-Classifier Training  (Phase 10)")
    logger.info("=" * 60)

    X, y = None, None

    # ── 1. Load pre-extracted CSV ────────────────────────────────────────────
    if args.data:
        try:
            X, y = load_csv_data(args.data, FEATURE_KEYS)
            if X.shape[1] != len(FEATURE_KEYS):
                logger.error(
                    f"Feature count mismatch: expected {len(FEATURE_KEYS)}, "
                    f"got {X.shape[1]}. Expected columns: {FEATURE_KEYS + ['label']}"
                )
                sys.exit(1)
        except Exception as e:
            logger.error(f"Failed to load CSV data: {e}")
            sys.exit(1)

    # ── 2. Auto-extract from dataset directories ─────────────────────────────
    elif any([args.ff_real, args.ff_fake, args.celebdf_real, args.celebdf_fake]):
        try:
            X, y = extract_features_from_dirs(
                ff_real=args.ff_real,
                ff_fake=args.ff_fake,
                celebdf_real=args.celebdf_real,
                celebdf_fake=args.celebdf_fake,
                limit=args.limit,
            )
        except Exception as e:
            logger.error(f"Failed to extract features from directories: {e}")
            sys.exit(1)

    # ── 3. Augment real data with synthetic samples ──────────────────────────
    if X is not None and args.augment:
        import numpy as np
        from ensemble.meta_classifier import generate_synthetic_dataset

        logger.info(
            f"Augmenting {len(y)} real samples with {args.samples} synthetic samples..."
        )
        X_synth, y_synth = generate_synthetic_dataset(args.samples)
        X = np.vstack([X, X_synth])
        y = np.concatenate([y, y_synth])
        logger.info(f"Combined dataset: {len(y)} samples")

    save_path = Path(args.output) if args.output else MODEL_PATH

    # ── 4. Train ─────────────────────────────────────────────────────────────
    metrics = train_model(X=X, y=y, n_synthetic=args.samples, save_path=save_path)

    # ── 5. Report ─────────────────────────────────────────────────────────────
    logger.info("")
    logger.info("=" * 60)
    logger.info("  TRAINING RESULTS")
    logger.info("=" * 60)
    logger.info(f"  AUC-ROC:    {metrics['auc']}")
    logger.info(f"  Accuracy:   {metrics['accuracy']}")
    logger.info(f"  FPR@0.5:    {metrics['fpr_at_0.5']}")
    logger.info(f"  Samples:    {metrics['n_train']} train / {metrics['n_val']} val")
    logger.info(f"  Synthetic:  {metrics['synthetic_data']}")
    logger.info("")
    logger.info("  Feature Importance:")
    importance = metrics["feature_importance"]
    sorted_imp = sorted(importance.items(), key=lambda x: x[1], reverse=True)
    for feat, imp in sorted_imp:
        bar = "█" * int(imp / max(importance.values()) * 20) if importance.values() else ""
        logger.info(f"    {feat:20s} {imp:5d}  {bar}")
    logger.info("")
    logger.info(f"  Model saved to: {save_path}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
