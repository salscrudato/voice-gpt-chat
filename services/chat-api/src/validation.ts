/**
 * Request Validation - Comprehensive input validation for Chat API
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: any;
}

/**
 * Validate chat message request
 */
export function validateChatRequest(body: any): ValidationResult {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  const { messages, sessionId } = body;

  // Validate messages array
  if (!Array.isArray(messages)) {
    return { valid: false, error: "messages must be an array" };
  }

  if (messages.length === 0) {
    return { valid: false, error: "messages array cannot be empty" };
  }

  if (messages.length > 100) {
    return { valid: false, error: "messages array cannot exceed 100 items" };
  }

  // Validate each message
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (!msg || typeof msg !== "object") {
      return { valid: false, error: `Message ${i} must be an object` };
    }

    if (!["user", "assistant", "system"].includes(msg.role)) {
      return { valid: false, error: `Message ${i} has invalid role` };
    }

    if (typeof msg.content !== "string") {
      return { valid: false, error: `Message ${i} content must be a string` };
    }

    if (msg.content.length === 0 || msg.content.length > 5000) {
      return { valid: false, error: `Message ${i} content length invalid (0-5000 chars)` };
    }
  }

  // Validate sessionId if provided
  if (sessionId !== undefined && typeof sessionId !== "string") {
    return { valid: false, error: "sessionId must be a string" };
  }

  if (sessionId && sessionId.length > 256) {
    return { valid: false, error: "sessionId too long (max 256 chars)" };
  }

  return {
    valid: true,
    sanitized: {
      messages: messages.map(m => ({
        role: m.role,
        content: sanitizeString(m.content),
      })),
      sessionId: sessionId || undefined,
    },
  };
}

/**
 * Sanitize string input to prevent injection attacks
 */
export function sanitizeString(input: string): string {
  if (typeof input !== "string") return "";

  return input
    .replace(/[<>]/g, "") // Remove angle brackets
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, "") // Remove event handlers
    .substring(0, 5000); // Enforce max length
}

/**
 * Validate user ID format
 */
export function validateUserId(uid: string): boolean {
  if (!uid || typeof uid !== "string") return false;
  if (uid.length < 10 || uid.length > 128) return false;
  // Firebase UIDs are alphanumeric
  return /^[a-zA-Z0-9]+$/.test(uid);
}

/**
 * Validate session ID format
 */
export function validateSessionId(sessionId: string): boolean {
  if (!sessionId || typeof sessionId !== "string") return false;
  if (sessionId.length < 1 || sessionId.length > 256) return false;
  return /^[a-zA-Z0-9\-_]+$/.test(sessionId);
}

/**
 * Get error response with proper status code
 */
export function getErrorResponse(validation: ValidationResult): { status: number; body: any } {
  return {
    status: 400,
    body: {
      error: validation.error || "Invalid request",
      timestamp: new Date().toISOString(),
    },
  };
}

