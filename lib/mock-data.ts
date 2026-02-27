import type { AnalysisResult, DashboardMetrics, DetectionSignal } from "./types";

// ============================================
// Mock data for Phase 0-1 development
// ============================================

const mockSignals: DetectionSignal[] = [
  {
    id: "sig-1",
    name: "GAN Fingerprint Detected",
    category: "visual",
    confidence: 0.92,
    description: "StyleGAN2-specific frequency artifacts found in the generated face region.",
    severity: "high_risk",
  },
  {
    id: "sig-2",
    name: "Noise Inconsistency",
    category: "visual",
    confidence: 0.78,
    description: "Noise floor varies between face region and background, suggesting compositing.",
    severity: "harmful",
  },
  {
    id: "sig-3",
    name: "EXIF Metadata Stripped",
    category: "metadata",
    confidence: 0.65,
    description: "Image metadata has been intentionally removed, common in manipulated media.",
    severity: "suspicious",
  },
  {
    id: "sig-4",
    name: "Frequency Artifact",
    category: "visual",
    confidence: 0.85,
    description: "Unusual high-frequency patterns detected in DCT domain, typical of GAN outputs.",
    severity: "harmful",
  },
  {
    id: "sig-5",
    name: "Compression Anomaly",
    category: "visual",
    confidence: 0.55,
    description: "Multiple compression layers detected, suggesting image has been re-saved.",
    severity: "low",
  },
];

export const mockAnalysisResult: AnalysisResult = {
  id: "analysis-001",
  media: {
    id: "media-001",
    filename: "suspicious_portrait.jpg",
    mediaType: "image",
    size: 2_450_000,
    uploadedAt: "2026-02-27T10:30:00Z",
    url: "/uploads/suspicious_portrait.jpg",
  },
  fakeProbability: 0.87,
  riskLevel: "high_risk",
  riskScore: 85,
  signals: mockSignals,
  explanation:
    "This image shows strong indicators of being AI-generated. The GAN fingerprint classifier identified StyleGAN2-specific artifacts with 92% confidence. Noise analysis reveals inconsistencies between the face region and background that are characteristic of face synthesis. Combined with stripped EXIF metadata and frequency domain anomalies, the overall assessment indicates this is very likely a synthetic image.",
  manipulationType: "AI-Generated Face (StyleGAN2)",
  metadata: {
    exifPresent: false,
    hasBeenEdited: true,
    compressionAnomalies: true,
    softwareUsed: "Unknown",
  },
  analyzedAt: "2026-02-27T10:30:05Z",
  processingTimeMs: 4823,
};

const mockRecentAnalyses: AnalysisResult[] = [
  mockAnalysisResult,
  {
    id: "analysis-002",
    media: {
      id: "media-002",
      filename: "news_clip.mp4",
      mediaType: "video",
      size: 15_200_000,
      uploadedAt: "2026-02-27T09:15:00Z",
      url: "/uploads/news_clip.mp4",
    },
    fakeProbability: 0.34,
    riskLevel: "suspicious",
    riskScore: 38,
    signals: [mockSignals[2], mockSignals[4]],
    explanation:
      "The video shows some signs of post-processing but overall appears largely authentic. Minor compression anomalies suggest re-encoding.",
    metadata: {
      exifPresent: true,
      hasBeenEdited: false,
      compressionAnomalies: true,
    },
    analyzedAt: "2026-02-27T09:16:12Z",
    processingTimeMs: 12450,
  },
  {
    id: "analysis-003",
    media: {
      id: "media-003",
      filename: "voice_message.wav",
      mediaType: "audio",
      size: 890_000,
      uploadedAt: "2026-02-26T14:20:00Z",
      url: "/uploads/voice_message.wav",
    },
    fakeProbability: 0.12,
    riskLevel: "low",
    riskScore: 15,
    signals: [mockSignals[4]],
    explanation:
      "Audio analysis shows natural speech patterns with no significant anomalies. The recording appears to be authentic.",
    metadata: {
      exifPresent: false,
      hasBeenEdited: false,
      compressionAnomalies: false,
    },
    analyzedAt: "2026-02-26T14:20:08Z",
    processingTimeMs: 3200,
  },
  {
    id: "analysis-004",
    media: {
      id: "media-004",
      filename: "political_meme.png",
      mediaType: "image",
      size: 1_200_000,
      uploadedAt: "2026-02-26T11:45:00Z",
      url: "/uploads/political_meme.png",
    },
    fakeProbability: 0.62,
    riskLevel: "harmful",
    riskScore: 65,
    signals: [mockSignals[1], mockSignals[2], mockSignals[3]],
    explanation:
      "This image shows signs of face manipulation through compositing. The noise profile around the face differs from the background, and frequency analysis reveals editing artifacts.",
    manipulationType: "Face Swap / Compositing",
    metadata: {
      exifPresent: false,
      hasBeenEdited: true,
      compressionAnomalies: false,
      softwareUsed: "Adobe Photoshop",
    },
    analyzedAt: "2026-02-26T11:45:04Z",
    processingTimeMs: 5100,
  },
];

export const mockDashboardMetrics: DashboardMetrics = {
  totalAnalyses: 1247,
  threatsDetected: 389,
  mediaProcessed: 3891,
  avgRiskScore: 42,
  recentAnalyses: mockRecentAnalyses,
};
