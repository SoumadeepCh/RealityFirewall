// ============================================
// AMAF — Audio Detection Module
// Implements: ETK, PVSS, FRD
// ============================================

import type {
  EnergyTransitionMetrics,
  PitchMetrics,
  SpectralFlatnessMetrics,
  DetectionSignalOutput,
} from "./types";

// ---- Utilities ----

/**
 * Hanning window function.
 */
function hanningWindow(size: number): Float64Array {
  const window = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

/**
 * Compute Short-Time Fourier Transform.
 * Returns per-frame magnitude spectra.
 */
function computeSTFT(
  samples: Float32Array,
  frameSize: number = 1024,
  hopSize: number = 512
): Float64Array[] {
  const window = hanningWindow(frameSize);
  const frames: Float64Array[] = [];

  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    const real = new Float64Array(frameSize);
    const imag = new Float64Array(frameSize);

    // Apply window
    for (let i = 0; i < frameSize; i++) {
      real[i] = samples[start + i] * window[i];
    }

    // Simple DFT for the first half of frequencies (Nyquist)
    const halfSize = frameSize / 2;
    const magnitudes = new Float64Array(halfSize);

    for (let k = 0; k < halfSize; k++) {
      let sumRe = 0, sumIm = 0;
      // Use sparse computation for performance (skip every 4th sample for large frames)
      const step = frameSize > 512 ? 2 : 1;
      for (let n = 0; n < frameSize; n += step) {
        const angle = (2 * Math.PI * k * n) / frameSize;
        sumRe += real[n] * Math.cos(angle);
        sumIm -= real[n] * Math.sin(angle);
      }
      magnitudes[k] = Math.sqrt(sumRe * sumRe + sumIm * sumIm) * (step);
    }

    frames.push(magnitudes);
  }

  return frames;
}

/**
 * Compute frame energy from magnitude spectrum.
 */
function frameEnergy(spectrum: Float64Array): number {
  let energy = 0;
  for (let i = 0; i < spectrum.length; i++) {
    energy += spectrum[i] * spectrum[i];
  }
  return energy;
}

/**
 * Compute kurtosis of an array.
 * Kurtosis = E[(X-μ)^4] / σ^4 - 3 (excess kurtosis)
 */
function kurtosis(values: number[]): number {
  if (values.length < 4) return 0;
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  if (variance < 1e-10) return 0;
  const m4 = values.reduce((a, b) => a + (b - mean) ** 4, 0) / n;
  return m4 / (variance * variance) - 3;
}

// ---- Metric Implementations ----

/**
 * 4.1 Energy Transition Kurtosis (ETK)
 * Sharp artificial energy transitions → high kurtosis in ΔE.
 */
export function computeEnergyTransition(
  samples: Float32Array,
  frameSize: number = 1024
): EnergyTransitionMetrics {
  const spectra = computeSTFT(samples, frameSize, frameSize / 2);
  const energies = spectra.map(frameEnergy);

  // Compute energy deltas: ΔE(t) = E(t) - E(t-1)
  const deltas: number[] = [];
  for (let i = 1; i < energies.length; i++) {
    deltas.push(energies[i] - energies[i - 1]);
  }

  const etk = Math.abs(kurtosis(deltas));

  return { etk, energyDeltas: deltas };
}

/**
 * 4.2 Pitch Variance Smoothness Score (PVSS)
 * Extracts pitch contour via autocorrelation, then measures smoothness.
 * Over-smooth pitch = suspicious TTS.
 */
export function computePitchMetrics(
  samples: Float32Array,
  sampleRate: number = 44100,
  frameSize: number = 2048
): PitchMetrics {
  const hopSize = frameSize / 2;
  const pitchContour: number[] = [];

  // Pitch detection via autocorrelation per frame
  const minPeriod = Math.floor(sampleRate / 500); // 500 Hz max
  const maxPeriod = Math.floor(sampleRate / 60);  // 60 Hz min

  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    // Autocorrelation for this frame
    let bestCorr = -1;
    let bestPeriod = 0;

    for (let lag = minPeriod; lag < Math.min(maxPeriod, frameSize / 2); lag++) {
      let corr = 0;
      let norm1 = 0;
      let norm2 = 0;
      const len = frameSize - lag;

      for (let i = 0; i < len; i += 2) { // stride 2 for perf
        corr += samples[start + i] * samples[start + i + lag];
        norm1 += samples[start + i] * samples[start + i];
        norm2 += samples[start + i + lag] * samples[start + i + lag];
      }

      const normFactor = Math.sqrt(norm1 * norm2);
      const normalized = normFactor > 0 ? corr / normFactor : 0;

      if (normalized > bestCorr) {
        bestCorr = normalized;
        bestPeriod = lag;
      }
    }

    // Only accept strong pitch detection
    const pitch = bestCorr > 0.3 && bestPeriod > 0
      ? sampleRate / bestPeriod
      : 0;
    pitchContour.push(pitch);
  }

  // Filter out zero-pitch frames for smoothness calculation
  const validPitch = pitchContour.filter((p) => p > 0);

  if (validPitch.length < 4) {
    return { pvss: 0, pitchContour };
  }

  // Second derivative of pitch contour
  const d2: number[] = [];
  for (let i = 2; i < validPitch.length; i++) {
    d2.push(validPitch[i] - 2 * validPitch[i - 1] + validPitch[i - 2]);
  }

  // PVSS = variance of second derivative
  const mean = d2.reduce((a, b) => a + b, 0) / d2.length;
  const pvss = d2.reduce((a, b) => a + (b - mean) ** 2, 0) / d2.length;

  return { pvss, pitchContour };
}

/**
 * 4.3 Spectral Flatness Deviation (FRD)
 * Measures how "noise-like" vs "tonal" the spectrum is.
 * TTS over-regularizes → abnormal flatness.
 */
export function computeSpectralFlatness(
  samples: Float32Array,
  frameSize: number = 1024
): SpectralFlatnessMetrics {
  const spectra = computeSTFT(samples, frameSize, frameSize / 2);
  const flatnessValues: number[] = [];

  for (const spectrum of spectra) {
    // Geometric mean / Arithmetic mean
    let logSum = 0;
    let arithmeticSum = 0;
    let count = 0;

    for (let i = 1; i < spectrum.length; i++) {
      const val = Math.max(spectrum[i], 1e-10);
      logSum += Math.log(val);
      arithmeticSum += val;
      count++;
    }

    if (count === 0 || arithmeticSum < 1e-10) {
      flatnessValues.push(0);
      continue;
    }

    const geometricMean = Math.exp(logSum / count);
    const arithmeticMean = arithmeticSum / count;
    flatnessValues.push(geometricMean / arithmeticMean);
  }

  // FRD = deviation from natural speech baseline (~0.05-0.15)
  const meanFlatness = flatnessValues.reduce((a, b) => a + b, 0) / flatnessValues.length;
  const naturalBaseline = 0.1;
  const frd = Math.abs(meanFlatness - naturalBaseline) / naturalBaseline;

  return { frd, flatnessValues };
}

/**
 * Run the full audio detection suite.
 */
export function analyzeAudio(
  samples: Float32Array,
  sampleRate: number = 44100
): {
  energyTransition: EnergyTransitionMetrics;
  pitch: PitchMetrics;
  spectralFlatness: SpectralFlatnessMetrics;
  signals: DetectionSignalOutput[];
} {
  const signals: DetectionSignalOutput[] = [];

  const energyTransition = computeEnergyTransition(samples);
  const pitch = computePitchMetrics(samples, sampleRate);
  const spectralFlatness = computeSpectralFlatness(samples);

  // ETK signals
  if (energyTransition.etk > 5) {
    signals.push({
      id: "audio-etk-high",
      name: "Sharp Energy Transitions",
      category: "spectral",
      confidence: Math.min(0.85, 0.4 + energyTransition.etk * 0.05),
      description: `Energy Transition Kurtosis of ${energyTransition.etk.toFixed(2)} indicates sharp, artificial energy transitions typical of synthesized audio.`,
      severity: energyTransition.etk > 15 ? "high_risk" : "suspicious",
      metricValue: energyTransition.etk,
    });
  }

  // PVSS signals
  if (pitch.pvss < 5 && pitch.pitchContour.filter((p) => p > 0).length > 10) {
    signals.push({
      id: "audio-pvss-smooth",
      name: "Over-Smooth Pitch Contour",
      category: "spectral",
      confidence: Math.min(0.8, 0.5 + (5 - pitch.pvss) * 0.05),
      description: `Pitch variance smoothness of ${pitch.pvss.toFixed(2)} is unusually low, suggesting text-to-speech synthesis with over-regularized prosody.`,
      severity: pitch.pvss < 1 ? "harmful" : "suspicious",
      metricValue: pitch.pvss,
    });
  }

  // FRD signals
  if (spectralFlatness.frd > 0.5) {
    signals.push({
      id: "audio-frd-anomaly",
      name: "Spectral Flatness Anomaly",
      category: "spectral",
      confidence: Math.min(0.75, 0.3 + spectralFlatness.frd * 0.3),
      description: `Spectral Flatness Deviation of ${spectralFlatness.frd.toFixed(3)} deviates significantly from natural speech patterns.`,
      severity: spectralFlatness.frd > 1.0 ? "harmful" : "suspicious",
      metricValue: spectralFlatness.frd,
    });
  }

  return { energyTransition, pitch, spectralFlatness, signals };
}
