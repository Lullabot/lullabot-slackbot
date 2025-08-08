import pino from 'pino';
import { config } from './config';

// Define sensitive patterns to redact
const redactionPaths = [
    'token',
    'secret',
    'password',
    'auth',
    'authorization',
    'cookie',
    'session',
    'api_key',
    'apikey',
    'access_token',
    'refresh_token',
    'client_secret',
    'BOT_TOKEN',
    'SLACK_APP_TOKEN',
    'CLIENT_SIGNING_SECRET',
    'SLACK_SHARED_SECRET',
    'GITHUB_TOKEN',
    // Redact email addresses
    '*.email',
    '*.user.email',
    // Redact message content in production
    ...(config.NODE_ENV === 'production' ? ['message.text', 'content', 'payload'] : [])
];

// Create logger configuration
const loggerConfig: pino.LoggerOptions = {
    level: process.env.LOG_LEVEL || (config.NODE_ENV === 'production' ? 'info' : 'debug'),
    // Use pretty printing in development
    ...(config.NODE_ENV !== 'production' && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname'
            }
        }
    }),
    // Redaction configuration
    redact: {
        paths: redactionPaths,
        censor: '[REDACTED]'
    },
    // Add base metadata
    base: {
        env: config.NODE_ENV,
        pid: process.pid
    },
    // Serialize errors properly
    serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
        req: (req: any) => ({
            method: req.method,
            url: req.url,
            // Don't log headers as they may contain sensitive data
            query: req.query
        }),
        res: (res: any) => ({
            statusCode: res.statusCode
        })
    }
};

// Create the logger instance
export const logger = pino(loggerConfig);

// Create child loggers for different modules
export const createLogger = (module: string) => {
    return logger.child({ module });
};

// Helper function to safely log objects with potential sensitive data
export function safeLog(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any) {
    if (config.NODE_ENV === 'production' && level === 'debug') {
        // Skip debug logs in production
        return;
    }
    
    // Create a safe copy of the data
    const safeData = data ? JSON.parse(JSON.stringify(data)) : undefined;
    
    // Additional manual redaction for URLs and message content in production
    if (safeData && config.NODE_ENV === 'production') {
        // Recursively redact sensitive fields
        redactSensitiveFields(safeData);
    }
    
    logger[level]({ data: safeData }, message);
}

function redactSensitiveFields(obj: any): void {
    if (!obj || typeof obj !== 'object') return;
    
    const sensitiveKeys = ['url', 'permalink', 'message', 'text', 'content'];
    
    for (const key in obj) {
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
            obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object') {
            redactSensitiveFields(obj[key]);
        }
    }
}

// Export convenience methods
export default {
    debug: (message: string, data?: any) => safeLog('debug', message, data),
    info: (message: string, data?: any) => safeLog('info', message, data),
    warn: (message: string, data?: any) => safeLog('warn', message, data),
    error: (message: string, data?: any) => safeLog('error', message, data),
    child: createLogger
};