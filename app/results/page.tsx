"use client";

import React from "react";
import {
  Brain,
  AlertTriangle,
  FileSearch,
  Clock,
  HardDrive,
  Layers,
} from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import AuthenticityMeter from "@/components/ui/AuthenticityMeter";
import RiskMeter from "@/components/ui/RiskMeter";
import { mockAnalysisResult } from "@/lib/mock-data";
import type { DetectionSignal } from "@/lib/types";

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

export default function ResultsPage() {
  const result = mockAnalysisResult;

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
