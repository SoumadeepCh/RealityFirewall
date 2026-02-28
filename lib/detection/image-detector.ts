// ============================================
// AMAF — Image Detection Module
// Implements: HFER, SVD, PDI, EXIF Analysis
// ============================================

import type {
  FrequencyMetrics,
  TextureMetrics,
  DetectionSignalOutput,
} from "./types";

// ---- FFT Utilities ----

/**
 * 1D FFT (Cooley-Tukey radix-2, in-place).
 * Input: real[] and imag[] of length N (must be power of 2).
 */
function fft1d(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  // FFT butterfly
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const tRe = curRe * real[i + k + len / 2] - curIm * imag[i + k + len / 2];
        const tIm = curRe * imag[i + k + len / 2] + curIm * real[i + k + len / 2];
        real[i + k + len / 2] = real[i + k] - tRe;
        imag[i + k + len / 2] = imag[i + k] - tIm;
        real[i + k] += tRe;
        imag[i + k] += tIm;
        const newCurRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newCurRe;
      }
    }
  }
}

/**
 * Compute 2D magnitude spectrum from grayscale image.
 * Returns magnitude array and dimensions (padded to power of 2).
 */
function computeMagnitudeSpectrum(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): { magnitude: Float64Array; size: number } {
  // Pad to next power of 2 (use the larger dimension)
  const maxDim = Math.max(width, height);
  let size = 1;
  while (size < maxDim) size <<= 1;
  // Cap at 512 for performance
  size = Math.min(size, 512);

  const n = size * size;
  const real = new Float64Array(n);
  const imag = new Float64Array(n);

  // Convert to grayscale and fill padded array
  for (let y = 0; y < Math.min(height, size); y++) {
    for (let x = 0; x < Math.min(width, size); x++) {
      const srcIdx = (y * width + x) * 4;
      // Luminance
      const gray = 0.299 * pixels[srcIdx] + 0.587 * pixels[srcIdx + 1] + 0.114 * pixels[srcIdx + 2];
      real[y * size + x] = gray;
    }
  }

  // Row-wise FFT
  for (let y = 0; y < size; y++) {
    const rowReal = new Float64Array(size);
    const rowImag = new Float64Array(size);
    for (let x = 0; x < size; x++) {
      rowReal[x] = real[y * size + x];
    }
    fft1d(rowReal, rowImag);
    for (let x = 0; x < size; x++) {
      real[y * size + x] = rowReal[x];
      imag[y * size + x] = rowImag[x];
    }
  }

  // Column-wise FFT
  for (let x = 0; x < size; x++) {
    const colReal = new Float64Array(size);
    const colImag = new Float64Array(size);
    for (let y = 0; y < size; y++) {
      colReal[y] = real[y * size + x];
      colImag[y] = imag[y * size + x];
    }
    fft1d(colReal, colImag);
    for (let y = 0; y < size; y++) {
      real[y * size + x] = colReal[y];
      imag[y * size + x] = colImag[y];
    }
  }

  // Magnitude spectrum: M(u,v) = log(1 + |F(u,v)|)
  const magnitude = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    magnitude[i] = Math.log(1 + Math.sqrt(real[i] * real[i] + imag[i] * imag[i]));
  }

  return { magnitude, size };
}

// ---- Metric Implementations ----

/**
 * 3.1 Frequency-Domain Anomaly Score
 * HFER = high-frequency energy / total energy
 * SVD = deviation of spectral variance from baseline
 */
export function computeFrequencyMetrics(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): FrequencyMetrics {
  const { magnitude, size } = computeMagnitudeSpectrum(pixels, width, height);
  const center = size / 2;
  const radiusThreshold = size * 0.3; // 30% of spectral radius = high frequency zone

  let totalEnergy = 0;
  let highFreqEnergy = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const mag = magnitude[y * size + x];
      const energy = mag * mag;
      totalEnergy += energy;
      const dist = Math.sqrt((x - center) ** 2 + (y - center) ** 2);
      if (dist > radiusThreshold) {
        highFreqEnergy += energy;
      }
    }
  }

  const hfer = totalEnergy > 0 ? highFreqEnergy / totalEnergy : 0;

  // Spectral Variance Deviation
  const mean = magnitude.reduce((a, b) => a + b, 0) / magnitude.length;
  const variance = magnitude.reduce((a, b) => a + (b - mean) ** 2, 0) / magnitude.length;

  // Baseline variance for natural images is typically ~2.5-4.0
  // GAN images tend to have lower variance (more uniform spectrum)
  const baselineVariance = 3.2;
  const svd = Math.abs(variance - baselineVariance) / baselineVariance;

  return { hfer, svd };
}

/**
 * 3.2 Texture Consistency Drift — Patch Drift Index (PDI)
 * Divide image into patches, compute embedding similarity between adjacent patches.
 * PDI = variance of similarity scores (higher = more inconsistent = suspicious)
 */
export function computeTextureMetrics(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  gridSize: number = 8
): TextureMetrics {
  const patchW = Math.floor(width / gridSize);
  const patchH = Math.floor(height / gridSize);

  // Compute color histogram (16 bins per channel = 4096 dims, compressed to 48) per patch
  const histograms: number[][] = [];

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const hist = new Array(48).fill(0); // 16 bins * 3 channels
      let count = 0;
      for (let y = gy * patchH; y < (gy + 1) * patchH && y < height; y++) {
        for (let x = gx * patchW; x < (gx + 1) * patchW && x < width; x++) {
          const idx = (y * width + x) * 4;
          hist[Math.floor(pixels[idx] / 16)] += 1;           // R
          hist[16 + Math.floor(pixels[idx + 1] / 16)] += 1;  // G
          hist[32 + Math.floor(pixels[idx + 2] / 16)] += 1;  // B
          count++;
        }
      }
      // Normalize
      if (count > 0) {
        for (let i = 0; i < 48; i++) hist[i] /= count;
      }
      histograms.push(hist);
    }
  }

  // Compute cosine similarity between adjacent patches
  const similarities: number[] = [];

  function cosineSim(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  }

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const idx = gy * gridSize + gx;
      // Right neighbor
      if (gx + 1 < gridSize) {
        similarities.push(cosineSim(histograms[idx], histograms[idx + 1]));
      }
      // Bottom neighbor
      if (gy + 1 < gridSize) {
        similarities.push(cosineSim(histograms[idx], histograms[idx + gridSize]));
      }
    }
  }

  // PDI = variance of similarities
  const mean = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const pdi = similarities.reduce((a, b) => a + (b - mean) ** 2, 0) / similarities.length;

  return { pdi, patchScores: similarities, gridSize };
}

/**
 * EXIF / Metadata analysis from raw image buffer.
 * Checks for stripped metadata, known editing software signatures.
 */
export function analyzeImageMetadata(
  buffer: ArrayBuffer
): {
  exifPresent: boolean;
  hasBeenEdited: boolean;
  compressionAnomalies: boolean;
  softwareUsed: string | undefined;
  signals: DetectionSignalOutput[];
} {
  const bytes = new Uint8Array(buffer);
  const signals: DetectionSignalOutput[] = [];

  // Check for JPEG EXIF (APP1 marker = 0xFF 0xE1)
  let exifPresent = false;
  let softwareUsed: string | undefined;
  let hasBeenEdited = false;

  // JPEG check
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    // Scan for APP1 marker
    let offset = 2;
    while (offset < bytes.length - 4) {
      if (bytes[offset] === 0xFF) {
        const marker = bytes[offset + 1];
        if (marker === 0xE1) {
          exifPresent = true;
          // Try to find software tag in EXIF
          const exifStr = String.fromCharCode(...bytes.slice(offset, Math.min(offset + 500, bytes.length)));
          const softwareMatches = [
            "Photoshop", "GIMP", "Lightroom", "Snapseed",
            "FaceApp", "Remini", "AI", "deepfake",
          ];
          for (const sw of softwareMatches) {
            if (exifStr.toLowerCase().includes(sw.toLowerCase())) {
              softwareUsed = sw;
              hasBeenEdited = true;
            }
          }
          break;
        }
        // Skip to next marker
        const segLen = (bytes[offset + 2] << 8) | bytes[offset + 3];
        offset += 2 + segLen;
      } else {
        offset++;
      }
    }
  }

  // PNG check — look for iTXt/tEXt chunks
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const pngStr = String.fromCharCode(...bytes.slice(0, Math.min(2000, bytes.length)));
    if (pngStr.includes("tEXt") || pngStr.includes("iTXt")) {
      exifPresent = true;
    }
    if (pngStr.toLowerCase().includes("photoshop") || pngStr.toLowerCase().includes("gimp")) {
      hasBeenEdited = true;
      softwareUsed = pngStr.includes("Photoshop") ? "Adobe Photoshop" : "GIMP";
    }
  }

  // Check for re-compression (multiple JPEG quantization tables)
  let quantTableCount = 0;
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    for (let i = 0; i < bytes.length - 1; i++) {
      if (bytes[i] === 0xFF && bytes[i + 1] === 0xDB) {
        quantTableCount++;
      }
    }
  }
  const compressionAnomalies = quantTableCount > 2;

  // Generate signals
  if (!exifPresent) {
    signals.push({
      id: "meta-exif-stripped",
      name: "EXIF Metadata Stripped",
      category: "metadata",
      confidence: 0.65,
      description: "Image metadata has been intentionally removed, common in manipulated media.",
      severity: "suspicious",
    });
  }

  if (hasBeenEdited) {
    signals.push({
      id: "meta-edited",
      name: "Editing Software Detected",
      category: "metadata",
      confidence: 0.7,
      description: `Image shows signs of editing${softwareUsed ? ` via ${softwareUsed}` : ""}.`,
      severity: "suspicious",
    });
  }

  if (compressionAnomalies) {
    signals.push({
      id: "meta-recompression",
      name: "Re-Compression Detected",
      category: "metadata",
      confidence: 0.55,
      description: "Multiple compression layers detected, suggesting image has been re-saved or manipulated.",
      severity: "low",
    });
  }

  return { exifPresent, hasBeenEdited, compressionAnomalies, softwareUsed, signals };
}

/**
 * Run the full image detection suite.
 */
export function analyzeImage(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  buffer: ArrayBuffer,
  enableTexture: boolean = true
): {
  frequency: FrequencyMetrics;
  texture: TextureMetrics | null;
  metadata: ReturnType<typeof analyzeImageMetadata>;
  signals: DetectionSignalOutput[];
} {
  const frequency = computeFrequencyMetrics(pixels, width, height);
  const texture = enableTexture ? computeTextureMetrics(pixels, width, height) : null;
  const metadata = analyzeImageMetadata(buffer);

  const signals: DetectionSignalOutput[] = [...metadata.signals];

  // Generate frequency signals
  if (frequency.hfer < 0.15) {
    signals.push({
      id: "freq-hfer-low",
      name: "Suppressed High-Frequency Energy",
      category: "visual",
      confidence: Math.min(0.95, 0.6 + (0.15 - frequency.hfer) * 3),
      description: `High-frequency energy ratio is ${(frequency.hfer * 100).toFixed(1)}%, well below natural baseline. GAN-generated images typically show suppressed high-frequency noise.`,
      severity: frequency.hfer < 0.08 ? "high_risk" : "harmful",
      metricValue: frequency.hfer,
    });
  }

  if (frequency.svd > 0.5) {
    signals.push({
      id: "freq-svd-high",
      name: "Spectral Variance Anomaly",
      category: "visual",
      confidence: Math.min(0.9, 0.5 + frequency.svd * 0.3),
      description: `Spectral variance deviates ${(frequency.svd * 100).toFixed(0)}% from natural image baseline. Synthetic images show abnormal spectral distribution.`,
      severity: frequency.svd > 1.0 ? "high_risk" : "suspicious",
      metricValue: frequency.svd,
    });
  }

  // Texture signal
  if (texture && texture.pdi > 0.02) {
    signals.push({
      id: "tex-pdi-high",
      name: "Texture Consistency Drift",
      category: "visual",
      confidence: Math.min(0.85, 0.5 + texture.pdi * 10),
      description: `Patch Drift Index of ${texture.pdi.toFixed(4)} indicates inconsistent texture across image regions, suggesting compositing or generation artifacts.`,
      severity: texture.pdi > 0.05 ? "harmful" : "suspicious",
      metricValue: texture.pdi,
    });
  }

  return { frequency, texture, metadata, signals };
}

/**
 * Analyze image from raw buffer (server-side compatible).
 * When ImageData is not available, extracts basic metrics from raw bytes.
 */
export function analyzeImageFromBuffer(
  buffer: ArrayBuffer,
  imageData?: ImageData
): ReturnType<typeof analyzeImage> {
  if (imageData) {
    return analyzeImage(imageData.data, imageData.width, imageData.height, buffer);
  }

  // Fallback: analyze just metadata when pixel data unavailable
  const metadata = analyzeImageMetadata(buffer);
  return {
    frequency: { hfer: 0.5, svd: 0 },
    texture: null,
    metadata,
    signals: metadata.signals,
  };
}
