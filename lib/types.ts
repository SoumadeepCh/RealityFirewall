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

export interface AnalysisResult {
  id: string;
  media: MediaItem;
  fakeProbability: number; // 0 - 1
  riskLevel: RiskLevel;
  riskScore: number; // 0 - 100
  signals: DetectionSignal[];
  explanation: string;
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
