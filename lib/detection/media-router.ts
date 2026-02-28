// ============================================
// AMAF — Media Routing Layer
// Routes incoming media to correct pipeline
// ============================================

import type { DetectedMediaType, MediaRouteDecision } from "./types";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".avi", ".mov", ".mkv", ".ogv"];
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".wma"];

const MIME_MAP: Record<string, DetectedMediaType> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/bmp": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/avi": "video",
  "video/quicktime": "video",
  "audio/mpeg": "audio",
  "audio/wav": "audio",
  "audio/ogg": "audio",
  "audio/flac": "audio",
  "audio/mp4": "audio",
  "audio/x-m4a": "audio",
};

function detectMediaType(fileName: string, mimeType: string): DetectedMediaType {
  // Prefer MIME type
  const fromMime = MIME_MAP[mimeType.toLowerCase()];
  if (fromMime) return fromMime;

  // Fall back to extension
  const ext = "." + fileName.split(".").pop()?.toLowerCase();
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  if (AUDIO_EXTENSIONS.includes(ext)) return "audio";

  return "unknown";
}

/**
 * Load an image File into ImageData via OffscreenCanvas (works in API routes / workers)
 * Falls back to basic ArrayBuffer for server-side processing.
 */
async function loadImageData(buffer: ArrayBuffer, mimeType: string): Promise<ImageData | undefined> {
  // In a server context we cannot use Canvas, so we return undefined
  // and handle pixel extraction differently in the detector
  if (typeof globalThis.OffscreenCanvas === "undefined" && typeof document === "undefined") {
    return undefined;
  }

  // Browser context: use createImageBitmap
  const blob = new Blob([buffer], { type: mimeType });
  const bitmap = await createImageBitmap(blob);

  const canvas = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(bitmap.width, bitmap.height)
    : document.createElement("canvas");

  if ("width" in canvas) {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
  }

  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (!ctx) return undefined;

  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

/**
 * Extract frames from a video file.
 * Returns sampled ImageData frames and the audio track as Float32Array.
 */
async function extractVideoFrames(
  buffer: ArrayBuffer,
  mimeType: string,
  sampleRate: number = 2
): Promise<{ frames: ImageData[]; audioBuffer?: Float32Array }> {
  // Server-side: return empty — actual frame extraction requires browser APIs
  if (typeof document === "undefined" && typeof globalThis.OffscreenCanvas === "undefined") {
    return { frames: [] };
  }

  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = url;

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      const frames: ImageData[] = [];
      const interval = 1 / sampleRate;
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(video.videoWidth, 640); // cap resolution
      canvas.height = Math.round(canvas.width * (video.videoHeight / video.videoWidth));
      const ctx = canvas.getContext("2d")!;

      for (let t = 0; t < duration && frames.length < 60; t += interval) {
        video.currentTime = t;
        await new Promise<void>((r) => {
          video.onseeked = () => r();
        });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      }

      // Extract audio via AudioContext
      let audioBuffer: Float32Array | undefined;
      try {
        const audioCtx = new AudioContext();
        const decoded = await audioCtx.decodeAudioData(buffer.slice(0));
        audioBuffer = decoded.getChannelData(0);
        await audioCtx.close();
      } catch {
        // Audio extraction may fail for some formats
      }

      URL.revokeObjectURL(url);
      resolve({ frames, audioBuffer });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ frames: [] });
    };
  });
}

/**
 * Extract audio samples from an audio file.
 */
async function extractAudioSamples(
  buffer: ArrayBuffer
): Promise<Float32Array | undefined> {
  if (typeof AudioContext === "undefined" && typeof (globalThis as Record<string, unknown>).webkitAudioContext === "undefined") {
    return undefined;
  }
  try {
    const audioCtx = new AudioContext();
    const decoded = await audioCtx.decodeAudioData(buffer.slice(0));
    const samples = decoded.getChannelData(0);
    await audioCtx.close();
    return samples;
  } catch {
    return undefined;
  }
}

/**
 * Main routing function: takes a File and produces a MediaRouteDecision.
 */
export async function routeMedia(
  file: File,
  frameSampleRate: number = 2
): Promise<MediaRouteDecision> {
  const mediaType = detectMediaType(file.name, file.type);
  const rawBuffer = await file.arrayBuffer();

  const decision: MediaRouteDecision = {
    mediaType,
    mimeType: file.type,
    fileName: file.name,
    fileSize: file.size,
    rawBuffer,
  };

  switch (mediaType) {
    case "image": {
      decision.imageData = await loadImageData(rawBuffer, file.type);
      break;
    }
    case "video": {
      const { frames, audioBuffer } = await extractVideoFrames(rawBuffer, file.type, frameSampleRate);
      decision.frames = frames;
      decision.audioBuffer = audioBuffer;
      break;
    }
    case "audio": {
      decision.audioBuffer = await extractAudioSamples(rawBuffer);
      break;
    }
  }

  return decision;
}

export { detectMediaType };
