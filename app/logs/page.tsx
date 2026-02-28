"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ScrollText,
  Shield,
  Clock,
  Hash,
  Layers,
  Activity,
  ChevronDown,
  ChevronUp,
  FileSearch,
  AlertTriangle,
  Brain,
  RefreshCw,
  ArrowLeft,
  Cpu,
} from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import type { RiskLevel } from "@/lib/types";

const AI_URL = process.env.NEXT_PUBLIC_AI_SERVICE_URL || "http://localhost:8000";

interface LogSignal {
  id: string;
  confidence: number;
  source: string;
}

interface LogEntry {
  timestamp: string;
  media_hash: string;
  filename: string;
  media_type: string;
  file_size: number;
  feature_vector: Record<string, number>;
  signal_count: number;
  signal_ids: string[];
  top_signals: LogSignal[];
  fake_probability: number;
  risk_level: string;
  verdict: string;
  processing_time_ms: number;
  model_versions: Record<string, string>;
  analysis_level: string;
}

const verdictColor: Record<string, string> = {
  authentic: "#06d6a0",
  suspicious: "#fbbf24",
  manipulated: "#ff4d6d",
  inconclusive: "#a8a29e",
};

const levelLabel: Record<string, string> = {
  level1_lightweight: "Level 1 — Lightweight",
  level2_deep_spatial: "Level 2 — Deep Spatial",
  level3_temporal_crossmodal: "Level 3 — Temporal + Cross-modal",
};

const SIGNAL_EXPLANATIONS: Record<string, string> = {
  "model-efficientnet-anomaly":
    "EfficientNet-B4 CNN detected anomalous feature patterns consistent with AI-generated content.",
  "freq-hfer-low":
    "High-frequency energy ratio is suppressed — GANs typically produce less high-frequency noise than cameras.",
  "freq-svd-high":
    "Spectral variance deviates significantly from natural images, indicating potential synthesis.",
  "tex-pdi-high":
    "Patch drift index is elevated — adjacent face patches show inconsistent texture, typical of face compositing.",
  "vid-tiis-high":
    "Temporal identity instability detected — face embeddings drift frame-to-frame more than in real video.",
  "vid-identity-spike":
    "Sudden identity embedding spikes detected at specific frames, indicating face-swap transition points.",
  "audio-etk-high":
    "Energy transition kurtosis is unusual — sharp energy transitions suggest synthetic speech boundaries.",
  "audio-pvss-smooth":
    "Pitch variance is unnaturally smooth — TTS systems often produce over-regularized pitch contours.",
  "audio-frd-high":
    "Spectral flatness deviation suggests over-regularized spectrum, common in voice cloning.",
  "audio-spoof-detected":
    "MFCC + CNN analysis detected patterns consistent with speech synthesis or voice cloning.",
  "meta-editing-software":
    "Metadata indicates the file was processed by editing software (e.g., Photoshop, GIMP).",
  "meta-compression-anomaly":
    "JPEG compression quality is unusually high or inconsistent with camera output.",
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ProbabilityBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct > 70 ? "#ff4d6d" : pct > 40 ? "#fbbf24" : "#06d6a0";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        minWidth: "120px",
      }}
    >
      <div
        style={{
          flex: 1,
          height: "6px",
          borderRadius: "3px",
          background: "rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: "3px",
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            transition: "width 0.5s ease",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: "var(--font-mono), monospace",
          fontSize: "13px",
          fontWeight: 700,
          color,
          minWidth: "36px",
          textAlign: "right",
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

function FeatureChip({
  name,
  value,
}: {
  name: string;
  value: number;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "3px 8px",
        borderRadius: "6px",
        background: "rgba(139, 92, 246, 0.08)",
        border: "1px solid rgba(139, 92, 246, 0.15)",
        fontSize: "11px",
        fontFamily: "var(--font-mono), monospace",
        color: "#a78bfa",
      }}
    >
      <span style={{ opacity: 0.7 }}>{name}</span>
      <span style={{ fontWeight: 700 }}>{value.toFixed(4)}</span>
    </span>
  );
}

function LogCard({
  entry,
  index,
}: {
  entry: LogEntry;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const vColor = verdictColor[entry.verdict] || "#8888a0";

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "12px",
        overflow: "hidden",
        transition: "border-color 0.2s",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = "rgba(139,92,246,0.2)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")
      }
    >
      {/* Header Row */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto auto auto auto",
          gap: "16px",
          alignItems: "center",
          padding: "16px 20px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {/* File info */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: vColor,
              boxShadow: `0 0 8px ${vColor}80`,
              flexShrink: 0,
            }}
          />
          <div>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 600,
                maxWidth: "240px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {entry.filename}
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "#55556a",
                marginTop: "2px",
                display: "flex",
                gap: "8px",
              }}
            >
              <span>{entry.media_type.toUpperCase()}</span>
              <span>·</span>
              <span>{formatBytes(entry.file_size)}</span>
            </div>
          </div>
        </div>

        {/* Probability */}
        <ProbabilityBar value={entry.fake_probability} />

        {/* Badge */}
        <Badge
          level={entry.risk_level as RiskLevel}
          size="sm"
        />

        {/* Timestamp */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "12px",
            color: "#55556a",
            fontFamily: "var(--font-mono), monospace",
          }}
        >
          <Clock size={12} />
          {formatTime(entry.timestamp)}
        </div>

        {/* Expand */}
        <div style={{ color: "#55556a" }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.04)",
            padding: "20px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "20px",
          }}
        >
          {/* Left: Pipeline Explanation */}
          <div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#8b5cf6",
                marginBottom: "12px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Brain size={14} />
              Pipeline Breakdown
            </div>

            {/* Analysis Level */}
            <div style={{ marginBottom: "14px" }}>
              <div
                style={{
                  fontSize: "11px",
                  color: "#55556a",
                  marginBottom: "4px",
                }}
              >
                Analysis Depth
              </div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#c4b5fd",
                }}
              >
                {levelLabel[entry.analysis_level] || entry.analysis_level}
              </div>
            </div>

            {/* Models Used */}
            {Object.keys(entry.model_versions).length > 0 && (
              <div style={{ marginBottom: "14px" }}>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#55556a",
                    marginBottom: "6px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <Cpu size={11} />
                  Models Invoked
                </div>
                <div
                  style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}
                >
                  {Object.entries(entry.model_versions).map(([k, v]) => (
                    <span
                      key={k}
                      style={{
                        fontSize: "11px",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        background: "rgba(6, 214, 160, 0.08)",
                        border: "1px solid rgba(6, 214, 160, 0.15)",
                        color: "#06d6a0",
                        fontFamily: "var(--font-mono), monospace",
                      }}
                    >
                      {k}: {v}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Processing Time */}
            <div style={{ marginBottom: "14px" }}>
              <div
                style={{
                  fontSize: "11px",
                  color: "#55556a",
                  marginBottom: "4px",
                }}
              >
                Processing Time
              </div>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#fbbf24",
                  fontFamily: "var(--font-mono), monospace",
                }}
              >
                {entry.processing_time_ms}ms
              </div>
            </div>

            {/* Media Hash */}
            <div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#55556a",
                  marginBottom: "4px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Hash size={11} />
                SHA-256 Media Hash
              </div>
              <div
                style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-mono), monospace",
                  color: "#666680",
                  wordBreak: "break-all",
                }}
              >
                {entry.media_hash}
              </div>
            </div>
          </div>

          {/* Right: Signals + Features */}
          <div>
            {/* Signals */}
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#f97316",
                  marginBottom: "10px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <AlertTriangle size={14} />
                Detection Signals ({entry.signal_count})
              </div>

              {entry.top_signals.length === 0 ? (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#55556a",
                    fontStyle: "italic",
                  }}
                >
                  No anomalous signals detected.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {entry.top_signals.map((sig) => (
                    <div
                      key={sig.id}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "8px",
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            fontFamily: "var(--font-mono), monospace",
                            color: "#f97316",
                          }}
                        >
                          {sig.id}
                        </span>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "11px",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              background:
                                sig.source === "pretrained"
                                  ? "rgba(59, 130, 246, 0.12)"
                                  : "rgba(168, 162, 158, 0.12)",
                              color:
                                sig.source === "pretrained"
                                  ? "#3b82f6"
                                  : "#a8a29e",
                              fontWeight: 600,
                            }}
                          >
                            {sig.source}
                          </span>
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: 700,
                              fontFamily: "var(--font-mono), monospace",
                              color: sig.confidence > 0.7 ? "#ff4d6d" : "#fbbf24",
                            }}
                          >
                            {(sig.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#7a7a90",
                          lineHeight: 1.5,
                        }}
                      >
                        {SIGNAL_EXPLANATIONS[sig.id] ||
                          "Signal detected during forensic analysis."}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Feature Vector */}
            {Object.keys(entry.feature_vector).length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#8b5cf6",
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Activity size={14} />
                  Feature Vector
                </div>
                <div
                  style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}
                >
                  {Object.entries(entry.feature_vector).map(([k, v]) => (
                    <FeatureChip key={k} name={k} value={v} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${AI_URL}/logs?limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEntries(data.entries || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to connect to AI service"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Stats
  const verdictCounts = entries.reduce(
    (acc, e) => {
      acc[e.verdict] = (acc[e.verdict] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const avgTime =
    entries.length > 0
      ? Math.round(
          entries.reduce((s, e) => s + e.processing_time_ms, 0) /
            entries.length
        )
      : 0;
  const pretrainedCount = entries.filter(
    (e) => Object.keys(e.model_versions).length > 0
  ).length;

  return (
    <>
      <Navbar />
      <main
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "100px 20px 60px",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "32px",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <Link
              href="/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
                color: "#8b5cf6",
                textDecoration: "none",
                marginBottom: "8px",
              }}
            >
              <ArrowLeft size={14} />
              Dashboard
            </Link>
            <h1
              style={{
                fontSize: "28px",
                fontWeight: 800,
                background: "linear-gradient(135deg, #c4b5fd, #8b5cf6)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <ScrollText size={28} />
              Forensic Analysis Logs
            </h1>
            <p style={{ fontSize: "14px", color: "#55556a", marginTop: "4px" }}>
              Complete audit trail of every detection pipeline execution with
              signal breakdowns and feature vectors.
            </p>
          </div>
          <button
            onClick={fetchLogs}
            disabled={loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(139,92,246,0.3)",
              background: "rgba(139,92,246,0.08)",
              color: "#c4b5fd",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Stats Row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
            marginBottom: "28px",
          }}
        >
          {[
            {
              label: "Total Analyses",
              value: total.toString(),
              icon: FileSearch,
              color: "#8b5cf6",
            },
            {
              label: "Authentic",
              value: (verdictCounts["authentic"] || 0).toString(),
              icon: Shield,
              color: "#06d6a0",
            },
            {
              label: "Manipulated",
              value: (verdictCounts["manipulated"] || 0).toString(),
              icon: AlertTriangle,
              color: "#ff4d6d",
            },
            {
              label: "Avg Response",
              value: `${avgTime}ms`,
              icon: Clock,
              color: "#fbbf24",
            },
            {
              label: "AI-Backed",
              value: pretrainedCount.toString(),
              icon: Brain,
              color: "#3b82f6",
            },
          ].map((stat) => (
            <Card key={stat.label}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "4px 0",
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: `${stat.color}12`,
                    border: `1px solid ${stat.color}25`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <stat.icon size={18} color={stat.color} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#55556a",
                    }}
                  >
                    {stat.label}
                  </div>
                  <div
                    style={{
                      fontSize: "20px",
                      fontWeight: 800,
                      fontFamily: "var(--font-mono), monospace",
                      color: stat.color,
                    }}
                  >
                    {stat.value}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Error */}
        {error && (
          <Card>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 0",
                color: "#ff4d6d",
              }}
            >
              <AlertTriangle size={20} />
              <div>
                <div style={{ fontWeight: 600 }}>
                  Cannot reach AI Service
                </div>
                <div style={{ fontSize: "13px", color: "#8888a0" }}>
                  {error}. Make sure the Python backend is running at{" "}
                  <code style={{ color: "#c4b5fd" }}>{AI_URL}</code>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Loading */}
        {loading && !error && (
          <div
            style={{
              textAlign: "center",
              padding: "60px 0",
              color: "#55556a",
            }}
          >
            <RefreshCw
              size={24}
              style={{ animation: "spin 1s linear infinite" }}
            />
            <p style={{ marginTop: "12px", fontSize: "14px" }}>
              Loading forensic logs...
            </p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && entries.length === 0 && (
          <Card>
            <div
              style={{
                textAlign: "center",
                padding: "48px 20px",
                color: "#55556a",
              }}
            >
              <ScrollText size={40} style={{ marginBottom: "16px", opacity: 0.3 }} />
              <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>
                No analyses yet
              </h3>
              <p style={{ fontSize: "14px", maxWidth: "400px", margin: "0 auto" }}>
                Upload media on the{" "}
                <Link
                  href="/analyze"
                  style={{ color: "#8b5cf6", textDecoration: "none" }}
                >
                  Analyze page
                </Link>{" "}
                to start generating forensic logs.
              </p>
            </div>
          </Card>
        )}

        {/* Log Entries */}
        {!loading && entries.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* Column Labels */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto auto auto",
                gap: "16px",
                padding: "0 20px 4px",
                fontSize: "10px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "#55556a",
              }}
            >
              <span>File</span>
              <span style={{ minWidth: "120px" }}>Fake Probability</span>
              <span>Verdict</span>
              <span>Timestamp</span>
              <span />
            </div>

            {entries.map((entry, i) => (
              <LogCard key={`${entry.media_hash}-${i}`} entry={entry} index={i} />
            ))}
          </div>
        )}

        {/* How it works */}
        <Card>
          <div style={{ padding: "4px 0" }}>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#8b5cf6",
                marginBottom: "12px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Layers size={14} />
              How the Pipeline Works
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "16px",
              }}
            >
              {[
                {
                  step: "1",
                  title: "Pretrained Backbone",
                  desc: "EfficientNet-B4 extracts deep CNN features from face crops. InceptionV3 computes identity embeddings for drift analysis.",
                  color: "#06d6a0",
                },
                {
                  step: "2",
                  title: "Forensic Features",
                  desc: "Frequency analysis (HFER/SVD), texture consistency (PDI), audio metrics (ETK/PVSS/FRD), EXIF metadata, and audio spoof detection.",
                  color: "#fbbf24",
                },
                {
                  step: "3",
                  title: "Meta-Classifier",
                  desc: "LightGBM gradient-boosted classifier combines all 10 feature dimensions into a single calibrated probability.",
                  color: "#f97316",
                },
                {
                  step: "4",
                  title: "Governance",
                  desc: "Probabilities between 40-60% are marked 'Inconclusive'. Forensic logging stores every decision for audit trails.",
                  color: "#ff4d6d",
                },
              ].map((s) => (
                <div
                  key={s.step}
                  style={{
                    padding: "14px",
                    borderRadius: "10px",
                    background: `${s.color}06`,
                    border: `1px solid ${s.color}15`,
                  }}
                >
                  <div
                    style={{
                      fontSize: "22px",
                      fontWeight: 900,
                      fontFamily: "var(--font-mono), monospace",
                      color: s.color,
                      marginBottom: "6px",
                    }}
                  >
                    {s.step}
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 700,
                      marginBottom: "4px",
                    }}
                  >
                    {s.title}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#7a7a90",
                      lineHeight: 1.5,
                    }}
                  >
                    {s.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </main>

      <style jsx global>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}
