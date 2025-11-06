/**
 * Validation utilities for request and data validation
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate audio file
 */
export function validateAudioFile(file: Blob): ValidationResult {
  const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
  const MIN_SIZE = 1024; // 1 KB minimum
  const ALLOWED_TYPES = ["audio/webm", "audio/mp3", "audio/wav", "audio/m4a"];

  if (file.size < MIN_SIZE) {
    return {
      valid: false,
      error: "Recording is too short. Please record at least a few seconds.",
    };
  }

  if (file.size > MAX_SIZE) {
    return {
      valid: false,
      error: `File size exceeds ${MAX_SIZE / 1024 / 1024}MB limit`,
    };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} not supported`,
    };
  }

  return {valid: true};
}

/**
 * Validate user name
 */
export function validateUserName(name: string): ValidationResult {
  const trimmed = name.trim();
  
  if (trimmed.length < 2) {
    return {valid: false, error: "Name must be at least 2 characters"};
  }
  
  if (trimmed.length > 50) {
    return {valid: false, error: "Name must be less than 50 characters"};
  }
  
  if (!/^[a-zA-Z0-9\s\-']+$/.test(trimmed)) {
    return {valid: false, error: "Name contains invalid characters"};
  }
  
  return {valid: true};
}

/**
 * Validate chat message
 */
export function validateChatMessage(message: string): ValidationResult {
  const trimmed = message.trim();
  
  if (trimmed.length === 0) {
    return {valid: false, error: "Message cannot be empty"};
  }
  
  if (trimmed.length > 5000) {
    return {valid: false, error: "Message exceeds 5000 character limit"};
  }
  
  return {valid: true};
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  const div = document.createElement("div");
  div.textContent = input;
  return div.innerHTML;
}

