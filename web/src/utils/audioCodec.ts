/**
 * Audio Codec Detection and Management
 * Enterprise-grade codec detection with fallback strategy and validation
 */

export interface CodecInfo {
  mimeType: string;
  extension: string;
  priority: number;
  supported: boolean;
}

const CODEC_PRIORITY: CodecInfo[] = [
  {mimeType: "audio/webm;codecs=opus", extension: "webm", priority: 1, supported: false},
  {mimeType: "audio/webm", extension: "webm", priority: 2, supported: false},
  {mimeType: "audio/mp4", extension: "m4a", priority: 3, supported: false},
  {mimeType: "audio/wav", extension: "wav", priority: 4, supported: false},
  {mimeType: "audio/ogg", extension: "ogg", priority: 5, supported: false},
];

const MAX_AUDIO_SIZE = 500 * 1024 * 1024; // 500MB
const MIN_AUDIO_SIZE = 1024; // 1KB
const VALID_AUDIO_TYPES = ["audio/webm", "audio/mp4", "audio/m4a", "audio/wav", "audio/mp3", "audio/ogg"];

export function detectSupportedCodecs(): CodecInfo[] {
  return CODEC_PRIORITY.map((codec) => ({
    ...codec,
    supported: MediaRecorder.isTypeSupported(codec.mimeType),
  })).filter((c) => c.supported);
}

export function getBestCodec(): CodecInfo | null {
  const supported = detectSupportedCodecs();
  return supported.length > 0 ? supported[0] : null;
}

export function getCodecInfo(mimeType: string): CodecInfo | null {
  const normalized = mimeType.split(";")[0];
  return CODEC_PRIORITY.find((c) => c.mimeType.startsWith(normalized)) || null;
}

export function validateAudioBlob(blob: Blob): {valid: boolean; error?: string} {
  if (!blob) {
    return {valid: false, error: "Audio blob is missing"};
  }

  if (blob.size === 0) {
    return {valid: false, error: "Audio file is empty"};
  }

  if (blob.size < MIN_AUDIO_SIZE) {
    return {valid: false, error: "Audio file is too small (minimum 1KB)"};
  }

  if (blob.size > MAX_AUDIO_SIZE) {
    return {valid: false, error: `Audio file is too large (max ${MAX_AUDIO_SIZE / 1024 / 1024}MB)`};
  }

  if (!VALID_AUDIO_TYPES.some((t) => blob.type.startsWith(t))) {
    return {valid: false, error: `Invalid audio format: ${blob.type || "unknown"}`};
  }

  return {valid: true};
}

export function getFileExtension(mimeType: string): string {
  const codec = getCodecInfo(mimeType);
  if (codec) return codec.extension;

  const typeMap: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/wav": "wav",
    "audio/mp3": "mp3",
    "audio/ogg": "ogg",
  };

  const normalized = mimeType.split(";")[0];
  return typeMap[normalized] || "webm";
}

export function getMimeType(extension: string): string {
  const extMap: Record<string, string> = {
    webm: "audio/webm",
    m4a: "audio/m4a",
    wav: "audio/wav",
    mp3: "audio/mp3",
    ogg: "audio/ogg",
  };
  return extMap[extension.toLowerCase()] || "audio/webm";
}

export function logCodecInfo(): void {
  const supported = detectSupportedCodecs();
  const best = getBestCodec();
  console.log("[AudioCodec] Supported codecs:", {
    best: best?.mimeType,
    all: supported.map((c) => c.mimeType),
  });
}

