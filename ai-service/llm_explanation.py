"""
Reality Firewall — Phase 4: LLM Explanation Layer
Generates structured, human-readable explanations for the forensic analysis.

Uses Google Gemini if GEMINI_API_KEY is available.
Falls back to a high-quality rule-based explanation when no API key is set.
"""
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_GEMINI_AVAILABLE = False
_gemini_model = None


def _init_gemini():
    """Lazy-initialize Gemini client."""
    global _GEMINI_AVAILABLE, _gemini_model
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return False
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        _gemini_model = genai.GenerativeModel("gemini-1.5-flash")
        _GEMINI_AVAILABLE = True
        logger.info("Gemini LLM explanation layer initialized (gemini-1.5-flash)")
        return True
    except Exception as e:
        logger.warning(f"Gemini init failed: {e}")
        return False


def _build_gemini_prompt(
    media_type: str,
    fake_probability: float,
    verdict: str,
    signals: list[dict],
    manipulation_type: Optional[str],
    virality_score: float,
    misinfo_risk: str,
) -> str:
    signal_summary = "\n".join(
        f"  - {s.get('name', '?')}: {s.get('description', '')} (confidence: {s.get('confidence', 0):.0%})"
        for s in sorted(signals, key=lambda x: x.get("confidence", 0), reverse=True)[:5]
    )

    return f"""You are a forensic media analyst AI. Provide a concise, expert-level explanation (2–3 paragraphs, plain English) for this media authenticity analysis result.

Media Type: {media_type.upper()}
Verdict: {verdict.upper()} ({fake_probability:.0%} probability of manipulation)
Manipulation Type: {manipulation_type or 'Undetermined'}
Virality Risk Score: {virality_score:.0f}/100
Misinformation Risk Category: {misinfo_risk.upper()}

Top Detection Signals:
{signal_summary or '  (none detected)'}

Write your explanation for a non-technical audience. Be specific about what was found, what it means, and what action the reader should take. Do not use bullet points — write in paragraphs. Do not start with "I" or repeat "This analysis"."""


def _rule_based_explanation(
    media_type: str,
    fake_probability: float,
    verdict: str,
    signals: list[dict],
    manipulation_type: Optional[str],
    virality_score: float,
    misinfo_risk: str,
) -> str:
    """
    High-quality rule-based explanation fallback.
    Generates a 2-paragraph forensic narrative without any LLM calls.
    """
    parts = []

    # Paragraph 1: overall verdict
    if verdict == "inconclusive":
        parts.append(
            f"This {media_type} produced an ambiguous authenticity score of {fake_probability:.0%}. "
            "Our forensic pipeline detected some anomalies but does not have sufficient confidence to make a definitive determination. "
            "Manual review by a trained analyst or submission of higher-quality source material is recommended."
        )
    elif fake_probability >= 0.75:
        mt = f" The manipulation pattern is consistent with {manipulation_type}." if manipulation_type else ""
        parts.append(
            f"This {media_type} shows strong forensic indicators of AI generation or digital manipulation, "
            f"with a scored probability of {fake_probability:.0%}.{mt} "
            "Multiple independent detection layers flagged anomalous patterns that are uncommon in authentic media."
        )
    elif fake_probability >= 0.45:
        parts.append(
            f"This {media_type} shows moderate signs of potential manipulation ({fake_probability:.0%} probability). "
            "Some forensic features deviate from baseline distributions observed in authentic media, "
            "but the evidence is not conclusive enough to assert manipulation with high confidence."
        )
    else:
        parts.append(
            f"This {media_type} appears largely authentic based on our multi-layer forensic analysis "
            f"({fake_probability:.0%} manipulation probability). "
            "Frequency-domain, texture, and identity consistency checks did not reveal significant anomalies."
        )

    # Paragraph 2: signal detail + virality
    sorted_signals = sorted(signals, key=lambda s: s.get("confidence", 0), reverse=True)
    top = sorted_signals[:3]
    if top:
        signal_text = " ".join(s.get("description", "") for s in top)
        parts.append(signal_text)

    if virality_score > 60:
        parts.append(
            f"The virality risk score of {virality_score:.0f}/100 indicates this content has the characteristics "
            "of media that spreads rapidly, which amplifies the potential societal impact if misrepresented. "
            f"Misinformation risk is rated as '{misinfo_risk.replace('_', ' ')}'."
        )
    elif virality_score > 30:
        parts.append(
            f"The misinformation risk is rated as '{misinfo_risk.replace('_', ' ')}' with a virality score of {virality_score:.0f}/100."
        )

    return " ".join(parts)


def generate_llm_explanation_sync(
    media_type: str,
    fake_probability: float,
    verdict: str,
    signals: list,
    manipulation_type: Optional[str],
    virality_score: float,
    misinfo_risk: str,
) -> Optional[str]:
    """
    Synchronous wrapper for use in non-async contexts (e.g., pipeline.py).
    Calls the rule-based fallback directly to avoid event loop conflicts.
    """
    global _GEMINI_AVAILABLE, _gemini_model

    # Try Gemini inline if available (sync call to generative model)
    if not _GEMINI_AVAILABLE:
        _init_gemini()

    if _GEMINI_AVAILABLE and _gemini_model:
        try:
            prompt = _build_gemini_prompt(
                media_type, fake_probability, verdict, signals,
                manipulation_type, virality_score, misinfo_risk
            )
            response = _gemini_model.generate_content(prompt)
            text = response.text.strip()
            if text:
                logger.info("LLM explanation generated via Gemini (sync)")
                return text
        except Exception as e:
            logger.warning(f"Gemini sync explanation failed, using fallback: {e}")

    return _rule_based_explanation(
        media_type, fake_probability, verdict, signals,
        manipulation_type, virality_score, misinfo_risk
    )


async def generate_llm_explanation(
    media_type: str,
    fake_probability: float,
    verdict: str,
    signals: list[dict],
    manipulation_type: Optional[str],
    virality_score: float,
    misinfo_risk: str,
) -> Optional[str]:
    """
    Generate LLM-powered explanation for analysis results.

    Uses Gemini if available; falls back to rule-based generation.
    Always returns a string (never None) so the frontend always has rich text.
    """
    global _GEMINI_AVAILABLE, _gemini_model

    # Try Gemini first
    if not _GEMINI_AVAILABLE:
        _init_gemini()

    if _GEMINI_AVAILABLE and _gemini_model:
        try:
            prompt = _build_gemini_prompt(
                media_type, fake_probability, verdict, signals,
                manipulation_type, virality_score, misinfo_risk
            )
            response = _gemini_model.generate_content(prompt)
            text = response.text.strip()
            if text:
                logger.info("LLM explanation generated via Gemini")
                return text
        except Exception as e:
            logger.warning(f"Gemini explanation failed, using fallback: {e}")

    # Rule-based fallback
    explanation = _rule_based_explanation(
        media_type, fake_probability, verdict, signals,
        manipulation_type, virality_score, misinfo_risk
    )
    logger.info("LLM explanation generated via rule-based fallback")
    return explanation
