"""
Reality Firewall — Ensemble Scoring Engine
Weighted ensemble scoring + Platt calibration + false positive governance.
"""
import math
from typing import Optional
from config import (
    FEATURE_BASELINES,
    PLATT_A,
    PLATT_B,
    RISK_HIGH_THRESHOLD,
    RISK_HARMFUL_THRESHOLD,
    RISK_SUSPICIOUS_THRESHOLD,
    INCONCLUSIVE_LOW,
    INCONCLUSIVE_HIGH,
)


def normalize_feature(key: str, value: float) -> float:
    """
    Normalize a feature value to an anomaly score using z-score against baseline.

    Returns:
        Anomaly score (0 = normal, higher = more anomalous)
    """
    baseline = FEATURE_BASELINES.get(key)
    if baseline is None:
        return 0.0

    std = max(baseline["std"], 1e-6)
    z_score = (value - baseline["mean"]) / std

    if baseline["higher_suspicious"]:
        return max(0.0, z_score)
    else:
        return max(0.0, -z_score)


def compute_ensemble_score(feature_vector: dict[str, Optional[float]]) -> float:
    """
    Compute weighted ensemble score from feature vector.

    Returns:
        Raw anomaly score (0 = likely real, higher = likely fake)
    """
    weighted_sum = 0.0
    total_weight = 0.0

    for key, value in feature_vector.items():
        if value is None:
            continue
        baseline = FEATURE_BASELINES.get(key)
        if baseline is None:
            continue

        anomaly_score = normalize_feature(key, value)
        weighted_sum += anomaly_score * baseline["weight"]
        total_weight += baseline["weight"]

    if total_weight <= 0:
        return 0.0

    return weighted_sum / total_weight


def platt_scale(raw_score: float, a: float = PLATT_A, b: float = PLATT_B) -> float:
    """
    Platt scaling calibration.
    P(fake) = 1 / (1 + exp(-(A*s + B)))
    """
    exponent = -(a * raw_score + b)
    # Clamp to avoid overflow
    exponent = max(-20.0, min(20.0, exponent))
    return 1.0 / (1.0 + math.exp(exponent))


def classify_risk(probability: float) -> dict:
    """
    Determine risk level with false positive governance.

    Includes 'inconclusive' zone for ambiguous results (0.4-0.6).
    """
    risk_score = round(probability * 100)

    # False positive governance: inconclusive zone
    if INCONCLUSIVE_LOW <= probability <= INCONCLUSIVE_HIGH:
        return {
            "risk_level": "inconclusive",
            "risk_score": risk_score,
            "verdict": "inconclusive",
        }

    if probability >= RISK_HIGH_THRESHOLD:
        risk_level = "high_risk"
        verdict = "manipulated"
    elif probability >= RISK_HARMFUL_THRESHOLD:
        risk_level = "harmful"
        verdict = "manipulated"
    elif probability >= RISK_SUSPICIOUS_THRESHOLD:
        risk_level = "suspicious"
        verdict = "suspicious"
    else:
        risk_level = "low"
        verdict = "authentic"

    return {
        "risk_level": risk_level,
        "risk_score": risk_score,
        "verdict": verdict,
    }


def generate_explanation(
    feature_vector: dict,
    signals: list[dict],
    fake_probability: float,
    media_type: str,
    verdict: str,
) -> str:
    """Generate human-readable explanation from analysis results."""
    parts = []

    if verdict == "inconclusive":
        parts.append(
            f"This {media_type} produced an ambiguous confidence score of "
            f"{fake_probability * 100:.0f}%. The analysis is inconclusive — "
            "additional evidence or manual review is recommended."
        )
    elif fake_probability > 0.7:
        parts.append(
            f"This {media_type} shows strong indicators of being AI-generated or manipulated."
        )
    elif fake_probability > 0.4:
        parts.append(
            f"This {media_type} shows some signs of potential manipulation."
        )
    else:
        parts.append(
            f"This {media_type} appears largely authentic based on multi-layer analysis."
        )

    # Top signals by confidence
    sorted_signals = sorted(signals, key=lambda s: s.get("confidence", 0), reverse=True)
    top = sorted_signals[:3]
    if top:
        parts.append(" ".join(s["description"] for s in top))

    # Feature summary
    sources = set(s.get("source", "heuristic") for s in signals)
    if "pretrained" in sources:
        parts.append("Analysis included pretrained deep learning models alongside forensic features.")
    else:
        active = [k for k, v in feature_vector.items() if v is not None]
        if active:
            parts.append(f"Analysis used {len(active)} forensic feature dimensions.")

    return " ".join(parts)


def score_analysis(
    feature_vector: dict[str, Optional[float]],
    signals: list[dict],
    media_type: str,
) -> dict:
    """
    Full scoring pipeline: feature vector → calibrated probability → risk + verdict.

    Phase 5: Uses trained LightGBM meta-classifier if available.
    Fallback: weighted ensemble + Platt scaling.

    Returns:
        dict with raw_score, fake_probability, risk_level, risk_score, verdict, explanation
    """
    scoring_method = "weighted_ensemble"

    # Phase 5: Try meta-classifier first
    try:
        from ensemble.meta_classifier import predict as meta_predict, is_available

        if is_available():
            meta_prob = meta_predict(feature_vector)
            if meta_prob is not None:
                fake_probability = meta_prob
                raw_score = meta_prob
                scoring_method = "lightgbm_meta_classifier"
    except ImportError:
        pass

    # Fallback: weighted ensemble + Platt scaling
    if scoring_method == "weighted_ensemble":
        raw_score = compute_ensemble_score(feature_vector)
        fake_probability = platt_scale(raw_score)

    risk = classify_risk(fake_probability)

    explanation = generate_explanation(
        feature_vector, signals, fake_probability, media_type, risk["verdict"]
    )

    if scoring_method == "lightgbm_meta_classifier":
        explanation += " Scoring used trained LightGBM meta-classifier."

    return {
        "raw_score": raw_score,
        "fake_probability": fake_probability,
        "calibrated_probability": fake_probability,
        "scoring_method": scoring_method,
        **risk,
        "explanation": explanation,
    }
