/**
 * Simple in-memory rate limiter.
 * SEC-06: Prevents request flooding on sensitive endpoints.
 *
 * Uses a sliding window approach: tracks timestamps per key (userId/IP),
 * and rejects requests exceeding the limit within the window.
 */

interface RateLimitEntry {
    timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Cleanup interval to prevent memory leaks (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        entry.timestamps = entry.timestamps.filter(t => now - t < 60_000);
        if (entry.timestamps.length === 0) {
            store.delete(key);
        }
    }
}, CLEANUP_INTERVAL);

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfterMs?: number;
}

/**
 * Check if a request is within the rate limit.
 * @param key - Unique identifier (userId, IP, etc.)
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds (default: 60s)
 */
export function checkRateLimit(
    key: string,
    maxRequests: number,
    windowMs = 60_000
): RateLimitResult {
    const now = Date.now();
    const entry = store.get(key) || { timestamps: [] };

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter(t => now - t < windowMs);

    if (entry.timestamps.length >= maxRequests) {
        const oldestInWindow = entry.timestamps[0];
        const retryAfterMs = windowMs - (now - oldestInWindow);
        return { allowed: false, remaining: 0, retryAfterMs };
    }

    entry.timestamps.push(now);
    store.set(key, entry);

    return {
        allowed: true,
        remaining: maxRequests - entry.timestamps.length,
    };
}
