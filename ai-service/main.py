"""
Reality Firewall — AI Service
FastAPI application for forensic-grade media authenticity detection.

Run with:
    uvicorn main:app --reload --port 8000
"""
import hashlib
import logging
import sys
import time
import os
from collections import OrderedDict
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import CORS_ORIGINS, HOST, PORT
from schemas import AnalysisResponse, HealthResponse
from pipeline import run_pipeline
from logging_service import get_log_stats, get_log_entries
from celery_app import dispatch_video_analysis, get_task_status
from storage import query_analyses, count_analyses, get_storage_status

# ---- Phase 9: In-memory fingerprint cache (LRU, max 500 entries) ----
_CACHE_MAX = 500
_fingerprint_cache: OrderedDict[str, Any] = OrderedDict()


def _cache_get(sha256: str):
    if sha256 in _fingerprint_cache:
        _fingerprint_cache.move_to_end(sha256)  # LRU update
        return _fingerprint_cache[sha256]
    return None


def _cache_put(sha256: str, result: Any):
    if sha256 in _fingerprint_cache:
        _fingerprint_cache.move_to_end(sha256)
    else:
        if len(_fingerprint_cache) >= _CACHE_MAX:
            _fingerprint_cache.popitem(last=False)  # evict oldest
        _fingerprint_cache[sha256] = result

# ---- Logging Setup ----
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-24s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("reality-firewall")


# ---- Model Preloading ----
_models_loaded: list[str] = []
_device: str = "cpu"


def preload_models():
    """Preload models at startup to avoid cold-start latency."""
    global _models_loaded, _device

    logger.info("Preloading models...")

    # Face detector
    try:
        from feature_extractors.face_detector import _get_mtcnn
        mtcnn = _get_mtcnn()
        if mtcnn:
            _models_loaded.append("mtcnn_face_detector")
    except Exception as e:
        logger.warning(f"MTCNN preload failed: {e}")

    # Deepfake classifier
    try:
        from models.deepfake_classifier import get_model_info
        info = get_model_info()
        if info["loaded"]:
            _models_loaded.append(f"efficientnet_b4 ({info['device']})")
            _device = info["device"]
    except Exception as e:
        logger.warning(f"Deepfake classifier preload failed: {e}")

    logger.info(f"Models loaded: {_models_loaded if _models_loaded else ['none (heuristic-only mode)']}")


# ---- Application Lifecycle ----
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("=" * 60)
    logger.info("  Reality Firewall — AI Service v0.2.0")
    logger.info("  Forensic-Grade Media Authenticity Detection")
    logger.info("=" * 60)

    preload_models()

    logger.info(f"Server ready at http://{HOST}:{PORT}")
    logger.info(f"CORS origins: {CORS_ORIGINS}")

    yield  # Server runs here

    logger.info("Shutting down...")


# ---- FastAPI App ----
app = FastAPI(
    title="Reality Firewall — AI Service",
    description="Forensic-grade media authenticity detection API",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Endpoints ----

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Service health check."""
    return HealthResponse(
        status="ok",
        version="0.3.0",
        models_loaded=_models_loaded,
        device=_device,
    )


@app.post("/analyze")
async def analyze_media(file: UploadFile = File(...)):
    """
    Analyze uploaded media file for authenticity.

    Accepts: image (jpg/png/webp), video (mp4/webm), audio (wav/mp3/ogg)
    For large files (>5MB) or long videos, processes asynchronously and returns a `task_id`.
    Returns: Full forensic analysis with feature vector, signals, and verdict
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    logger.info(f"Analyzing: {file.filename} ({file.content_type})")
    start = time.perf_counter()

    try:
        raw_bytes = await file.read()

        if len(raw_bytes) == 0:
            raise HTTPException(status_code=400, detail="Empty file")

        if len(raw_bytes) > 100 * 1024 * 1024:  # 100MB limit
            raise HTTPException(status_code=413, detail="File too large (max 100MB)")

        # Phase 9: check fingerprint cache before running full pipeline
        sha256 = hashlib.sha256(raw_bytes).hexdigest()
        cached = _cache_get(sha256)
        if cached is not None:
            elapsed = time.perf_counter() - start
            logger.info(f"Cache hit for {file.filename} ({sha256[:8]}…) in {elapsed:.3f}s")
            return cached

        # Phase 13: Async processing for larger files (>5MB)
        size_mb = len(raw_bytes) / (1024 * 1024)
        if size_mb > 5.0 or (file.content_type and "video" in file.content_type):
            import tempfile
            from pathlib import Path
            
            # Save bytes to a secure tempfile to hand off to background worker
            fd, temp_path = tempfile.mkstemp(suffix=Path(file.filename).suffix)
            with os.fdopen(fd, 'wb') as f:
                f.write(raw_bytes)
                
            task_id = dispatch_video_analysis(temp_path, file.filename, file.content_type)
            logger.info(f"Dispatched large task {task_id} for {file.filename} ({size_mb:.1f}MB)")
            return JSONResponse(status_code=202, content={"task_id": task_id, "status": "PENDING"})

        # Synchronous execution for small images
        result = run_pipeline(raw_bytes, file.filename, file.content_type)
        _cache_put(sha256, result)

        elapsed = time.perf_counter() - start
        logger.info(
            f"Analysis complete: {file.filename} → "
            f"{result.verdict} ({result.fake_probability:.1%}) "
            f"in {elapsed:.1f}s"
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/task/{task_id}")
async def check_task_status(task_id: str):
    """Phase 13: Poll status of an asynchronous analysis task."""
    status_dict = get_task_status(task_id)
    
    # If done, we want to maybe cache it
    if status_dict["status"] == "SUCCESS" and status_dict.get("result"):
        # We can't easily hash the bytes here as we don't have them, 
        # so this specific run bypasses the fingerprint cache.
        pass

    return status_dict


@app.get("/stats")
async def get_stats():
    """Get analysis statistics from the log."""
    return get_log_stats()


@app.get("/logs")
async def get_logs(limit: int = 100, offset: int = 0):
    """Get analysis log entries for the forensic logs dashboard."""
    entries = get_log_entries(limit=limit, offset=offset)
    stats = get_log_stats()
    return {
        "entries": entries,
        "total": stats["total_analyses"],
        "limit": limit,
        "offset": offset,
    }


@app.post("/retrain")
async def retrain_meta_classifier(n_samples: int = 5000):
    """
    Trigger meta-classifier retraining with improved synthetic distributions.
    This deletes the old model and trains a fresh one with better calibration.
    """
    logger.info(f"Retraining meta-classifier with {n_samples} synthetic samples...")
    try:
        from ensemble.meta_classifier import train_model
        metrics = train_model(n_synthetic=n_samples)
        # Clear fingerprint cache so re-analyses use new model
        _fingerprint_cache.clear()
        logger.info(f"Retrain complete: {metrics}")
        return {"status": "ok", "metrics": metrics}
    except Exception as e:
        logger.error(f"Retrain failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Retrain failed: {str(e)}")


@app.get("/cache/stats")
async def cache_stats():
    """Return fingerprint cache stats (Phase 9)."""
    return {"cached_entries": len(_fingerprint_cache), "max_capacity": _CACHE_MAX}


@app.delete("/cache")
async def clear_cache():
    """Clear the fingerprint cache."""
    _fingerprint_cache.clear()
    return {"status": "cleared"}


# ---- Main Entry ----
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
