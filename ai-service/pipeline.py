"""
Reality Firewall — Pipeline Orchestrator
Routes media through detection layers, assembles features, scores results.
"""
import time
import logging
from typing import Optional

from PIL import Image

from media_router import route_media
from feature_extractors.frequency import compute_frequency_metrics
from feature_extractors.texture import compute_texture_metrics
from feature_extractors.metadata import analyze_metadata
from feature_extractors.face_detector import crop_faces_for_classification
from feature_extractors.identity import compute_identity_drift
from feature_extractors.audio import analyze_audio
from feature_extractors.noise_analysis import analyze_noise
from feature_extractors.optical_flow import compute_flow_metrics
from models.deepfake_classifier import predict_deepfake, get_model_info
from models.audio_spoof_detector import predict_spoof as predict_audio_spoof
from ensemble.scoring import score_analysis
from logging_service import log_analysis, compute_media_hash
from schemas import (
    AnalysisResponse,
    FeatureVector,
    DetectionSignal,
    SegmentAuthenticity,
    ChangePoint,
    MediaInfo,
    MetadataEvidence,
)

logger = logging.getLogger(__name__)


def run_pipeline(raw_bytes: bytes, filename: str, content_type: Optional[str] = None) -> AnalysisResponse:
    """
    Main forensic detection pipeline.

    Architecture:
        Layer 1: Pretrained Deepfake Backbone (EfficientNet)
        Layer 2: Forensic Feature Extractors (HFER, SVD, PDI, ETK, PVSS, FRD)
        Layer 3: Meta-Classifier (ensemble scoring)
        Layer 4: Calibration + Risk Model (Platt scaling + governance)

    Args:
        raw_bytes: Raw file bytes
        filename: Original filename
        content_type: MIME type

    Returns:
        AnalysisResponse with all detection results
    """
    start_time = time.perf_counter()

    # ---- Step 1: Route and preprocess media ----
    media = route_media(raw_bytes, filename, content_type)
    media_type = media["media_type"]

    # Initialize feature vector
    feature_dict = {
        "hfer": None, "svd": None, "pdi": None,
        "tiis": None, "fav": None,
        "etk": None, "pvss": None, "frd": None,
        "deepfake_prob": None,
        "identity_drift": None,
        "metadata_score": None,
        "audio_spoof_prob": None,
        "noise_score": None,
        "spectral_peak_score": None,
        "frame_consistency": None,
    }
    signals = []
    segments = []
    change_points = []
    faces_detected = 0
    analysis_level = "level1_lightweight"
    model_versions = {}

    # ---- Step 2: Layer 1 — Pretrained model (image / video frames) ----
    if media_type == "image" and "image" in media:
        image: Image.Image = media["image"]

        # Face detection
        faces = crop_faces_for_classification(image)
        faces_detected = len(faces)

        if faces:
            # Run deepfake classifier on largest face
            largest_face = max(faces, key=lambda f: (f["box"][2] - f["box"][0]) * (f["box"][3] - f["box"][1]))
            df_result = predict_deepfake(largest_face["face_tensor_ready"])

            if df_result["model_available"]:
                feature_dict["deepfake_prob"] = df_result["deepfake_prob"]
                signals.extend(df_result["signals"])
                model_versions["deepfake_classifier"] = "efficientnet_b4_imagenet"
                analysis_level = "level2_deep_spatial"

    elif media_type == "video" and "frames" in media and media["frames"]:
        frames = media["frames"]

        # Run deepfake classifier on face crops from sample frames
        all_face_crops = []
        per_frame_probs = []
        df_result_available = False
        for i, frame in enumerate(frames[:10]):  # Sample first 10 frames
            faces = crop_faces_for_classification(frame)
            if faces:
                faces_detected = max(faces_detected, len(faces))
                largest = max(faces, key=lambda f: (f["box"][2] - f["box"][0]) * (f["box"][3] - f["box"][1]))
                all_face_crops.append(largest["face_tensor_ready"])

                # Classify first detected face
                if i == 0:
                    df_result = predict_deepfake(largest["face_tensor_ready"])
                    if df_result["model_available"]:
                        per_frame_probs.append(df_result["deepfake_prob"])
                        signals.extend(df_result["signals"])
                        model_versions["deepfake_classifier"] = "efficientnet_b4_imagenet"
                        df_result_available = True
                elif df_result_available:
                    # Improvement 2: Multi-frame classification
                    df_result_n = predict_deepfake(largest["face_tensor_ready"])
                    if df_result_n["model_available"] and df_result_n["deepfake_prob"] is not None:
                        per_frame_probs.append(df_result_n["deepfake_prob"])

        # Improvement 2: Aggregate multi-frame deepfake probabilities
        if per_frame_probs:
            import numpy as np
            feature_dict["deepfake_prob"] = float(np.mean(per_frame_probs))
            # Frame consistency: low std = consistent (real or consistently fake)
            # Very high std = inconsistent → suspicious
            if len(per_frame_probs) >= 2:
                frame_std = float(np.std(per_frame_probs))
                feature_dict["frame_consistency"] = min(1.0, frame_std * 3.0)
                if frame_std > 0.15:
                    signals.append({
                        "id": "vid-frame-inconsistency",
                        "name": "Frame-Level Prediction Inconsistency",
                        "category": "temporal",
                        "confidence": min(0.85, frame_std * 3),
                        "description": (
                            f"Deepfake probability varies across {len(per_frame_probs)} frames "
                            f"(std={frame_std:.3f}). Inconsistent scores suggest partial manipulation."
                        ),
                        "severity": "suspicious",
                        "metric_value": frame_std,
                        "source": "pretrained",
                    })

        # Identity drift across frames (Phase 3: pretrained embeddings)
        if len(all_face_crops) >= 2:
            drift_result = compute_identity_drift(all_face_crops)
            feature_dict["tiis"] = drift_result["tiis"]
            feature_dict["identity_drift"] = drift_result.get("identity_drift", drift_result["tiis"])
            signals.extend(drift_result["signals"])
            model_used = drift_result.get("model_used", "histogram_fallback")
            if model_used != "histogram_fallback":
                model_versions["identity_encoder"] = model_used
            analysis_level = "level3_temporal_crossmodal"

        # Per-frame frequency analysis → segment authenticity
        for seg_idx, frame in enumerate(frames):
            freq_result = compute_frequency_metrics(frame)
            authenticity = 1.0 - min(1.0, max(0.0, (0.15 - freq_result["hfer"]) / 0.15))
            start_t = seg_idx / max(1, len(frames)) * media.get("duration", len(frames))
            end_t = (seg_idx + 1) / max(1, len(frames)) * media.get("duration", len(frames))

            segments.append(SegmentAuthenticity(
                segment_index=seg_idx,
                start_time=round(start_t, 2),
                end_time=round(end_t, 2),
                authenticity_score=round(authenticity, 4),
                flagged=authenticity < 0.4,
            ))

    # ---- Step 3: Layer 2 — Forensic Feature Extractors ----
    if media_type == "image" and "image" in media:
        image = media["image"]

        # Frequency analysis
        freq = compute_frequency_metrics(image)
        feature_dict["hfer"] = freq["hfer"]
        feature_dict["svd"] = freq["svd"]
        feature_dict["spectral_peak_score"] = freq.get("spectral_peak_score")
        signals.extend(freq["signals"])

        # Texture consistency
        tex = compute_texture_metrics(image)
        feature_dict["pdi"] = tex["pdi"]
        signals.extend(tex["signals"])

        # Metadata
        meta = analyze_metadata(image, raw_bytes)
        feature_dict["metadata_score"] = meta["metadata_score"]
        signals.extend(meta["signals"])

        # Improvement 3: Noise residual analysis
        import numpy as np
        image_arr = np.array(image.convert("RGB"))
        noise_result = analyze_noise(image_arr)
        if noise_result["noise_score"] is not None:
            feature_dict["noise_score"] = noise_result["noise_score"]
            signals.extend(noise_result["signals"])

        analysis_level = "level2_deep_spatial"

    elif media_type == "video" and "frames" in media and media["frames"]:
        # Frequency on first frame (representative)
        first_frame = media["frames"][0]
        freq = compute_frequency_metrics(first_frame)
        feature_dict["hfer"] = freq["hfer"]
        feature_dict["svd"] = freq["svd"]
        feature_dict["spectral_peak_score"] = freq.get("spectral_peak_score")
        signals.extend(freq["signals"])

        # Noise analysis on first frame
        import numpy as np
        first_arr = np.array(first_frame.convert("RGB"))
        noise_result = analyze_noise(first_arr)
        if noise_result["noise_score"] is not None:
            feature_dict["noise_score"] = noise_result["noise_score"]
            signals.extend(noise_result["signals"])

        # Improvement 5: Optical flow
        flow_result = compute_flow_metrics(media["frames"])
        if flow_result["fav"] is not None:
            feature_dict["fav"] = flow_result["fav"]
            signals.extend(flow_result["signals"])

    elif media_type == "audio" and media.get("samples") is not None:
        sr = media.get("sr", 22050)
        samples = media["samples"]

        # Heuristic audio analysis (ETK, PVSS, FRD)
        audio_result = analyze_audio(samples, sr)
        feature_dict["etk"] = audio_result["etk"]
        feature_dict["pvss"] = audio_result["pvss"]
        feature_dict["frd"] = audio_result["frd"]
        signals.extend(audio_result["signals"])

        # Phase 4: Pretrained audio spoof model
        spoof_result = predict_audio_spoof(samples, sr)
        if spoof_result.get("audio_spoof_prob") is not None:
            feature_dict["audio_spoof_prob"] = spoof_result["audio_spoof_prob"]
            signals.extend(spoof_result["signals"])
            model_versions["audio_spoof"] = spoof_result.get("model_used", "mfcc_feature_analysis")

        analysis_level = "level2_deep_spatial"

    # ---- Step 4: Layer 3+4 — Meta-Classifier + Calibration ----
    scoring_result = score_analysis(feature_dict, signals, media_type)

    processing_time_ms = int((time.perf_counter() - start_time) * 1000)

    # ---- Step 5: Assemble response ----
    # Build FeatureVector
    fv = FeatureVector(
        hfer=feature_dict["hfer"],
        svd=feature_dict["svd"],
        pdi=feature_dict["pdi"],
        tiis=feature_dict["tiis"],
        fav=feature_dict["fav"],
        etk=feature_dict["etk"],
        pvss=feature_dict["pvss"],
        frd=feature_dict["frd"],
        deepfake_prob=feature_dict["deepfake_prob"],
        identity_drift=feature_dict["identity_drift"],
        metadata_score=feature_dict["metadata_score"],
        audio_spoof_prob=feature_dict["audio_spoof_prob"],
        noise_score=feature_dict["noise_score"],
        spectral_peak_score=feature_dict["spectral_peak_score"],
        frame_consistency=feature_dict["frame_consistency"],
    )

    # Build detection signals
    detection_signals = [
        DetectionSignal(**{k: v for k, v in s.items() if k in DetectionSignal.model_fields})
        for s in signals
    ]

    # Determine manipulation type
    manipulation_type = _determine_manipulation_type(signals, feature_dict)

    # Media info
    media_info = MediaInfo(
        filename=filename,
        media_type=media_type,
        file_size=media["file_size"],
        mime_type=media.get("mime_type", "application/octet-stream"),
        width=media.get("width"),
        height=media.get("height"),
        duration=media.get("duration"),
        faces_detected=faces_detected,
    )

    # Metadata evidence
    if media_type == "image":
        try:
            meta_result = analyze_metadata(media.get("image", Image.new("RGB", (1, 1))), raw_bytes)
            metadata_evidence = MetadataEvidence(
                exif_present=meta_result["exif_present"],
                has_been_edited=meta_result["has_been_edited"],
                compression_anomalies=meta_result["compression_anomalies"],
                software_used=meta_result.get("software_used"),
                creation_date=meta_result.get("creation_date"),
            )
        except Exception:
            metadata_evidence = MetadataEvidence()
    else:
        metadata_evidence = MetadataEvidence()

    # ---- Step 6: Forensic logging ----
    media_hash = compute_media_hash(raw_bytes)
    log_analysis(
        media_hash=media_hash,
        filename=filename,
        media_type=media_type,
        file_size=media["file_size"],
        feature_vector=feature_dict,
        signals=signals,
        fake_probability=scoring_result["fake_probability"],
        risk_level=scoring_result["risk_level"],
        verdict=scoring_result["verdict"],
        processing_time_ms=processing_time_ms,
        model_versions=model_versions,
        analysis_level=analysis_level,
    )

    return AnalysisResponse(
        id=f"analysis-{media_hash[:12]}",
        media=media_info,
        fake_probability=round(scoring_result["fake_probability"], 4),
        calibrated_probability=round(scoring_result["calibrated_probability"], 4),
        risk_level=scoring_result["risk_level"],
        risk_score=scoring_result["risk_score"],
        verdict=scoring_result["verdict"],
        analysis_level=analysis_level,
        early_exit=False,
        feature_vector=fv,
        signals=detection_signals,
        explanation=scoring_result["explanation"],
        manipulation_type=manipulation_type,
        metadata_evidence=metadata_evidence,
        segments=segments,
        change_points=change_points,
        processing_time_ms=processing_time_ms,
        model_versions=model_versions,
    )


def _determine_manipulation_type(signals: list[dict], feature_dict: dict) -> Optional[str]:
    """Determine the most likely manipulation type from signals."""
    ids = [s["id"] for s in signals]

    if "model-efficientnet-anomaly" in ids and feature_dict.get("deepfake_prob") and feature_dict["deepfake_prob"] > 0.5:
        return "AI-Generated (CNN Feature Anomaly)"
    if "freq-hfer-low" in ids and feature_dict.get("hfer") is not None and feature_dict["hfer"] < 0.1:
        return "AI-Generated (GAN Signature)"
    if "vid-tiis-high" in ids:
        return "Deepfake Video (Identity Instability)"
    if "vid-identity-spike" in ids:
        return "Deepfake Video (Face Swap Transition)"
    if "audio-spoof-detected" in ids:
        return "Synthetic Audio (Spoof Model Detection)"
    if "audio-pvss-smooth" in ids:
        return "Synthetic Audio (TTS)"
    if "tex-pdi-high" in ids:
        return "Composited / Face-Swapped"
    return None
