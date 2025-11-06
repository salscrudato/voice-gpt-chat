"use strict";
/**
 * Error handling utilities for Chat API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorCode = void 0;
exports.sendError = sendError;
exports.handleStreamError = handleStreamError;
const logger_1 = require("./logger");
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["INVALID_USER_ID"] = "INVALID_USER_ID";
    ErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    ErrorCode["INVALID_MESSAGES"] = "INVALID_MESSAGES";
    ErrorCode["EMBEDDING_FAILED"] = "EMBEDDING_FAILED";
    ErrorCode["VECTOR_SEARCH_FAILED"] = "VECTOR_SEARCH_FAILED";
    ErrorCode["CHAT_FAILED"] = "CHAT_FAILED";
    ErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
function sendError(res, statusCode, message, code, options) {
    logger_1.logger.error(message, {
        userId: options?.userId,
        requestId: options?.requestId,
        metadata: { statusCode, code },
        error: options?.error,
    });
    if (res.headersSent) {
        return;
    }
    const response = {
        error: message,
        code,
        retryAfter: options?.retryAfter,
    };
    if (options?.retryAfter) {
        res.set("Retry-After", options.retryAfter.toString());
    }
    res.status(statusCode).json(response);
}
function handleStreamError(res, message, options) {
    logger_1.logger.error(message, {
        userId: options?.userId,
        requestId: options?.requestId,
        error: options?.error,
    });
    if (!res.headersSent) {
        res.status(500).json({ error: message, code: ErrorCode.INTERNAL_ERROR });
    }
    else {
        // Stream already started, send error as SSE
        res.write(`data: ${JSON.stringify({ type: "error", error: message })}\n\n`);
        res.end();
    }
}
//# sourceMappingURL=errorHandler.js.map