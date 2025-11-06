/**
 * Structured logging for Chat API
 */
export declare enum LogLevel {
    DEBUG = "DEBUG",
    INFO = "INFO",
    WARN = "WARN",
    ERROR = "ERROR"
}
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    userId?: string;
    requestId?: string;
    duration?: number;
    metadata?: Record<string, any>;
    error?: {
        message: string;
        stack?: string;
    };
}
declare class Logger {
    private isDevelopment;
    private formatLog;
    private log;
    debug(message: string, options?: Parameters<typeof this.log>[2]): void;
    info(message: string, options?: Parameters<typeof this.log>[2]): void;
    warn(message: string, options?: Parameters<typeof this.log>[2]): void;
    error(message: string, options?: Parameters<typeof this.log>[2]): void;
}
export declare const logger: Logger;
export {};
//# sourceMappingURL=logger.d.ts.map