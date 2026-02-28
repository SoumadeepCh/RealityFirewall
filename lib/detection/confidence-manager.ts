// ============================================
// AMAF — Confidence Manager
// 3-level escalation with early exit
// ============================================

import type { AnalysisLevel, LEVEL_CONFIGS, AMAFFeatureVector } from "./types";

interface EscalationDecision {
  shouldEscalate: boolean;
  nextLevel: AnalysisLevel | null;
  earlyExit: boolean;
  reason: string;
}

/**
 * Determine if analysis should escalate to a deeper level.
 *
 * Strategy from README:
 * - If confidence > 0.95 and stable → early exit
 * - If confidence is ambiguous (0.3–0.7) → escalate
 * - Randomized deeper sampling improves robustness
 */
export function evaluateEscalation(
  currentLevel: AnalysisLevel,
  rawScore: number,
  fakeProbability: number,
  vector: AMAFFeatureVector,
  stableFrameCount: number = 0
): EscalationDecision {
  // Early exit: very high or very low confidence + stable
  if (
    (fakeProbability > 0.95 || fakeProbability < 0.05) &&
    stableFrameCount >= 3
  ) {
    return {
      shouldEscalate: false,
      nextLevel: null,
      earlyExit: true,
      reason: `High confidence (${(fakeProbability * 100).toFixed(0)}%) stable over ${stableFrameCount} frames — early exit.`,
    };
  }

  // Randomized deeper sampling: 20% chance to escalate even if confident
  // This prevents predictable escalation patterns (README §12)
  const randomEscalate = Math.random() < 0.2;

  // Ambiguous zone: escalate
  const isAmbiguous = fakeProbability >= 0.25 && fakeProbability <= 0.75;

  // Determine next level
  if (currentLevel === "level1_lightweight") {
    if (isAmbiguous || randomEscalate) {
      return {
        shouldEscalate: true,
        nextLevel: "level2_deep_spatial",
        earlyExit: false,
        reason: isAmbiguous
          ? `Ambiguous confidence (${(fakeProbability * 100).toFixed(0)}%) — escalating to Level 2 deep spatial analysis.`
          : "Randomized deeper sampling triggered — escalating to Level 2.",
      };
    }
  }

  if (currentLevel === "level2_deep_spatial") {
    if (isAmbiguous || randomEscalate) {
      return {
        shouldEscalate: true,
        nextLevel: "level3_temporal_crossmodal",
        earlyExit: false,
        reason: isAmbiguous
          ? `Still ambiguous (${(fakeProbability * 100).toFixed(0)}%) after Level 2 — escalating to Level 3 temporal + cross-modal.`
          : "Randomized deeper sampling triggered — escalating to Level 3.",
      };
    }
  }

  // Level 3 or confident enough — no further escalation
  return {
    shouldEscalate: false,
    nextLevel: null,
    earlyExit: false,
    reason: currentLevel === "level3_temporal_crossmodal"
      ? "Maximum analysis depth reached."
      : `Confidence (${(fakeProbability * 100).toFixed(0)}%) sufficient at current level.`,
  };
}

/**
 * Count how many non-null features are available in the vector.
 */
export function countActiveFeatures(vector: AMAFFeatureVector): number {
  return Object.values(vector).filter((v) => v !== null).length;
}

/**
 * Determine the appropriate starting level based on media type and file size.
 */
export function determineStartLevel(
  mediaType: string,
  fileSize: number
): AnalysisLevel {
  // Small images: can go straight to Level 2
  if (mediaType === "image" && fileSize < 500_000) {
    return "level2_deep_spatial";
  }

  // Large videos: start lightweight
  if (mediaType === "video" && fileSize > 20_000_000) {
    return "level1_lightweight";
  }

  // Audio: start at Level 2 (audio metrics are relatively cheap)
  if (mediaType === "audio") {
    return "level2_deep_spatial";
  }

  return "level1_lightweight";
}

export { type EscalationDecision };
