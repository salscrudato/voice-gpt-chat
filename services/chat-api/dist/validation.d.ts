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
export declare function validateChatRequest(body: any): ValidationResult;
/**
 * Sanitize string input to prevent injection attacks
 */
export declare function sanitizeString(input: string): string;
/**
 * Validate user ID format
 */
export declare function validateUserId(uid: string): boolean;
/**
 * Validate session ID format
 */
export declare function validateSessionId(sessionId: string): boolean;
/**
 * Get error response with proper status code
 */
export declare function getErrorResponse(validation: ValidationResult): {
    status: number;
    body: any;
};
//# sourceMappingURL=validation.d.ts.map