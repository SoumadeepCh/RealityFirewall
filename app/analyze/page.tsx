"use client";

import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import {
  Upload,
  Image as ImageIcon,
  Video,
  AudioLines,
  FileText,
  X,
  ScanEye,
  FileUp,
} from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import type { MediaType } from "@/lib/types";

const mediaTypes: { type: MediaType; icon: React.ElementType; label: string }[] = [
  { type: "image", icon: ImageIcon, label: "Image" },
  { type: "video", icon: Video, label: "Video" },
  { type: "audio", icon: AudioLines, label: "Audio" },
  { type: "text", icon: FileText, label: "Text" },
];

const acceptMap: Record<MediaType, Record<string, string[]>> = {
  image: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"] },
  video: { "video/*": [".mp4", ".webm", ".avi", ".mov", ".mkv"] },
  audio: { "audio/*": [".mp3", ".wav", ".ogg", ".flac", ".m4a"] },
  text: { "text/*": [".txt", ".json", ".csv"] },
};

export default function AnalyzePage() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<MediaType>("image");
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptMap[selectedType],
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024, // 100MB
  });

  const handleAnalyze = () => {
    setIsAnalyzing(true);
    // Simulate analysis delay then navigate
    setTimeout(() => {
      router.push("/results");
    }, 2000);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <>
      <Navbar />
      <main
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          padding: "88px 24px 60px",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Analyze Media
          </h1>
          <p style={{ color: "#8888a0", fontSize: "14px", marginTop: "6px" }}>
            Upload an image, video, audio, or text file for deepfake and
            manipulation detection.
          </p>
        </div>

        {/* Media type selector */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "8px",
            marginBottom: "28px",
          }}
        >
          {mediaTypes.map(({ type, icon: Icon, label }) => {
            const active = selectedType === type;
            return (
              <button
                key={type}
                onClick={() => {
                  setSelectedType(type);
                  setFile(null);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 20px",
                  borderRadius: "10px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: active
                    ? "1px solid rgba(6, 214, 160, 0.4)"
                    : "1px solid rgba(255,255,255,0.06)",
                  background: active
                    ? "rgba(6, 214, 160, 0.08)"
                    : "rgba(255,255,255,0.02)",
                  color: active ? "#06d6a0" : "#8888a0",
                  transition: "all 0.2s",
                  fontFamily: "inherit",
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Drop zone */}
        <Card padding="lg" glow={isDragActive}>
          {!file ? (
            <div
              {...getRootProps()}
              style={{
                border: `2px dashed ${isDragActive ? "#06d6a0" : "rgba(255,255,255,0.08)"}`,
                borderRadius: "14px",
                padding: "60px 20px",
                textAlign: "center",
                cursor: "pointer",
                transition: "all 0.3s ease",
                background: isDragActive
                  ? "rgba(6, 214, 160, 0.04)"
                  : "transparent",
              }}
            >
              <input {...getInputProps()} />
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "16px",
                  background: "rgba(6, 214, 160, 0.08)",
                  border: "1px solid rgba(6, 214, 160, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                }}
              >
                <Upload size={28} color="#06d6a0" />
              </div>
              <p
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                {isDragActive
                  ? "Drop your file here..."
                  : "Drag & drop your file here"}
              </p>
              <p style={{ color: "#55556a", fontSize: "13px" }}>
                or click to browse · Max 100MB
              </p>
            </div>
          ) : (
            <div>
              {/* File preview */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "20px",
                  borderRadius: "12px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  marginBottom: "24px",
                }}
              >
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "12px",
                    background: "rgba(6, 214, 160, 0.08)",
                    border: "1px solid rgba(6, 214, 160, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <FileUp size={22} color="#06d6a0" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {file.name}
                  </p>
                  <p style={{ color: "#55556a", fontSize: "12px", marginTop: "2px" }}>
                    {formatSize(file.size)} · {selectedType.toUpperCase()}
                  </p>
                </div>
                <button
                  onClick={() => setFile(null)}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255,77,109,0.1)",
                    border: "1px solid rgba(255,77,109,0.2)",
                    color: "#ff4d6d",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Analyze button */}
              <Button
                onClick={handleAnalyze}
                loading={isAnalyzing}
                icon={<ScanEye size={18} />}
                size="lg"
                style={{ width: "100%" }}
              >
                {isAnalyzing ? "Analyzing..." : "Run Analysis"}
              </Button>

              {isAnalyzing && (
                <div
                  style={{
                    marginTop: "20px",
                    textAlign: "center",
                    color: "#8888a0",
                    fontSize: "13px",
                  }}
                >
                  <div
                    style={{
                      height: "3px",
                      borderRadius: "2px",
                      background: "rgba(255,255,255,0.05)",
                      overflow: "hidden",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: "60%",
                        background: "linear-gradient(90deg, #06d6a0, #7b61ff)",
                        borderRadius: "2px",
                        animation: "shimmer 1.5s infinite",
                      }}
                    />
                  </div>
                  Running multi-model ensemble detection...
                </div>
              )}
            </div>
          )}
        </Card>
      </main>
    </>
  );
}
