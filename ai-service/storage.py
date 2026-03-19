"""
Reality Firewall — Phase 14: Persistent Storage Abstraction
Abstracts between local filesystem and remote (MongoDB + ImageKit/S3) storage.

When environment variables are NOT set, falls back transparently to local JSONL + local files.
When MONGO_URI is set, records are also written to MongoDB.
When IMAGEKIT_* vars are set, media files are uploaded to ImageKit CDN.
"""
import os
import io
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ---- Configuration (from environment) ----
MONGO_URI = os.getenv("MONGO_URI", "")
MONGO_DB = os.getenv("MONGO_DB", "reality_firewall")
IMAGEKIT_PUBLIC_KEY = os.getenv("IMAGEKIT_PUBLIC_KEY", "")
IMAGEKIT_PRIVATE_KEY = os.getenv("IMAGEKIT_PRIVATE_KEY", "")
IMAGEKIT_URL_ENDPOINT = os.getenv("IMAGEKIT_URL_ENDPOINT", "")

# ---- MongoDB Setup ----
_mongo_client = None
_mongo_db = None

def _get_mongo_db():
    """Lazy-connect to MongoDB. Returns None if MONGO_URI is not set or connection fails."""
    global _mongo_client, _mongo_db
    if _mongo_db is not None:
        return _mongo_db
    if not MONGO_URI:
        return None
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        _mongo_client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        _mongo_db = _mongo_client[MONGO_DB]
        logger.info(f"Connected to MongoDB at {MONGO_URI[:20]}...")
        return _mongo_db
    except ImportError:
        logger.warning("motor not installed. Install with: pip install motor. Falling back to local storage.")
        return None
    except Exception as e:
        logger.warning(f"MongoDB connection failed: {e}. Falling back to local storage.")
        return None


# ---- ImageKit Setup ----
_imagekit_client = None

def _get_imagekit():
    """Lazy-connect to ImageKit CDN client. Returns None if credentials are missing."""
    global _imagekit_client
    if _imagekit_client is not None:
        return _imagekit_client
    if not all([IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, IMAGEKIT_URL_ENDPOINT]):
        return None
    try:
        from imagekitio import ImageKit
        _imagekit_client = ImageKit(
            public_key=IMAGEKIT_PUBLIC_KEY,
            private_key=IMAGEKIT_PRIVATE_KEY,
            url_endpoint=IMAGEKIT_URL_ENDPOINT
        )
        logger.info("Initialized ImageKit CDN client.")
        return _imagekit_client
    except ImportError:
        logger.warning("imagekitio not installed. Using local file storage fallback.")
        return None
    except Exception as e:
        logger.warning(f"ImageKit initialization failed: {e}.")
        return None


# ---- API: Store Analysis Record ----
async def store_analysis_record(record: dict) -> Optional[str]:
    """
    Store an analysis record persistently.
    
    Returns:
        str: document/record ID if inserted into MongoDB, else None (JSONL fallback)
    """
    db = _get_mongo_db()
    if db is not None:
        try:
            result = await db.analyses.insert_one(record.copy())
            logger.debug(f"Stored analysis in MongoDB: {result.inserted_id}")
            return str(result.inserted_id)
        except Exception as e:
            logger.warning(f"MongoDB write failed: {e}. Falling back to JSONL.")

    # JSONL Fallback (always succeeds)
    return None  # JSONL write is handled by logging_service.py


# ---- API: Query Analysis Records ----
async def query_analyses(
    limit: int = 100,
    offset: int = 0,
    verdict: Optional[str] = None,
    media_type: Optional[str] = None,
) -> list[dict]:
    """
    Query persisted analysis records.
    Falls back to the local JSONL log if MongoDB is not available.
    """
    db = _get_mongo_db()
    if db is not None:
        try:
            filters: dict[str, Any] = {}
            if verdict:
                filters["verdict"] = verdict
            if media_type:
                filters["media_type"] = media_type

            cursor = db.analyses.find(filters).sort("timestamp", -1).skip(offset).limit(limit)
            results = []
            async for doc in cursor:
                doc["_id"] = str(doc["_id"])  # Convert ObjectId to string
                results.append(doc)
            return results
        except Exception as e:
            logger.warning(f"MongoDB query failed: {e}. Falling back to JSONL.")

    # JSONL Fallback
    from logging_service import get_log_entries
    return get_log_entries(limit=limit, offset=offset)


async def count_analyses(verdict: Optional[str] = None) -> int:
    """Count total analysis records."""
    db = _get_mongo_db()
    if db is not None:
        try:
            filters: dict[str, Any] = {}
            if verdict:
                filters["verdict"] = verdict
            return await db.analyses.count_documents(filters)
        except Exception as e:
            logger.warning(f"MongoDB count failed: {e}.")

    from logging_service import get_log_stats
    return get_log_stats()["total_analyses"]


# ---- API: Upload Media File ----
def upload_media(raw_bytes: bytes, filename: str, folder: str = "analyses") -> str:
    """
    Upload a media file to ImageKit CDN.
    Returns the CDN URL, or a local placeholder path if ImageKit is not configured.
    """
    ik = _get_imagekit()
    if ik is not None:
        try:
            import base64
            encoded = base64.b64encode(raw_bytes).decode("utf-8")
            result = ik.upload_file(
                file=encoded,
                file_name=filename,
                options={"folder": f"/{folder}/"}
            )
            url = result.response_metadata.raw.get("url", "")
            logger.debug(f"Uploaded {filename} to ImageKit: {url}")
            return url
        except Exception as e:
            logger.warning(f"ImageKit upload failed: {e}. Using local path.")

    # Local fallback: save to uploads dir
    uploads_dir = Path("uploads")
    uploads_dir.mkdir(exist_ok=True)
    local_path = uploads_dir / filename
    local_path.write_bytes(raw_bytes)
    return f"/uploads/{filename}"


def get_storage_status() -> dict:
    """Return the current storage backend status for the health endpoint."""
    return {
        "mongodb": "connected" if _mongo_db is not None else ("configured" if MONGO_URI else "not_configured"),
        "imagekit": "connected" if _imagekit_client is not None else ("configured" if IMAGEKIT_PUBLIC_KEY else "not_configured"),
        "fallback": "jsonl_local",
    }
