"""
Reality Firewall — Metadata & EXIF Feature Extractor
Parses EXIF data, detects editing software, compression anomalies.
"""
import io
from PIL import Image
from typing import Optional


def analyze_metadata(image: Image.Image, raw_bytes: bytes) -> dict:
    """
    Analyze image metadata for forensic signals.

    Checks:
    - EXIF presence and content
    - Known editing software signatures
    - Compression anomaly indicators
    - Creation date consistency

    Args:
        image: PIL Image
        raw_bytes: Raw file bytes

    Returns:
        dict with metadata findings and signals
    """
    exif_present = False
    software_used = None
    has_been_edited = False
    compression_anomalies = False
    creation_date = None
    signals = []

    # ---- EXIF Analysis ----
    try:
        import exifread
        tags = exifread.process_file(io.BytesIO(raw_bytes), details=False)

        if tags:
            exif_present = True

            # Check for software tag
            software_tags = ["Image Software", "EXIF Software"]
            for tag_name in software_tags:
                if tag_name in tags:
                    sw = str(tags[tag_name])
                    software_used = sw

                    editing_signatures = [
                        "photoshop", "gimp", "lightroom", "snapseed",
                        "faceapp", "remini", "deepfake", "reface",
                        "fotoforensics", "stable diffusion", "dall-e",
                        "midjourney", "adobe",
                    ]
                    for sig in editing_signatures:
                        if sig in sw.lower():
                            has_been_edited = True
                            break

            # Check creation date
            date_tags = ["EXIF DateTimeOriginal", "Image DateTime"]
            for tag_name in date_tags:
                if tag_name in tags:
                    creation_date = str(tags[tag_name])
                    break

    except ImportError:
        # exifread not installed — try PIL EXIF
        try:
            exif_data = image.getexif()
            if exif_data:
                exif_present = True
                # Tag 305 = Software
                if 305 in exif_data:
                    software_used = str(exif_data[305])
                # Tag 36867 = DateTimeOriginal
                if 36867 in exif_data:
                    creation_date = str(exif_data[36867])
        except Exception:
            pass
    except Exception:
        pass

    # ---- Compression Analysis ----
    # Check for JPEG re-compression indicators
    if raw_bytes[:2] == b'\xff\xd8':  # JPEG
        quant_table_count = 0
        i = 0
        while i < len(raw_bytes) - 1:
            if raw_bytes[i] == 0xFF and raw_bytes[i + 1] == 0xDB:
                quant_table_count += 1
            i += 1
            if i > 5000:  # Only scan header area
                break

        if quant_table_count > 2:
            compression_anomalies = True

    # ---- Compute metadata anomaly score ----
    metadata_score = 0.0
    if not exif_present:
        metadata_score += 0.3
    if has_been_edited:
        metadata_score += 0.4
    if compression_anomalies:
        metadata_score += 0.2
    if not creation_date:
        metadata_score += 0.1

    # ---- Generate Signals ----
    if not exif_present:
        signals.append({
            "id": "meta-exif-stripped",
            "name": "EXIF Metadata Stripped",
            "category": "metadata",
            "confidence": 0.65,
            "description": (
                "Image metadata has been intentionally removed, "
                "common in manipulated or AI-generated media."
            ),
            "severity": "suspicious",
            "metric_value": None,
            "source": "heuristic",
        })

    if has_been_edited:
        signals.append({
            "id": "meta-edited",
            "name": "Editing Software Detected",
            "category": "metadata",
            "confidence": 0.7,
            "description": (
                f"Image shows signs of editing"
                f"{f' via {software_used}' if software_used else ''}."
            ),
            "severity": "suspicious",
            "metric_value": None,
            "source": "heuristic",
        })

    if compression_anomalies:
        signals.append({
            "id": "meta-recompression",
            "name": "Re-Compression Detected",
            "category": "metadata",
            "confidence": 0.55,
            "description": (
                "Multiple compression layers detected, suggesting "
                "image has been re-saved or manipulated."
            ),
            "severity": "low",
            "metric_value": None,
            "source": "heuristic",
        })

    return {
        "exif_present": exif_present,
        "has_been_edited": has_been_edited,
        "compression_anomalies": compression_anomalies,
        "software_used": software_used,
        "creation_date": creation_date,
        "metadata_score": metadata_score,
        "signals": signals,
    }
