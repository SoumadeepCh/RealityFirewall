// ============================================
// AMAF — Change Detector (CUSUM)
// Partial manipulation detection
// ============================================

import type { ChangePoint, SegmentAuthenticity } from "./types";

/**
 * CUSUM (Cumulative Sum) change-point detection.
 *
 * Detects sudden shifts in the authenticity score sequence
 * that indicate partial manipulation (e.g., only certain
 * segments of video/audio are deepfaked).
 *
 * Algorithm:
 *   S_h(t) = max(0, S_h(t-1) + (x_t - μ - k))    [upper CUSUM]
 *   S_l(t) = max(0, S_l(t-1) + (-x_t + μ - k))   [lower CUSUM]
 *
 * where k = allowance (slack), h = decision threshold
 */
export function detectChangePoints(
  segments: SegmentAuthenticity[],
  allowance: number = 0.1,
  threshold: number = 0.5
): ChangePoint[] {
  if (segments.length < 3) return [];

  const scores = segments.map((s) => s.authenticityScore);

  // Compute running mean
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;

  let cusumUpper = 0;
  let cusumLower = 0;
  const changePoints: ChangePoint[] = [];
  const alreadyFlagged = new Set<number>();

  for (let i = 0; i < scores.length; i++) {
    // Upper CUSUM: detects increase in anomaly (decrease in authenticity)
    cusumUpper = Math.max(0, cusumUpper + (mean - scores[i] - allowance));
    // Lower CUSUM: detects decrease in anomaly (return to authentic)
    cusumLower = Math.max(0, cusumLower + (scores[i] - mean - allowance));

    if (cusumUpper > threshold && !alreadyFlagged.has(i)) {
      changePoints.push({
        timestamp: segments[i].startTime,
        segmentIndex: i,
        cusumValue: cusumUpper,
        direction: "increase",
      });
      alreadyFlagged.add(i);
      cusumUpper = 0; // Reset after detection
    }

    if (cusumLower > threshold && !alreadyFlagged.has(i)) {
      changePoints.push({
        timestamp: segments[i].startTime,
        segmentIndex: i,
        cusumValue: cusumLower,
        direction: "decrease",
      });
      alreadyFlagged.add(i);
      cusumLower = 0;
    }
  }

  return changePoints;
}

/**
 * Enrich segment data with change-point information.
 * Marks segments around change points as flagged.
 */
export function enrichSegmentsWithChangePoints(
  segments: SegmentAuthenticity[],
  changePoints: ChangePoint[],
  radiusSegments: number = 1
): SegmentAuthenticity[] {
  const enriched = segments.map((s) => ({ ...s }));

  for (const cp of changePoints) {
    const start = Math.max(0, cp.segmentIndex - radiusSegments);
    const end = Math.min(enriched.length - 1, cp.segmentIndex + radiusSegments);

    for (let i = start; i <= end; i++) {
      if (!enriched[i].flagged && cp.direction === "increase") {
        enriched[i].flagged = true;
      }
    }
  }

  return enriched;
}
