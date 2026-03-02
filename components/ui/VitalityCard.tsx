"use client";

import React from "react";
import type { ViralityAnalysis, RiskLevel } from "@/lib/types";
import { TrendingUp, AlertTriangle, Shield, Flame, Users, Star } from "lucide-react";
import Card, { CardHeader } from "@/components/ui/Card";

const riskColors: Record<RiskLevel | "inconclusive", string> = {
  low: "#06d6a0",
  suspicious: "#fbbf24",
  harmful: "#ff8c42",
  high_risk: "#ff4d6d",
  inconclusive: "#8888a0",
};

const riskLabels: Record<string, string> = {
  low: "Low Risk",
  suspicious: "Suspicious",
  harmful: "Harmful",
  high_risk: "High Misinformation Risk",
  inconclusive: "Inconclusive",
};

function ViralityGauge({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 70 ? "#ff4d6d" : pct >= 45 ? "#ff8c42" : pct >= 25 ? "#fbbf24" : "#06d6a0";

  // SVG arc gauge
  const r = 54;
  const circ = Math.PI * r; // half-circle circumference
  const dash = (pct / 100) * circ;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
      <svg width="140" height="84" viewBox="0 0 140 84">
        {/* Track */}
        <path
          d="M 10 80 A 60 60 0 0 1 130 80"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d="M 10 80 A 60 60 0 0 1 130 80"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: "stroke-dasharray 0.8s ease, stroke 0.4s ease" }}
        />
        {/* Score text */}
        <text x="70" y="62" textAnchor="middle" fill="#f0f0f5" fontSize="22" fontWeight="800" fontFamily="monospace">
          {Math.round(pct)}
        </text>
        <text x="70" y="78" textAnchor="middle" fill="#55556a" fontSize="10" fontWeight="600">
          / 100
        </text>
      </svg>
      <p style={{ fontSize: "11px", color: "#8888a0", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
        Virality Score
      </p>
    </div>
  );
}

function ImpactBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ fontSize: "12px", color: "#8888a0" }}>{label}</span>
        <span style={{ fontSize: "12px", fontWeight: 700, color, fontFamily: "monospace" }}>
          {Math.round(value * 100)}%
        </span>
      </div>
      <div style={{ height: "5px", borderRadius: "3px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${value * 100}%`,
            background: `linear-gradient(90deg, ${color}80, ${color})`,
            borderRadius: "3px",
            transition: "width 0.8s ease",
          }}
        />
      </div>
    </div>
  );
}

export default function VitalityCard({ data }: { data: ViralityAnalysis }) {
  const riskColor = riskColors[data.misinformationRisk] || "#8888a0";
  const polarityPct = (data.emotionalPolarity + 1) / 2; // normalize -1..1 → 0..1

  return (
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
          <TrendingUp size={18} color="#ff8c42" />
          Virality & Risk Analysis
        </h2>
      </CardHeader>

      {/* Top row: gauge + risk badge */}
      <div style={{ display: "flex", gap: "24px", alignItems: "flex-start", flexWrap: "wrap", marginBottom: "24px" }}>
        <ViralityGauge score={data.viralityScore} />

        <div style={{ flex: 1, minWidth: "160px", display: "flex", flexDirection: "column", gap: "12px", paddingTop: "4px" }}>
          {/* Misinfo risk badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 14px",
              borderRadius: "10px",
              background: `${riskColor}12`,
              border: `1px solid ${riskColor}30`,
              alignSelf: "flex-start",
            }}
          >
            <AlertTriangle size={14} color={riskColor} />
            <span style={{ fontSize: "13px", fontWeight: 700, color: riskColor }}>
              {riskLabels[data.misinformationRisk] || data.misinformationRisk}
            </span>
          </div>

          {/* Emotional polarity */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ fontSize: "12px", color: "#8888a0", display: "flex", alignItems: "center", gap: "4px" }}>
                <Flame size={11} />
                Emotional Polarity
              </span>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  fontFamily: "monospace",
                  color: data.emotionalPolarity > 0.3 ? "#ff8c42" : "#06d6a0",
                }}
              >
                {data.emotionalPolarity > 0 ? "+" : ""}
                {data.emotionalPolarity.toFixed(2)}
              </span>
            </div>
            <div style={{ height: "5px", borderRadius: "3px", background: "rgba(255,255,255,0.06)", overflow: "hidden", position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  height: "100%",
                  width: `${polarityPct * 100}%`,
                  background: `linear-gradient(90deg, #06d6a0, #fbbf24, #ff4d6d)`,
                  borderRadius: "3px",
                  transition: "width 0.8s ease",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "3px", fontSize: "9px", color: "#55556a" }}>
              <span>Calm</span><span>Alarming</span>
            </div>
          </div>
        </div>
      </div>

      {/* Societal Impact bars */}
      <div style={{ marginBottom: "16px" }}>
        <p style={{ fontSize: "12px", fontWeight: 700, color: "#8888a0", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
          <Users size={12} />
          Societal Impact
        </p>
        <ImpactBar label="Polarization Potential" value={data.societalImpact.polarizationPotential} color="#7b61ff" />
        <ImpactBar label="Panic Potential" value={data.societalImpact.panicPotential} color="#ff4d6d" />
        <ImpactBar label="Reputation Damage" value={data.societalImpact.reputationDamageLikelihood} color="#ff8c42" />
      </div>

      {/* Risk factors */}
      {data.riskFactors.length > 0 && (
        <div>
          <p style={{ fontSize: "12px", fontWeight: 700, color: "#8888a0", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
            <Shield size={12} />
            Risk Factors
          </p>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
            {data.riskFactors.map((factor, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  fontSize: "13px",
                  color: "#c0c0d0",
                  lineHeight: 1.4,
                }}
              >
                <Star size={10} color="#fbbf24" style={{ marginTop: "3px", flexShrink: 0 }} />
                {factor}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
