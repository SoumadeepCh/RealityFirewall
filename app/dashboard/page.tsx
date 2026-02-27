"use client";

import React from "react";
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

export default function DashboardPage() {
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

        {/* Recent Analyses */}
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
                  {/* Icon */}
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

                  {/* Info */}
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

                  {/* Fake % */}
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

                  {/* Badge */}
                  <Badge level={a.riskLevel} size="sm" />
                </Link>
              );
            })}
          </div>
        </Card>
      </main>
    </>
  );
}
