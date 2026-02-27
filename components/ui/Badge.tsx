"use client";

import React from "react";
import type { RiskLevel } from "@/lib/types";

interface BadgeProps {
  level: RiskLevel;
  size?: "sm" | "md";
  className?: string;
}

const config: Record<RiskLevel, { label: string; bg: string; color: string; border: string }> = {
  low: {
    label: "Low Risk",
    bg: "rgba(6, 214, 160, 0.12)",
    color: "#06d6a0",
    border: "rgba(6, 214, 160, 0.3)",
  },
  suspicious: {
    label: "Suspicious",
    bg: "rgba(251, 191, 36, 0.12)",
    color: "#fbbf24",
    border: "rgba(251, 191, 36, 0.3)",
  },
  harmful: {
    label: "Harmful",
    bg: "rgba(255, 77, 109, 0.12)",
    color: "#ff4d6d",
    border: "rgba(255, 77, 109, 0.3)",
  },
  high_risk: {
    label: "High Risk",
    bg: "rgba(255, 77, 109, 0.2)",
    color: "#ff4d6d",
    border: "rgba(255, 77, 109, 0.5)",
  },
};

export default function Badge({ level, size = "md", className = "" }: BadgeProps) {
  const c = config[level];
  const isSmall = size === "sm";

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: isSmall ? "3px 10px" : "5px 14px",
        fontSize: isSmall ? "11px" : "13px",
        fontWeight: 600,
        borderRadius: "20px",
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
      }}
    >
      <span
        style={{
          width: isSmall ? "5px" : "6px",
          height: isSmall ? "5px" : "6px",
          borderRadius: "50%",
          background: c.color,
          boxShadow: `0 0 6px ${c.color}`,
        }}
      />
      {c.label}
    </span>
  );
}
