"""
Reality Firewall — Meta-Classifier Training CLI
Train the LightGBM meta-classifier.

Usage:
    python train_meta.py                    # Train on synthetic data
    python train_meta.py --samples 10000     # More synthetic samples
    python train_meta.py --data data.csv     # Train on real labeled data
"""
import sys
import argparse
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-24s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("train-meta")


def main():
    parser = argparse.ArgumentParser(description="Train Reality Firewall meta-classifier")
    parser.add_argument("--samples", type=int, default=5000, help="Number of synthetic samples (default: 5000)")
    parser.add_argument("--data", type=str, default=None, help="Path to CSV with labeled data (optional)")
    parser.add_argument("--output", type=str, default=None, help="Output model path (optional)")
    args = parser.parse_args()

    from ensemble.meta_classifier import train_model, FEATURE_KEYS, MODEL_PATH
    from pathlib import Path

    logger.info("=" * 60)
    logger.info("  Reality Firewall — Meta-Classifier Training")
    logger.info("=" * 60)

    X, y = None, None

    # Load real data if provided
    if args.data:
        try:
            import numpy as np
            logger.info(f"Loading labeled data from {args.data}...")

            # Expect CSV with columns: [FEATURE_KEYS..., label]
            data = np.loadtxt(args.data, delimiter=",", skiprows=1)
            X = data[:, :-1]
            y = data[:, -1]

            if X.shape[1] != len(FEATURE_KEYS):
                logger.error(
                    f"Feature count mismatch: expected {len(FEATURE_KEYS)}, "
                    f"got {X.shape[1]}. Expected columns: {FEATURE_KEYS + ['label']}"
                )
                sys.exit(1)

            logger.info(f"Loaded {len(y)} samples ({int(sum(y))} fake, {int(len(y) - sum(y))} real)")

        except Exception as e:
            logger.error(f"Failed to load data: {e}")
            sys.exit(1)

    save_path = Path(args.output) if args.output else MODEL_PATH

    # Train
    metrics = train_model(X=X, y=y, n_synthetic=args.samples, save_path=save_path)

    # Report
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
        bar = "█" * int(imp / max(importance.values()) * 20)
        logger.info(f"    {feat:20s} {imp:5d}  {bar}")
    logger.info("")
    logger.info(f"  Model saved to: {save_path}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
