"use client";

import React from "react";

interface RiskMeterProps {
  score: number; // 0 - 100
}

export default function RiskMeter({ score }: RiskMeterProps) {
  const segments = [
    { label: "Low", min: 0, max: 25, color: "#06d6a0" },
    { label: "Suspicious", min: 25, max: 50, color: "#fbbf24" },
    { label: "Harmful", min: 50, max: 75, color: "#ff8c42" },
    { label: "Critical", min: 75, max: 100, color: "#ff4d6d" },
  ];

  const activeSegment = segments.find((s) => score >= s.min && score < s.max) || segments[3];

  return (
    <div style={{ width: "100%" }}>
      {/* Label */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "8px",
          fontSize: "13px",
        }}
      >
        <span style={{ color: "#8888a0", fontWeight: 500 }}>Risk Score</span>
        <span style={{ color: activeSegment.color, fontWeight: 700, fontFamily: "var(--font-mono), monospace" }}>
          {score}/100
        </span>
      </div>

      {/* Bar */}
      <div
        style={{
          height: "10px",
          borderRadius: "5px",
          background: "rgba(255,255,255,0.05)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${score}%`,
            borderRadius: "5px",
            background: `linear-gradient(90deg, #06d6a0, ${activeSegment.color})`,
            boxShadow: `0 0 12px ${activeSegment.color}40`,
            transition: "width 1s ease-out",
          }}
        />
      </div>

      {/* Segment labels */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "6px",
          fontSize: "10px",
          color: "#55556a",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {segments.map((s) => (
          <span
            key={s.label}
            style={{
              color: score >= s.min && score < (s.max === 100 ? 101 : s.max)
                ? s.color
                : undefined,
              fontWeight: score >= s.min && score < (s.max === 100 ? 101 : s.max) ? 600 : 400,
            }}
          >
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
