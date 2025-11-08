/**
 * Audio Codec Detection and Management
 * Automatically detects best codec, validates quality, and provides fallback strategy
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
  {mimeType: "audio/m4a", extension: "m4a", priority: 4, supported: false},
  {mimeType: "audio/wav", extension: "wav", priority: 5, supported: false},
  {mimeType: "audio/mp3", extension: "mp3", priority: 6, supported: false},
  {mimeType: "audio/ogg", extension: "ogg", priority: 7, supported: false},
];

/**
 * Detect supported audio codecs
 */
export function detectSupportedCodecs(): CodecInfo[] {
  return CODEC_PRIORITY.map((codec) => ({
    ...codec,
    supported: MediaRecorder.isTypeSupported(codec.mimeType),
  })).filter((c) => c.supported);
}

/**
 * Get best supported codec
 */
export function getBestCodec(): CodecInfo | null {
  const supported = detectSupportedCodecs();
  return supported.length > 0 ? supported[0] : null;
}

/**
 * Get codec info by MIME type
 */
export function getCodecInfo(mimeType: string): CodecInfo | null {
  const normalized = mimeType.split(";")[0];
  return CODEC_PRIORITY.find((c) => c.mimeType.startsWith(normalized)) || null;
}

/**
 * Validate audio blob
 */
export function validateAudioBlob(blob: Blob): {valid: boolean; error?: string} {
  if (!blob || blob.size === 0) {
    return {valid: false, error: "Audio file is empty"};
  }

  if (blob.size > 500 * 1024 * 1024) {
    // 500MB limit
    return {valid: false, error: "Audio file is too large (max 500MB)"};
  }

  const validTypes = [
    "audio/webm",
    "audio/mp4",
    "audio/m4a",
    "audio/wav",
    "audio/mp3",
    "audio/ogg",
  ];

  if (!validTypes.some((t) => blob.type.startsWith(t))) {
    return {valid: false, error: `Invalid audio format: ${blob.type}`};
  }

  return {valid: true};
}

/**
 * Get file extension from MIME type
 */
export function getFileExtension(mimeType: string): string {
  const codec = getCodecInfo(mimeType);
  if (codec) return codec.extension;

  // Fallback mapping
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

/**
 * Get MIME type from file extension
 */
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

/**
 * Log codec information for debugging
 */
export function logCodecInfo(): void {
  const supported = detectSupportedCodecs();
  const best = getBestCodec();
  console.log("Audio Codec Support:", {
    supported: supported.map((c) => c.mimeType),
    best: best?.mimeType,
    all: CODEC_PRIORITY.map((c) => ({
      mimeType: c.mimeType,
      supported: c.supported,
    })),
  });
}

