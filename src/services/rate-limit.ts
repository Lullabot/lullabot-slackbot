import { createLogger } from '../logger';

const logger = createLogger('rate-limit');

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

interface RateLimitOptions {
    maxRequests: number;    // Maximum number of requests
    windowMs: number;        // Time window in milliseconds
    identifier: string;      // Unique identifier for the rate limit (e.g., 'karma', 'factoids')
}

// Store rate limit entries by identifier and user/channel
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Check if a user or channel has exceeded the rate limit
 * @param userId User or channel ID to check
 * @param options Rate limit configuration
 * @returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(userId: string, options: RateLimitOptions): boolean {
    const key = `${options.identifier}:${userId}`;
    const now = Date.now();
    
    // Get or create entry
    let entry = rateLimitStore.get(key);
    
    // If no entry exists or window has expired, create new entry
    if (!entry || now > entry.resetTime) {
        entry = {
            count: 1,
            resetTime: now + options.windowMs
        };
        rateLimitStore.set(key, entry);
        
        logger.debug(`Rate limit: New window for ${key}`, {
            count: entry.count,
            maxRequests: options.maxRequests,
            resetTime: new Date(entry.resetTime).toISOString()
        });
        
        return true; // First request in window is always allowed
    }
    
    // Check if limit exceeded
    if (entry.count >= options.maxRequests) {
        const remainingMs = entry.resetTime - now;
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        
        logger.info(`Rate limit exceeded for ${key}`, {
            count: entry.count,
            maxRequests: options.maxRequests,
            remainingSeconds
        });
        
        return false;
    }
    
    // Increment counter and allow request
    entry.count++;
    
    logger.debug(`Rate limit: Incrementing counter for ${key}`, {
        count: entry.count,
        maxRequests: options.maxRequests,
        resetTime: new Date(entry.resetTime).toISOString()
    });
    
    return true;
}

/**
 * Get remaining time until rate limit resets
 * @param userId User or channel ID
 * @param identifier Rate limit identifier
 * @returns Remaining seconds until reset, or 0 if not rate limited
 */
export function getRemainingTime(userId: string, identifier: string): number {
    const key = `${identifier}:${userId}`;
    const entry = rateLimitStore.get(key);
    
    if (!entry) {
        return 0;
    }
    
    const now = Date.now();
    if (now > entry.resetTime) {
        return 0;
    }
    
    return Math.ceil((entry.resetTime - now) / 1000);
}

/**
 * Clear expired entries from the rate limit store (cleanup)
 * This should be called periodically to prevent memory leaks
 */
export function cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of rateLimitStore.entries()) {
        if (now > entry.resetTime) {
            rateLimitStore.delete(key);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        logger.debug(`Cleaned up ${cleaned} expired rate limit entries`);
    }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

// Default rate limit configurations for different features
export const RATE_LIMITS = {
    // Karma: 10 operations per minute per user
    karma: {
        maxRequests: 10,
        windowMs: 60 * 1000,
        identifier: 'karma'
    },
    // Factoids: 5 queries per 30 seconds per user
    factoids: {
        maxRequests: 5,
        windowMs: 30 * 1000,
        identifier: 'factoids'
    },
    // Add-prompt: 3 submissions per minute per user
    addPrompt: {
        maxRequests: 3,
        windowMs: 60 * 1000,
        identifier: 'add-prompt'
    },
    // General command: 20 commands per minute per user
    general: {
        maxRequests: 20,
        windowMs: 60 * 1000,
        identifier: 'general'
    }
};

/**
 * Helper function to create a rate limit response message
 * @param remainingSeconds Seconds until rate limit resets
 * @returns User-friendly rate limit message
 */
export function getRateLimitMessage(remainingSeconds: number): string {
    if (remainingSeconds <= 0) {
        return 'Please try again.';
    }
    
    if (remainingSeconds === 1) {
        return `⏱️ Rate limit exceeded. Please wait 1 second before trying again.`;
    }
    
    if (remainingSeconds < 60) {
        return `⏱️ Rate limit exceeded. Please wait ${remainingSeconds} seconds before trying again.`;
    }
    
    const minutes = Math.ceil(remainingSeconds / 60);
    return `⏱️ Rate limit exceeded. Please wait ${minutes} minute${minutes === 1 ? '' : 's'} before trying again.`;
}