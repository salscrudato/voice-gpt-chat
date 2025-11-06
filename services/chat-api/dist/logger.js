"use strict";
/**
 * Structured logging for Chat API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "DEBUG";
    LogLevel["INFO"] = "INFO";
    LogLevel["WARN"] = "WARN";
    LogLevel["ERROR"] = "ERROR";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    constructor() {
        this.isDevelopment = process.env.NODE_ENV !== "production";
    }
    formatLog(entry) {
        return JSON.stringify(entry);
    }
    log(level, message, options) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            userId: options?.userId,
            requestId: options?.requestId,
            duration: options?.duration,
            metadata: options?.metadata,
            error: options?.error
                ? {
                    message: options.error.message,
                    stack: this.isDevelopment ? options.error.stack : undefined,
                }
                : undefined,
        };
        const logOutput = this.formatLog(entry);
        if (level === LogLevel.ERROR) {
            console.error(logOutput);
        }
        else if (level === LogLevel.WARN) {
            console.warn(logOutput);
        }
        else {
            console.log(logOutput);
        }
    }
    debug(message, options) {
        this.log(LogLevel.DEBUG, message, options);
    }
    info(message, options) {
        this.log(LogLevel.INFO, message, options);
    }
    warn(message, options) {
        this.log(LogLevel.WARN, message, options);
    }
    error(message, options) {
        this.log(LogLevel.ERROR, message, options);
    }
}
exports.logger = new Logger();
//# sourceMappingURL=logger.js.map