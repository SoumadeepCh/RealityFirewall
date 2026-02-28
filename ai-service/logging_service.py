"""
Reality Firewall — Forensic Logging Service
Stores analysis results for continuous learning and audit trails.
"""
import json
import hashlib
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from config import LOG_ANALYSIS, LOG_FILE

logger = logging.getLogger(__name__)


def compute_media_hash(raw_bytes: bytes) -> str:
    """Compute SHA-256 hash of media content."""
    return hashlib.sha256(raw_bytes).hexdigest()


def log_analysis(
    media_hash: str,
    filename: str,
    media_type: str,
    file_size: int,
    feature_vector: dict,
    signals: list[dict],
    fake_probability: float,
    risk_level: str,
    verdict: str,
    processing_time_ms: int,
    model_versions: dict,
    analysis_level: str = "unknown",
):
    """
    Log analysis result to JSONL file for forensic audit and future retraining.

    Each line is a self-contained JSON record.
    """
    if not LOG_ANALYSIS:
        return

    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "media_hash": media_hash,
        "filename": filename,
        "media_type": media_type,
        "file_size": file_size,
        "feature_vector": {k: v for k, v in feature_vector.items() if v is not None},
        "signal_count": len(signals),
        "signal_ids": [s["id"] for s in signals],
        "top_signals": [
            {"id": s["id"], "confidence": s["confidence"], "source": s.get("source", "heuristic")}
            for s in sorted(signals, key=lambda x: x["confidence"], reverse=True)[:5]
        ],
        "fake_probability": round(fake_probability, 4),
        "risk_level": risk_level,
        "verdict": verdict,
        "processing_time_ms": processing_time_ms,
        "model_versions": model_versions,
        "analysis_level": analysis_level,
        # Future: user_feedback field for correction logging
    }

    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except Exception as e:
        logger.error(f"Failed to write analysis log: {e}")


def get_log_stats() -> dict:
    """Get summary statistics from the analysis log."""
    if not LOG_FILE.exists():
        return {"total_analyses": 0, "log_file": str(LOG_FILE)}

    total = 0
    verdicts = {}
    media_types = {}

    try:
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    record = json.loads(line.strip())
                    total += 1
                    v = record.get("verdict", "unknown")
                    verdicts[v] = verdicts.get(v, 0) + 1
                    mt = record.get("media_type", "unknown")
                    media_types[mt] = media_types.get(mt, 0) + 1
                except json.JSONDecodeError:
                    continue
    except Exception as e:
        logger.error(f"Failed to read log stats: {e}")

    return {
        "total_analyses": total,
        "verdicts": verdicts,
        "media_types": media_types,
        "log_file": str(LOG_FILE),
    }


def get_log_entries(limit: int = 100, offset: int = 0) -> list[dict]:
    """Get individual log entries for the logs dashboard."""
    if not LOG_FILE.exists():
        return []

    entries = []
    try:
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    record = json.loads(line.strip())
                    entries.append(record)
                except json.JSONDecodeError:
                    continue
    except Exception as e:
        logger.error(f"Failed to read log entries: {e}")

    # Return newest first
    entries.reverse()
    return entries[offset : offset + limit]
