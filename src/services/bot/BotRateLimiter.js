// src/services/bot/BotRateLimiter.js
/**
 * Bot Response Rate Limiter
 *
 * Prevents the bot from responding to every rapid-fire message from a customer.
 * If a customer sends 10 messages in 5 seconds, the bot responds ONCE to the
 * latest message (with full context), not 10 times.
 *
 * Uses in-memory tracking per conversation. No Redis needed.
 */

// Map<conversationId, { lastResponseAt: number, pendingTimeout: NodeJS.Timeout }>
const _rateLimitMap = new Map();

// Minimum gap between bot responses for the same conversation (ms)
const MIN_RESPONSE_GAP_MS = 5000; // 5 seconds

// How long to wait after the last message before responding (debounce)
const DEBOUNCE_MS = 2000; // 2 seconds

// Cleanup old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of _rateLimitMap.entries()) {
    if (now - entry.lastResponseAt > 300000) { // 5 minutes idle
      if (entry.pendingTimeout) clearTimeout(entry.pendingTimeout);
      _rateLimitMap.delete(key);
    }
  }
}, 600000);

/**
 * Check if the bot should respond to this conversation right now.
 *
 * @param {string} conversationId
 * @returns {boolean} true if bot should respond, false if rate-limited
 */
export function shouldBotRespond(conversationId) {
  const now = Date.now();
  const entry = _rateLimitMap.get(conversationId);

  if (!entry) {
    // First message — allow response
    _rateLimitMap.set(conversationId, { lastResponseAt: now, pendingTimeout: null });
    return true;
  }

  const timeSinceLastResponse = now - entry.lastResponseAt;

  if (timeSinceLastResponse < MIN_RESPONSE_GAP_MS) {
    // Too soon after last response — skip
    return false;
  }

  // Enough time has passed — allow response
  entry.lastResponseAt = now;
  return true;
}

/**
 * Record that the bot responded to this conversation.
 * Call this AFTER the bot successfully sends a response.
 */
export function recordBotResponse(conversationId) {
  const entry = _rateLimitMap.get(conversationId);
  if (entry) {
    entry.lastResponseAt = Date.now();
  } else {
    _rateLimitMap.set(conversationId, { lastResponseAt: Date.now(), pendingTimeout: null });
  }
}
