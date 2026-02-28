// ============================================
// AMAF — Video Detection Module
// Implements: TIIS, FAV, Segment Analysis
// ============================================

import type {
  TemporalIdentityMetrics,
  OpticalFlowMetrics,
  SegmentAuthenticity,
  DetectionSignalOutput,
} from "./types";
import { computeFrequencyMetrics, computeTextureMetrics } from "./image-detector";
import type { FrequencyMetrics, TextureMetrics } from "./types";

// ---- Utilities ----

/**
 * Extract a simple color-histogram embedding from an ImageData region.
 * Returns a normalized 48-dim vector (16 bins × 3 channels).
 */
function extractEmbedding(frame: ImageData): Float64Array {
  const bins = 16;
  const embedding = new Float64Array(bins * 3);
  const pixels = frame.data;
  const totalPixels = frame.width * frame.height;

  for (let i = 0; i < pixels.length; i += 4) {
    embedding[Math.floor(pixels[i] / 16)] += 1;        // R
    embedding[bins + Math.floor(pixels[i + 1] / 16)] += 1; // G
    embedding[bins * 2 + Math.floor(pixels[i + 2] / 16)] += 1; // B
  }

  // Normalize
  for (let i = 0; i < embedding.length; i++) {
    embedding[i] /= totalPixels;
  }

  return embedding;
}

/**
 * Euclidean distance between two embeddings.
 */
function embeddingDistance(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * Compute grayscale values from ImageData.
 */
function toGrayscale(frame: ImageData): Float64Array {
  const gray = new Float64Array(frame.width * frame.height);
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * frame.data[idx] + 0.587 * frame.data[idx + 1] + 0.114 * frame.data[idx + 2];
  }
  return gray;
}

// ---- Metric Implementations ----

/**
 * 3.3 Temporal Identity Instability Score (TIIS)
 * Measures embedding drift between consecutive frames.
 * Real video → low drift. Deepfake → higher variance.
 */
export function computeTemporalIdentity(
  frames: ImageData[]
): TemporalIdentityMetrics {
  if (frames.length < 2) {
    return { tiis: 0, frameDrifts: [] };
  }

  const embeddings = frames.map((f) => extractEmbedding(f));
  const drifts: number[] = [];

  for (let i = 1; i < embeddings.length; i++) {
    drifts.push(embeddingDistance(embeddings[i], embeddings[i - 1]));
  }

  const meanDrift = drifts.reduce((a, b) => a + b, 0) / drifts.length;
  // TIIS is the variance of drift (high variance = identity instability)
  const variance = drifts.reduce((a, b) => a + (b - meanDrift) ** 2, 0) / drifts.length;

  // Combine mean + variance for a single score
  const tiis = meanDrift * 0.6 + Math.sqrt(variance) * 0.4;

  return { tiis, frameDrifts: drifts };
}

/**
 * 3.4 Optical Flow Residual — Flow Acceleration Variance (FAV)
 * Simplified block-matching optical flow between consecutive frames.
 */
export function computeOpticalFlow(
  frames: ImageData[],
  blockSize: number = 16
): OpticalFlowMetrics {
  if (frames.length < 3) {
    return { fav: 0, flowMagnitudes: [] };
  }

  const flowMagnitudes: number[] = [];

  for (let f = 1; f < frames.length; f++) {
    const prev = toGrayscale(frames[f - 1]);
    const curr = toGrayscale(frames[f]);
    const w = frames[f].width;
    const h = frames[f].height;

    let totalFlow = 0;
    let blockCount = 0;

    // Block matching: for each block in current frame, find best match in previous
    const searchRange = 4;
    for (let by = 0; by + blockSize <= h; by += blockSize) {
      for (let bx = 0; bx + blockSize <= w; bx += blockSize) {
        let bestDist = Infinity;
        let bestDx = 0, bestDy = 0;

        for (let dy = -searchRange; dy <= searchRange; dy++) {
          for (let dx = -searchRange; dx <= searchRange; dx++) {
            const py = by + dy;
            const px = bx + dx;
            if (py < 0 || py + blockSize > h || px < 0 || px + blockSize > w) continue;

            let sad = 0; // Sum of Absolute Differences
            for (let y = 0; y < blockSize; y++) {
              for (let x = 0; x < blockSize; x++) {
                sad += Math.abs(
                  curr[(by + y) * w + (bx + x)] - prev[(py + y) * w + (px + x)]
                );
              }
            }

            if (sad < bestDist) {
              bestDist = sad;
              bestDx = dx;
              bestDy = dy;
            }
          }
        }

        totalFlow += Math.sqrt(bestDx * bestDx + bestDy * bestDy);
        blockCount++;
      }
    }

    flowMagnitudes.push(blockCount > 0 ? totalFlow / blockCount : 0);
  }

  // Compute flow acceleration (second derivative)
  const accelerations: number[] = [];
  for (let i = 1; i < flowMagnitudes.length; i++) {
    accelerations.push(Math.abs(flowMagnitudes[i] - flowMagnitudes[i - 1]));
  }

  // FAV = variance of accelerations
  if (accelerations.length === 0) return { fav: 0, flowMagnitudes };

  const mean = accelerations.reduce((a, b) => a + b, 0) / accelerations.length;
  const fav = accelerations.reduce((a, b) => a + (b - mean) ** 2, 0) / accelerations.length;

  return { fav, flowMagnitudes };
}

/**
 * Segment-level authenticity analysis.
 * Divide video into segments and compute per-segment scores.
 */
export function computeSegmentAuthenticity(
  frames: ImageData[],
  segmentDurationSec: number = 5,
  fps: number = 2
): SegmentAuthenticity[] {
  const framesPerSegment = Math.max(1, Math.floor(segmentDurationSec * fps));
  const segments: SegmentAuthenticity[] = [];

  for (let i = 0; i < frames.length; i += framesPerSegment) {
    const segmentFrames = frames.slice(i, i + framesPerSegment);
    const segIdx = Math.floor(i / framesPerSegment);
    const startTime = i / fps;
    const endTime = Math.min((i + framesPerSegment) / fps, frames.length / fps);

    // Per-segment quick frequency check
    let segScore = 1.0; // Start at "authentic"

    if (segmentFrames.length > 0) {
      const frame = segmentFrames[0];
      const freq = computeFrequencyMetrics(frame.data, frame.width, frame.height);
      // Lower HFER → more suspicious → lower authenticity
      segScore = Math.min(1, Math.max(0, freq.hfer * 3));

      // If multiple frames, check identity stability
      if (segmentFrames.length >= 2) {
        const identity = computeTemporalIdentity(segmentFrames);
        // High TIIS → lower authenticity
        segScore = segScore * 0.6 + Math.max(0, 1 - identity.tiis * 10) * 0.4;
      }
    }

    segments.push({
      segmentIndex: segIdx,
      startTime,
      endTime,
      authenticityScore: Math.max(0, Math.min(1, segScore)),
      flagged: segScore < 0.5,
    });
  }

  return segments;
}

/**
 * Run the full video detection suite.
 */
export function analyzeVideo(
  frames: ImageData[],
  enableTexture: boolean = true,
  enableOpticalFlow: boolean = false
): {
  frequency: FrequencyMetrics | null;
  texture: TextureMetrics | null;
  temporalIdentity: TemporalIdentityMetrics;
  opticalFlow: OpticalFlowMetrics | null;
  segments: SegmentAuthenticity[];
  signals: DetectionSignalOutput[];
} {
  const signals: DetectionSignalOutput[] = [];

  // Frequency analysis on representative frames
  let frequency: FrequencyMetrics | null = null;
  let texture: TextureMetrics | null = null;

  if (frames.length > 0) {
    // Use middle frame as representative
    const midFrame = frames[Math.floor(frames.length / 2)];
    frequency = computeFrequencyMetrics(midFrame.data, midFrame.width, midFrame.height);

    if (enableTexture) {
      texture = computeTextureMetrics(midFrame.data, midFrame.width, midFrame.height);
    }

    if (frequency.hfer < 0.15) {
      signals.push({
        id: "vid-freq-anomaly",
        name: "Frequency Anomaly in Key Frame",
        category: "visual",
        confidence: Math.min(0.9, 0.5 + (0.15 - frequency.hfer) * 4),
        description: `Key frame analysis shows suppressed high-frequency energy (${(frequency.hfer * 100).toFixed(1)}%), suggesting synthetic generation.`,
        severity: frequency.hfer < 0.08 ? "high_risk" : "harmful",
        metricValue: frequency.hfer,
      });
    }
  }

  // Temporal identity analysis
  const temporalIdentity = computeTemporalIdentity(frames);
  if (temporalIdentity.tiis > 0.05) {
    signals.push({
      id: "vid-tiis-high",
      name: "Temporal Identity Instability",
      category: "temporal",
      confidence: Math.min(0.9, 0.4 + temporalIdentity.tiis * 5),
      description: `Identity embedding drift score of ${temporalIdentity.tiis.toFixed(4)} indicates frame-to-frame inconsistency, characteristic of deepfaked faces.`,
      severity: temporalIdentity.tiis > 0.1 ? "high_risk" : "suspicious",
      metricValue: temporalIdentity.tiis,
    });
  }

  // Optical flow (Level 3 only)
  let opticalFlow: OpticalFlowMetrics | null = null;
  if (enableOpticalFlow && frames.length >= 3) {
    // Use subset of frames for performance
    const subset = frames.length > 10
      ? frames.filter((_, i) => i % Math.ceil(frames.length / 10) === 0)
      : frames;
    opticalFlow = computeOpticalFlow(subset);

    if (opticalFlow.fav > 0.5) {
      signals.push({
        id: "vid-fav-high",
        name: "Motion Smoothness Anomaly",
        category: "temporal",
        confidence: Math.min(0.85, 0.3 + opticalFlow.fav * 0.5),
        description: `Flow Acceleration Variance of ${opticalFlow.fav.toFixed(3)} indicates unnatural motion patterns between frames.`,
        severity: opticalFlow.fav > 1.5 ? "harmful" : "suspicious",
        metricValue: opticalFlow.fav,
      });
    }
  }

  // Segment analysis
  const segments = computeSegmentAuthenticity(frames);
  const flaggedSegments = segments.filter((s) => s.flagged);
  if (flaggedSegments.length > 0) {
    signals.push({
      id: "vid-segment-flags",
      name: "Suspicious Video Segments",
      category: "temporal",
      confidence: Math.min(0.8, 0.4 + (flaggedSegments.length / segments.length) * 0.5),
      description: `${flaggedSegments.length} of ${segments.length} video segments flagged as potentially manipulated.`,
      severity: flaggedSegments.length > segments.length / 2 ? "harmful" : "suspicious",
    });
  }

  return { frequency, texture, temporalIdentity, opticalFlow, segments, signals };
}
