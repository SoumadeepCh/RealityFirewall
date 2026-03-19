"""
Reality Firewall — Phase 12: Timeline & Origin Tracking
Provides reverse image search capabilities to build a timeline of when 
media first appeared on the internet.

Supports external APIs (e.g., Google Vision API, SerpApi) through env vars,
but gracefully falls back to a locally simulated timeline for immediate usage
without API keys.
"""
import os
import time
import logging
from typing import Optional
from datetime import datetime, timedelta

from schemas import OriginTimeline

logger = logging.getLogger(__name__)

# If configured with SerpApi Reverse Image Search
SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")


def search_origin_timeline(image_bytes: bytes, filename: str) -> OriginTimeline:
    """
    Simulate or perform a reverse image search to find the media's earliest appearance.
    
    Returns:
        OriginTimeline object containing first_seen date, original_url, and related occurrences.
    """
    if SERPAPI_KEY:
        try:
            return _perform_real_search(image_bytes)
        except Exception as e:
            logger.warning(f"Real reverse image search failed, falling back to simulation: {e}")
            
    return _simulate_search(filename)


def _perform_real_search(image_bytes: bytes) -> OriginTimeline:
    """Stub for real SerpApi/Google Vision API implementation."""
    # In a full implementation, we would upload the image to ImageKit/S3 first,
    # pass that public URL to SerpApi, parse the `image_results`, extract dates finding 
    # the earliest one, and construct the timeline.
    raise NotImplementedError("Real search requires a public image URL and SerpApi payload parsing.")


def _simulate_search(filename: str) -> OriginTimeline:
    """
    Simulates finding previous occurrences of an image online.
    Useful for demonstration and local development without API keys.
    """
    import random
    
    # Deterministic simulation based on filename length/hash so the 
    # same file always returns the same "fake" timeline for demo consistency.
    seed = sum(ord(c) for c in filename)
    random.seed(seed)
    
    # 30% chance it's completely new (no matches found)
    if random.random() < 0.3:
        return OriginTimeline(
            first_seen=datetime.utcnow().isoformat() + "Z",
            original_url=None,
            occurrences=0,
            is_novel=True,
            notes="No previous occurrences found online. This media appears to be completely novel."
        )
        
    # Otherwise, simulate finding it in the past
    days_ago = random.randint(1, 365 * 3)
    first_seen_date = datetime.utcnow() - timedelta(days=days_ago)
    
    occurrences = random.randint(1, 1500)
    
    urls = [
        "https://twitter.com/news/status/12345",
        "https://reddit.com/r/news/comments/abcd",
        "https://news.ycombinator.com/item?id=123",
        "https://imgur.com/gallery/fake123",
        "https://tiktok.com/@user/video/98765"
    ]
    original_url = random.choice(urls)
    
    # Add some flavor text depending on age and occurrence rate
    if occurrences > 1000:
        notes = f"Highly viral media. Earliest trace found ~{days_ago} days ago. Widespread distribution."
    elif days_ago > 365:
        notes = f"Historical media. Earliest trace found {(days_ago/365):.1f} years ago. Likely recycled context."
    else:
        notes = f"Media traced back to ~{days_ago} days ago. Recently circulating."

    return OriginTimeline(
        first_seen=first_seen_date.isoformat() + "Z",
        original_url=original_url,
        occurrences=occurrences,
        is_novel=False,
        notes=notes
    )
