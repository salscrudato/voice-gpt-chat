/**
 * Validation utilities for request and data validation
 * Comprehensive input validation and sanitization with XSS/injection prevention
 */

import {logWarning} from "./errorHandler";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Dangerous patterns for injection detection
const DANGEROUS_PATTERNS = [
  /<script[^>]*>.*?<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /eval\(/gi,
  /expression\(/gi,
  /vbscript:/gi,
  /data:text\/html/gi,
];

/**
 * Validate audio file
 */
export function validateAudioFile(file: Blob): ValidationResult {
  const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
  const MIN_SIZE = 1024; // 1 KB minimum
  const ALLOWED_TYPES = ["audio/webm", "audio/mp3", "audio/wav", "audio/m4a", "audio/mp4"];

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

  // Allow empty type (browser default) or check against allowed types
  // Handle codec specifications like "audio/webm;codecs=opus"
  if (file.type) {
    const baseType = file.type.split(";")[0];
    if (!ALLOWED_TYPES.includes(baseType)) {
      return {
        valid: false,
        error: `File type ${file.type} not supported. Supported types: ${ALLOWED_TYPES.join(", ")}`,
      };
    }
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
 * Sanitize user input to prevent XSS and injection attacks
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== "string") {
    logWarning("Invalid input type for sanitization", new Error(`Expected string, got ${typeof input}`));
    return "";
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(input)) {
      logWarning("Dangerous pattern detected in input", new Error(`Pattern: ${pattern}`));
      return "";
    }
  }

  // Use textContent to prevent HTML injection
  const div = document.createElement("div");
  div.textContent = input;
  return div.innerHTML;
}

/**
 * Validate and sanitize user input
 */
export function validateAndSanitize(input: string, maxLength = 5000): ValidationResult {
  if (typeof input !== "string") {
    return {valid: false, error: "Input must be a string"};
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return {valid: false, error: "Input cannot be empty"};
  }

  if (trimmed.length > maxLength) {
    return {valid: false, error: `Input exceeds ${maxLength} character limit`};
  }

  // Check for injection patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {valid: false, error: "Input contains invalid characters or patterns"};
    }
  }

  return {valid: true};
}

/**
 * Validate UUID format
 */
export function validateUUID(uuid: string): ValidationResult {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(uuid)) {
    return {valid: false, error: "Invalid UUID format"};
  }
  return {valid: true};
}

/**
 * Validate email format
 */
export function validateEmail(email: string): ValidationResult {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return {valid: false, error: "Invalid email format"};
  }
  return {valid: true};
}

/**
 * Validate API request payload
 */
export function validateAPIRequest(data: any): ValidationResult {
  if (!data || typeof data !== "object") {
    return {valid: false, error: "Request payload must be a valid object"};
  }

  // Check for suspicious patterns in all string values
  const checkForInjection = (obj: any, depth = 0): boolean => {
    if (depth > 10) return false; // Prevent deep recursion

    if (typeof obj === "string") {
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(obj)) {
          return true;
        }
      }
    } else if (typeof obj === "object" && obj !== null) {
      for (const value of Object.values(obj)) {
        if (checkForInjection(value, depth + 1)) {
          return true;
        }
      }
    }
    return false;
  };

  if (checkForInjection(data)) {
    return {valid: false, error: "Request contains invalid or suspicious content"};
  }

  return {valid: true};
}

/**
 * Validate request size
 */
export function validateRequestSize(data: any, maxSizeBytes = 1024 * 1024): ValidationResult {
  try {
    const size = new Blob([JSON.stringify(data)]).size;
    if (size > maxSizeBytes) {
      return {
        valid: false,
        error: `Request size exceeds ${maxSizeBytes / 1024}KB limit`,
      };
    }
    return {valid: true};
  } catch (error) {
    return {valid: false, error: "Failed to validate request size"};
  }
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject(obj: any, depth = 0): any {
  if (depth > 10) return obj; // Prevent deep recursion

  if (typeof obj === "string") {
    return sanitizeInput(obj);
  } else if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  } else if (typeof obj === "object" && obj !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value, depth + 1);
    }
    return sanitized;
  }
  return obj;
}

