// src/middleware/rateLimit.js
// In-memory rate limiter for auth endpoints
import { NextResponse } from 'next/server';

const rateLimitStore = new Map();

const CLEANUP_INTERVAL = 60 * 1000; // Clean up every 60 seconds

// Periodic cleanup to prevent memory leaks
let cleanupTimer = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
      if (now - entry.resetTime > 0) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
  // Allow the process to exit even if the timer is still running
  if (cleanupTimer.unref) cleanupTimer.unref();
}

/**
 * Rate limit check for API routes.
 * @param {Request} request - The incoming request
 * @param {object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60000)
 * @param {number} options.max - Max requests per window (default: 10)
 * @param {string} options.keyPrefix - Prefix for the rate limit key (default: 'rl')
 * @returns {{ limited: boolean, remaining: number, retryAfterMs: number }}
 */
export function checkRateLimit(request, { windowMs = 60 * 1000, max = 10, keyPrefix = 'rl' } = {}) {
  ensureCleanup();

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';

  const key = `${keyPrefix}:${ip}`;
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + windowMs };
    rateLimitStore.set(key, entry);
  }

  entry.count++;

  if (entry.count > max) {
    const retryAfterMs = entry.resetTime - now;
    return { limited: true, remaining: 0, retryAfterMs };
  }

  return { limited: false, remaining: max - entry.count, retryAfterMs: 0 };
}

/**
 * Pre-configured rate limits for common auth endpoints.
 */
export const AUTH_RATE_LIMITS = {
  login: { windowMs: 15 * 60 * 1000, max: 10, keyPrefix: 'auth:login' },
  forgotPassword: { windowMs: 15 * 60 * 1000, max: 5, keyPrefix: 'auth:forgot' },
  verifyOtp: { windowMs: 15 * 60 * 1000, max: 10, keyPrefix: 'auth:otp' },
  resetPassword: { windowMs: 15 * 60 * 1000, max: 5, keyPrefix: 'auth:reset' },
};

/**
 * Returns a 429 NextResponse if rate limited.
 * Usage in route handlers:
 *   const rateLimitResponse = applyRateLimit(request, AUTH_RATE_LIMITS.login);
 *   if (rateLimitResponse) return rateLimitResponse;
 */
export function applyRateLimit(request, options) {
  const { limited, retryAfterMs } = checkRateLimit(request, options);

  if (limited) {
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
    return NextResponse.json(
      { success: false, message: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds) },
      }
    );
  }

  return null;
}
