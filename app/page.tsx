"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Shield,
  ScanEye,
  Brain,
  Clock,
  TrendingUp,
  Globe,
  AlertTriangle,
  ArrowRight,
  Cpu,
  Database,
  Zap,
} from "lucide-react";

const features = [
  {
    icon: ScanEye,
    title: "Authenticity Detection",
    desc: "Multi-modal analysis of images, video, audio, and text using state-of-the-art AI models.",
    color: "#06d6a0",
  },
  {
    icon: Brain,
    title: "Explainable AI",
    desc: "Heatmaps, reasoning, and evidence panels that show why media is flagged — not just a score.",
    color: "#7b61ff",
  },
  {
    icon: Clock,
    title: "Timeline & Origin",
    desc: "Track when and where media first appeared, detect re-uploads, and map propagation across platforms.",
    color: "#fbbf24",
  },
  {
    icon: TrendingUp,
    title: "Virality Risk Scoring",
    desc: "Predict misinformation spread potential with engagement, repost, and velocity analysis.",
    color: "#ff8c42",
  },
  {
    icon: Globe,
    title: "Browser Extension",
    desc: "Real-time media inspection overlay for any web page — right-click to analyze instantly.",
    color: "#06d6a0",
  },
  {
    icon: AlertTriangle,
    title: "Investigative Dashboard",
    desc: "Frame-by-frame viewer, media comparison tools, and annotation features for deep analysis.",
    color: "#ff4d6d",
  },
];

const techStack = [
  { icon: Cpu, label: "AI Pipeline", desc: "Multi-model ensemble" },
  { icon: Database, label: "Storage", desc: "MongoDB + Object Storage" },
  { icon: Zap, label: "Processing", desc: "Async + Redis queues" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: "easeOut" as const },
  }),
};

export default function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--rf-bg-primary)" }}>
      {/* ===== Hero ===== */}
      <section
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "120px 24px 80px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: "absolute",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(6,214,160,0.08) 0%, transparent 70%)",
            top: "10%",
            left: "50%",
            transform: "translateX(-50%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(123,97,255,0.06) 0%, transparent 70%)",
            bottom: "10%",
            right: "10%",
            pointerEvents: "none",
          }}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          style={{
            width: "72px",
            height: "72px",
            borderRadius: "18px",
            background: "linear-gradient(135deg, #06d6a0, #7b61ff)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "28px",
            boxShadow: "0 0 60px rgba(6, 214, 160, 0.2)",
          }}
        >
          <Shield size={36} color="#050510" strokeWidth={2} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          style={{
            fontSize: "clamp(40px, 6vw, 72px)",
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            marginBottom: "20px",
            maxWidth: "800px",
          }}
        >
          <span className="gradient-text">Reality</span>{" "}
          <span style={{ color: "#f0f0f5" }}>Firewall</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          style={{
            fontSize: "clamp(16px, 2vw, 20px)",
            color: "#8888a0",
            maxWidth: "580px",
            lineHeight: 1.7,
            marginBottom: "40px",
          }}
        >
          Detect synthetic and manipulated media with explainable AI.
          Multi-layer analysis across image, video, audio, and text — with
          heatmaps, risk scoring, and propagation intelligence.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "center" }}
        >
          <Link
            href="/dashboard"
            className="gradient-btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              textDecoration: "none",
              fontSize: "16px",
              padding: "14px 32px",
              borderRadius: "12px",
            }}
          >
            Launch Dashboard
            <ArrowRight size={18} />
          </Link>
          <Link
            href="/analyze"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "14px 32px",
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#f0f0f5",
              textDecoration: "none",
              fontSize: "16px",
              fontWeight: 600,
              transition: "all 0.2s",
            }}
          >
            Analyze Media
          </Link>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          style={{
            position: "absolute",
            bottom: "40px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            color: "#55556a",
            fontSize: "12px",
          }}
        >
          <span>Scroll to explore</span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            style={{
              width: "20px",
              height: "32px",
              borderRadius: "10px",
              border: "2px solid #55556a",
              display: "flex",
              justifyContent: "center",
              paddingTop: "6px",
            }}
          >
            <div
              style={{
                width: "3px",
                height: "8px",
                borderRadius: "2px",
                background: "#55556a",
              }}
            />
          </motion.div>
        </motion.div>
      </section>

      {/* ===== Features ===== */}
      <section
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "80px 24px 100px",
        }}
      >
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          style={{ textAlign: "center", marginBottom: "60px" }}
        >
          <motion.p
            variants={fadeUp}
            custom={0}
            style={{
              fontSize: "13px",
              color: "#06d6a0",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontWeight: 600,
              marginBottom: "12px",
            }}
          >
            Core Capabilities
          </motion.p>
          <motion.h2
            variants={fadeUp}
            custom={1}
            style={{
              fontSize: "clamp(28px, 4vw, 42px)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Not just &ldquo;fake or real&rdquo; —{" "}
            <span className="gradient-text">explainable intelligence</span>
          </motion.h2>
        </motion.div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "20px",
          }}
        >
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeUp}
              className="glass-card"
              style={{
                padding: "28px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  background: `${f.color}15`,
                  border: `1px solid ${f.color}30`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <f.icon size={22} color={f.color} />
              </div>
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                {f.title}
              </h3>
              <p style={{ color: "#8888a0", fontSize: "14px", lineHeight: 1.6 }}>
                {f.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ===== Architecture ===== */}
      <section
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "60px 24px 100px",
        }}
      >
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          style={{ textAlign: "center", marginBottom: "48px" }}
        >
          <motion.p
            variants={fadeUp}
            custom={0}
            style={{
              fontSize: "13px",
              color: "#7b61ff",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontWeight: 600,
              marginBottom: "12px",
            }}
          >
            System Architecture
          </motion.p>
          <motion.h2
            variants={fadeUp}
            custom={1}
            style={{
              fontSize: "clamp(28px, 4vw, 42px)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Multi-layer <span className="gradient-text">AI pipeline</span>
          </motion.h2>
        </motion.div>

        {/* Pipeline diagram */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          custom={2}
          className="glass-card"
          style={{ padding: "40px", textAlign: "center" }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "16px",
              marginBottom: "32px",
            }}
          >
            {["Image", "Video", "Audio", "Text"].map((type) => (
              <div
                key={type}
                style={{
                  padding: "10px 24px",
                  borderRadius: "10px",
                  background: "rgba(6, 214, 160, 0.08)",
                  border: "1px solid rgba(6, 214, 160, 0.2)",
                  color: "#06d6a0",
                  fontWeight: 600,
                  fontSize: "14px",
                }}
              >
                {type}
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              marginBottom: "20px",
              color: "#55556a",
              fontSize: "24px",
            }}
          >
            ↓
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "16px",
              marginBottom: "32px",
            }}
          >
            {[
              "Preprocessing",
              "Feature Extraction",
              "Ensemble Detection",
              "LLM Reasoning",
            ].map((step) => (
              <div
                key={step}
                style={{
                  padding: "10px 20px",
                  borderRadius: "10px",
                  background: "rgba(123, 97, 255, 0.08)",
                  border: "1px solid rgba(123, 97, 255, 0.2)",
                  color: "#7b61ff",
                  fontWeight: 600,
                  fontSize: "13px",
                }}
              >
                {step}
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              marginBottom: "20px",
              color: "#55556a",
              fontSize: "24px",
            }}
          >
            ↓
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "16px",
            }}
          >
            {["Authenticity Score", "Risk Assessment", "Heatmaps", "Explanation"].map(
              (out) => (
                <div
                  key={out}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "10px",
                    background: "rgba(255, 77, 109, 0.08)",
                    border: "1px solid rgba(255, 77, 109, 0.2)",
                    color: "#ff4d6d",
                    fontWeight: 600,
                    fontSize: "13px",
                  }}
                >
                  {out}
                </div>
              )
            )}
          </div>
        </motion.div>

        {/* Tech stack badges */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "20px",
            flexWrap: "wrap",
            marginTop: "32px",
          }}
        >
          {techStack.map((t) => (
            <div
              key={t.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "12px 20px",
                borderRadius: "12px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <t.icon size={18} color="#8888a0" />
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>{t.label}</div>
                <div style={{ fontSize: "11px", color: "#55556a" }}>{t.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section
        style={{
          textAlign: "center",
          padding: "80px 24px 120px",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 700,
            marginBottom: "16px",
          }}
        >
          Ready to analyze?
        </h2>
        <p
          style={{
            color: "#8888a0",
            marginBottom: "32px",
            fontSize: "16px",
          }}
        >
          Upload an image, video, or audio file and see the firewall in action.
        </p>
        <Link
          href="/analyze"
          className="gradient-btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            textDecoration: "none",
            fontSize: "16px",
            padding: "16px 36px",
            borderRadius: "14px",
          }}
        >
          Start Analysis
          <ArrowRight size={18} />
        </Link>
      </section>

      {/* Footer */}
      <footer
        style={{
          textAlign: "center",
          padding: "32px 24px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          color: "#55556a",
          fontSize: "13px",
        }}
      >
        Reality Firewall · Deepfake & AI Media Risk Analyzer
      </footer>
    </div>
  );
}
