"use client";

import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  hover?: boolean;
  padding?: "sm" | "md" | "lg";
  style?: React.CSSProperties;
}

export default function Card({
  children,
  className = "",
  glow = false,
  hover = true,
  padding = "md",
  style,
}: CardProps) {
  const paddingMap = { sm: "16px", md: "24px", lg: "32px" };

  const cardStyle: React.CSSProperties = {
    background: "rgba(15, 15, 35, 0.7)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: glow
      ? "1px solid rgba(6, 214, 160, 0.25)"
      : "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: "16px",
    boxShadow: glow
      ? "0 0 40px rgba(6, 214, 160, 0.08)"
      : "0 4px 30px rgba(0, 0, 0, 0.3)",
    padding: paddingMap[padding],
    transition: "border-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease",
    ...style,
  };

  return (
    <div
      className={`${hover ? "glass-card" : ""} ${className}`}
      style={cardStyle}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, className = "" }: CardHeaderProps) {
  return (
    <div
      className={className}
      style={{
        marginBottom: "16px",
        paddingBottom: "12px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {children}
    </div>
  );
}
