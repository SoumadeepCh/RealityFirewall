"use client";

import React from "react";

interface AuthenticityMeterProps {
  fakeProbability: number; // 0 - 1
  size?: number;
}

export default function AuthenticityMeter({
  fakeProbability,
  size = 200,
}: AuthenticityMeterProps) {
  const percentage = Math.round(fakeProbability * 100);
  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (fakeProbability * 0.75 * circumference);

  // Color based on risk
  const getColor = () => {
    if (fakeProbability < 0.3) return "#06d6a0";
    if (fakeProbability < 0.6) return "#fbbf24";
    if (fakeProbability < 0.8) return "#ff8c42";
    return "#ff4d6d";
  };

  const color = getColor();
  const label = fakeProbability < 0.3 ? "Likely Authentic" : fakeProbability < 0.6 ? "Uncertain" : fakeProbability < 0.8 ? "Suspicious" : "Likely Fake";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-225deg)" }}>
          {/* Background arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * 0.25}
            strokeLinecap="round"
          />
          {/* Filled arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 8px ${color})`,
              transition: "stroke-dashoffset 1s ease-out, stroke 0.5s ease",
            }}
          />
        </svg>
        {/* Center text */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: size * 0.22,
              fontWeight: 800,
              color: color,
              lineHeight: 1,
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            {percentage}%
          </span>
          <span
            style={{
              fontSize: size * 0.07,
              color: "#8888a0",
              marginTop: "4px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 600,
            }}
          >
            Fake Probability
          </span>
        </div>
      </div>
      <span
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: color,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </span>
    </div>
  );
}
