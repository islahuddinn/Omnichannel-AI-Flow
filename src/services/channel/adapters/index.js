// src/services/channel/adapters/index.js
/**
 * Channel Adapters Registry & Factory
 *
 * Adapter instances are cached by a key derived from channel type + credentials hash.
 * This ensures the same SMTP connection pool (EmailAdapter) or API client (WhatsAppAdapter)
 * is reused across messages to the same channel account, eliminating per-message connection overhead.
 */

import { WhatsAppAdapter } from './WhatsAppAdapter.js';
import { SMSAdapter } from './SMSAdapter.js';
import { EmailAdapter } from './EmailAdapter.js';
import { FacebookAdapter } from './FacebookAdapter.js';
import { InstagramAdapter } from './InstagramAdapter.js';
import { WebChatAdapter } from './WebChatAdapter.js';
import crypto from 'crypto';

// Adapter registry
export const ADAPTER_REGISTRY = {
  whatsapp: WhatsAppAdapter,
  sms: SMSAdapter,
  email: EmailAdapter,
  facebook: FacebookAdapter,
  instagram: InstagramAdapter,
  webchat: WebChatAdapter,
};

// Adapter instance cache — keyed by channelType + credentials hash
const _adapterCache = new Map();
const ADAPTER_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCredentialsHash(credentials) {
  // Create a stable hash from the credentials object to use as cache key
  const key = JSON.stringify(credentials, Object.keys(credentials).sort());
  return crypto.createHash('md5').update(key).digest('hex').substring(0, 12);
}

/**
 * Get adapter instance by channel type.
 * Cached: same credentials return the same adapter (reuses SMTP pool, API clients, etc.)
 */
export function getAdapter(channelType, credentials, options = {}) {
  const AdapterClass = ADAPTER_REGISTRY[channelType];

  if (!AdapterClass) {
    throw new Error(`Unsupported channel type: ${channelType}`);
  }

  // Build cache key from channel type + credentials hash
  const credHash = getCredentialsHash(credentials);
  const cacheKey = `${channelType}:${credHash}`;

  const cached = _adapterCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ADAPTER_CACHE_TTL) {
    return cached.adapter;
  }

  // Create new adapter and cache it
  const adapter = new AdapterClass(credentials, options);
  _adapterCache.set(cacheKey, { adapter, ts: Date.now() });

  return adapter;
}

/**
 * Get supported channel types
 */
export function getSupportedChannels() {
  return Object.keys(ADAPTER_REGISTRY);
}

/**
 * Check if channel type is supported
 */
export function isChannelSupported(channelType) {
  return channelType in ADAPTER_REGISTRY;
}

/**
 * Get adapter capabilities
 */
export function getAdapterCapabilities(channelType) {
  const capabilities = {
    whatsapp: {
      name: 'WhatsApp Business',
      provider: 'Meta',
      supportsMedia: true,
      supportsTemplates: true,
      requires24HourWindow: true,
      webhookRequired: true,
      maxMessageLength: 4096,
      supportedMedia: ['image', 'video', 'audio', 'document'],
    },
    sms: {
      name: 'SMS',
      provider: 'Twilio / EuroSMS',
      supportsMedia: true,
      supportsTemplates: false,
      requires24HourWindow: false,
      webhookRequired: true,
      maxMessageLength: 1600,
      supportedMedia: ['image', 'video', 'audio'],
    },
    email: {
      name: 'Email',
      provider: 'SMTP',
      supportsMedia: true,
      supportsTemplates: true,
      requires24HourWindow: false,
      webhookRequired: false,
      maxMessageLength: null,
      supportedMedia: ['image', 'video', 'audio', 'document'],
    },
    facebook: {
      name: 'Facebook Messenger',
      provider: 'Meta',
      supportsMedia: true,
      supportsTemplates: true,
      requires24HourWindow: true,
      webhookRequired: true,
      maxMessageLength: 2000,
      supportedMedia: ['image', 'video', 'audio', 'file'],
    },
    instagram: {
      name: 'Instagram Direct',
      provider: 'Meta',
      supportsMedia: true,
      supportsTemplates: false,
      requires24HourWindow: true,
      webhookRequired: true,
      maxMessageLength: 2000,
      supportedMedia: ['image', 'video', 'audio'],
    },
    webchat: {
      name: 'WebChat',
      provider: 'OmniConnect',
      supportsMedia: true,
      supportsTemplates: false,
      requires24HourWindow: false,
      webhookRequired: false,
      maxMessageLength: 5000,
      supportedMedia: ['image', 'video', 'audio', 'file'],
    },
  };

  return capabilities[channelType] || null;
}

/**
 * Validate credentials for a channel
 */
export function validateCredentials(channelType, credentials) {
  try {
    getAdapter(channelType, credentials);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Test channel connection
 */
export async function testConnection(channelType, credentials) {
  try {
    const adapter = getAdapter(channelType, credentials);

    switch (channelType) {
      case 'email':
        return await adapter.verifyConnection();
      case 'whatsapp':
        const testData = {
          to: credentials.testPhoneNumber || '1234567890',
          content: { type: 'text', text: 'Connection test' }
        };
        await adapter.sendMessage(testData);
        return true;
      default:
        return true;
    }
  } catch (error) {
    throw new Error(`Connection test failed: ${error.message}`);
  }
}

export {
  WhatsAppAdapter,
  SMSAdapter,
  EmailAdapter,
  FacebookAdapter,
  InstagramAdapter,
  WebChatAdapter,
};
