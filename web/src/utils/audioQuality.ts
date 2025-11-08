/**
 * Audio Quality Detection and Analysis
 * Provides real-time audio quality metrics and adaptive processing
 */

export interface AudioQualityMetrics {
  rms: number;
  peakLevel: number;
  noiseFloor: number;
  signalToNoise: number;
  clipping: number;
  silenceRatio: number;
  qualityScore: number;
  recommendedBitrate: number;
  audioLevel: "low" | "optimal" | "high" | "clipping";
}

export interface AudioSegment {
  data: Float32Array;
  startTime: number;
  duration: number;
  isSilence: boolean;
}

/**
 * Analyze audio buffer for quality metrics
 */
export function analyzeAudioQuality(audioBuffer: Float32Array, sampleRate: number): AudioQualityMetrics {
  if (audioBuffer.length === 0) {
    return getDefaultMetrics();
  }

  let sumSquares = 0;
  let maxAmplitude = 0;
  let clippedSamples = 0;
  const clipThreshold = 0.99;

  for (let i = 0; i < audioBuffer.length; i++) {
    const sample = audioBuffer[i];
    sumSquares += sample * sample;
    maxAmplitude = Math.max(maxAmplitude, Math.abs(sample));
    if (Math.abs(sample) > clipThreshold) {
      clippedSamples++;
    }
  }

  const rms = Math.sqrt(sumSquares / audioBuffer.length);
  const clipping = (clippedSamples / audioBuffer.length) * 100;

  const sorted = Array.from(audioBuffer).map(Math.abs).sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.1)];

  const snr = rms > 0 && noiseFloor > 0 ? 20 * Math.log10(rms / noiseFloor) : 0;

  const silenceThreshold = noiseFloor * 1.5;
  let silentSamples = 0;
  for (let i = 0; i < audioBuffer.length; i++) {
    if (Math.abs(audioBuffer[i]) < silenceThreshold) {
      silentSamples++;
    }
  }
  const silenceRatio = (silentSamples / audioBuffer.length) * 100;

  let audioLevel: "low" | "optimal" | "high" | "clipping";
  if (clipping > 1) {
    audioLevel = "clipping";
  } else if (rms < 0.05) {
    audioLevel = "low";
  } else if (rms > 0.7) {
    audioLevel = "high";
  } else {
    audioLevel = "optimal";
  }

  let qualityScore = 100;
  qualityScore -= Math.min(clipping * 2, 30);
  if (snr < 10) qualityScore -= 20;
  else if (snr < 20) qualityScore -= 10;
  if (silenceRatio > 50) qualityScore -= 15;
  if (rms < 0.05) qualityScore -= 20;
  qualityScore = Math.max(0, Math.min(100, qualityScore));

  let recommendedBitrate = 128;
  if (qualityScore > 80) {
    recommendedBitrate = 192;
  } else if (qualityScore < 50) {
    recommendedBitrate = 96;
  }

  return {
    rms,
    peakLevel: maxAmplitude,
    noiseFloor,
    signalToNoise: snr,
    clipping,
    silenceRatio,
    qualityScore: Math.round(qualityScore),
    recommendedBitrate,
    audioLevel,
  };
}

/**
 * Normalize audio buffer to prevent clipping
 */
export function normalizeAudio(audioBuffer: Float32Array, targetLevel = 0.9): Float32Array {
  let maxAmplitude = 0;
  for (let i = 0; i < audioBuffer.length; i++) {
    maxAmplitude = Math.max(maxAmplitude, Math.abs(audioBuffer[i]));
  }

  if (maxAmplitude === 0) return audioBuffer;

  const normalized = new Float32Array(audioBuffer.length);
  const scaleFactor = targetLevel / maxAmplitude;

  for (let i = 0; i < audioBuffer.length; i++) {
    normalized[i] = audioBuffer[i] * scaleFactor;
  }

  return normalized;
}

/**
 * Apply high-pass filter to reduce low-frequency noise
 */
export function applyHighPassFilter(audioBuffer: Float32Array, cutoffFrequency = 80, sampleRate = 48000): Float32Array {
  const filtered = new Float32Array(audioBuffer.length);
  const rc = 1.0 / (2.0 * Math.PI * cutoffFrequency);
  const dt = 1.0 / sampleRate;
  const alpha = dt / (rc + dt);

  filtered[0] = audioBuffer[0];
  for (let i = 1; i < audioBuffer.length; i++) {
    filtered[i] = alpha * (filtered[i - 1] + audioBuffer[i] - audioBuffer[i - 1]);
  }

  return filtered;
}

function getDefaultMetrics(): AudioQualityMetrics {
  return {
    rms: 0,
    peakLevel: 0,
    noiseFloor: 0,
    signalToNoise: 0,
    clipping: 0,
    silenceRatio: 100,
    qualityScore: 0,
    recommendedBitrate: 128,
    audioLevel: "low",
  };
}

export function formatAudioMetrics(metrics: AudioQualityMetrics): string {
  return `Quality: ${metrics.qualityScore}% | SNR: ${metrics.signalToNoise.toFixed(1)}dB | ` +
    `Level: ${metrics.audioLevel} | Clipping: ${metrics.clipping.toFixed(1)}%`;
}

