// src/services/bot/HumanHandoffService.js
/**
 * Human Handoff Detection Service
 *
 * Detects when a customer wants to talk to a human agent and switches
 * the conversation from auto mode to manual mode in real-time.
 *
 * Uses a two-tier approach:
 *   1. Fast keyword check (~0ms) — catches obvious phrases instantly
 *   2. AI intent detection (~300ms) — catches nuanced/multilingual requests
 *
 * Supports all languages — the AI understands intent regardless of language.
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import SocketEmitter from '../socket/SocketEmitter.js';

// Fast keyword patterns (checked first — no AI call needed for obvious cases)
const HANDOFF_PATTERNS = [
  /\b(talk|speak|connect|transfer)\b.*(human|agent|person|operator|representative|rep|someone|real person|live)/i,
  /\b(human|live|real)\b.*(agent|person|chat|support|operator|help)/i,
  /\b(want|need|get)\b.*(human|agent|person|operator|representative)/i,
  /\bnot a bot\b/i,
  /\bstop bot\b/i,
  /\bno bot\b/i,
  /\breal person\b/i,
  /\blive agent\b/i,
  /\bhuman (please|plz|pls)\b/i,
  /\bagent (please|plz|pls)\b/i,
  /\boperator\b/i,
];

const handoffSchema = z.object({
  wantsHuman: z.boolean().describe('True if the customer wants to talk to a human agent instead of the AI bot.'),
});

/**
 * Check if the customer wants to talk to a human.
 *
 * @param {string} messageText — The customer's message
 * @param {Object} [aiConfig] — AI provider config (optional, for AI-based detection)
 * @returns {Promise<boolean>} — true if handoff requested
 */
export async function detectHumanHandoff(messageText, aiConfig = null) {
  if (!messageText || typeof messageText !== 'string') return false;
  const text = messageText.trim();
  if (text.length < 3) return false;

  // Tier 1: Fast keyword check
  for (const pattern of HANDOFF_PATTERNS) {
    if (pattern.test(text)) {
      console.log(`[Handoff] Keyword match detected: "${text.substring(0, 60)}"`);
      return true;
    }
  }

  // Tier 2: AI intent detection (only if AI is configured and message is long enough)
  if (aiConfig?.provider && aiConfig?.model && aiConfig?.apiKey && text.length >= 5) {
    try {
      const { createModelInstance } = await import('./AIProviderRegistry.js');
      const model = createModelInstance(aiConfig.provider, aiConfig.model, aiConfig.apiKey);

      const { object } = await generateObject({
        model,
        schema: handoffSchema,
        prompt: `Does this customer message indicate they want to stop talking to the AI bot and instead talk to a human agent, operator, or real person?\n\nMessage: "${text.substring(0, 300)}"`,
        temperature: 0,
        maxTokens: 50,
        abortSignal: AbortSignal.timeout(5000), // 5 second max
      });

      if (object.wantsHuman) {
        console.log(`[Handoff] AI detected human handoff intent: "${text.substring(0, 60)}"`);
        return true;
      }
    } catch (err) {
      // AI detection failed — don't block message processing
      console.warn('[Handoff] AI detection failed, continuing with bot:', err.message);
    }
  }

  return false;
}

/**
 * Execute the handoff — switch conversation to manual mode and notify in real-time.
 *
 * @param {Object} params
 * @returns {Promise<{handoffMessage: string}>}
 */
export async function executeHandoff({ tenantDB, tenantId, conversationId, contactName }) {
  const ConversationSchema = (await import('../../models/schemas/Conversation.js')).default;
  const MessageSchema = (await import('../../models/schemas/Message.js')).default;
  const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
  const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

  // 1. Get conversation
  const conversation = await Conversation.findById(conversationId)
    .select('mode department contact channel unreadCount').lean();
  if (!conversation) return { handoffMessage: '' };

  // Already manual — no action needed
  if (conversation.mode === 'manual') return { handoffMessage: '' };

  // 2. Calculate unread count
  const unreadCount = await Message.countDocuments({
    conversation: conversationId,
    direction: 'inbound',
    readAt: { $exists: false },
  });

  // 3. Switch to manual mode
  const now = new Date();
  await Conversation.findByIdAndUpdate(conversationId, {
    $set: {
      mode: 'manual',
      unreadCount: Math.max(unreadCount, 1),
      updatedAt: now,
    },
  });

  const deptId = conversation.department?.toString();

  // 4. Emit real-time socket events
  await SocketEmitter.emitConversationUpdate(
    conversationId,
    { mode: 'manual', unreadCount: Math.max(unreadCount, 1) },
    tenantId,
    deptId
  );

  // Notify department agents
  if (deptId) {
    await SocketEmitter.emit(`department:${deptId}`, 'conversation:handoff', {
      conversationId: conversationId.toString(),
      contactName: contactName || 'Customer',
      reason: 'Customer requested human agent',
      timestamp: now.toISOString(),
    });
  }

  // Notify tenant admins
  await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:handoff', {
    conversationId: conversationId.toString(),
    contactName: contactName || 'Customer',
    reason: 'Customer requested human agent',
    timestamp: now.toISOString(),
  });

  console.log(`[Handoff] Conversation ${conversationId} switched to manual mode`);

  // 5. Generate conversation summary + sentiment analysis (async, non-blocking)
  const handoffReason = contactName ? 'human_request' : 'media';
  import('./ConversationIntelligenceService.js').then(({ analyzeConversation }) => {
    analyzeConversation({ tenantDB, tenantId, conversationId, handoffReason }).catch(err => {
      console.error('[Handoff] Intelligence analysis failed:', err.message);
    });
  }).catch(() => {});

  // 6. Return handoff message for the bot to send
  const name = contactName && contactName !== 'User' ? contactName : '';
  const greeting = name ? `${name}, ` : '';
  return {
    handoffMessage: `${greeting}I understand you'd like to speak with a human agent. I'm connecting you now. A team member will be with you shortly. Thank you for your patience.`,
  };
}
