import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reality Firewall — Deepfake & AI Media Risk Analyzer",
  description:
    "Detect synthetic and manipulated media with explainable AI. Image, video, audio, and text authenticity detection with heatmaps, risk scoring, and propagation intelligence.",
  keywords: [
    "deepfake detection",
    "AI media analysis",
    "fake image detection",
    "misinformation",
    "media authenticity",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable}`}
        style={{ margin: 0 }}
      >
        {children}
      </body>
    </html>
  );
}
