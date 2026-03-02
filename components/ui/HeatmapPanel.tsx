"use client";

import React, { useRef, useEffect } from "react";
import type { AMAFFeatureVector } from "@/lib/types";
import Card, { CardHeader } from "@/components/ui/Card";
import { Layers } from "lucide-react";

interface HeatmapPanelProps {
  vector: AMAFFeatureVector;
  fakeProbability: number;
  mediaType: string;
}

/**
 * Renders a simulated frequency-domain anomaly heatmap.
 *
 * Since we don't have pixel-level saliency maps from the backend yet (that would require
 * Grad-CAM on the server), we generate a visually meaningful pseudo-heatmap using the
 * AMAF forensic feature values. The pattern simulates where GAN artifacts typically appear:
 * - HFER drives high-frequency edge ring energy
 * - SVD drives center vs. edge deviation patterns
 * - PDI drives block-level texture inconsistency clusters
 */
function drawHeatmap(
  canvas: HTMLCanvasElement,
  vector: AMAFFeatureVector,
  fakeProbability: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = "rgba(5, 5, 16, 1)";
  ctx.fillRect(0, 0, W, H);

  const hfer = vector.hfer ?? 0.15;
  const svd = vector.svd ?? 0.05;
  const pdi = vector.pdi ?? 0.2;
  const fakeP = fakeProbability;

  const cx = W / 2;
  const cy = H / 2;

  // Draw frequency energy rings (HFER-driven)
  const rings = 6;
  for (let i = rings; i >= 1; i--) {
    const radius = (Math.min(W, H) / 2) * (i / rings) * 0.9;
    const energy = Math.max(0, 1 - hfer * (rings - i + 1) * 0.8);
    const alpha = 0.08 + energy * 0.15 * fakeP;

    const grad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
    grad.addColorStop(0, `rgba(6, 214, 160, 0)`);
    grad.addColorStop(0.7, `rgba(6, 214, 160, ${alpha * 0.4})`);
    grad.addColorStop(1, `rgba(123, 97, 255, ${alpha * 0.6})`);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Draw anomaly hotspots (PDI + fakeP driven) — typical deepfake artifact regions
  const hotspots = [
    { fx: 0.25, fy: 0.2, weight: pdi },   // top-left (hairline/forehead)
    { fx: 0.75, fy: 0.2, weight: pdi },   // top-right
    { fx: 0.5, fy: 0.45, weight: fakeP }, // center face
    { fx: 0.3, fy: 0.65, weight: svd },   // jaw-left
    { fx: 0.7, fy: 0.65, weight: svd },   // jaw-right
    { fx: 0.5, fy: 0.8, weight: pdi * 0.5 }, // neck/chin
  ];

  for (const { fx, fy, weight } of hotspots) {
    const x = fx * W;
    const y = fy * H;
    const r = 28 + weight * 20;
    const alpha = 0.1 + weight * 0.4 * fakeP;

    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (fakeP > 0.6) {
      g.addColorStop(0, `rgba(255, 77, 109, ${alpha})`);
      g.addColorStop(0.5, `rgba(255, 140, 66, ${alpha * 0.5})`);
      g.addColorStop(1, `rgba(255, 77, 109, 0)`);
    } else if (fakeP > 0.35) {
      g.addColorStop(0, `rgba(251, 191, 36, ${alpha})`);
      g.addColorStop(1, `rgba(251, 191, 36, 0)`);
    } else {
      g.addColorStop(0, `rgba(6, 214, 160, ${alpha * 0.5})`);
      g.addColorStop(1, `rgba(6, 214, 160, 0)`);
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  // SVD spectral grid overlay (lighter)
  const gridAlpha = Math.min(0.08, svd * 0.3);
  ctx.strokeStyle = `rgba(123, 97, 255, ${gridAlpha})`;
  ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += W / 8) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += H / 8) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Draw legend color bar at bottom
  const barH = 6;
  const barW = W - 32;
  const barX = 16;
  const barY = H - 14;
  const legendGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  legendGrad.addColorStop(0, "#06d6a0");
  legendGrad.addColorStop(0.5, "#fbbf24");
  legendGrad.addColorStop(1, "#ff4d6d");
  ctx.fillStyle = legendGrad;
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 3);
  ctx.fill();
}

const featureItems = [
  { key: "hfer", label: "HFER", desc: "High Freq. Energy Ratio", warn: (v: number) => v < 0.12 },
  { key: "svd",  label: "SVD",  desc: "Spectral Variance Dev.",  warn: (v: number) => v > 0.3  },
  { key: "pdi",  label: "PDI",  desc: "Patch Drift Index",       warn: (v: number) => v > 0.35 },
];

export default function HeatmapPanel({ vector, fakeProbability, mediaType }: HeatmapPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawHeatmap(canvas, vector, fakeProbability);
  }, [vector, fakeProbability]);

  return (
    <Card padding="lg">
      <CardHeader>
        <h2 style={{ fontSize: "16px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <Layers size={18} color="#06d6a0" />
          Frequency Anomaly Heatmap
        </h2>
        <span style={{ fontSize: "11px", color: "#55556a", marginLeft: "auto" }}>
          {mediaType.toUpperCase()} · Simulated overlay
        </span>
      </CardHeader>

      {/* Canvas */}
      <div style={{ borderRadius: "10px", overflow: "hidden", marginBottom: "16px", border: "1px solid rgba(255,255,255,0.06)" }}>
        <canvas
          ref={canvasRef}
          width={480}
          height={200}
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      </div>

      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#55556a", marginBottom: "16px", padding: "0 2px" }}>
        <span>■ Authentic zone</span>
        <span>■ Suspicious zone</span>
        <span>■ Anomaly cluster</span>
      </div>

      {/* Key frequency features */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {featureItems.map(({ key, label, desc, warn }) => {
          const val = vector[key as keyof AMAFFeatureVector] as number | null;
          if (val === null || val === undefined) return null;
          const isWarn = warn(val);
          const color = isWarn ? "#ff4d6d" : "#06d6a0";

          return (
            <div
              key={key}
              style={{
                flex: "1 1 120px",
                padding: "10px 12px",
                borderRadius: "8px",
                background: isWarn ? "rgba(255,77,109,0.05)" : "rgba(6,214,160,0.05)",
                border: `1px solid ${color}20`,
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, color, letterSpacing: "0.04em" }}>{label}</div>
              <div style={{ fontSize: "10px", color: "#55556a", marginBottom: "4px" }}>{desc}</div>
              <div style={{ fontSize: "15px", fontWeight: 800, color, fontFamily: "monospace" }}>
                {val < 0.01 ? val.toExponential(2) : val.toFixed(4)}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
