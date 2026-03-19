"use client";

import React, { useState } from "react";
import { Layers, Eye, FlaskConical } from "lucide-react";

interface HeatmapPanelProps {
  /** URL of the original uploaded image (blob URL or CDN URL) */
  imageUrl?: string;
  /** Base64-encoded PNG of the Grad-CAM overlay heatmap */
  gradcamBase64?: string;
  /** Class name for the outer container */
  className?: string;
}

type HeatmapMode = "original" | "heatmap" | "overlay";

/**
 * HeatmapPanel — Phase 15: Pixel-level Grad-CAM Visualization
 *
 * Renders three toggleable views:
 *  - Original: clean original image
 *  - Heatmap:  pure Grad-CAM activation map
 *  - Overlay:  live CSS blend of both using CSS mix-blend modes
 */
export default function HeatmapPanel({ imageUrl, gradcamBase64, className = "" }: HeatmapPanelProps) {
  const [mode, setMode] = useState<HeatmapMode>("overlay");

  const heatmapSrc = gradcamBase64 ? `data:image/png;base64,${gradcamBase64}` : null;
  const hasHeatmap = !!heatmapSrc;

  const tabs: { id: HeatmapMode; icon: React.ElementType; label: string }[] = [
    { id: "original", icon: Eye, label: "Original" },
    { id: "heatmap", icon: FlaskConical, label: "Heatmap" },
    { id: "overlay", icon: Layers, label: "Overlay" },
  ];

  return (
    <div
      className={className}
      style={{
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.02)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Layers size={16} color="#7b61ff" />
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#e0e0e0", letterSpacing: "0.02em" }}>
            Grad-CAM Attention Map
          </span>
        </div>
        {/* Mode Tabs */}
        <div
          style={{
            display: "flex",
            gap: "2px",
            padding: "3px",
            borderRadius: "8px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {tabs.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              disabled={id === "heatmap" && !hasHeatmap}
              title={!hasHeatmap && id !== "original" ? "Heatmap not available for this media" : label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: id !== "heatmap" || hasHeatmap ? "pointer" : "not-allowed",
                border: "none",
                background: mode === id ? "rgba(123,97,255,0.2)" : "transparent",
                color: mode === id ? "#7b61ff" : "#55556a",
                transition: "all 0.15s",
                opacity: !hasHeatmap && id !== "original" ? 0.4 : 1,
                fontFamily: "inherit",
              }}
            >
              <Icon size={11} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Image View */}
      <div style={{ position: "relative", width: "100%", aspectRatio: "16/9", background: "#0a0a12" }}>
        {/* Original Image */}
        {imageUrl && (mode === "original" || mode === "overlay") && (
          <img
            src={imageUrl}
            alt="Original media"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              mixBlendMode: mode === "overlay" ? "normal" : "normal",
              opacity: mode === "overlay" ? 1 : 1,
            }}
          />
        )}

        {/* Grad-CAM Heatmap */}
        {heatmapSrc && (mode === "heatmap" || mode === "overlay") && (
          <img
            src={heatmapSrc}
            alt="Grad-CAM heatmap"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              mixBlendMode: mode === "overlay" ? "multiply" : "normal",
              opacity: mode === "overlay" ? 0.75 : 1,
            }}
          />
        )}

        {/* Placeholder for no media */}
        {!imageUrl && !heatmapSrc && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
            }}
          >
            <Layers size={32} color="#2a2a3c" />
            <p style={{ color: "#35354d", fontSize: "12px" }}>No image available</p>
          </div>
        )}

        {/* Badge */}
        {hasHeatmap && mode !== "original" && (
          <div
            style={{
              position: "absolute",
              bottom: "8px",
              right: "8px",
              padding: "3px 8px",
              borderRadius: "6px",
              fontSize: "10px",
              fontWeight: 700,
              background: "rgba(123,97,255,0.25)",
              border: "1px solid rgba(123,97,255,0.4)",
              color: "#7b61ff",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Grad-CAM
          </div>
        )}
      </div>

      {/* Legend */}
      {hasHeatmap && (
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid rgba(255,255,255,0.04)",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: 32, height: 8, borderRadius: 3, background: "linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)" }} />
            <span style={{ fontSize: "10px", color: "#55556a" }}>Low → High</span>
          </div>
          <p style={{ fontSize: "10px", color: "#35354d", flex: 1 }}>
            Red regions = highest model attention / manipulation suspicion
          </p>
        </div>
      )}
    </div>
  );
}
