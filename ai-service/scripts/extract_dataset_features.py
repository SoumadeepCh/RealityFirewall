"""
Reality Firewall — Phase 10: Real Dataset Feature Extraction
=============================================================
Walks FaceForensics++ or Celeb-DF dataset directories, runs the full AMAF
feature extractor pipeline on each media file, and writes a CSV file that
train_meta.py can consume directly.

Usage
-----
# FaceForensics++ (expects real/ and fake/ sub-dirs of images/video clips):
    python scripts/extract_dataset_features.py \\
        --ff-real  /data/FaceForensics/original_sequences/ \\
        --ff-fake  /data/FaceForensics/manipulated_sequences/ \\
        --output   ff_features.csv \\
        --limit    2000

# Celeb-DF (expects Celeb-real/ and Celeb-synthesis/ sub-dirs):
    python scripts/extract_dataset_features.py \\
        --celebdf-real  /data/Celeb-DF/Celeb-real/ \\
        --celebdf-fake  /data/Celeb-DF/Celeb-synthesis/ \\
        --output        celebdf_features.csv

# Combine both datasets into one CSV:
    python scripts/extract_dataset_features.py \\
        --ff-real   /data/FaceForensics/original_sequences/ \\
        --ff-fake   /data/FaceForensics/manipulated_sequences/ \\
        --celebdf-real  /data/Celeb-DF/Celeb-real/ \\
        --celebdf-fake  /data/Celeb-DF/Celeb-synthesis/ \\
        --output    combined_features.csv

After generating the CSV, train with:
    python train_meta.py --data combined_features.csv
"""
import sys
import csv
import json
import random
import argparse
import logging
from pathlib import Path

# Add ai-service dir to path so we can import pipeline and ensemble modules
_AISERVICE_DIR = Path(__file__).resolve().parent.parent
if str(_AISERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(_AISERVICE_DIR))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("extract-features")

SUPPORTED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
SUPPORTED_VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}


def collect_files(directory: Path, limit: int = None) -> list[Path]:
    """Recursively collect all supported media files from a directory."""
    exts = SUPPORTED_IMAGE_EXTS | SUPPORTED_VIDEO_EXTS
    files = [f for f in directory.rglob("*") if f.suffix.lower() in exts]
    if limit:
        files = files[:limit]
    return files


def extract_features_from_file(file_path: Path) -> dict | None:
    """
    Run the AMAF pipeline on a single media file and return feature dict.
    Returns None if extraction fails.
    """
    try:
        # Import the pipeline (lazy import to avoid startup cost in arg-parse phase)
        import mimetypes
        from pipeline import run_pipeline

        with open(file_path, "rb") as fh:
            file_bytes = fh.read()

        # Guess MIME type from file extension
        content_type, _ = mimetypes.guess_type(str(file_path))

        result = run_pipeline(file_bytes, filename=file_path.name, content_type=content_type)

        if result is None:
            logger.warning(f"Pipeline returned None for {file_path.name}")
            return None

        # AnalysisResponse is a Pydantic model — convert to dict
        if hasattr(result, "model_dump"):
            result_dict = result.model_dump()
        elif hasattr(result, "dict"):
            result_dict = result.dict()
        else:
            result_dict = dict(result)

        # Feature vector is nested inside the response
        fv_raw = result_dict.get("feature_vector", {})
        # It may be a FeatureVector Pydantic object or already a dict
        if hasattr(fv_raw, "model_dump"):
            fv = fv_raw.model_dump()
        elif hasattr(fv_raw, "dict"):
            fv = fv_raw.dict()
        elif isinstance(fv_raw, dict):
            fv = fv_raw
        else:
            fv = {}

        return fv

    except Exception as e:
        logger.error(f"Failed to extract features from {file_path.name}: {e}")
        return None


def process_split(
    directory: Path,
    label: int,
    cache_path: Path,
    existing_results: dict,
    limit: int = None,
    dataset_name: str = "dataset",
) -> list[dict]:
    """Process all files in a directory and return list of feature rows."""
    if not directory.exists():
        logger.error(f"Directory does not exist: {directory}")
        return []

    files = collect_files(directory, limit)
    logger.info(
        f"[{dataset_name}] label={label} — found {len(files)} files in {directory}"
    )

    rows = []
    for i, fpath in enumerate(files):
        logger.info(f"  [{i+1}/{len(files)}] {fpath.name}")
        str_fpath = str(fpath)
        
        # Check cache for resume functionality
        if str_fpath in existing_results:
            logger.info(f"  Skipped (found in cache): {fpath.name}")
            rows.append(existing_results[str_fpath])
            continue

        fv = extract_features_from_file(fpath)
        if fv is not None:
            row = dict(fv)
            row["label"] = label
            row["source_file"] = str_fpath
            row["dataset"] = dataset_name
            rows.append(row)
            
            # Save to cache incrementally
            if cache_path:
                try:
                    with open(cache_path, "a", encoding="utf-8") as f:
                        f.write(json.dumps(row) + "\n")
                except Exception as e:
                    logger.error(f"  Failed to write to cache: {e}")
        else:
            logger.warning(f"  Skipped (extraction failed): {fpath.name}")

    logger.info(
        f"[{dataset_name}] label={label} — extracted {len(rows)}/{len(files)} samples"
    )
    return rows


def write_csv(rows: list[dict], output_path: Path):
    """Write feature rows to CSV. Columns: FEATURE_KEYS... + label."""
    from ensemble.meta_classifier import FEATURE_KEYS

    # Column order: feature keys + metadata columns
    meta_cols = ["label", "source_file", "dataset"]
    fieldnames = FEATURE_KEYS + meta_cols

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            # Fill missing feature keys with -1 (sentinel for LightGBM)
            for key in FEATURE_KEYS:
                if key not in row or row[key] is None:
                    row[key] = -1.0
            writer.writerow(row)

    logger.info(f"CSV written: {output_path} ({len(rows)} rows)")


def main():
    parser = argparse.ArgumentParser(
        description="Extract AMAF features from FaceForensics++ / Celeb-DF for meta-classifier training"
    )
    parser.add_argument(
        "--ff-real",
        type=Path,
        default=None,
        help="FaceForensics++ real/original sequences directory",
    )
    parser.add_argument(
        "--ff-fake",
        type=Path,
        default=None,
        help="FaceForensics++ manipulated sequences directory",
    )
    parser.add_argument(
        "--celebdf-real",
        type=Path,
        default=None,
        help="Celeb-DF real sequences directory (Celeb-real/)",
    )
    parser.add_argument(
        "--celebdf-fake",
        type=Path,
        default=None,
        help="Celeb-DF synthesis directory (Celeb-synthesis/)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("real_features.csv"),
        help="Output CSV path (default: real_features.csv)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max files to process per class per dataset (for quick tests)",
    )

    args = parser.parse_args()

    if not any([args.ff_real, args.ff_fake, args.celebdf_real, args.celebdf_fake]):
        parser.error(
            "Provide at least one dataset directory (--ff-real, --ff-fake, --celebdf-real, --celebdf-fake)"
        )

    # Initialize cache for resuming feature extraction
    cache_path = Path(str(args.output) + ".cache.jsonl")
    existing_results = {}
    if cache_path.exists():
        logger.info(f"Found existing cache at {cache_path}. Loading for resume...")
        with open(cache_path, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    row = json.loads(line)
                    existing_results[row["source_file"]] = row
                except Exception:
                    pass
        logger.info(f"Loaded {len(existing_results)} extracted files from cache.")

    all_rows = []

    def balance_and_add(real_rows, fake_rows, dataset_name):
        """Cap real/fake to the smaller count so each dataset is class-balanced."""
        n = min(len(real_rows), len(fake_rows))
        if n == 0:
            logger.warning(f"[{dataset_name}] No rows to add (empty real or fake split).")
            return
        if len(real_rows) != len(fake_rows):
            logger.info(
                f"[{dataset_name}] Balancing: {len(real_rows)} real / {len(fake_rows)} fake "
                f"→ capped to {n} each"
            )
        all_rows.extend(random.sample(real_rows, n))
        all_rows.extend(random.sample(fake_rows, n))

    # FaceForensics++
    ff_real_rows, ff_fake_rows = [], []
    if args.ff_real:
        ff_real_rows = process_split(args.ff_real, label=0, cache_path=cache_path, existing_results=existing_results, limit=args.limit, dataset_name="FF++")
    if args.ff_fake:
        ff_fake_rows = process_split(args.ff_fake, label=1, cache_path=cache_path, existing_results=existing_results, limit=args.limit, dataset_name="FF++")
    if ff_real_rows or ff_fake_rows:
        balance_and_add(ff_real_rows, ff_fake_rows, "FF++")

    # Celeb-DF
    cdf_real_rows, cdf_fake_rows = [], []
    if args.celebdf_real:
        cdf_real_rows = process_split(
            args.celebdf_real, label=0, cache_path=cache_path, existing_results=existing_results, limit=args.limit, dataset_name="Celeb-DF"
        )
    if args.celebdf_fake:
        cdf_fake_rows = process_split(
            args.celebdf_fake, label=1, cache_path=cache_path, existing_results=existing_results, limit=args.limit, dataset_name="Celeb-DF"
        )
    if cdf_real_rows or cdf_fake_rows:
        balance_and_add(cdf_real_rows, cdf_fake_rows, "Celeb-DF")

    if not all_rows:
        logger.error("No features extracted. Check dataset paths and logs above.")
        sys.exit(1)

    # Global shuffle — eliminates sequential dataset ordering bias
    random.shuffle(all_rows)
    logger.info(f"Shuffled {len(all_rows)} combined rows before writing CSV.")

    write_csv(all_rows, args.output)

    # Summary
    n_real = sum(1 for r in all_rows if r["label"] == 0)
    n_fake = sum(1 for r in all_rows if r["label"] == 1)
    logger.info("=" * 60)
    logger.info("  EXTRACTION COMPLETE")
    logger.info("=" * 60)
    logger.info(f"  Total samples : {len(all_rows)}")
    logger.info(f"  Real (label=0): {n_real}")
    logger.info(f"  Fake (label=1): {n_fake}")
    logger.info(f"  Output CSV    : {args.output}")
    logger.info("")
    logger.info("  Next step: train the meta-classifier:")
    logger.info(f"    python train_meta.py --data {args.output}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
