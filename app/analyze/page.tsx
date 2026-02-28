"use client";

import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import {
  Upload,
  Image as ImageIcon,
  Video,
  AudioLines,
  FileText,
  X,
  ScanEye,
  FileUp,
  Shield,
  Layers,
  Zap,
} from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import type { MediaType, AnalysisResult, DetectionSignal, AMAFFeatureVector } from "@/lib/types";

const mediaTypes: { type: MediaType; icon: React.ElementType; label: string }[] = [
  { type: "image", icon: ImageIcon, label: "Image" },
  { type: "video", icon: Video, label: "Video" },
  { type: "audio", icon: AudioLines, label: "Audio" },
  { type: "text", icon: FileText, label: "Text" },
];

const acceptMap: Record<MediaType, Record<string, string[]>> = {
  image: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"] },
  video: { "video/*": [".mp4", ".webm", ".avi", ".mov", ".mkv"] },
  audio: { "audio/*": [".mp3", ".wav", ".ogg", ".flac", ".m4a"] },
  text: { "text/*": [".txt", ".json", ".csv"] },
};

const levelLabels: Record<string, string> = {
  level1_lightweight: "Level 1 — Lightweight Scan",
  level2_deep_spatial: "Level 2 — Deep Spatial Analysis",
  level3_temporal_crossmodal: "Level 3 — Temporal + Cross-Modal",
};

export default function AnalyzePage() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<MediaType>("image");
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState("");
  const [analysisLevel, setAnalysisLevel] = useState("");

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptMap[selectedType],
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024, // 100MB
  });

  const handleAnalyze = async () => {
    if (!file) return;
    setIsAnalyzing(true);
    setAnalysisPhase("Routing media...");
    setAnalysisLevel("level1_lightweight");

    try {
      // Send file to Python AI service backend
      const formData = new FormData();
      formData.append("file", file);

      setAnalysisPhase("Uploading to AI service...");
      setAnalysisLevel("level1_lightweight");

      const API_URL = process.env.NEXT_PUBLIC_AI_SERVICE_URL || "http://localhost:8000";
      const response = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: "Server error" }));
        throw new Error(err.detail || `Server returned ${response.status}`);
      }

      setAnalysisPhase("Processing results...");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apiResult: any = await response.json();

      setAnalysisLevel(apiResult.analysis_level || "level2_deep_spatial");
      setAnalysisPhase("Scoring & calibrating...");

      // Map snake_case API response → camelCase frontend types
      const signals: DetectionSignal[] = (apiResult.signals || []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) => ({
          id: s.id,
          name: s.name,
          category: s.category,
          confidence: s.confidence,
          description: s.description,
          severity: s.severity,
        })
      );

      const result: AnalysisResult = {
        id: apiResult.id || `analysis-${Date.now()}`,
        media: {
          id: `media-${Date.now()}`,
          filename: apiResult.media?.filename || file.name,
          mediaType: apiResult.media?.media_type || selectedType,
          size: apiResult.media?.file_size || file.size,
          uploadedAt: new Date().toISOString(),
          url: URL.createObjectURL(file),
        },
        fakeProbability: apiResult.fake_probability,
        riskLevel: apiResult.risk_level,
        riskScore: apiResult.risk_score,
        signals,
        explanation: apiResult.explanation || "",
        manipulationType: apiResult.manipulation_type,
        metadata: {
          exifPresent: apiResult.metadata_evidence?.exif_present ?? true,
          hasBeenEdited: apiResult.metadata_evidence?.has_been_edited ?? false,
          compressionAnomalies: apiResult.metadata_evidence?.compression_anomalies ?? false,
          softwareUsed: apiResult.metadata_evidence?.software_used,
        },
        analyzedAt: new Date().toISOString(),
        processingTimeMs: apiResult.processing_time_ms || 0,
        featureVector: apiResult.feature_vector
          ? {
              hfer: apiResult.feature_vector.hfer,
              svd: apiResult.feature_vector.svd,
              pdi: apiResult.feature_vector.pdi,
              tiis: apiResult.feature_vector.tiis,
              fav: apiResult.feature_vector.fav,
              etk: apiResult.feature_vector.etk,
              pvss: apiResult.feature_vector.pvss,
              frd: apiResult.feature_vector.frd,
            }
          : undefined,
        segments: (apiResult.segments || []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (s: any) => ({
            segmentIndex: s.segment_index,
            startTime: s.start_time,
            endTime: s.end_time,
            authenticityScore: s.authenticity_score,
            flagged: s.flagged,
          })
        ),
        changePoints: (apiResult.change_points || []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (c: any) => ({
            timestamp: c.timestamp,
            segmentIndex: c.segment_index,
            cusumValue: c.cusum_value,
            direction: c.direction,
          })
        ),
        analysisLevel: apiResult.analysis_level,
        earlyExit: apiResult.early_exit,
      };

      // Store result for the results page
      sessionStorage.setItem("lastAnalysis", JSON.stringify(result));
      setAnalysisPhase("Complete!");

      setTimeout(() => {
        router.push("/results");
      }, 500);
    } catch (err) {
      console.error("Analysis failed:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      setAnalysisPhase(`Analysis failed: ${message}`);
      setIsAnalyzing(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <>
      <Navbar />
      <main
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          padding: "88px 24px 60px",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Analyze Media
          </h1>
          <p style={{ color: "#8888a0", fontSize: "14px", marginTop: "6px" }}>
            Upload an image, video, audio, or text file for deepfake and
            manipulation detection using the AMAF pipeline.
          </p>
        </div>

        {/* Media type selector */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "8px",
            marginBottom: "28px",
          }}
        >
          {mediaTypes.map(({ type, icon: Icon, label }) => {
            const active = selectedType === type;
            return (
              <button
                key={type}
                onClick={() => {
                  setSelectedType(type);
                  setFile(null);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 20px",
                  borderRadius: "10px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: active
                    ? "1px solid rgba(6, 214, 160, 0.4)"
                    : "1px solid rgba(255,255,255,0.06)",
                  background: active
                    ? "rgba(6, 214, 160, 0.08)"
                    : "rgba(255,255,255,0.02)",
                  color: active ? "#06d6a0" : "#8888a0",
                  transition: "all 0.2s",
                  fontFamily: "inherit",
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Drop zone */}
        <Card padding="lg" glow={isDragActive}>
          {!file ? (
            <div
              {...getRootProps()}
              style={{
                border: `2px dashed ${isDragActive ? "#06d6a0" : "rgba(255,255,255,0.08)"}`,
                borderRadius: "14px",
                padding: "60px 20px",
                textAlign: "center",
                cursor: "pointer",
                transition: "all 0.3s ease",
                background: isDragActive
                  ? "rgba(6, 214, 160, 0.04)"
                  : "transparent",
              }}
            >
              <input {...getInputProps()} />
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "16px",
                  background: "rgba(6, 214, 160, 0.08)",
                  border: "1px solid rgba(6, 214, 160, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                }}
              >
                <Upload size={28} color="#06d6a0" />
              </div>
              <p
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                {isDragActive
                  ? "Drop your file here..."
                  : "Drag & drop your file here"}
              </p>
              <p style={{ color: "#55556a", fontSize: "13px" }}>
                or click to browse · Max 100MB
              </p>
            </div>
          ) : (
            <div>
              {/* File preview */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "20px",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  marginBottom: "24px",
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "12px",
                    background: "rgba(6, 214, 160, 0.08)",
                    border: "1px solid rgba(6, 214, 160, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <FileUp size={22} color="#06d6a0" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {file.name}
                  </p>
                  <p style={{ color: "#55556a", fontSize: "12px", marginTop: "2px" }}>
                    {formatSize(file.size)} · {selectedType.toUpperCase()}
                  </p>
                </div>
                {!isAnalyzing && (
                  <button
                    onClick={() => setFile(null)}
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(255,77,109,0.1)",
                      border: "1px solid rgba(255,77,109,0.2)",
                      color: "#ff4d6d",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Analyze button */}
              <Button
                onClick={handleAnalyze}
                loading={isAnalyzing}
                icon={<ScanEye size={18} />}
                size="lg"
                style={{ width: "100%" }}
              >
                {isAnalyzing ? "Analyzing..." : "Run AMAF Analysis"}
              </Button>

              {isAnalyzing && (
                <div
                  style={{
                    marginTop: "20px",
                  }}
                >
                  {/* Progress bar */}
                  <div
                    style={{
                      height: "3px",
                      borderRadius: "2px",
                      background: "rgba(255,255,255,0.05)",
                      overflow: "hidden",
                      marginBottom: "16px",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: "60%",
                        background: "linear-gradient(90deg, #06d6a0, #7b61ff)",
                        borderRadius: "2px",
                        animation: "shimmer 1.5s infinite",
                      }}
                    />
                  </div>

                  {/* Analysis level indicator */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      gap: "12px",
                      marginBottom: "12px",
                    }}
                  >
                    {["level1_lightweight", "level2_deep_spatial", "level3_temporal_crossmodal"].map((lvl) => {
                      const isActive = lvl === analysisLevel;
                      const isPast = [
                        "level1_lightweight",
                        "level2_deep_spatial",
                        "level3_temporal_crossmodal",
                      ].indexOf(lvl) < [
                        "level1_lightweight",
                        "level2_deep_spatial",
                        "level3_temporal_crossmodal",
                      ].indexOf(analysisLevel);

                      return (
                        <div
                          key={lvl}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 12px",
                            borderRadius: "8px",
                            fontSize: "11px",
                            fontWeight: 600,
                            background: isActive
                              ? "rgba(6, 214, 160, 0.1)"
                              : isPast
                              ? "rgba(123, 97, 255, 0.08)"
                              : "rgba(255,255,255,0.02)",
                            border: isActive
                              ? "1px solid rgba(6, 214, 160, 0.3)"
                              : "1px solid rgba(255,255,255,0.04)",
                            color: isActive
                              ? "#06d6a0"
                              : isPast
                              ? "#7b61ff"
                              : "#55556a",
                          }}
                        >
                          {isPast ? (
                            <Shield size={12} />
                          ) : isActive ? (
                            <Zap size={12} />
                          ) : (
                            <Layers size={12} />
                          )}
                          {lvl === "level1_lightweight"
                            ? "L1"
                            : lvl === "level2_deep_spatial"
                            ? "L2"
                            : "L3"}
                        </div>
                      );
                    })}
                  </div>

                  <p
                    style={{
                      textAlign: "center",
                      color: "#8888a0",
                      fontSize: "13px",
                    }}
                  >
                    {analysisPhase}
                  </p>
                  <p
                    style={{
                      textAlign: "center",
                      color: "#55556a",
                      fontSize: "11px",
                      marginTop: "4px",
                    }}
                  >
                    {levelLabels[analysisLevel] || "Initializing..."}
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>
      </main>
    </>
  );
}

// ---- Helper functions ----

function generateExplanation(
  amafResult: { fakeProbability: number; signals: { description: string; confidence: number }[]; featureVector: AMAFFeatureVector },
  mediaType: string
): string {
  const parts: string[] = [];
  const prob = amafResult.fakeProbability;

  if (prob > 0.7) {
    parts.push(`This ${mediaType} shows strong indicators of being AI-generated or manipulated.`);
  } else if (prob > 0.4) {
    parts.push(`This ${mediaType} shows some signs of potential manipulation that warrant further investigation.`);
  } else {
    parts.push(`This ${mediaType} appears largely authentic based on our multi-layer analysis.`);
  }

  const sorted = [...amafResult.signals].sort((a, b) => b.confidence - a.confidence);
  const top = sorted.slice(0, 3);
  if (top.length > 0) {
    parts.push(top.map((s) => s.description).join(" "));
  }

  return parts.join(" ");
}

function determineManipulationType(
  amafResult: { signals: { id: string }[]; featureVector: AMAFFeatureVector }
): string | undefined {
  const ids = amafResult.signals.map((s) => s.id);

  if (ids.includes("freq-hfer-low") && amafResult.featureVector.hfer !== null && amafResult.featureVector.hfer < 0.1) {
    return "AI-Generated (GAN Signature)";
  }
  if (ids.includes("vid-tiis-high")) {
    return "Deepfake Video (Identity Instability)";
  }
  if (ids.includes("audio-pvss-smooth")) {
    return "Synthetic Audio (TTS)";
  }
  if (ids.includes("cusum-changepoints")) {
    return "Partial Manipulation";
  }
  if (ids.includes("tex-pdi-high")) {
    return "Composited / Face-Swapped";
  }
  return undefined;
}
