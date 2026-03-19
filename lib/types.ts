// ============================================
// Reality Firewall — Core Type System
// ============================================

export type MediaType = "image" | "video" | "audio" | "text";

export type RiskLevel = "low" | "suspicious" | "harmful" | "high_risk" | "inconclusive";

export interface DetectionSignal {
  id: string;
  name: string;
  category: "visual" | "temporal" | "spectral" | "semantic" | "metadata";
  confidence: number; // 0 - 1
  description: string;
  severity: RiskLevel;
}

export interface MediaItem {
  id: string;
  filename: string;
  mediaType: MediaType;
  size: number; // bytes
  uploadedAt: string; // ISO date
  thumbnailUrl?: string;
  url: string;
}

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

export interface SegmentAuthenticity {
  segmentIndex: number;
  startTime: number;
  endTime: number;
  authenticityScore: number;
  flagged: boolean;
}

export interface ChangePoint {
  timestamp: number;
  segmentIndex: number;
  cusumValue: number;
  direction: "increase" | "decrease";
}

export interface SocietalImpact {
  polarizationPotential: number;
  panicPotential: number;
  reputationDamageLikelihood: number;
}

export interface ViralityAnalysis {
  viralityScore: number; // 0 - 100
  misinformationRisk: RiskLevel;
  misinformationRiskScore: number; // 0 - 1
  emotionalPolarity: number; // -1 to 1
  politicalSensitivity: number; // 0 - 1
  societalImpact: SocietalImpact;
  riskFactors: string[];
}

export interface OriginTimeline {
  firstSeen: string; // ISO date string
  originalUrl?: string;
  occurrences: number;
  isNovel: boolean;
  notes?: string;
}

export interface AnalysisResult {
  id: string;
  media: MediaItem;
  fakeProbability: number; // 0 - 1
  riskLevel: RiskLevel;
  riskScore: number; // 0 - 100
  signals: DetectionSignal[];
  explanation: string;
  llmExplanation?: string;   // Phase 4: rich LLM-generated reasoning
  manipulationType?: string;
  metadata: MediaMetadata;
  analyzedAt: string; // ISO date
  processingTimeMs: number;
  // AMAF extensions
  featureVector?: AMAFFeatureVector;
  segments?: SegmentAuthenticity[];
  changePoints?: ChangePoint[];
  analysisLevel?: string;
  earlyExit?: boolean;
  // Phase 6: Virality & Risk
  viralityAnalysis?: ViralityAnalysis;
  // Phase 12: Origin Timeline
  originTimeline?: OriginTimeline;
  // Phase 15: Grad-CAM heatmap (base64 PNG)
  gradcamBase64?: string;
}


export interface MediaMetadata {
  exifPresent: boolean;
  hasBeenEdited: boolean;
  compressionAnomalies: boolean;
  originalSource?: string;
  creationDate?: string;
  softwareUsed?: string;
}

export interface DashboardMetrics {
  totalAnalyses: number;
  threatsDetected: number;
  mediaProcessed: number;
  avgRiskScore: number;
  recentAnalyses: AnalysisResult[];
}

export interface UploadState {
  file: File | null;
  mediaType: MediaType;
  isUploading: boolean;
  isAnalyzing: boolean;
  progress: number;
  error?: string;
}
