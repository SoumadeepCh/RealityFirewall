"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Brain,
  AlertTriangle,
  FileSearch,
  Clock,
  HardDrive,
  Layers,
  ArrowLeft,
  Activity,
  BarChart3,
  Shield,
  Zap,
} from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import AuthenticityMeter from "@/components/ui/AuthenticityMeter";
import RiskMeter from "@/components/ui/RiskMeter";
import { mockAnalysisResult } from "@/lib/mock-data";
import type { AnalysisResult, DetectionSignal, AMAFFeatureVector, SegmentAuthenticity } from "@/lib/types";

const severityColor: Record<string, string> = {
  low: "#06d6a0",
  suspicious: "#fbbf24",
  harmful: "#ff8c42",
  high_risk: "#ff4d6d",
};

function SignalRow({ signal }: { signal: DetectionSignal }) {
  const color = severityColor[signal.severity] || "#8888a0";
  return (
    <div
      style={{
        display: "flex",
        gap: "12px",
        padding: "14px 0",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "8px",
          background: `${color}12`,
          border: `1px solid ${color}25`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: "2px",
        }}
      >
        <AlertTriangle size={16} color={color} />
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "8px",
            marginBottom: "4px",
          }}
        >
          <span style={{ fontSize: "14px", fontWeight: 600 }}>
            {signal.name}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 700,
                fontFamily: "var(--font-mono), monospace",
                color,
              }}
            >
              {Math.round(signal.confidence * 100)}%
            </span>
            <Badge level={signal.severity} size="sm" />
          </div>
        </div>
        <p style={{ color: "#8888a0", fontSize: "13px", lineHeight: 1.5 }}>
          {signal.description}
        </p>
      </div>
    </div>
  );
}

// ---- Feature Vector Display ----

const FEATURE_LABELS: Record<string, { name: string; fullName: string; color: string }> = {
  hfer: { name: "HFER", fullName: "High Frequency Energy Ratio", color: "#06d6a0" },
  svd: { name: "SVD", fullName: "Spectral Variance Deviation", color: "#7b61ff" },
  pdi: { name: "PDI", fullName: "Patch Drift Index", color: "#ff8c42" },
  tiis: { name: "TIIS", fullName: "Temporal Identity Instability", color: "#ff4d6d" },
  fav: { name: "FAV", fullName: "Flow Acceleration Variance", color: "#fbbf24" },
  etk: { name: "ETK", fullName: "Energy Transition Kurtosis", color: "#06d6a0" },
  pvss: { name: "PVSS", fullName: "Pitch Variance Smoothness", color: "#7b61ff" },
  frd: { name: "FRD", fullName: "Spectral Flatness Deviation", color: "#ff8c42" },
};

function FeatureVectorPanel({ vector }: { vector: AMAFFeatureVector }) {
  const entries = Object.entries(vector).filter(([, v]) => v !== null) as [string, number][];

  if (entries.length === 0) return null;

  return (
    <Card padding="lg">
      <CardHeader>
        <h2
          style={{
            fontSize: "16px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Activity size={18} color="#06d6a0" />
          AMAF Feature Vector
        </h2>
      </CardHeader>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "12px",
        }}
      >
        {entries.map(([key, value]) => {
          const info = FEATURE_LABELS[key] || { name: key, fullName: key, color: "#8888a0" };
          // Normalize for bar display (cap at reasonable ranges)
          const barWidth = Math.min(100, Math.max(5, value * (key === "pvss" ? 0.5 : key === "etk" ? 5 : 100)));

          return (
            <div
              key={key}
              style={{
                padding: "12px 14px",
                borderRadius: "10px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "6px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: info.color,
                    letterSpacing: "0.04em",
                  }}
                >
                  {info.name}
                </span>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    fontFamily: "var(--font-mono), monospace",
                    color: "#f0f0f5",
                  }}
                >
                  {value < 0.01 ? value.toExponential(2) : value.toFixed(4)}
                </span>
              </div>
              <p
                style={{
                  fontSize: "10px",
                  color: "#55556a",
                  marginBottom: "8px",
                }}
              >
                {info.fullName}
              </p>
              <div
                style={{
                  height: "3px",
                  borderRadius: "2px",
                  background: "rgba(255,255,255,0.05)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${barWidth}%`,
                    background: info.color,
                    borderRadius: "2px",
                    transition: "width 0.8s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---- Segment Timeline ----

function SegmentTimeline({ segments }: { segments: SegmentAuthenticity[] }) {
  if (segments.length === 0) return null;

  return (
    <Card padding="lg">
      <CardHeader>
        <h2
          style={{
            fontSize: "16px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <BarChart3 size={18} color="#7b61ff" />
          Authenticity Timeline
        </h2>
      </CardHeader>
      <div
        style={{
          display: "flex",
          gap: "3px",
          alignItems: "flex-end",
          height: "80px",
          padding: "0 4px",
        }}
      >
        {segments.map((seg) => {
          const barHeight = Math.max(8, seg.authenticityScore * 72);
          const color = seg.flagged
            ? "#ff4d6d"
            : seg.authenticityScore > 0.7
            ? "#06d6a0"
            : seg.authenticityScore > 0.4
            ? "#fbbf24"
            : "#ff8c42";

          return (
            <div
              key={seg.segmentIndex}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
              }}
              title={`Segment ${seg.segmentIndex + 1}: ${(seg.authenticityScore * 100).toFixed(0)}% authentic (${seg.startTime.toFixed(1)}s - ${seg.endTime.toFixed(1)}s)`}
            >
              <div
                style={{
                  width: "100%",
                  height: `${barHeight}px`,
                  borderRadius: "3px 3px 0 0",
                  background: color,
                  opacity: seg.flagged ? 1 : 0.7,
                  transition: "height 0.5s ease",
                  position: "relative",
                }}
              >
                {seg.flagged && (
                  <div
                    style={{
                      position: "absolute",
                      top: "-6px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: "8px",
                    }}
                  >
                    ⚠
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "10px",
          color: "#55556a",
          marginTop: "4px",
          padding: "0 4px",
        }}
      >
        <span>0s</span>
        <span>{segments[segments.length - 1]?.endTime.toFixed(0)}s</span>
      </div>
      {segments.some((s) => s.flagged) && (
        <p
          style={{
            fontSize: "12px",
            color: "#ff4d6d",
            marginTop: "8px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <AlertTriangle size={12} />
          {segments.filter((s) => s.flagged).length} segment(s) flagged as potentially manipulated
        </p>
      )}
    </Card>
  );
}

// ---- Main Page ----

export default function ResultsPage() {
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    // Try to load from sessionStorage first (real analysis)
    const stored = sessionStorage.getItem("lastAnalysis");
    if (stored) {
      try {
        setResult(JSON.parse(stored));
        return;
      } catch {
        // Fall through to mock
      }
    }
    // Fallback to mock data
    setResult(mockAnalysisResult);
  }, []);

  if (!result) return null;

  const levelLabel = result.analysisLevel
    ? result.analysisLevel === "level1_lightweight"
      ? "Level 1 — Lightweight"
      : result.analysisLevel === "level2_deep_spatial"
      ? "Level 2 — Deep Spatial"
      : "Level 3 — Temporal + Cross-Modal"
    : null;

  return (
    <>
      <Navbar />
      <main
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "88px 24px 60px",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "8px",
            }}
          >
            <Link
              href="/analyze"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#8888a0",
                textDecoration: "none",
                transition: "all 0.2s",
              }}
            >
              <ArrowLeft size={16} />
            </Link>
            <h1
              style={{
                fontSize: "28px",
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              Analysis Results
            </h1>
            <Badge level={result.riskLevel} />
            {result.earlyExit && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#06d6a0",
                  background: "rgba(6,214,160,0.1)",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Zap size={10} /> Early Exit
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              gap: "20px",
              flexWrap: "wrap",
              fontSize: "13px",
              color: "#8888a0",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <FileSearch size={13} />
              {result.media.filename}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <Clock size={13} />
              {(result.processingTimeMs / 1000).toFixed(1)}s processing
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <HardDrive size={13} />
              {(result.media.size / 1_000_000).toFixed(1)} MB
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <Layers size={13} />
              {result.media.mediaType.toUpperCase()}
            </span>
            {levelLabel && (
              <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <Shield size={13} />
                {levelLabel}
              </span>
            )}
          </div>
        </div>

        {/* Meters row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "20px",
            marginBottom: "24px",
          }}
        >
          <Card padding="lg" style={{ display: "flex", justifyContent: "center" }}>
            <AuthenticityMeter fakeProbability={result.fakeProbability} />
          </Card>
          <Card padding="lg">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                height: "100%",
                gap: "24px",
              }}
            >
              <RiskMeter score={result.riskScore} />

              {result.manipulationType && (
                <div
                  style={{
                    padding: "14px 18px",
                    borderRadius: "12px",
                    background: "rgba(255, 77, 109, 0.06)",
                    border: "1px solid rgba(255, 77, 109, 0.15)",
                  }}
                >
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#8888a0",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: "4px",
                      fontWeight: 600,
                    }}
                  >
                    Detected Manipulation
                  </p>
                  <p
                    style={{
                      fontSize: "15px",
                      fontWeight: 700,
                      color: "#ff4d6d",
                    }}
                  >
                    {result.manipulationType}
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* AMAF Feature Vector */}
        {result.featureVector && (
          <div style={{ marginBottom: "24px" }}>
            <FeatureVectorPanel vector={result.featureVector} />
          </div>
        )}

        {/* Segment Timeline */}
        {result.segments && result.segments.length > 0 && (
          <div style={{ marginBottom: "24px" }}>
            <SegmentTimeline segments={result.segments} />
          </div>
        )}

        {/* Two-column: Signals + Explanation */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gap: "20px",
            marginBottom: "24px",
          }}
        >
          {/* Detection Signals */}
          <Card padding="lg">
            <CardHeader>
              <h2
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <AlertTriangle size={18} color="#fbbf24" />
                Detection Signals ({result.signals.length})
              </h2>
            </CardHeader>
            <div>
              {result.signals.map((s) => (
                <SignalRow key={s.id} signal={s} />
              ))}
            </div>
          </Card>

          {/* AI Explanation */}
          <Card padding="lg">
            <CardHeader>
              <h2
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Brain size={18} color="#7b61ff" />
                AI Explanation
              </h2>
            </CardHeader>
            <p
              style={{
                color: "#c0c0d0",
                fontSize: "14px",
                lineHeight: 1.75,
              }}
            >
              {result.explanation}
            </p>
          </Card>
        </div>

        {/* Evidence / Metadata */}
        <Card padding="lg">
          <CardHeader>
            <h2
              style={{
                fontSize: "16px",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <FileSearch size={18} color="#06d6a0" />
              Metadata Evidence
            </h2>
          </CardHeader>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
            }}
          >
            {[
              {
                label: "EXIF Data",
                value: result.metadata.exifPresent ? "Present" : "Stripped",
                warn: !result.metadata.exifPresent,
              },
              {
                label: "Editing Detected",
                value: result.metadata.hasBeenEdited ? "Yes" : "No",
                warn: result.metadata.hasBeenEdited,
              },
              {
                label: "Compression Anomalies",
                value: result.metadata.compressionAnomalies ? "Detected" : "None",
                warn: result.metadata.compressionAnomalies,
              },
              {
                label: "Software",
                value: result.metadata.softwareUsed || "Unknown",
                warn: !result.metadata.softwareUsed || result.metadata.softwareUsed === "Unknown",
              },
            ].map((m) => (
              <div
                key={m.label}
                style={{
                  padding: "14px 18px",
                  borderRadius: "10px",
                  background: m.warn
                    ? "rgba(255, 77, 109, 0.04)"
                    : "rgba(6, 214, 160, 0.04)",
                  border: `1px solid ${
                    m.warn
                      ? "rgba(255, 77, 109, 0.12)"
                      : "rgba(6, 214, 160, 0.12)"
                  }`,
                }}
              >
                <p
                  style={{
                    fontSize: "11px",
                    color: "#55556a",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 600,
                    marginBottom: "4px",
                  }}
                >
                  {m.label}
                </p>
                <p
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    color: m.warn ? "#ff4d6d" : "#06d6a0",
                  }}
                >
                  {m.value}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </main>
    </>
  );
}
