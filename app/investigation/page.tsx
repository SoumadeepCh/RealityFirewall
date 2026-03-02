"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Film,
  ChevronDown,
  ChevronUp,
  FileSearch,
  Activity,
  Clock,
  Shield,
  AlertTriangle,
  BarChart3,
  Eye,
  Info,
} from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { mockAnalysisResult } from "@/lib/mock-data";
import type { AnalysisResult, SegmentAuthenticity } from "@/lib/types";

// ---- Frame Viewer ----

function FrameViewer({ segments, mediaType }: { segments: SegmentAuthenticity[]; mediaType: string }) {
  const [selected, setSelected] = useState(0);

  if (segments.length === 0) {
    return (
      <Card padding="lg">
        <CardHeader>
          <h2 style={{ fontSize: "16px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
            <Film size={18} color="#7b61ff" />
            Frame Viewer
          </h2>
        </CardHeader>
        <div style={{ textAlign: "center", padding: "40px", color: "#55556a" }}>
          <Film size={32} style={{ marginBottom: "12px", opacity: 0.3 }} />
          <p style={{ fontSize: "14px" }}>
            {mediaType === "video"
              ? "Frame data captured — run a video analysis to see per-frame breakdown."
              : "Frame viewer is available for video analysis."}
          </p>
        </div>
      </Card>
    );
  }

  const seg = segments[selected];

  return (
    <Card padding="lg">
      <CardHeader>
        <h2 style={{ fontSize: "16px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <Film size={18} color="#7b61ff" />
          Frame Viewer
        </h2>
        <span style={{ marginLeft: "auto", fontSize: "12px", color: "#55556a" }}>
          Frame {selected + 1} / {segments.length}
        </span>
      </CardHeader>

      {/* Authenticity reading for selected frame */}
      <div
        style={{
          padding: "16px 20px",
          borderRadius: "12px",
          background: seg.flagged ? "rgba(255,77,109,0.06)" : "rgba(6,214,160,0.06)",
          border: `1px solid ${seg.flagged ? "rgba(255,77,109,0.2)" : "rgba(6,214,160,0.2)"}`,
          marginBottom: "20px",
          display: "flex",
          gap: "24px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p style={{ fontSize: "11px", color: "#55556a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>Segment</p>
          <p style={{ fontSize: "18px", fontWeight: 800, fontFamily: "monospace" }}>#{selected + 1}</p>
        </div>
        <div>
          <p style={{ fontSize: "11px", color: "#55556a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>Timestamp</p>
          <p style={{ fontSize: "18px", fontWeight: 800, fontFamily: "monospace" }}>{seg.startTime.toFixed(1)}s — {seg.endTime.toFixed(1)}s</p>
        </div>
        <div>
          <p style={{ fontSize: "11px", color: "#55556a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>Authenticity</p>
          <p style={{ fontSize: "18px", fontWeight: 800, fontFamily: "monospace", color: seg.flagged ? "#ff4d6d" : "#06d6a0" }}>
            {(seg.authenticityScore * 100).toFixed(0)}%
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          {seg.flagged ? (
            <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#ff4d6d", fontWeight: 700, fontSize: "13px" }}>
              <AlertTriangle size={14} /> Flagged
            </span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#06d6a0", fontWeight: 700, fontSize: "13px" }}>
              <Shield size={14} /> Clean
            </span>
          )}
        </div>
      </div>

      {/* Thumbnail strip */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          overflowX: "auto",
          paddingBottom: "8px",
        }}
      >
        {segments.map((s, i) => {
          const isActive = i === selected;
          const color = s.flagged ? "#ff4d6d" : s.authenticityScore > 0.7 ? "#06d6a0" : "#fbbf24";

          return (
            <button
              key={i}
              onClick={() => setSelected(i)}
              style={{
                flexShrink: 0,
                width: "52px",
                padding: "6px 4px",
                borderRadius: "8px",
                border: isActive ? `2px solid ${color}` : "2px solid rgba(255,255,255,0.06)",
                background: isActive ? `${color}12` : "rgba(255,255,255,0.02)",
                cursor: "pointer",
                textAlign: "center",
                transition: "all 0.15s",
              }}
            >
              {/* Mini authenticity bar */}
              <div style={{ height: "28px", background: "rgba(255,255,255,0.04)", borderRadius: "4px", overflow: "hidden", display: "flex", alignItems: "flex-end", marginBottom: "4px" }}>
                <div style={{ width: "100%", height: `${s.authenticityScore * 100}%`, background: color, opacity: 0.7, transition: "height 0.3s" }} />
              </div>
              <div style={{ fontSize: "9px", color: isActive ? color : "#55556a", fontWeight: 700, fontFamily: "monospace" }}>
                {s.startTime.toFixed(0)}s
              </div>
              {s.flagged && <div style={{ fontSize: "8px", color: "#ff4d6d" }}>⚠</div>}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ---- Interactive Authenticity Timeline Chart ----

function TimelineChart({ segments }: { segments: SegmentAuthenticity[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (segments.length === 0) return null;

  return (
    <Card padding="lg">
      <CardHeader>
        <h2 style={{ fontSize: "16px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <BarChart3 size={18} color="#06d6a0" />
          Authenticity Timeline Graph
        </h2>
      </CardHeader>

      {/* SVG chart */}
      <div style={{ position: "relative" }}>
        <svg width="100%" height="120" viewBox={`0 0 ${segments.length * 20} 100`} preserveAspectRatio="none" style={{ display: "block" }}>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75, 1.0].map((y) => (
            <line key={y} x1={0} y1={(1 - y) * 80 + 10} x2={segments.length * 20} y2={(1 - y) * 80 + 10}
              stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          ))}
          {/* Area fill */}
          <polyline
            points={segments.map((s, i) => `${i * 20 + 10},${(1 - s.authenticityScore) * 80 + 10}`).join(" ")}
            fill="none"
            stroke="#06d6a0"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Flagged segment markers */}
          {segments.map((s, i) => s.flagged && (
            <circle key={i} cx={i * 20 + 10} cy={(1 - s.authenticityScore) * 80 + 10} r="4" fill="#ff4d6d" />
          ))}
          {/* Hover points */}
          {segments.map((s, i) => (
            <circle
              key={i}
              cx={i * 20 + 10}
              cy={(1 - s.authenticityScore) * 80 + 10}
              r="6"
              fill="transparent"
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>

        {/* Hover tooltip */}
        {hovered !== null && (
          <div
            style={{
              position: "absolute",
              top: "4px",
              left: `${Math.min(80, (hovered / segments.length) * 100)}%`,
              background: "rgba(5,5,16,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              padding: "8px 12px",
              fontSize: "12px",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              zIndex: 10,
            }}
          >
            <strong>Segment {hovered + 1}</strong> — {segments[hovered].startTime.toFixed(1)}s<br />
            Authenticity: <span style={{ color: segments[hovered].flagged ? "#ff4d6d" : "#06d6a0", fontWeight: 700 }}>
              {(segments[hovered].authenticityScore * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#55556a", padding: "0 4px" }}>
        <span>0s</span>
        <span>{segments[segments.length - 1]?.endTime.toFixed(0)}s</span>
      </div>
      <div style={{ display: "flex", gap: "16px", marginTop: "12px", fontSize: "12px", color: "#8888a0" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><span style={{ width: "10px", height: "3px", background: "#06d6a0", display: "inline-block", borderRadius: "2px" }}></span>Authenticity line</span>
        <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ff4d6d", display: "inline-block" }}></span>Flagged segment</span>
      </div>
    </Card>
  );
}

// ---- Evidence Accordion ----

interface AccordionItem {
  id: string;
  icon: React.ElementType;
  iconColor: string;
  label: string;
  content: React.ReactNode;
}

function EvidenceAccordion({ items }: { items: AccordionItem[] }) {
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);

  return (
    <Card padding="lg">
      <CardHeader>
        <h2 style={{ fontSize: "16px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <FileSearch size={18} color="#fbbf24" />
          Evidence Explorer
        </h2>
      </CardHeader>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {items.map((item) => {
          const isOpen = open === item.id;
          const Icon = item.icon;
          return (
            <div key={item.id} style={{ borderRadius: "10px", overflow: "hidden", border: isOpen ? `1px solid ${item.iconColor}25` : "1px solid rgba(255,255,255,0.05)" }}>
              <button
                onClick={() => setOpen(isOpen ? null : item.id)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: isOpen ? `${item.iconColor}08` : "rgba(255,255,255,0.02)",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                  color: isOpen ? item.iconColor : "#8888a0",
                  transition: "all 0.2s",
                }}
              >
                <Icon size={16} color={isOpen ? item.iconColor : "#55556a"} />
                <span style={{ flex: 1, fontSize: "14px", fontWeight: 600 }}>{item.label}</span>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {isOpen && (
                <div style={{ padding: "16px", borderTop: `1px solid ${item.iconColor}15` }}>
                  {item.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---- Main Page ----

export default function InvestigationPage() {
  const [result, setResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("lastAnalysis");
    if (stored) {
      try { setResult(JSON.parse(stored)); return; } catch { /* fall through */ }
    }
    setResult(mockAnalysisResult);
  }, []);

  if (!result) return null;

  const evidenceItems: AccordionItem[] = [
    {
      id: "signals",
      icon: AlertTriangle,
      iconColor: "#fbbf24",
      label: `Detection Signals (${result.signals.length})`,
      content: (
        <div>
          {result.signals.length === 0 && <p style={{ color: "#55556a", fontSize: "13px" }}>No signals detected.</p>}
          {result.signals.map((s) => (
            <div key={s.id} style={{ display: "flex", gap: "10px", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600 }}>{s.name}</span>
                  <Badge level={s.severity} size="sm" />
                </div>
                <p style={{ fontSize: "12px", color: "#8888a0", lineHeight: 1.4 }}>{s.description}</p>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "metadata",
      icon: FileSearch,
      iconColor: "#06d6a0",
      label: "Metadata & EXIF",
      content: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          {[
            { k: "EXIF Present", v: result.metadata.exifPresent ? "Yes" : "No (Stripped)", warn: !result.metadata.exifPresent },
            { k: "Editing Detected", v: result.metadata.hasBeenEdited ? "Yes" : "No", warn: result.metadata.hasBeenEdited },
            { k: "Compression Anomalies", v: result.metadata.compressionAnomalies ? "Detected" : "None", warn: result.metadata.compressionAnomalies },
            { k: "Software Used", v: result.metadata.softwareUsed || "Unknown", warn: !result.metadata.softwareUsed },
          ].map((r) => (
            <div key={r.k} style={{ padding: "10px 12px", borderRadius: "8px", background: r.warn ? "rgba(255,77,109,0.05)" : "rgba(6,214,160,0.05)", border: `1px solid ${r.warn ? "rgba(255,77,109,0.15)" : "rgba(6,214,160,0.15)"}` }}>
              <p style={{ fontSize: "10px", color: "#55556a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3px" }}>{r.k}</p>
              <p style={{ fontSize: "13px", fontWeight: 700, color: r.warn ? "#ff4d6d" : "#06d6a0" }}>{r.v}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "features",
      icon: Activity,
      iconColor: "#7b61ff",
      label: "AMAF Feature Vector",
      content: (
        <div>
          {!result.featureVector && <p style={{ color: "#55556a", fontSize: "13px" }}>No feature vector available.</p>}
          {result.featureVector && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px" }}>
              {Object.entries(result.featureVector)
                .filter(([, v]) => v !== null)
                .map(([k, v]) => (
                  <div key={k} style={{ padding: "10px 12px", borderRadius: "8px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <p style={{ fontSize: "10px", fontWeight: 700, color: "#7b61ff", letterSpacing: "0.04em", marginBottom: "4px" }}>{k.toUpperCase()}</p>
                    <p style={{ fontSize: "14px", fontWeight: 800, fontFamily: "monospace" }}>
                      {typeof v === "number" && v < 0.01 ? (v as number).toExponential(2) : (typeof v === "number" ? (v as number).toFixed(4) : "—")}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "virality",
      icon: Eye,
      iconColor: "#ff8c42",
      label: "Virality & Risk Profile",
      content: (
        <div>
          {!result.viralityAnalysis && <p style={{ color: "#55556a", fontSize: "13px" }}>Virality analysis not available. Run analysis via AI service.</p>}
          {result.viralityAnalysis && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(255,140,66,0.07)", border: "1px solid rgba(255,140,66,0.2)" }}>
                  <p style={{ fontSize: "10px", color: "#55556a", textTransform: "uppercase", marginBottom: "2px" }}>Virality Score</p>
                  <p style={{ fontSize: "22px", fontWeight: 800, fontFamily: "monospace", color: "#ff8c42" }}>{Math.round(result.viralityAnalysis.viralityScore)}</p>
                </div>
                <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(255,77,109,0.07)", border: "1px solid rgba(255,77,109,0.2)" }}>
                  <p style={{ fontSize: "10px", color: "#55556a", textTransform: "uppercase", marginBottom: "2px" }}>Misinformation Risk</p>
                  <p style={{ fontSize: "14px", fontWeight: 800, color: "#ff4d6d" }}>{result.viralityAnalysis.misinformationRisk.replace("_", " ").toUpperCase()}</p>
                </div>
                <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(123,97,255,0.07)", border: "1px solid rgba(123,97,255,0.2)" }}>
                  <p style={{ fontSize: "10px", color: "#55556a", textTransform: "uppercase", marginBottom: "2px" }}>Emotional Polarity</p>
                  <p style={{ fontSize: "14px", fontWeight: 800, fontFamily: "monospace", color: "#7b61ff" }}>{result.viralityAnalysis.emotionalPolarity.toFixed(2)}</p>
                </div>
              </div>
              {result.viralityAnalysis.riskFactors.length > 0 && (
                <div>
                  <p style={{ fontSize: "11px", color: "#55556a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Risk Factors</p>
                  {result.viralityAnalysis.riskFactors.map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "13px", color: "#c0c0d0", marginBottom: "6px", lineHeight: 1.4 }}>
                      <span style={{ color: "#fbbf24", marginTop: "2px" }}>•</span> {f}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "info",
      icon: Info,
      iconColor: "#8888a0",
      label: "Analysis Info",
      content: (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          {[
            { k: "File", v: result.media.filename },
            { k: "Type", v: result.media.mediaType.toUpperCase() },
            { k: "Size", v: `${(result.media.size / 1_000_000).toFixed(1)} MB` },
            { k: "Processing Time", v: `${(result.processingTimeMs / 1000).toFixed(1)}s` },
            { k: "Analysis Level", v: result.analysisLevel || "Unknown" },
            { k: "Analysis ID", v: result.id?.slice(0, 20) + "…" || "—" },
          ].map((r) => (
            <div key={r.k} style={{ padding: "10px 12px", borderRadius: "8px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p style={{ fontSize: "10px", color: "#55556a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3px" }}>{r.k}</p>
              <p style={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace", color: "#c0c0d0" }}>{r.v}</p>
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "88px 24px 60px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px", flexWrap: "wrap" }}>
          <Link
            href="/results"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "32px", height: "32px", borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.08)", color: "#8888a0", textDecoration: "none",
            }}
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: "10px" }}>
              <Shield size={22} color="#7b61ff" />
              Investigation Mode
            </h1>
            <p style={{ fontSize: "13px", color: "#8888a0", marginTop: "2px" }}>
              {result.media.filename} · <Clock size={11} style={{ display: "inline" }} /> {(result.processingTimeMs / 1000).toFixed(1)}s
            </p>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
            <Badge level={result.riskLevel} />
          </div>
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px" }}>
          {/* Left: Frame viewer */}
          <FrameViewer segments={result.segments || []} mediaType={result.media.mediaType} />

          {/* Right: Timeline chart */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <TimelineChart segments={result.segments || []} />

            {/* Quick stats */}
            <Card padding="lg">
              <CardHeader>
                <h2 style={{ fontSize: "16px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                  <Activity size={18} color="#06d6a0" />
                  Analysis Summary
                </h2>
              </CardHeader>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {[
                  { label: "Fake Probability", value: `${(result.fakeProbability * 100).toFixed(0)}%`, color: result.fakeProbability > 0.6 ? "#ff4d6d" : result.fakeProbability > 0.35 ? "#fbbf24" : "#06d6a0" },
                  { label: "Risk Score", value: `${result.riskScore}/100`, color: result.riskScore >= 70 ? "#ff4d6d" : result.riskScore >= 40 ? "#fbbf24" : "#06d6a0" },
                  { label: "Signals Fired", value: `${result.signals.length}`, color: "#8888a0" },
                  { label: "Segments", value: `${(result.segments || []).length}`, color: "#8888a0" },
                ].map((s) => (
                  <div key={s.label} style={{ padding: "12px 14px", borderRadius: "10px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <p style={{ fontSize: "11px", color: "#55556a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>{s.label}</p>
                    <p style={{ fontSize: "20px", fontWeight: 800, fontFamily: "monospace", color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* Evidence Explorer accordion — full width */}
        <EvidenceAccordion items={evidenceItems} />
      </main>
    </>
  );
}
