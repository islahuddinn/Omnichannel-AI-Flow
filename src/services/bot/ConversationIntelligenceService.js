// src/services/bot/ConversationIntelligenceService.js
/**
 * Conversation Intelligence Service
 *
 * Provides AI-powered analysis for conversations:
 *   1. Handoff Summary — generates a concise summary for agents when bot hands off
 *   2. Sentiment Detection — detects customer frustration and auto-escalates priority
 *
 * Called after every handoff (human request, media, bot failure) and periodically
 * for sentiment monitoring.
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import SocketEmitter from '../socket/SocketEmitter.js';

const sentimentSchema = z.object({
  sentiment: z.enum(['positive', 'neutral', 'negative', 'frustrated', 'angry']).describe('Customer sentiment'),
  priority: z.enum(['normal', 'high', 'urgent']).describe('Recommended priority based on sentiment and urgency'),
  summary: z.string().describe('2-3 sentence summary of the conversation so far for the agent taking over'),
  topics: z.array(z.string()).describe('Key topics discussed (e.g., billing, technical, complaint)'),
});

/**
 * Analyze conversation and generate summary + sentiment for handoff.
 *
 * @param {Object} params
 * @param {Object} params.tenantDB
 * @param {string} params.tenantId
 * @param {string} params.conversationId
 * @param {string} params.handoffReason - 'human_request' | 'media' | 'bot_failure'
 * @returns {Promise<{summary, sentiment, priority, topics}>}
 */
export async function analyzeConversation({
  tenantDB, tenantId, conversationId, handoffReason = 'human_request',
}) {
  try {
    const MessageSchema = (await import('../../models/schemas/Message.js')).default;
    const ConversationSchema = (await import('../../models/schemas/Conversation.js')).default;
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);

    // Fetch recent messages for analysis
    const messages = await Message.find({
      conversation: conversationId,
      direction: { $in: ['inbound', 'outbound'] },
    }).sort({ createdAt: -1 }).limit(15).select('content direction type createdAt').lean();

    if (messages.length === 0) {
      return { summary: 'No messages in conversation.', sentiment: 'neutral', priority: 'normal', topics: [] };
    }

    messages.reverse();
    const transcript = messages.map(m => {
      const role = m.direction === 'inbound' ? 'Customer' : 'Bot';
      const text = typeof m.content === 'string' ? m.content : (m.content?.text || `[${m.type}]`);
      return `${role}: ${text.substring(0, 200)}`;
    }).join('\n');

    // Get AI config
    const { BotService } = await import('./BotService.js');
    const botSettings = await BotService.getCompanyBotSettings(tenantId);

    if (!botSettings.enabled || !botSettings.provider || !botSettings.model || !botSettings.apiKey) {
      // No AI — return basic analysis
      return { summary: 'AI not configured for analysis.', sentiment: 'neutral', priority: 'normal', topics: [] };
    }

    const { createModelInstance } = await import('./AIProviderRegistry.js');
    const model = createModelInstance(botSettings.provider, botSettings.model, botSettings.apiKey);

    const reasonLabels = {
      human_request: 'The customer requested to speak with a human agent.',
      media: 'The customer sent a media file (image/video/audio) that requires human review.',
      bot_failure: 'The AI bot failed to respond and the conversation was escalated.',
      manual_switch: 'An agent manually switched the conversation to manual mode.',
      manual_summary: 'An agent requested a conversation summary.',
    };

    const { object: result } = await generateObject({
      model,
      schema: sentimentSchema,
      prompt: `Analyze this customer support conversation and provide:
1. A 2-3 sentence summary for the human agent taking over
2. The customer's sentiment (positive/neutral/negative/frustrated/angry)
3. Recommended priority (normal/high/urgent) based on urgency and sentiment
4. Key topics discussed

Handoff reason: ${reasonLabels[handoffReason] || handoffReason}

Conversation transcript:
${transcript}

Rules:
- If customer is angry or has been waiting long, set priority to 'urgent'
- If customer expressed frustration or complaint, set priority to 'high'
- Summary should help the agent understand the situation immediately
- Topics should be short labels like 'billing', 'technical issue', 'pricing inquiry'`,
      temperature: 0.1,
      maxTokens: 300,
      abortSignal: AbortSignal.timeout(10000),
    });

    // Update conversation with analysis results
    const updateData = {
      'metadata.handoffSummary': result.summary,
      'metadata.sentiment': result.sentiment,
      'metadata.topics': result.topics,
      'metadata.analyzedAt': new Date(),
    };

    // Auto-escalate priority if sentiment warrants it
    if (result.priority === 'urgent' || result.priority === 'high') {
      updateData.priority = result.priority;
    }

    await Conversation.findByIdAndUpdate(conversationId, { $set: updateData });

    // Emit real-time updates
    const conv = await Conversation.findById(conversationId).select('department').lean();
    const deptId = conv?.department?.toString();

    // Emit conversation update with priority and metadata
    await SocketEmitter.emitConversationUpdate(
      conversationId,
      {
        priority: result.priority !== 'normal' ? result.priority : undefined,
        metadata: {
          handoffSummary: result.summary,
          sentiment: result.sentiment,
          topics: result.topics,
        },
      },
      tenantId, deptId
    );

    // Emit dedicated sentiment alert for high/urgent priority
    if (result.priority === 'urgent' || result.priority === 'high') {
      const alertData = {
        conversationId: conversationId.toString(),
        sentiment: result.sentiment,
        priority: result.priority,
        summary: result.summary,
        topics: result.topics,
        timestamp: new Date().toISOString(),
      };

      if (deptId) {
        await SocketEmitter.emit(`department:${deptId}`, 'conversation:priority_escalation', alertData);
      }
      await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:priority_escalation', alertData);
    }

    console.log(`[Intelligence] Conversation ${conversationId}: sentiment=${result.sentiment}, priority=${result.priority}, topics=${result.topics.join(',')}`);
    return result;
  } catch (error) {
    console.error('[Intelligence] Analysis error:', error.message);
    return { summary: '', sentiment: 'neutral', priority: 'normal', topics: [] };
  }
}

/**
 * Detect sentiment from a single message (lightweight — for real-time monitoring).
 * Returns 'negative'/'frustrated'/'angry' if concerning, null otherwise.
 */
export async function detectSentiment(messageText, aiConfig = null) {
  if (!messageText || messageText.length < 10) return null;

  // Fast keyword check for obvious frustration
  const frustratedPatterns = [
    /\b(terrible|horrible|worst|awful|disgusting|pathetic|useless|incompetent)\b/i,
    /\b(scam|fraud|rip.?off|stealing|theft)\b/i,
    /\b(angry|furious|outraged|livid|pissed)\b/i,
    /\b(complaint|complain|sue|lawyer|legal action|report you)\b/i,
    /\b(waste of time|never again|cancel|unsubscribe|refund)\b/i,
    /[!?]{3,}/, // Multiple exclamation/question marks
    /\b[A-Z]{5,}\b/, // ALL CAPS words (5+ chars)
  ];

  for (const pattern of frustratedPatterns) {
    if (pattern.test(messageText)) {
      return 'frustrated';
    }
  }

  return null;
}
