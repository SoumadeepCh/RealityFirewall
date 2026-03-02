"""
Reality Firewall — Phase 6: Virality & Risk Analysis Engine
Computes virality score, misinformation risk, emotional polarity, and societal impact.

No external API calls — fully heuristic/signal-driven so it works offline.
"""
import math
from typing import Optional
from schemas import ViralityAnalysis, SocietalImpact


# Signal categories that correlate with high-virality misinformation
_HIGH_VIRALITY_SIGNAL_IDS = {
    "model-efficientnet-anomaly",
    "freq-hfer-low",
    "vid-tiis-high",
    "vid-identity-spike",
    "vid-frame-inconsistency",
    "audio-spoof-detected",
    "noise-inconsistency",
    "tex-pdi-high",
}

_ALARMING_SIGNAL_IDS = {
    "model-efficientnet-anomaly",
    "audio-spoof-detected",
    "vid-tiis-high",
    "vid-identity-spike",
}

_POLITICAL_SIGNAL_IDS = {
    "vid-identity-spike",
    "vid-tiis-high",
    "model-efficientnet-anomaly",
}


def sigmoid(x: float) -> float:
    """Standard sigmoid, clamped."""
    x = max(-10.0, min(10.0, x))
    return 1.0 / (1.0 + math.exp(-x))


def compute_virality_score(
    fake_probability: float,
    media_type: str,
    signals: list[dict],
    risk_level: str,
) -> float:
    """
    Estimate virality risk 0–100.

    Higher deepfake probability + more high-impact signals = higher virality potential.
    Video tends to spread faster than audio/image.
    """
    base = fake_probability * 60.0  # probability drives base

    # Media type multiplier
    type_mult = {"video": 1.4, "audio": 1.1, "image": 1.0, "text": 0.9}.get(media_type, 1.0)

    # Signal count contribution
    signal_ids = {s.get("id", "") for s in signals}
    high_impact = len(signal_ids & _HIGH_VIRALITY_SIGNAL_IDS)
    signal_bonus = min(20.0, high_impact * 5.0)

    # Risk level multiplier
    risk_mult = {"high_risk": 1.3, "harmful": 1.15, "suspicious": 1.0, "inconclusive": 0.8, "low": 0.5}
    rmult = risk_mult.get(risk_level, 1.0)

    score = (base + signal_bonus) * type_mult * rmult
    return round(min(100.0, max(0.0, score)), 2)


def compute_emotional_polarity(signals: list[dict], fake_probability: float) -> float:
    """
    Estimate emotional polarity from -1 (calm/neutral) to +1 (highly alarming).

    High-confidence manipulation signals increase alarming polarity.
    """
    if not signals:
        return round((fake_probability - 0.5) * 0.4, 4)

    alarming_ids = {s.get("id", "") for s in signals} & _ALARMING_SIGNAL_IDS
    alarming_conf = sum(
        s.get("confidence", 0.0) for s in signals if s.get("id", "") in _ALARMING_SIGNAL_IDS
    )

    if not alarming_ids:
        polarity = (fake_probability - 0.3) * 0.5
    else:
        polarity = 0.3 + alarming_conf / max(1, len(alarming_ids)) * 0.7

    return round(min(1.0, max(-1.0, polarity)), 4)


def compute_political_sensitivity(signals: list[dict], fake_probability: float) -> float:
    """
    Estimate political sensitivity 0–1.

    Video deepfakes of people are most politically sensitive.
    """
    signal_ids = {s.get("id", "") for s in signals}
    political_hits = len(signal_ids & _POLITICAL_SIGNAL_IDS)
    base = fake_probability * 0.5 + political_hits * 0.15
    return round(min(1.0, max(0.0, base)), 4)


def compute_misinformation_risk(
    fake_probability: float,
    virality_score: float,
    emotional_polarity: float,
    political_sensitivity: float,
) -> tuple[str, float]:
    """
    Combine all signals into misinformation risk score + category.

    Returns: (category label, 0–1 score)
    """
    # Weighted composite
    combined = (
        fake_probability * 0.45
        + (virality_score / 100.0) * 0.25
        + max(0.0, emotional_polarity) * 0.15
        + political_sensitivity * 0.15
    )
    score = round(min(1.0, max(0.0, combined)), 4)

    if score >= 0.75:
        category = "high_risk"
    elif score >= 0.55:
        category = "harmful"
    elif score >= 0.35:
        category = "suspicious"
    else:
        category = "low"

    return category, score


def compute_societal_impact(
    fake_probability: float,
    virality_score: float,
    emotional_polarity: float,
    signals: list[dict],
) -> SocietalImpact:
    """
    Estimate three societal harm dimensions:
    - Polarization potential
    - Panic potential
    - Reputation damage likelihood
    """
    signal_ids = {s.get("id", "") for s in signals}
    political_count = len(signal_ids & _POLITICAL_SIGNAL_IDS)

    polarization = round(min(1.0, fake_probability * 0.5 + political_count * 0.18 + max(0, emotional_polarity) * 0.2), 4)
    panic = round(min(1.0, max(0, emotional_polarity) * 0.5 + (virality_score / 100) * 0.3 + fake_probability * 0.2), 4)
    reputation = round(min(1.0, fake_probability * 0.6 + (virality_score / 100) * 0.2 + political_count * 0.1), 4)

    return SocietalImpact(
        polarization_potential=polarization,
        panic_potential=panic,
        reputation_damage_likelihood=reputation,
    )


def compute_risk_factors(
    fake_probability: float,
    media_type: str,
    virality_score: float,
    emotional_polarity: float,
    signals: list[dict],
) -> list[str]:
    """Generate human-readable list of risk factors."""
    factors = []
    if fake_probability > 0.7:
        factors.append("High AI-manipulation probability detected")
    elif fake_probability > 0.4:
        factors.append("Moderate manipulation indicators present")

    if media_type == "video" and fake_probability > 0.4:
        factors.append("Video deepfakes spread 3–4× faster than images")

    if virality_score > 60:
        factors.append("Signal profile matches high-virality misinformation patterns")

    signal_ids = {s.get("id", "") for s in signals}
    if "vid-identity-spike" in signal_ids or "vid-tiis-high" in signal_ids:
        factors.append("Face-swap or identity manipulation detected — high reputation damage risk")

    if "audio-spoof-detected" in signal_ids:
        factors.append("Synthetic audio detected — voice cloning is high-trust attack vector")

    if emotional_polarity > 0.5:
        factors.append("Content profile suggests high emotional/alarming framing")

    return factors


def analyze_virality(
    fake_probability: float,
    media_type: str,
    risk_level: str,
    signals: list[dict],
) -> ViralityAnalysis:
    """
    Full Phase 6 virality & risk analysis pipeline.

    Args:
        fake_probability: Calibrated fake probability 0–1
        media_type: image | video | audio | text
        risk_level: From classifier (low/suspicious/harmful/high_risk/inconclusive)
        signals: List of detection signal dicts

    Returns:
        ViralityAnalysis pydantic model
    """
    virality_score = compute_virality_score(fake_probability, media_type, signals, risk_level)
    emotional_polarity = compute_emotional_polarity(signals, fake_probability)
    political_sensitivity = compute_political_sensitivity(signals, fake_probability)
    misinfo_category, misinfo_score = compute_misinformation_risk(
        fake_probability, virality_score, emotional_polarity, political_sensitivity
    )
    societal_impact = compute_societal_impact(fake_probability, virality_score, emotional_polarity, signals)
    risk_factors = compute_risk_factors(fake_probability, media_type, virality_score, emotional_polarity, signals)

    return ViralityAnalysis(
        virality_score=virality_score,
        misinformation_risk=misinfo_category,
        misinformation_risk_score=misinfo_score,
        emotional_polarity=emotional_polarity,
        political_sensitivity=political_sensitivity,
        societal_impact=societal_impact,
        risk_factors=risk_factors,
    )
