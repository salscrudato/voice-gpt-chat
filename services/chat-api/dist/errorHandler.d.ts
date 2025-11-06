/**
 * Error handling utilities for Chat API
 */
import { Response } from "express";
export declare enum ErrorCode {
    INVALID_USER_ID = "INVALID_USER_ID",
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
    INVALID_MESSAGES = "INVALID_MESSAGES",
    EMBEDDING_FAILED = "EMBEDDING_FAILED",
    VECTOR_SEARCH_FAILED = "VECTOR_SEARCH_FAILED",
    CHAT_FAILED = "CHAT_FAILED",
    INTERNAL_ERROR = "INTERNAL_ERROR"
}
export interface ErrorResponse {
    error: string;
    code: ErrorCode;
    retryAfter?: number;
}
export declare function sendError(res: Response, statusCode: number, message: string, code: ErrorCode, options?: {
    userId?: string;
    requestId?: string;
    error?: Error;
    retryAfter?: number;
}): void;
export declare function handleStreamError(res: Response, message: string, options?: {
    userId?: string;
    requestId?: string;
    error?: Error;
}): void;
//# sourceMappingURL=errorHandler.d.ts.map