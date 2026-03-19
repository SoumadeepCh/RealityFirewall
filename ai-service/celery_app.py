"""
Reality Firewall — Phase 13: Async Video Queue
Configures Celery for background processing of large video files.
Requires Redis (or a simulated local queue fallback if Redis is unavailable).
"""
import os
import json
import logging
import asyncio
from typing import Optional
from pathlib import Path

# Configure logging for Celery processes
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)-7s | %(message)s"
)
logger = logging.getLogger("celery_tasks")

# ---- Fallback mechanism if Celery isn't installed ----
# To support local execution without forcing the user to install redis-server,
# we use a local in-memory dict + thread pool as a pseudo-celery fallback
# when REDIS_URL is not set or celery is missing.
REDIS_URL = os.getenv("REDIS_URL", "")

try:
    if not REDIS_URL:
        raise ImportError("No REDIS_URL provided, falling back to local threaded queue.")
    
    from celery import Celery
    
    celery_app = Celery(
        "reality_firewall",
        broker=REDIS_URL,
        backend=REDIS_URL
    )
    
    celery_app.conf.update(
        task_serializer='json',
        accept_content=['json'],
        result_serializer='json',
        timezone='UTC',
        enable_utc=True,
    )
    CELERY_AVAILABLE = True

except ImportError:
    logger.warning("Celery/Redis not detected. Using Local Background Queue fallback.")
    CELERY_AVAILABLE = False
    
    # Simple simulated queue
    import uuid
    import threading
    import datetime
    
    class LocalTaskQueue:
        def __init__(self):
            self.tasks = {}
            
        def apply_async(self, func, args=(), kwargs=None):
            if kwargs is None: kwargs = {}
            task_id = str(uuid.uuid4())
            self.tasks[task_id] = {
                "status": "PENDING",
                "result": None,
                "created_at": datetime.datetime.utcnow().isoformat()
            }
            
            def worker():
                self.tasks[task_id]["status"] = "PROCESSING"
                try:
                    res = func(*args, **kwargs)
                    self.tasks[task_id]["status"] = "SUCCESS"
                    self.tasks[task_id]["result"] = res
                except Exception as e:
                    logger.error(f"Local queue task {task_id} failed: {e}")
                    self.tasks[task_id]["status"] = "FAILURE"
                    self.tasks[task_id]["result"] = str(e)
                    
            thread = threading.Thread(target=worker, daemon=True)
            thread.start()
            
            # Return a mock AsyncResult
            class MockResult:
                def __init__(self, id): self.id = id
            return MockResult(task_id)

    local_queue = LocalTaskQueue()


# ---- The Core Task ----

def _run_pipeline_blocking(file_path: str, filename: str, content_type: str):
    """Blocking wrapper around the pipeline for background execution."""
    from pipeline import run_pipeline
    import time
    
    path = Path(file_path)
    if not path.exists():
        return {"error": f"File not found: {file_path}"}
        
    try:
        raw_bytes = path.read_bytes()
        
        # Simulate heavy lifting delay if it's too fast (for UI demonstration purposes)
        # In real life, large videos will naturally take 10-30 seconds.
        size_mb = len(raw_bytes) / (1024 * 1024)
        if size_mb < 5:
            time.sleep(3) # Ensure UI gets to show the "Processing..." state
            
        result = run_pipeline(raw_bytes, filename=filename, content_type=content_type)
        return result.model_dump()
        
    except Exception as e:
        logger.exception("Pipeline crashed during async task.")
        return {"error": str(e)}
    finally:
        # Cleanup temp file
        try:
            path.unlink(missing_ok=True)
        except Exception as e:
            logger.error(f"Failed to cleanup temp file {path}: {e}")


if CELERY_AVAILABLE:
    @celery_app.task(bind=True, name="process_video")
    def process_video_celery(self, file_path: str, filename: str, content_type: str):
        return _run_pipeline_blocking(file_path, filename, content_type)
else:
    def process_video_local(file_path: str, filename: str, content_type: str):
        return _run_pipeline_blocking(file_path, filename, content_type)


# ---- Entry point for main.py ----
def dispatch_video_analysis(file_path: str, filename: str, content_type: str) -> str:
    """Dispatches the video analysis task and returns the TASK_ID."""
    if CELERY_AVAILABLE:
        task = process_video_celery.apply_async(args=(file_path, filename, content_type))
        return task.id
    else:
        task = local_queue.apply_async(_run_pipeline_blocking, args=(file_path, filename, content_type))
        return task.id

def get_task_status(task_id: str) -> dict:
    """Gets the status of an async task."""
    if CELERY_AVAILABLE:
        from celery.result import AsyncResult
        res = AsyncResult(task_id, app=celery_app)
        if res.ready():
            return {"status": "SUCCESS" if res.successful() else "FAILURE", "result": res.result}
        return {"status": res.status, "result": None}
    else:
        # Local fallback
        if task_id in local_queue.tasks:
            t = local_queue.tasks[task_id]
            return {"status": t["status"], "result": t["result"]}
        return {"status": "UNKNOWN", "result": None}
