"""
Reality Firewall — AI Service
FastAPI application for forensic-grade media authenticity detection.

Run with:
    uvicorn main:app --reload --port 8000
"""
import logging
import sys
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS, HOST, PORT
from schemas import AnalysisResponse, HealthResponse
from pipeline import run_pipeline
from logging_service import get_log_stats, get_log_entries

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
        version="0.2.0",
        models_loaded=_models_loaded,
        device=_device,
    )


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_media(file: UploadFile = File(...)):
    """
    Analyze uploaded media file for authenticity.

    Accepts: image (jpg/png/webp), video (mp4/webm), audio (wav/mp3/ogg)
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

        result = run_pipeline(raw_bytes, file.filename, file.content_type)

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
        logger.error(f"Analysis failed for {file.filename}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


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


# ---- Main Entry ----
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
