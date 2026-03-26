// src/lib/auth/webchatSecret.js
import crypto from 'crypto';

/**
 * Get the webchat JWT secret.
 * Uses WEBCHAT_SECRET if set, otherwise derives one from JWT_SECRET
 * using HMAC-SHA256 so no new env variable is needed.
 */
let cached = null;

export function getWebChatSecret() {
  if (cached) return cached;

  if (process.env.WEBCHAT_SECRET) {
    cached = process.env.WEBCHAT_SECRET;
    return cached;
  }

  const base = process.env.JWT_SECRET;
  if (!base) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  cached = crypto.createHmac('sha256', base).update('webchat-token-secret').digest('hex');
  return cached;
}
