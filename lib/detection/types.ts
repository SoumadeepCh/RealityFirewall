// ============================================
// AMAF — Adaptive Media Authenticity Framework
// Detection Type System
// ============================================

// ---- Feature Metrics ----

/** Frequency-Domain Anomaly Score */
export interface FrequencyMetrics {
  /** High Frequency Energy Ratio — suppressed HF = GAN signature */
  hfer: number;
  /** Spectral Variance Deviation — deviation from natural spectrum */
  svd: number;
}

/** Patch Drift Index — texture consistency across adjacent patches */
export interface TextureMetrics {
  pdi: number;
  /** Per-patch similarity scores for visualization */
  patchScores: number[];
  gridSize: number;
}

/** Temporal Identity Instability Score — face embedding drift over time */
export interface TemporalIdentityMetrics {
  tiis: number;
  /** Per-frame drift values for timeline */
  frameDrifts: number[];
}

/** Optical Flow Residual — motion smoothness */
export interface OpticalFlowMetrics {
  /** Flow Acceleration Variance */
  fav: number;
  /** Per-frame flow magnitudes */
  flowMagnitudes: number[];
}

/** Audio Energy Transition Kurtosis */
export interface EnergyTransitionMetrics {
  etk: number;
  /** Per-frame energy deltas */
  energyDeltas: number[];
}

/** Pitch Variance Smoothness Score */
export interface PitchMetrics {
  pvss: number;
  /** Pitch contour for visualization */
  pitchContour: number[];
}

/** Spectral Flatness Deviation */
export interface SpectralFlatnessMetrics {
  frd: number;
  /** Per-frame flatness values */
  flatnessValues: number[];
}

// ---- Composite Feature Vector ----

export interface AMAFFeatureVector {
  hfer: number | null;
  svd: number | null;
  pdi: number | null;
  tiis: number | null;
  fav: number | null;
  etk: number | null;
  pvss: number | null;
  frd: number | null;
}

// ---- Analysis Levels ----

export type AnalysisLevel =
  | "level1_lightweight"
  | "level2_deep_spatial"
  | "level3_temporal_crossmodal";

export interface LevelConfig {
  level: AnalysisLevel;
  frameSampleRate: number; // frames per second to analyze
  enableFrequency: boolean;
  enableTexture: boolean;
  enableTemporalIdentity: boolean;
  enableOpticalFlow: boolean;
  enableAudioMetrics: boolean;
  enableChangeDetection: boolean;
}

export const LEVEL_CONFIGS: Record<AnalysisLevel, LevelConfig> = {
  level1_lightweight: {
    level: "level1_lightweight",
    frameSampleRate: 1,
    enableFrequency: true,
    enableTexture: false,
    enableTemporalIdentity: false,
    enableOpticalFlow: false,
    enableAudioMetrics: false,
    enableChangeDetection: false,
  },
  level2_deep_spatial: {
    level: "level2_deep_spatial",
    frameSampleRate: 2,
    enableFrequency: true,
    enableTexture: true,
    enableTemporalIdentity: true,
    enableOpticalFlow: false,
    enableAudioMetrics: true,
    enableChangeDetection: false,
  },
  level3_temporal_crossmodal: {
    level: "level3_temporal_crossmodal",
    frameSampleRate: 5,
    enableFrequency: true,
    enableTexture: true,
    enableTemporalIdentity: true,
    enableOpticalFlow: true,
    enableAudioMetrics: true,
    enableChangeDetection: true,
  },
};

// ---- Segment / Timeline ----

export interface SegmentAuthenticity {
  segmentIndex: number;
  startTime: number; // seconds
  endTime: number;
  authenticityScore: number; // 0 = fake, 1 = real
  flagged: boolean;
}

export interface ChangePoint {
  timestamp: number;
  segmentIndex: number;
  cusumValue: number;
  direction: "increase" | "decrease";
}

// ---- Pipeline I/O ----

export type DetectedMediaType = "image" | "video" | "audio" | "unknown";

export interface MediaRouteDecision {
  mediaType: DetectedMediaType;
  mimeType: string;
  fileName: string;
  fileSize: number;
  /** For video: extracted frame data URLs */
  frames?: ImageData[];
  /** For video/audio: audio buffer */
  audioBuffer?: Float32Array;
  /** For image: single image data */
  imageData?: ImageData;
  /** Raw array buffer for metadata parsing */
  rawBuffer: ArrayBuffer;
}

export interface DetectionProgress {
  currentLevel: AnalysisLevel;
  phase: string;
  percent: number;
}

export interface AMAFAnalysisResult {
  featureVector: AMAFFeatureVector;
  fakeProbability: number;
  calibratedProbability: number;
  riskLevel: "low" | "suspicious" | "harmful" | "high_risk";
  riskScore: number;
  analysisLevel: AnalysisLevel;
  earlyExit: boolean;

  // Detailed per-module results
  frequencyMetrics: FrequencyMetrics | null;
  textureMetrics: TextureMetrics | null;
  temporalIdentityMetrics: TemporalIdentityMetrics | null;
  opticalFlowMetrics: OpticalFlowMetrics | null;
  energyTransitionMetrics: EnergyTransitionMetrics | null;
  pitchMetrics: PitchMetrics | null;
  spectralFlatnessMetrics: SpectralFlatnessMetrics | null;

  // Timeline data (video/audio)
  segments: SegmentAuthenticity[];
  changePoints: ChangePoint[];

  // Metadata
  processingTimeMs: number;
  signals: DetectionSignalOutput[];
}

export interface DetectionSignalOutput {
  id: string;
  name: string;
  category: "visual" | "temporal" | "spectral" | "semantic" | "metadata";
  confidence: number;
  description: string;
  severity: "low" | "suspicious" | "harmful" | "high_risk";
  metricValue?: number;
}
