// ============================================
// AMAF — Scoring Engine
// Feature vector assembly + meta-classifier
// ============================================

import type { AMAFFeatureVector, DetectionSignalOutput } from "./types";

// ---- Baseline Statistics (from research literature) ----
// These represent typical values for REAL media. Deviations indicate manipulation.

interface FeatureBaseline {
  mean: number;
  std: number;
  weight: number; // importance weight in ensemble
  higherIsSuspicious: boolean;
}

const FEATURE_BASELINES: Record<keyof AMAFFeatureVector, FeatureBaseline> = {
  hfer: { mean: 0.25, std: 0.08, weight: 0.18, higherIsSuspicious: false }, // LOW hfer = suspicious
  svd:  { mean: 0.15, std: 0.12, weight: 0.12, higherIsSuspicious: true },
  pdi:  { mean: 0.008, std: 0.005, weight: 0.14, higherIsSuspicious: true },
  tiis: { mean: 0.02, std: 0.015, weight: 0.16, higherIsSuspicious: true },
  fav:  { mean: 0.2, std: 0.15, weight: 0.10, higherIsSuspicious: true },
  etk:  { mean: 3.0, std: 2.0, weight: 0.10, higherIsSuspicious: true },
  pvss: { mean: 50, std: 30, weight: 0.10, higherIsSuspicious: false }, // LOW pvss = suspicious (over-smooth)
  frd:  { mean: 0.15, std: 0.1, weight: 0.10, higherIsSuspicious: true },
};

/**
 * Normalize a feature value to a z-score based on baseline statistics.
 * Returns the anomaly score (0 = normal, higher = more anomalous).
 */
function normalizeFeature(
  key: keyof AMAFFeatureVector,
  value: number
): number {
  const baseline = FEATURE_BASELINES[key];
  const zScore = (value - baseline.mean) / Math.max(baseline.std, 1e-6);

  // Convert to anomaly score based on direction
  if (baseline.higherIsSuspicious) {
    // Higher value = more suspicious → positive z-score = anomalous
    return Math.max(0, zScore);
  } else {
    // Lower value = more suspicious → negative z-score = anomalous
    return Math.max(0, -zScore);
  }
}

/**
 * Compute weighted ensemble score from feature vector.
 * Returns raw score (0 = likely real, higher = likely fake).
 */
export function computeEnsembleScore(vector: AMAFFeatureVector): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const key of Object.keys(FEATURE_BASELINES) as (keyof AMAFFeatureVector)[]) {
    const value = vector[key];
    if (value === null) continue;

    const baseline = FEATURE_BASELINES[key];
    const anomalyScore = normalizeFeature(key, value);
    weightedSum += anomalyScore * baseline.weight;
    totalWeight += baseline.weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Platt scaling calibration.
 * Maps raw ensemble score to calibrated probability.
 * P(fake) = 1 / (1 + exp(-(A*s + B)))
 *
 * A and B are calibration parameters determined empirically.
 * Default: A=2.5, B=-1.0 (maps ~0.4 raw → ~0.5 probability)
 */
export function plattScale(
  rawScore: number,
  A: number = 2.5,
  B: number = -1.0
): number {
  const exponent = -(A * rawScore + B);
  return 1 / (1 + Math.exp(exponent));
}

/**
 * Determine risk level from calibrated probability.
 */
export function classifyRisk(
  probability: number
): { riskLevel: "low" | "suspicious" | "harmful" | "high_risk"; riskScore: number } {
  const riskScore = Math.round(probability * 100);

  let riskLevel: "low" | "suspicious" | "harmful" | "high_risk";
  if (probability >= 0.8) {
    riskLevel = "high_risk";
  } else if (probability >= 0.55) {
    riskLevel = "harmful";
  } else if (probability >= 0.3) {
    riskLevel = "suspicious";
  } else {
    riskLevel = "low";
  }

  return { riskLevel, riskScore };
}

/**
 * Generate AI explanation from feature vector and signals.
 */
export function generateExplanation(
  vector: AMAFFeatureVector,
  signals: DetectionSignalOutput[],
  fakeProbability: number,
  mediaType: string
): string {
  const parts: string[] = [];

  if (fakeProbability > 0.7) {
    parts.push(`This ${mediaType} shows strong indicators of being AI-generated or manipulated.`);
  } else if (fakeProbability > 0.4) {
    parts.push(`This ${mediaType} shows some signs of potential manipulation that warrant further investigation.`);
  } else {
    parts.push(`This ${mediaType} appears largely authentic based on our multi-layer analysis.`);
  }

  // Highlight top signals
  const sortedSignals = [...signals].sort((a, b) => b.confidence - a.confidence);
  const topSignals = sortedSignals.slice(0, 3);

  if (topSignals.length > 0) {
    const descriptions = topSignals.map((s) => s.description);
    parts.push(descriptions.join(" "));
  }

  // Add feature summary
  const activeFeatures: string[] = [];
  if (vector.hfer !== null) activeFeatures.push("frequency analysis");
  if (vector.pdi !== null) activeFeatures.push("texture consistency");
  if (vector.tiis !== null) activeFeatures.push("temporal identity tracking");
  if (vector.etk !== null || vector.pvss !== null) activeFeatures.push("audio spectral analysis");

  if (activeFeatures.length > 0) {
    parts.push(`Analysis included ${activeFeatures.join(", ")}.`);
  }

  return parts.join(" ");
}

/**
 * Full scoring pipeline: takes feature vector → returns calibrated probability + risk.
 */
export function scoreFeatureVector(
  vector: AMAFFeatureVector,
  signals: DetectionSignalOutput[],
  mediaType: string
): {
  rawScore: number;
  fakeProbability: number;
  riskLevel: "low" | "suspicious" | "harmful" | "high_risk";
  riskScore: number;
  explanation: string;
} {
  const rawScore = computeEnsembleScore(vector);
  const fakeProbability = plattScale(rawScore);
  const { riskLevel, riskScore } = classifyRisk(fakeProbability);
  const explanation = generateExplanation(vector, signals, fakeProbability, mediaType);

  return { rawScore, fakeProbability, riskLevel, riskScore, explanation };
}
