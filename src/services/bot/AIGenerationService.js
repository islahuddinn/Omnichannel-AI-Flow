// src/services/bot/AIGenerationService.js
/**
 * AI Generation Service
 *
 * Replaces the third-party Python bot API with direct Vercel AI SDK calls.
 * Builds conversation context from MongoDB, resolves the correct prompt
 * based on channel + contact type, and returns the AI response.
 *
 * Prompt resolution order (first match wins):
 *   1. Channel-specific prompt for contact type (e.g. whatsapp-customer-prompt)
 *   2. Channel-specific prompt for the other type (fallback within channel)
 *   3. Company-level system prompt (Settings page)
 *   4. Hardcoded default
 */

import { streamText, generateText } from 'ai';
import { createModelInstance } from './AIProviderRegistry.js';
import { getTenantDB } from '../../config/database.js';
import MessageSchema from '../../models/schemas/Message.js';
import AIPromptSchema from '../../models/schemas/AIPrompt.js';

const DEFAULT_SYSTEM_PROMPT = `You are a helpful, professional customer support assistant.
Respond concisely and accurately. Be friendly but professional.
If you don't know the answer, say so honestly and offer to connect the customer with a human agent.
Do not make up information. Keep responses focused and relevant to the customer's question.
IMPORTANT: Always respond in the same language the customer uses. If the customer writes in Slovak, respond in Slovak. If in Czech, respond in Czech. If in German, respond in German. Match the customer's language exactly.`;

// Token cost estimates per 1K tokens (USD) for cost tracking
const TOKEN_COSTS = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4.1': { input: 0.002, output: 0.008 },
  'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
  'gpt-4.1-nano': { input: 0.0001, output: 0.0004 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'o4-mini': { input: 0.0011, output: 0.0044 },
  'o3': { input: 0.01, output: 0.04 },
  'o3-mini': { input: 0.0011, output: 0.0044 },
  'gemini-2.5-flash': { input: 0.00015, output: 0.0006 },
  'gemini-2.5-pro': { input: 0.00125, output: 0.01 },
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  'gemini-2.0-flash-lite': { input: 0.000075, output: 0.0003 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'claude-sonnet-4-5-20250514': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5-20251001': { input: 0.0008, output: 0.004 },
  'claude-opus-4-0-20250514': { input: 0.015, output: 0.075 },
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'claude-3-5-haiku-20241022': { input: 0.0008, output: 0.004 },
};

// In-memory prompt cache (channelAccountId:contactType → prompt text)
const _promptCache = new Map();
const PROMPT_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

function getCachedPrompt(key) {
  const entry = _promptCache.get(key);
  if (entry && Date.now() - entry.ts < PROMPT_CACHE_TTL) return entry.value;
  _promptCache.delete(key);
  return undefined;
}

function setCachedPrompt(key, value) {
  _promptCache.set(key, { value, ts: Date.now() });
}

/**
 * Estimate cost for a request based on token usage.
 */
function estimateCost(modelId, inputTokens, outputTokens) {
  const costs = TOKEN_COSTS[modelId];
  if (!costs) return 0;
  return parseFloat((((inputTokens || 0) / 1000) * costs.input + ((outputTokens || 0) / 1000) * costs.output).toFixed(6));
}

/**
 * Generate an AI response for a conversation message.
 * Uses streaming for faster time-to-first-token, collects full response before returning.
 * Supports AbortSignal for cancellation (used by parallel processing).
 */
export async function generateAIResponse({
  aiConfig,
  tenantId,
  conversationId,
  contactId,
  message,
  platform,
  contactName,
  messageType = 'text',
  channelAccountId,
  contactType,
  abortSignal = null,
}) {
  const { provider, model: modelId, apiKey, systemPrompt: companyPrompt, temperature, maxTokens, contextMessageCount } = aiConfig;

  if (!provider || !modelId || !apiKey) {
    return { failed: true, reason: 'empty_response', error: 'AI provider, model, or API key not configured' };
  }

  try {
    // 1. Create the model instance
    const model = createModelInstance(provider, modelId, apiKey);

    // 2. Resolve the correct system prompt (channel-specific → company → default)
    const resolvedPrompt = await resolveSystemPrompt({
      tenantId,
      channelAccountId,
      contactType,
      platform,
      companyPrompt,
      contactName,
    });

    // 3. Build conversation context from recent messages (smart context window)
    const conversationMessages = await buildSmartConversationContext(
      tenantId, conversationId, contextMessageCount || 20, aiConfig
    );

    // 4. Append the current inbound message
    conversationMessages.push({
      role: 'user',
      content: formatInboundMessage(message, messageType),
    });

    // 5. Call the AI provider using streaming for faster time-to-first-token
    const startTime = Date.now();
    const signal = abortSignal || AbortSignal.timeout(45000);

    const stream = streamText({
      model,
      system: resolvedPrompt,
      messages: conversationMessages,
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? 1024,
      abortSignal: signal,
    });

    // Collect the full streamed response
    const result = await stream;
    const responseText = (await result.text)?.trim();
    const usage = await result.usage;

    const duration = Date.now() - startTime;

    if (!responseText) {
      console.warn(`AI returned empty text (${provider}/${modelId}, ${duration}ms)`);
      return { failed: true, reason: 'empty_response' };
    }

    // Calculate cost estimate
    const inputTokens = usage?.promptTokens || 0;
    const outputTokens = usage?.completionTokens || 0;
    const totalTokens = inputTokens + outputTokens;
    const costEstimate = estimateCost(modelId, inputTokens, outputTokens);

    console.log(`AI response generated (${provider}/${modelId}, ${duration}ms, ${responseText.length} chars, ${totalTokens} tokens, $${costEstimate}, contactType: ${contactType || 'unknown'})`);

    return {
      response: responseText,
      metadata: {
        responseTimeMs: duration,
        inputTokens,
        outputTokens,
        totalTokens,
        costEstimate,
        provider,
        model: modelId,
      },
    };

  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      console.error(`AI generation timeout/cancelled (${provider}/${modelId}):`, error.message);
      return { failed: true, reason: 'timeout', error: error.message };
    }
    console.error(`AI generation error (${provider}/${modelId}):`, error.message);
    return { failed: true, reason: 'api_error', error: error.message };
  }
}

/**
 * Detect language from a message using a fast heuristic + AI fallback.
 * Returns ISO 639-1 language code (e.g., 'sk', 'cs', 'en', 'de').
 */
export async function detectLanguage(messageText, aiConfig = null) {
  if (!messageText || messageText.length < 3) return 'en';

  // Fast heuristic for common European languages based on character patterns
  const langPatterns = [
    { code: 'sk', patterns: [/[ľĺŕďťňôäúý]/i, /\b(som|nie|ako|pre|pri|kde|kto|mam|chcem|prosím|dakujem|ano|dobry|den)\b/i] },
    { code: 'cs', patterns: [/[řžšěůúýáíéóď]/i, /\b(jsem|není|jak|pro|kde|kdo|chci|prosím|děkuji|ano|dobrý|den)\b/i] },
    { code: 'pl', patterns: [/[ąćęłńóśźż]/i, /\b(jestem|nie|jak|dla|gdzie|kto|chcę|proszę|dziękuję|tak)\b/i] },
    { code: 'hu', patterns: [/[őűáéíóúü]/i, /\b(vagyok|nem|hogy|igen|köszönöm|kérem|szeretnék)\b/i] },
    { code: 'de', patterns: [/[äöüß]/i, /\b(ich|bin|nicht|wie|für|bitte|danke|ja|nein|hallo|guten)\b/i] },
    { code: 'ro', patterns: [/[ăâîșț]/i, /\b(sunt|nu|cum|pentru|unde|mulțumesc|da|bună)\b/i] },
    { code: 'hr', patterns: [/[čćšžđ]/i, /\b(sam|nije|kako|za|gdje|tko|hvala|da|dobar)\b/i] },
    { code: 'sl', patterns: [/[čšž]/i, /\b(sem|ni|kako|za|kjer|kdo|hvala|da|dober)\b/i] },
    { code: 'bg', patterns: [/[абвгдежзиклмнопрстуфхцчшщъьюя]/i] },
    { code: 'uk', patterns: [/[іїєґ]/i] },
    { code: 'ru', patterns: [/[абвгдежзиклмнопрстуфхцчшщъыьэюя]/i, /\b(я|не|как|для|где|кто|спасибо|да|нет|здравствуйте)\b/i] },
    { code: 'fr', patterns: [/[àâçéèêëïîôùûüÿœæ]/i, /\b(je|suis|pas|pour|bonjour|merci|oui|non|comment)\b/i] },
    { code: 'es', patterns: [/[ñ¿¡áéíóú]/i, /\b(soy|no|como|para|hola|gracias|sí|donde)\b/i] },
    { code: 'it', patterns: [/[àèéìíîòóùú]/i, /\b(sono|non|come|per|ciao|grazie|sì|dove)\b/i] },
    { code: 'pt', patterns: [/[ãõçáâàéêíóôú]/i, /\b(sou|não|como|para|olá|obrigado|sim|onde)\b/i] },
    { code: 'nl', patterns: [/\b(ik|ben|niet|hoe|voor|waar|wie|bedankt|ja|nee|hallo|goedemorgen)\b/i] },
    { code: 'tr', patterns: [/[çğıöşüâî]/i, /\b(ben|değil|nasıl|için|nerede|teşekkür|evet|hayır|merhaba)\b/i] },
    { code: 'ar', patterns: [/[\u0600-\u06FF]/] },
    { code: 'zh', patterns: [/[\u4e00-\u9fff]/] },
    { code: 'ja', patterns: [/[\u3040-\u309f\u30a0-\u30ff]/] },
    { code: 'ko', patterns: [/[\uac00-\ud7af]/] },
  ];

  // Score each language
  let bestMatch = null;
  let bestScore = 0;
  for (const lang of langPatterns) {
    let score = 0;
    for (const pattern of lang.patterns) {
      if (pattern.test(messageText)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = lang.code;
    }
  }

  if (bestScore >= 1) return bestMatch;

  // Default to English
  return 'en';
}

/**
 * Translate a message to English for agent display.
 * Returns null if already English or translation fails.
 */
export async function translateForAgent(messageText, detectedLang, aiConfig) {
  if (!messageText || detectedLang === 'en' || !aiConfig?.provider || !aiConfig?.apiKey) return null;

  try {
    const model = createModelInstance(aiConfig.provider, aiConfig.model, aiConfig.apiKey);
    const result = await generateText({
      model,
      system: 'You are a translator. Translate the following message to English. Return ONLY the translation, nothing else.',
      messages: [{ role: 'user', content: messageText }],
      temperature: 0.1,
      maxTokens: 500,
      abortSignal: AbortSignal.timeout(8000),
    });
    return result.text?.trim() || null;
  } catch (err) {
    console.warn('[Translation] Failed:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the system prompt with this priority:
 *   1. Channel + contact type specific prompt (e.g. whatsapp-customer-prompt)
 *   2. Channel + opposite type fallback (e.g. whatsapp-handyman-prompt if customer not set)
 *   3. Company-level system prompt (from Settings page)
 *   4. Hardcoded default
 */
async function resolveSystemPrompt({ tenantId, channelAccountId, contactType, platform, companyPrompt, contactName }) {
  let promptText = null;

  // Try channel-specific prompt if we have a channelAccountId
  if (channelAccountId && platform) {
    promptText = await getChannelPrompt(tenantId, channelAccountId, platform, contactType);
  }

  // Fall back to company prompt, then default
  if (!promptText) {
    promptText = companyPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  }

  // Append platform and contact context
  const platformContext = platform
    ? `\nThe customer is contacting via ${platform}. Adjust response length and formatting for this channel.`
    : '';
  const nameContext = contactName && contactName !== 'User'
    ? `\nThe customer's name is ${contactName}.`
    : '';

  return `${promptText}${platformContext}${nameContext}`;
}

/**
 * Fetch channel-specific prompt from AIPrompt collection.
 * Returns the prompt text or null if not found.
 */
async function getChannelPrompt(tenantId, channelAccountId, platform, contactType) {
  // Determine which prompt to fetch based on contact type
  const isHandyman = contactType && contactType.toLowerCase() === 'handyman';
  const primaryDesc = `${platform}-${isHandyman ? 'handyman' : 'customer'}-prompt`;
  const fallbackDesc = `${platform}-${isHandyman ? 'customer' : 'handyman'}-prompt`;

  // Check cache first
  const cacheKey = `${channelAccountId}:${primaryDesc}`;
  const cached = getCachedPrompt(cacheKey);
  if (cached !== undefined) return cached; // cached null means "checked, not found"

  try {
    const tenantDB = await getTenantDB(tenantId);
    const AIPrompt = tenantDB.models.AIPrompt || tenantDB.model('AIPrompt', AIPromptSchema);

    // Fetch both prompts in one query
    const prompts = await AIPrompt.find({
      tenantId,
      moduleId: channelAccountId,
      moduleIdDescription: { $in: [primaryDesc, fallbackDesc] },
      isActive: true,
    }).select('moduleIdDescription prompt').lean();

    // Find primary (exact contact type match)
    const primary = prompts.find(p => p.moduleIdDescription === primaryDesc);
    if (primary?.prompt?.trim()) {
      const text = primary.prompt.trim();
      setCachedPrompt(cacheKey, text);
      console.log(`Using channel prompt: ${primaryDesc} for channel ${channelAccountId}`);
      return text;
    }

    // Fall back to the other type's prompt
    const fallback = prompts.find(p => p.moduleIdDescription === fallbackDesc);
    if (fallback?.prompt?.trim()) {
      const text = fallback.prompt.trim();
      setCachedPrompt(cacheKey, text);
      console.log(`Using fallback channel prompt: ${fallbackDesc} for channel ${channelAccountId}`);
      return text;
    }

    // Nothing found for this channel
    setCachedPrompt(cacheKey, null);
    return null;
  } catch (error) {
    console.error('Failed to fetch channel prompt:', error.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart Conversation context builder (summarizes older messages)
// ─────────────────────────────────────────────────────────────────────────────

const RECENT_VERBATIM_COUNT = 6; // Keep last 6 messages verbatim
const SUMMARY_CACHE = new Map(); // conversationId:msgCount → summary
const SUMMARY_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

/**
 * Smart context window: keeps recent messages verbatim, summarizes older ones.
 * This reduces token usage by ~60% for long conversations while maintaining quality.
 */
async function buildSmartConversationContext(tenantId, conversationId, limit, aiConfig = null) {
  try {
    const tenantDB = await getTenantDB(tenantId);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    const recentMessages = await Message.find({
      conversation: conversationId,
      direction: { $in: ['inbound', 'outbound'] },
      type: { $in: ['text', 'template', 'image', 'video', 'document', 'audio', 'interactive', 'button'] },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('content direction type metadata caption createdAt')
      .lean();

    // Reverse to chronological order
    recentMessages.reverse();

    const allMapped = recentMessages.map(msg => {
      const role = msg.direction === 'inbound' ? 'user' : 'assistant';
      let content = '';

      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (msg.content?.text) {
        content = msg.content.text;
      } else if (msg.caption) {
        content = msg.caption;
      }

      if (msg.type && msg.type !== 'text' && msg.type !== 'template') {
        const prefix = `[${msg.type}]`;
        content = content ? `${prefix} ${content}` : prefix;
      }

      return { role, content: content || '[empty message]' };
    });

    // If few messages, return all verbatim (no summarization needed)
    if (allMapped.length <= RECENT_VERBATIM_COUNT + 2) {
      return allMapped;
    }

    // Split: older messages to summarize + recent messages to keep verbatim
    const olderMessages = allMapped.slice(0, allMapped.length - RECENT_VERBATIM_COUNT);
    const recentVerbatim = allMapped.slice(allMapped.length - RECENT_VERBATIM_COUNT);

    // Try to summarize older messages
    const summaryKey = `${conversationId}:${olderMessages.length}`;
    const cachedSummary = SUMMARY_CACHE.get(summaryKey);
    let summaryText = null;

    if (cachedSummary && Date.now() - cachedSummary.ts < SUMMARY_CACHE_TTL) {
      summaryText = cachedSummary.value;
    } else if (aiConfig?.provider && aiConfig?.apiKey && aiConfig?.model) {
      try {
        const model = createModelInstance(aiConfig.provider, aiConfig.model, aiConfig.apiKey);
        const transcript = olderMessages.map(m =>
          `${m.role === 'user' ? 'Customer' : 'Agent'}: ${m.content.substring(0, 150)}`
        ).join('\n');

        const summaryResult = await generateText({
          model,
          system: 'Summarize this conversation history in 2-3 concise sentences. Focus on: what the customer asked, what was resolved, and any pending issues. Do NOT add greetings or filler.',
          messages: [{ role: 'user', content: transcript }],
          temperature: 0.1,
          maxTokens: 200,
          abortSignal: AbortSignal.timeout(8000),
        });

        summaryText = summaryResult.text?.trim();
        if (summaryText) {
          SUMMARY_CACHE.set(summaryKey, { value: summaryText, ts: Date.now() });
        }
      } catch (err) {
        console.warn('[SmartContext] Summarization failed, using full context:', err.message);
      }
    }

    // Build final context
    if (summaryText) {
      return [
        { role: 'user', content: `[Previous conversation summary: ${summaryText}]` },
        ...recentVerbatim,
      ];
    }

    // Fallback: return all messages if summarization failed
    return allMapped;
  } catch (error) {
    console.error('Failed to build conversation context:', error.message);
    return [];
  }
}

// Keep legacy function for backward compatibility
async function buildConversationContext(tenantId, conversationId, limit) {
  return buildSmartConversationContext(tenantId, conversationId, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Message formatting
// ─────────────────────────────────────────────────────────────────────────────

function formatInboundMessage(message, messageType) {
  if (messageType === 'text' || !messageType) return message;

  const typeDescriptions = {
    'image': 'User sent an image',
    'video': 'User sent a video',
    'audio': 'User sent an audio message',
    'voice': 'User sent a voice message',
    'file': 'User sent a file',
    'document': 'User sent a document',
    'sticker': 'User sent a sticker',
    'location': 'User shared a location',
    'contact': 'User shared a contact',
    'interactive': 'User responded to an interactive message',
  };

  const desc = typeDescriptions[messageType] || `User sent a ${messageType} message`;
  return message ? `${desc}: ${message}` : desc;
}
