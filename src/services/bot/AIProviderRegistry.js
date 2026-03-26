// src/services/bot/AIProviderRegistry.js
/**
 * AI Provider Registry
 *
 * Dynamically creates Vercel AI SDK model instances based on provider/model configuration
 * stored in the database. Supports OpenAI, Google (Gemini), and Anthropic.
 *
 * Adding a new provider requires:
 * 1. Install the @ai-sdk/<provider> package
 * 2. Add a case to createModelInstance()
 * 3. Add the provider to SUPPORTED_PROVIDERS
 *
 * No other code changes needed — settings UI auto-populates from SUPPORTED_PROVIDERS.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';

/**
 * Registry of supported AI providers and their available models.
 * The settings UI reads this to populate dropdowns dynamically.
 */
export const SUPPORTED_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable, multimodal' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and affordable' },
      { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Latest flagship model' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: 'Fast, affordable flagship' },
      { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', description: 'Fastest, most affordable' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'High intelligence, vision' },
      { id: 'o4-mini', name: 'o4-mini', description: 'Reasoning model, affordable' },
      { id: 'o3', name: 'o3', description: 'Powerful reasoning' },
      { id: 'o3-mini', name: 'o3 Mini', description: 'Fast reasoning' },
    ],
    requiresApiKey: true,
    apiKeyPlaceholder: 'sk-...',
  },
  google: {
    name: 'Google (Gemini)',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Adaptive thinking, fast' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Enhanced thinking, best quality' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Next gen features, speed' },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', description: 'Cost efficient' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Complex tasks' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast, versatile' },
    ],
    requiresApiKey: true,
    apiKeyPlaceholder: 'AIza...',
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    models: [
      { id: 'claude-sonnet-4-5-20250514', name: 'Claude Sonnet 4.5', description: 'Best balance of speed & intelligence' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: 'Fastest, most affordable' },
      { id: 'claude-opus-4-0-20250514', name: 'Claude Opus 4', description: 'Most capable' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Excellent quality, fast' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fast, affordable' },
    ],
    requiresApiKey: true,
    apiKeyPlaceholder: 'sk-ant-...',
  },
};

/**
 * Create a Vercel AI SDK model instance from dynamic configuration.
 *
 * @param {string} provider - Provider key (e.g. 'openai', 'google', 'anthropic')
 * @param {string} modelId - Model ID (e.g. 'gpt-4o-mini', 'gemini-2.0-flash')
 * @param {string} apiKey - The provider API key
 * @returns {Object} Vercel AI SDK model instance ready for generateText/streamText
 */
export function createModelInstance(provider, modelId, apiKey) {
  if (!provider || !modelId || !apiKey) {
    throw new Error('Provider, model, and API key are required');
  }

  switch (provider) {
    case 'openai': {
      const openai = createOpenAI({ apiKey });
      return openai(modelId);
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(modelId);
    }
    default:
      throw new Error(`Unsupported AI provider: "${provider}". Supported: ${Object.keys(SUPPORTED_PROVIDERS).join(', ')}`);
  }
}

/**
 * Validate that a provider + model combination is supported.
 */
export function validateProviderModel(provider, modelId) {
  const providerConfig = SUPPORTED_PROVIDERS[provider];
  if (!providerConfig) {
    return { valid: false, error: `Unknown provider: "${provider}"` };
  }
  const model = providerConfig.models.find(m => m.id === modelId);
  if (!model) {
    return { valid: false, error: `Unknown model "${modelId}" for provider "${provider}"` };
  }
  return { valid: true };
}
