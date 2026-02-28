// ============================================
// AMAF — Pipeline Orchestrator
// Main entry point for media analysis
// ============================================

import type {
  AMAFAnalysisResult,
  AMAFFeatureVector,
  AnalysisLevel,
  DetectionSignalOutput,
  SegmentAuthenticity,
  ChangePoint,
  LEVEL_CONFIGS,
} from "./types";
import { routeMedia } from "./media-router";
import { analyzeImage, analyzeImageFromBuffer } from "./image-detector";
import { analyzeVideo } from "./video-detector";
import { analyzeAudio } from "./audio-detector";
import { scoreFeatureVector } from "./scoring-engine";
import { evaluateEscalation, determineStartLevel, countActiveFeatures } from "./confidence-manager";
import { detectChangePoints, enrichSegmentsWithChangePoints } from "./change-detector";

/**
 * Run the full AMAF detection pipeline on a File.
 *
 * Pipeline flow:
 *   1. Route media → identify type + extract raw data
 *   2. Start at appropriate analysis level
 *   3. Run Level 1 → check confidence → escalate if needed
 *   4. Run Level 2 → check confidence → escalate if needed
 *   5. Run Level 3 if needed (temporal + cross-modal)
 *   6. Assemble feature vector
 *   7. Score with ensemble + Platt calibration
 *   8. Run CUSUM change detection (video/audio)
 *   9. Return AMAFAnalysisResult
 */
export async function runPipeline(file: File): Promise<AMAFAnalysisResult> {
  const startTime = performance.now();

  // Step 1: Route media
  const route = await routeMedia(file, 2);

  // Initialize feature vector (all null)
  const featureVector: AMAFFeatureVector = {
    hfer: null, svd: null, pdi: null,
    tiis: null, fav: null,
    etk: null, pvss: null, frd: null,
  };

  const signals: DetectionSignalOutput[] = [];
  let segments: SegmentAuthenticity[] = [];
  let changePoints: ChangePoint[] = [];
  let currentLevel: AnalysisLevel = determineStartLevel(route.mediaType, route.fileSize);
  let earlyExit = false;

  // Detailed metrics storage
  let frequencyMetrics = null;
  let textureMetrics = null;
  let temporalIdentityMetrics = null;
  let opticalFlowMetrics = null;
  let energyTransitionMetrics = null;
  let pitchMetrics = null;
  let spectralFlatnessMetrics = null;

  // ---- Level 1: Lightweight Scan ----
  if (currentLevel === "level1_lightweight" || currentLevel === "level2_deep_spatial" || currentLevel === "level3_temporal_crossmodal") {
    
    if (route.mediaType === "image" && route.imageData) {
      const imgResult = analyzeImage(
        route.imageData.data,
        route.imageData.width,
        route.imageData.height,
        route.rawBuffer,
        false // no texture at Level 1
      );
      featureVector.hfer = imgResult.frequency.hfer;
      featureVector.svd = imgResult.frequency.svd;
      frequencyMetrics = imgResult.frequency;
      signals.push(...imgResult.signals);
    } else if (route.mediaType === "image") {
      // Fallback: buffer-only analysis
      const imgResult = analyzeImageFromBuffer(route.rawBuffer);
      featureVector.hfer = imgResult.frequency.hfer;
      featureVector.svd = imgResult.frequency.svd;
      frequencyMetrics = imgResult.frequency;
      signals.push(...imgResult.signals);
    }

    if (route.mediaType === "video" && route.frames && route.frames.length > 0) {
      const vidResult = analyzeVideo(route.frames, false, false);
      if (vidResult.frequency) {
        featureVector.hfer = vidResult.frequency.hfer;
        featureVector.svd = vidResult.frequency.svd;
        frequencyMetrics = vidResult.frequency;
      }
      featureVector.tiis = vidResult.temporalIdentity.tiis;
      temporalIdentityMetrics = vidResult.temporalIdentity;
      segments = vidResult.segments;
      signals.push(...vidResult.signals);
    }

    if (route.mediaType === "audio" && route.audioBuffer) {
      // Basic audio at Level 1: just ETK
      const { computeEnergyTransition } = await import("./audio-detector");
      const etk = computeEnergyTransition(route.audioBuffer);
      featureVector.etk = etk.etk;
      energyTransitionMetrics = etk;
    }

    // Check if we can early exit or need to escalate
    const scoring = scoreFeatureVector(featureVector, signals, route.mediaType);
    const escalation = evaluateEscalation(
      "level1_lightweight",
      scoring.rawScore,
      scoring.fakeProbability,
      featureVector
    );

    if (escalation.earlyExit) {
      earlyExit = true;
      currentLevel = "level1_lightweight";
    } else if (escalation.shouldEscalate && currentLevel === "level1_lightweight") {
      currentLevel = "level2_deep_spatial";
    }
  }

  // ---- Level 2: Deep Spatial Analysis ----
  if (!earlyExit && (currentLevel === "level2_deep_spatial" || currentLevel === "level3_temporal_crossmodal")) {
    
    if (route.mediaType === "image" && route.imageData) {
      const imgResult = analyzeImage(
        route.imageData.data,
        route.imageData.width,
        route.imageData.height,
        route.rawBuffer,
        true // enable texture
      );
      // Update with texture metrics
      if (imgResult.texture) {
        featureVector.pdi = imgResult.texture.pdi;
        textureMetrics = imgResult.texture;
      }
      // Merge any new signals (avoid duplicates)
      const existingIds = new Set(signals.map(s => s.id));
      for (const sig of imgResult.signals) {
        if (!existingIds.has(sig.id)) {
          signals.push(sig);
          existingIds.add(sig.id);
        }
      }
    }

    if (route.mediaType === "video" && route.frames && route.frames.length > 0) {
      const vidResult = analyzeVideo(route.frames, true, false);
      if (vidResult.texture) {
        featureVector.pdi = vidResult.texture.pdi;
        textureMetrics = vidResult.texture;
      }
      // Update identity metrics if not already set
      if (!temporalIdentityMetrics) {
        featureVector.tiis = vidResult.temporalIdentity.tiis;
        temporalIdentityMetrics = vidResult.temporalIdentity;
      }
      segments = vidResult.segments;

      const existingIds = new Set(signals.map(s => s.id));
      for (const sig of vidResult.signals) {
        if (!existingIds.has(sig.id)) {
          signals.push(sig);
          existingIds.add(sig.id);
        }
      }
    }

    if (route.audioBuffer) {
      const audioResult = analyzeAudio(route.audioBuffer);
      featureVector.etk = audioResult.energyTransition.etk;
      featureVector.pvss = audioResult.pitch.pvss;
      featureVector.frd = audioResult.spectralFlatness.frd;
      energyTransitionMetrics = audioResult.energyTransition;
      pitchMetrics = audioResult.pitch;
      spectralFlatnessMetrics = audioResult.spectralFlatness;
      signals.push(...audioResult.signals);
    }

    // Check escalation again
    const scoring = scoreFeatureVector(featureVector, signals, route.mediaType);
    const escalation = evaluateEscalation(
      "level2_deep_spatial",
      scoring.rawScore,
      scoring.fakeProbability,
      featureVector
    );

    if (escalation.earlyExit) {
      earlyExit = true;
    } else if (escalation.shouldEscalate) {
      currentLevel = "level3_temporal_crossmodal";
    }
  }

  // ---- Level 3: Temporal + Cross-modal ----
  if (!earlyExit && currentLevel === "level3_temporal_crossmodal") {
    
    if (route.mediaType === "video" && route.frames && route.frames.length >= 3) {
      const vidResult = analyzeVideo(route.frames, true, true); // enable optical flow
      if (vidResult.opticalFlow) {
        featureVector.fav = vidResult.opticalFlow.fav;
        opticalFlowMetrics = vidResult.opticalFlow;
      }
      segments = vidResult.segments;

      const existingIds = new Set(signals.map(s => s.id));
      for (const sig of vidResult.signals) {
        if (!existingIds.has(sig.id)) {
          signals.push(sig);
          existingIds.add(sig.id);
        }
      }
    }

    // CUSUM change detection on segments
    if (segments.length >= 3) {
      changePoints = detectChangePoints(segments);
      if (changePoints.length > 0) {
        segments = enrichSegmentsWithChangePoints(segments, changePoints);
        signals.push({
          id: "cusum-changepoints",
          name: "Partial Manipulation Detected",
          category: "temporal",
          confidence: Math.min(0.9, 0.5 + changePoints.length * 0.15),
          description: `CUSUM analysis detected ${changePoints.length} change point(s) in authenticity, suggesting partial manipulation of specific segments.`,
          severity: changePoints.length > 2 ? "high_risk" : "harmful",
        });
      }
    }
  }

  // ---- Final Scoring ----
  const {
    rawScore,
    fakeProbability,
    riskLevel,
    riskScore,
    explanation,
  } = scoreFeatureVector(featureVector, signals, route.mediaType);

  const processingTimeMs = Math.round(performance.now() - startTime);

  return {
    featureVector,
    fakeProbability,
    calibratedProbability: fakeProbability,
    riskLevel,
    riskScore,
    analysisLevel: currentLevel,
    earlyExit,

    frequencyMetrics,
    textureMetrics,
    temporalIdentityMetrics,
    opticalFlowMetrics,
    energyTransitionMetrics,
    pitchMetrics,
    spectralFlatnessMetrics,

    segments,
    changePoints,

    processingTimeMs,
    signals,
  };
}
