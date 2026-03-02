"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  ShieldAlert,
  FileVideo,
  TrendingUp,
  Upload,
  Image as ImageIcon,
  Video,
  AudioLines,
  Clock,
  RefreshCw,
  Activity,
} from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { mockDashboardMetrics } from "@/lib/mock-data";

const metrics = [
  {
    label: "Total Analyses",
    value: mockDashboardMetrics.totalAnalyses.toLocaleString(),
    icon: BarChart3,
    color: "#06d6a0",
    change: "+12%",
  },
  {
    label: "Threats Detected",
    value: mockDashboardMetrics.threatsDetected.toLocaleString(),
    icon: ShieldAlert,
    color: "#ff4d6d",
    change: "+8%",
  },
  {
    label: "Media Processed",
    value: mockDashboardMetrics.mediaProcessed.toLocaleString(),
    icon: FileVideo,
    color: "#7b61ff",
    change: "+23%",
  },
  {
    label: "Avg Risk Score",
    value: mockDashboardMetrics.avgRiskScore.toString(),
    icon: TrendingUp,
    color: "#fbbf24",
    change: "-3%",
  },
];

const mediaIcons: Record<string, React.ElementType> = {
  image: ImageIcon,
  video: Video,
  audio: AudioLines,
};

interface LogEntry {
  id: string;
  filename: string;
  media_type: string;
  fake_probability: number;
  risk_level: string;
  verdict: string;
  processing_time_ms: number;
  timestamp: string;
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<"recent" | "logs">("recent");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const API_URL = process.env.NEXT_PUBLIC_AI_SERVICE_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/logs?limit=50`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setLogs(data.entries || []);
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : "Could not reach AI service");
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "logs") fetchLogs();
  }, [activeTab]);

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
            marginBottom: "32px",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "28px",
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              Dashboard
            </h1>
            <p style={{ color: "#8888a0", fontSize: "14px", marginTop: "4px" }}>
              Overview of media analysis activity
            </p>
          </div>
          <Link href="/analyze" style={{ textDecoration: "none" }}>
            <Button icon={<Upload size={16} />}>Analyze Media</Button>
          </Link>
        </div>

        {/* Metric Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
            marginBottom: "40px",
          }}
        >
          {metrics.map((m) => (
            <Card key={m.label} padding="md">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "10px",
                    background: `${m.color}12`,
                    border: `1px solid ${m.color}25`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <m.icon size={20} color={m.color} />
                </div>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: m.change.startsWith("+") ? "#06d6a0" : "#ff4d6d",
                    background: m.change.startsWith("+")
                      ? "rgba(6,214,160,0.1)"
                      : "rgba(255,77,109,0.1)",
                    padding: "3px 8px",
                    borderRadius: "6px",
                  }}
                >
                  {m.change}
                </span>
              </div>
              <p
                style={{
                  fontSize: "30px",
                  fontWeight: 800,
                  fontFamily: "var(--font-mono), monospace",
                  lineHeight: 1,
                }}
              >
                {m.value}
              </p>
              <p style={{ color: "#8888a0", fontSize: "13px", marginTop: "6px" }}>
                {m.label}
              </p>
            </Card>
          ))}
        </div>

        {/* Tab selector */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {[
            { id: "recent" as const, label: "Recent Analyses", icon: Clock },
            { id: "logs" as const, label: "Forensic Logs", icon: Activity },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 18px",
                borderRadius: "10px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                border: activeTab === id ? "1px solid rgba(6,214,160,0.35)" : "1px solid rgba(255,255,255,0.06)",
                background: activeTab === id ? "rgba(6,214,160,0.08)" : "rgba(255,255,255,0.02)",
                color: activeTab === id ? "#06d6a0" : "#8888a0",
                transition: "all 0.2s",
              }}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "recent" && (
          <Card padding="lg">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 700 }}>
                Recent Analyses
              </h2>
              <Link
                href="/results"
                style={{
                  fontSize: "13px",
                  color: "#06d6a0",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                View all →
              </Link>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              {mockDashboardMetrics.recentAnalyses.map((a) => {
                const MIcon = mediaIcons[a.media.mediaType] || ImageIcon;
                return (
                  <Link
                    key={a.id}
                    href="/results"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      padding: "14px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      textDecoration: "none",
                      color: "inherit",
                      transition: "opacity 0.2s",
                    }}
                  >
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        background: "rgba(255,255,255,0.04)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <MIcon size={16} color="#8888a0" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {a.media.filename}
                      </p>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginTop: "2px",
                          fontSize: "12px",
                          color: "#55556a",
                        }}
                      >
                        <Clock size={11} />
                        {new Date(a.analyzedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 700,
                        fontFamily: "var(--font-mono), monospace",
                        color:
                          a.fakeProbability > 0.7
                            ? "#ff4d6d"
                            : a.fakeProbability > 0.4
                            ? "#fbbf24"
                            : "#06d6a0",
                        minWidth: "48px",
                        textAlign: "right",
                      }}
                    >
                      {Math.round(a.fakeProbability * 100)}%
                    </span>
                    <Badge level={a.riskLevel} size="sm" />
                  </Link>
                );
              })}
            </div>
          </Card>
        )}

        {activeTab === "logs" && (
          <Card padding="lg">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                <Activity size={18} color="#7b61ff" />
                Forensic Analysis Logs
              </h2>
              <button
                onClick={fetchLogs}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "7px 14px", borderRadius: "8px",
                  fontSize: "12px", fontWeight: 600,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
                  color: "#8888a0", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <RefreshCw size={13} style={{ animation: logsLoading ? "spin 1s linear infinite" : "none" }} />
                Refresh
              </button>
            </div>

            {logsLoading && (
              <div style={{ textAlign: "center", padding: "40px", color: "#55556a" }}>
                <RefreshCw size={24} style={{ animation: "spin 1s linear infinite", marginBottom: "12px" }} />
                <p style={{ fontSize: "13px" }}>Loading logs from AI service…</p>
              </div>
            )}

            {logsError && !logsLoading && (
              <div style={{ textAlign: "center", padding: "40px", color: "#ff4d6d" }}>
                <p style={{ fontSize: "14px", marginBottom: "8px" }}>⚠ Could not reach AI service</p>
                <p style={{ fontSize: "12px", color: "#55556a" }}>{logsError}</p>
                <p style={{ fontSize: "12px", color: "#55556a", marginTop: "8px" }}>
                  Make sure the AI service is running at{" "}
                  <code style={{ background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: "4px" }}>
                    {process.env.NEXT_PUBLIC_AI_SERVICE_URL || "http://localhost:8000"}
                  </code>
                </p>
              </div>
            )}

            {!logsLoading && !logsError && logs.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px", color: "#55556a" }}>
                <p style={{ fontSize: "14px", marginBottom: "4px" }}>No logs yet</p>
                <p style={{ fontSize: "12px" }}>Analyze some media to see forensic log entries here.</p>
              </div>
            )}

            {!logsLoading && logs.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                {logs.map((entry) => {
                  const MIcon = mediaIcons[entry.media_type] || ImageIcon;
                  return (
                    <div
                      key={entry.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "14px",
                        padding: "12px 0",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <MIcon size={14} color="#8888a0" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {entry.filename}
                        </p>
                        <p style={{ fontSize: "11px", color: "#55556a", marginTop: "1px" }}>
                          {new Date(entry.timestamp).toLocaleString()} · {(entry.processing_time_ms / 1000).toFixed(1)}s
                        </p>
                      </div>
                      <span style={{ fontSize: "13px", fontWeight: 700, fontFamily: "monospace", color: entry.fake_probability > 0.7 ? "#ff4d6d" : entry.fake_probability > 0.4 ? "#fbbf24" : "#06d6a0", minWidth: "44px", textAlign: "right" }}>
                        {Math.round(entry.fake_probability * 100)}%
                      </span>
                      <Badge level={entry.risk_level as "low" | "suspicious" | "harmful" | "high_risk" | "inconclusive"} size="sm" />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}
      </main>

      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
