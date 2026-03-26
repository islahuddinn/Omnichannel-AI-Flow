// src/config/bot.js
/**
 * Bot Configuration
 *
 * Default timeouts, retry settings, and legacy provider config.
 * The primary AI integration now uses the Vercel AI SDK configured
 * dynamically per company via Settings → AI Bot.
 *
 * The legacy "fastapi" provider is kept as a fallback for companies
 * that haven't migrated to direct AI integration yet.
 */

export const BOT_CONFIG = {
  // Default bot settings (shared by both direct AI and legacy)
  default: {
    enabled: true,
    timeout: 45000, // 45 seconds (generous for AI API calls)
    retries: 1,
    retryDelay: 1000, // 1 second
  },

  // Legacy bot provider (third-party Python API — kept for backward compatibility)
  providers: {
    fastapi: {
      enabled: process.env.AI_BOT_ENABLED !== 'false',
      baseUrl: process.env.AI_BOT_BASE_URL || 'http://localhost:8000',
      endpoint: '/api/v1/chat/generate',
      timeout: 30000,
      retries: 1,
      retryDelay: 1000,
      platformMapping: {
        whatsapp: 'whatsapp',
        sms: 'whatsapp',
        email: 'email',
        webchat: 'webchat',
        facebook: 'facebook',
        instagram: 'instagram',
      },
    },
  },

  getActiveProvider: () => {
    return BOT_CONFIG.providers.fastapi;
  },
};

export default BOT_CONFIG;
