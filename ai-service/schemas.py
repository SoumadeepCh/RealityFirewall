"""
Reality Firewall — Pydantic Schemas
Request/response models for the API.
"""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional


class FeatureVector(BaseModel):
    """AMAF Feature Vector + model outputs."""
    hfer: Optional[float] = None
    svd: Optional[float] = None
    pdi: Optional[float] = None
    tiis: Optional[float] = None
    fav: Optional[float] = None
    etk: Optional[float] = None
    pvss: Optional[float] = None
    frd: Optional[float] = None
    # Phase 2: pretrained model outputs
    deepfake_prob: Optional[float] = None
    identity_drift: Optional[float] = None
    metadata_score: Optional[float] = None
    # Phase 4: pretrained audio model
    audio_spoof_prob: Optional[float] = None
    # Prediction improvements
    noise_score: Optional[float] = None
    spectral_peak_score: Optional[float] = None
    frame_consistency: Optional[float] = None


class DetectionSignal(BaseModel):
    """Individual detection signal."""
    id: str
    name: str
    category: str  # visual, temporal, spectral, semantic, metadata, model
    confidence: float = Field(ge=0, le=1)
    description: str
    severity: str  # low, suspicious, harmful, high_risk
    metric_value: Optional[float] = None
    source: str = "heuristic"  # heuristic, pretrained, ensemble


class SegmentAuthenticity(BaseModel):
    """Per-segment authenticity score (video/audio)."""
    segment_index: int
    start_time: float
    end_time: float
    authenticity_score: float = Field(ge=0, le=1)
    flagged: bool = False


class ChangePoint(BaseModel):
    """CUSUM change-point detection result."""
    timestamp: float
    segment_index: int
    cusum_value: float
    direction: str  # increase, decrease


class MediaInfo(BaseModel):
    """Metadata about the analyzed media."""
    filename: str
    media_type: str  # image, video, audio
    file_size: int
    mime_type: str
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None
    faces_detected: int = 0


class MetadataEvidence(BaseModel):
    """EXIF and compression metadata findings."""
    exif_present: bool = False
    has_been_edited: bool = False
    compression_anomalies: bool = False
    software_used: Optional[str] = None
    original_source: Optional[str] = None
    creation_date: Optional[str] = None


class AnalysisResponse(BaseModel):
    """Full analysis result returned by the API."""
    id: str
    media: MediaInfo
    fake_probability: float = Field(ge=0, le=1)
    calibrated_probability: float = Field(ge=0, le=1)
    risk_level: str  # low, suspicious, harmful, high_risk, inconclusive
    risk_score: int = Field(ge=0, le=100)
    verdict: str  # authentic, suspicious, manipulated, inconclusive
    analysis_level: str  # level1_lightweight, level2_deep_spatial, level3_temporal_crossmodal
    early_exit: bool = False

    feature_vector: FeatureVector
    signals: list[DetectionSignal] = []
    explanation: str = ""
    manipulation_type: Optional[str] = None

    metadata_evidence: MetadataEvidence = MetadataEvidence()

    # Timeline data
    segments: list[SegmentAuthenticity] = []
    change_points: list[ChangePoint] = []

    processing_time_ms: int = 0
    model_versions: dict[str, str] = {}


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "ok"
    version: str = "0.2.0"
    models_loaded: list[str] = []
    device: str = "cpu"
