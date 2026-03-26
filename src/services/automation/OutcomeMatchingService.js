// src/services/automation/OutcomeMatchingService.js
/**
 * OWM Outcome Matching & Follow-up Service — AI-Powered, Scale-Ready
 *
 * Optimized for thousands of contacts:
 *   - Caches automation data (outcomes, prompts) to avoid repeated DB queries
 *   - Single AI call per contact (matching + follow-up combined)
 *   - Retry with backoff on rate limit errors
 *   - Each contact's conversation is independent — no shared state conflicts
 */

import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import mongoose from 'mongoose';
import { getTenantDB } from '../../config/database.js';
import OWMOutcomeSchema from '../../models/schemas/OWMOutcome.js';
import OWMOutcomeMatchSchema from '../../models/schemas/OWMOutcomeMatch.js';
import ConversationSchema from '../../models/schemas/Conversation.js';
import MessageSchema from '../../models/schemas/Message.js';
import AIPromptSchema from '../../models/schemas/AIPrompt.js';

const CONFIDENCE_THRESHOLD = 0.7;

function toObjectId(id) {
  if (!id) return id;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id);
  return id;
}

const outcomeMatchSchema = z.object({
  isOWMResponse: z.boolean().describe('True if the customer message is a response to the OWM automated message.'),
  matchedOutcomeIndex: z.number().nullable().describe('Zero-based index of the matched outcome. Null if no match.'),
  confidence: z.number().min(0).max(1).describe('Confidence score.'),
  reasoning: z.string().describe('Brief explanation.'),
});

// ── Automation data cache (shared across contacts for same automation) ──
const _automationCache = new Map();
const AUTOMATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Invalidate cached automation data when outcomes or prompts are updated.
 * Call this from outcome CRUD endpoints to ensure fresh data on next match.
 */
export function invalidateAutomationCache(tenantId, automationId) {
  if (tenantId && automationId) {
    _automationCache.delete(`${tenantId}:${automationId}`);
  } else {
    _automationCache.clear();
  }
}

async function getAutomationData(tenantDB, tenantId, automationId) {
  const cacheKey = `${tenantId}:${automationId}`;
  const cached = _automationCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < AUTOMATION_CACHE_TTL) return cached.data;

  const autoObjId = toObjectId(automationId);
  const OWMOutcome = tenantDB.models.OWMOutcome || tenantDB.model('OWMOutcome', OWMOutcomeSchema);
  const AIPrompt = tenantDB.models.AIPrompt || tenantDB.model('AIPrompt', AIPromptSchema);

  const [allOutcomes, automationPrompt, outcomePrompts, automation] = await Promise.all([
    OWMOutcome.find({ automationId: autoObjId }).sort({ order: 1 }).lean(),
    AIPrompt.findOne({ moduleId: autoObjId, moduleIdDescription: 'OWM', isActive: true }).select('prompt').lean(),
    AIPrompt.find({ moduleIdDescription: 'OWM_OUTCOME', isActive: true }).lean(),
    (async () => {
      const AutomationSchema = (await import('../../models/schemas/Automation.js')).default;
      const Automation = tenantDB.models.Automation || tenantDB.model('Automation', AutomationSchema);
      return Automation.findById(autoObjId).select('name').lean();
    })(),
  ]);

  // Build prompt map — filter to only prompts for this automation's outcomes
  const outcomeIdSet = new Set(allOutcomes.map(o => o._id.toString()));
  const outcomePromptMap = {};
  for (const p of outcomePrompts) {
    if (outcomeIdSet.has(p.moduleId.toString())) {
      outcomePromptMap[p.moduleId.toString()] = p.prompt;
    }
  }

  const data = { allOutcomes, automationPrompt, outcomePromptMap, automationName: automation?.name || '' };
  _automationCache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

// ── AI call with retry for rate limits ──
async function callAIWithRetry(fn, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimit = error.status === 429 || error.message?.includes('429') || error.message?.includes('rate limit');
      if (isRateLimit && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // 1s, 2s, 4s, max 10s
        console.warn(`[OutcomeMatching] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
}

class OutcomeMatchingService {
  /**
   * Initialize outcome tracking records (atomic upsert).
   */
  static async initializeOutcomes(tenantId, conversationId, contactId, automationId) {
    try {
      const tenantDB = await getTenantDB(tenantId);
      const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);
      const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);

      const conversation = await Conversation.findById(conversationId).lean();
      if (!conversation) return [];

      const { allOutcomes, automationName } = await getAutomationData(tenantDB, tenantId, automationId);
      if (!allOutcomes || allOutcomes.length === 0) return [];

      const convId = toObjectId(conversationId);
      const autoId = toObjectId(automationId);

      const results = [];
      for (const outcome of allOutcomes) {
        const record = await OWMOutcomeMatch.findOneAndUpdate(
          { conversationId: convId, automationId: autoId, owmOutcomeId: outcome._id },
          {
            $setOnInsert: {
              tenantId, conversationId: convId,
              contactId: contactId ? toObjectId(contactId) : conversation.contact,
              automationId: autoId, owmOutcomeId: outcome._id,
              automationName, outcomeName: outcome.outcomeName,
              status: 0, stage: 'pending', createdAt: new Date(),
            },
            $set: { updatedAt: new Date() },
          },
          { upsert: true, new: true }
        ).lean();
        results.push(record);
      }
      return results;
    } catch (error) {
      console.error('[OutcomeMatching] Error initializing:', error.message);
      return [];
    }
  }

  /**
   * Analyze inbound message, match against OWM outcomes, send follow-up.
   */
  static async analyzeAndMatch(tenantId, conversationId, messageId, automationId) {
    try {
      const tenantDB = await getTenantDB(tenantId);
      const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
      const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
      const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);

      const convObjId = toObjectId(conversationId);
      const autoObjId = toObjectId(automationId);

      // ── Step 1: Validate message ──
      const message = await Message.findById(messageId).lean();
      if (!message || message.direction !== 'inbound') return null;

      const textContent = this.extractTextContent(message);
      if (!textContent) return null;

      // ── Step 2: Get cached automation data (shared across all contacts) ──
      const { allOutcomes, automationPrompt, outcomePromptMap, automationName } = await getAutomationData(tenantDB, tenantId, automationId);
      if (!allOutcomes || allOutcomes.length === 0) return null;

      // ── Step 3: Get match records for THIS conversation ──
      // Query with BOTH ObjectId and string formats to handle type mismatches
      // (records may have been created with string conversationId by AutomationService)
      let allMatchRecords = await OWMOutcomeMatch.find({
        conversationId: convObjId, automationId: autoObjId,
      }).lean();

      // Fallback: try string format if ObjectId returned nothing
      if (allMatchRecords.length === 0) {
        allMatchRecords = await OWMOutcomeMatch.find({
          conversationId: conversationId.toString(), automationId: automationId.toString(),
        }).lean();
      }

      const matchedOutcomeIds = new Set(
        allMatchRecords.filter(r => r.status === 1).map(r => r.owmOutcomeId.toString())
      );

      // All outcomes for AI — skip already matched ones for THIS conversation
      const outcomes = allOutcomes.filter(o => !matchedOutcomeIds.has(o._id.toString()));
      if (outcomes.length === 0) {
        console.log(`[OutcomeMatching] All outcomes matched for conversation ${conversationId}`);
        return null;
      }

      // ── Step 4: Find OWM message ──
      let owmMessage = await Message.findOne({
        conversation: convObjId, direction: 'outbound', sendingModule: 'owm',
        'metadata.automationId': automationId.toString(),
      }).sort({ createdAt: -1 }).select('content createdAt').lean();

      if (!owmMessage) {
        owmMessage = await Message.findOne({
          conversation: convObjId, direction: 'outbound', sendingModule: 'owm',
        }).sort({ createdAt: -1 }).select('content createdAt').lean();
      }
      if (!owmMessage) return null;

      const owmContent = typeof owmMessage.content === 'string'
        ? owmMessage.content : (owmMessage.content?.text || '[OWM message]');

      // ── Step 5: Get AI config (cached by BotService) ──
      const { BotService } = await import('../bot/BotService.js');
      const botSettings = await BotService.getCompanyBotSettings(tenantId);
      if (!botSettings.enabled || !botSettings.provider || !botSettings.model || !botSettings.apiKey) {
        console.warn(`[OutcomeMatching] AI not configured`);
        return null;
      }

      const { createModelInstance } = await import('../bot/AIProviderRegistry.js');
      const model = createModelInstance(botSettings.provider, botSettings.model, botSettings.apiKey);

      // ── Step 6: Conversation context ──
      // Get recent messages for context — includes both the latest message
      // and previous conversation history since the OWM was sent.
      const allMessagesSinceOWM = await Message.find({
        conversation: convObjId,
        createdAt: { $gte: owmMessage.createdAt, $lte: message.createdAt },
        direction: { $in: ['inbound', 'outbound'] },
      }).sort({ createdAt: 1 }).limit(20).select('content direction sendingModule createdAt').lean();

      // Build conversation context
      const contextSummary = allMessagesSinceOWM.map(m => {
        const role = m.direction === 'inbound' ? 'Customer' : (m.sendingModule === 'owm' ? 'Automated Message' : 'Bot/Agent');
        const text = typeof m.content === 'string' ? m.content : (m.content?.text || '[media]');
        return `${role}: ${text.substring(0, 300)}`;
      }).join('\n');

      // Collect ALL inbound messages since OWM for multi-turn analysis
      const allCustomerReplies = allMessagesSinceOWM
        .filter(m => m.direction === 'inbound')
        .map(m => typeof m.content === 'string' ? m.content : (m.content?.text || ''))
        .filter(Boolean);

      // ── Step 7: Build AI prompt ──
      const outcomesDescription = outcomes.map((o, i) => {
        const followUp = outcomePromptMap[o._id.toString()];
        return `${i}. "${o.outcomeName}"\n   Matches when: ${o.possibleOutcome}${followUp ? `\n   Follow-up: ${followUp.substring(0, 150)}...` : ''}`;
      }).join('\n\n');

      const systemContext = automationPrompt?.prompt
        ? `AUTOMATION CONTEXT:\n${automationPrompt.prompt}\n\n---\n\n` : '';

      const matchPrompt = `${systemContext}TASK: Determine if the customer's latest message is a response to the automated OWM message, and if so, which outcome it matches.

THE AUTOMATED (OWM) MESSAGE THAT WAS SENT TO THE CUSTOMER:
"${owmContent.substring(0, 800)}"

AVAILABLE OUTCOMES TO MATCH:
${outcomesDescription}

CONVERSATION HISTORY:
${contextSummary}

LATEST CUSTOMER MESSAGE:
"${textContent.substring(0, 500)}"
${allCustomerReplies.length > 1 ? `\n(Note: Customer has sent ${allCustomerReplies.length} messages since the OWM. Consider ALL messages together — the customer may have been unsure initially but later confirmed.)` : ''}

RULES:
1. The customer IS responding to the OWM if their message relates to the topic in the OWM. Set isOWMResponse=true.
2. Even if a bot or agent responded in between, the customer's message is still an OWM response if it answers the original OWM question.
3. Only set isOWMResponse=false if the customer's message is completely unrelated to the OWM topic.
4. Match the customer's INTENT, not exact words. Understand synonyms, similar phrases, slang, abbreviations, emojis, and informal language. Match in any language.
5. Short responses and single-word replies are valid — match them confidently based on context.
6. Set confidence below 0.7 only if the intent is truly ambiguous.`;

      // ── Step 8: Call AI with retry ──
      const startTime = Date.now();
      const { object: aiResult } = await callAIWithRetry(() =>
        generateObject({
          model, schema: outcomeMatchSchema, prompt: matchPrompt,
          temperature: 0.1, maxTokens: 400,
          abortSignal: AbortSignal.timeout(30000),
        })
      );
      const matchDurationMs = Date.now() - startTime;

      console.log(`[OutcomeMatching] AI: isOWM=${aiResult.isOWMResponse}, idx=${aiResult.matchedOutcomeIndex}, conf=${aiResult.confidence?.toFixed(2)}, ${matchDurationMs}ms`);

      if (!aiResult.isOWMResponse || aiResult.matchedOutcomeIndex === null || aiResult.matchedOutcomeIndex === undefined) return null;
      if (aiResult.confidence < CONFIDENCE_THRESHOLD) return null;

      const matchedOutcome = outcomes[aiResult.matchedOutcomeIndex];
      if (!matchedOutcome) return null;

      // Already matched? Skip duplicate
      if (matchedOutcomeIds.has(matchedOutcome._id.toString())) {
        return { matched: true, outcome: matchedOutcome, confidence: aiResult.confidence, followUpSent: false, duplicate: true };
      }

      // ── Step 9: Get conversation details ──
      const conv = await Conversation.findById(convObjId).select('channel contact channelAccount').lean();

      // ── Step 10: Save match (upsert to handle missing records) ──
      const now = new Date();
      const matchUpdateData = {
        status: 1, stage: 'matched',
        confidenceScore: aiResult.confidence, matchSource: 'ai',
        matchedMessageId: toObjectId(messageId), matchedAt: now,
        contactId: conv?.contact || null, channelType: conv?.channel || null,
        automationName, outcomeName: matchedOutcome.outcomeName,
        customerMessage: textContent.substring(0, 500),
        aiReasoning: aiResult.reasoning || '', matchDurationMs,
        updatedAt: now,
      };

      let matchRecord = null;
      try {
        matchRecord = await OWMOutcomeMatch.findOneAndUpdate(
          { conversationId: convObjId, automationId: autoObjId, owmOutcomeId: matchedOutcome._id },
          {
            $set: matchUpdateData,
            $setOnInsert: { tenantId, createdAt: now },
          },
          { new: true, upsert: true }
        );
      } catch (saveErr) {
        // If upsert fails (duplicate key with different type), try string format
        console.warn(`[OutcomeMatching] Save failed with ObjectId, trying string format:`, saveErr.message);
        try {
          matchRecord = await OWMOutcomeMatch.findOneAndUpdate(
            { conversationId: conversationId.toString(), automationId: automationId.toString(), owmOutcomeId: matchedOutcome._id.toString() },
            { $set: matchUpdateData },
            { new: true }
          );
        } catch (saveErr2) {
          console.error(`[OutcomeMatching] Save also failed with string format:`, saveErr2.message);
        }
      }

      console.log(`[OutcomeMatching] ✅ MATCHED "${matchedOutcome.outcomeName}" (conf=${aiResult.confidence.toFixed(2)}, saved=${!!matchRecord})`);

      // ── Step 11: ALWAYS send follow-up regardless of match record save result ──
      let followUpSent = false;
      let followUpMessageId = null;

      const followUpPrompt = outcomePromptMap[matchedOutcome._id.toString()];
      if (followUpPrompt && conv) {
        try {
          console.log(`[OutcomeMatching] Sending follow-up for "${matchedOutcome.outcomeName}" to conversation ${conversationId}...`);
          const result = await this._sendFollowUpResponse({
            tenantId, tenantDB, conversationId: convObjId.toString(),
            matchedOutcome, automationPrompt, followUpPrompt,
            botSettings, model, textContent, conv,
          });
          followUpSent = result.sent || false;
          followUpMessageId = result.messageId || null;
          console.log(`[OutcomeMatching] Follow-up result: sent=${followUpSent}, messageId=${followUpMessageId}`);
        } catch (err) {
          console.error(`[OutcomeMatching] Follow-up FAILED for "${matchedOutcome.outcomeName}":`, err.message, err.stack?.substring(0, 200));
        }
      } else {
        console.warn(`[OutcomeMatching] Cannot send follow-up: prompt=${!!followUpPrompt}, conv=${!!conv}`);
      }

      // Update match record with follow-up status
      if (followUpSent && matchRecord?._id) {
        try {
          await OWMOutcomeMatch.findByIdAndUpdate(matchRecord._id, {
            $set: {
              stage: 'action_taken', followUpSent: true,
              followUpMessageId, followUpSentAt: new Date(),
              actionTakenAt: new Date(), actionTakenBy: 'ai_bot',
              updatedAt: new Date(),
            },
          });
        } catch (updateErr) {
          console.error(`[OutcomeMatching] Failed to update match with follow-up status:`, updateErr.message);
        }
      }

      // ── Step 12: Salesforce Deal Update (async, non-blocking) ──
      // If the follow-up prompt instructs to update Salesforce fields, process it in background.
      if (followUpSent && followUpPrompt && conv?.contact) {
        console.log(`[OutcomeMatching] Starting Salesforce action check for "${matchedOutcome.outcomeName}"...`);
        console.log(`[OutcomeMatching] Follow-up prompt: "${followUpPrompt.substring(0, 150)}..."`);

        (async () => {
          try {
            const { processFollowUpActions } = await import('../bot/SalesforceActionService.js');

            // Build conversation context for AI extraction
            const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
            const recentMsgs = await Message.find({
              conversation: convObjId,
              direction: { $in: ['inbound', 'outbound'] },
            }).sort({ createdAt: -1 }).limit(10).select('content direction').lean();
            recentMsgs.reverse();
            const history = recentMsgs.map(m => ({
              role: m.direction === 'inbound' ? 'user' : 'assistant',
              content: typeof m.content === 'string' ? m.content : (m.content?.text || '[media]'),
            }));

            console.log(`[OutcomeMatching] Calling processFollowUpActions with contact=${typeof conv.contact === 'object' ? conv.contact._id || conv.contact : conv.contact}`);

            const sfResult = await processFollowUpActions({
              tenantDB, tenantId,
              conversationId: convObjId.toString(),
              contact: conv.contact,
              followUpPrompt,
              matchedOutcomeName: matchedOutcome.outcomeName,
              conversationHistory: history,
              model,
              matchRecordId: matchRecord?._id?.toString() || null,
              automationId: automationId?.toString() || null,
            });

            if (sfResult.updated) {
              console.log(`[OutcomeMatching] ✅ Salesforce updated: ${sfResult.fieldsUpdated?.join(', ')}`);
            } else {
              console.log(`[OutcomeMatching] SF update skipped: ${sfResult.reason}`, sfResult.error || '');
            }
          } catch (sfErr) {
            console.error('[OutcomeMatching] Salesforce action error:', sfErr.message, sfErr.stack?.substring(0, 300));
          }
        })();
      } else {
        console.log(`[OutcomeMatching] SF action skipped: followUpSent=${followUpSent}, hasPrompt=${!!followUpPrompt}, hasContact=${!!conv?.contact}`);
      }

      return { matched: true, outcome: matchedOutcome, confidence: aiResult.confidence, followUpSent };
    } catch (error) {
      console.error('[OutcomeMatching] ERROR:', error.message);
      return null;
    }
  }

  /**
   * Send follow-up response.
   */
  static async _sendFollowUpResponse({
    tenantId, tenantDB, conversationId,
    matchedOutcome, automationPrompt, followUpPrompt,
    botSettings, model, textContent, conv,
  }) {
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    // Build conversation history
    const recentMessages = await Message.find({
      conversation: toObjectId(conversationId),
      direction: { $in: ['inbound', 'outbound'] },
    }).sort({ createdAt: -1 }).limit(10).select('content direction').lean();

    recentMessages.reverse();
    const history = recentMessages.map(m => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: typeof m.content === 'string' ? m.content : (m.content?.text || '[media]'),
    }));
    history.push({ role: 'user', content: textContent });

    const systemParts = [];
    if (automationPrompt?.prompt) systemParts.push(automationPrompt.prompt);
    systemParts.push(`\nCustomer matched outcome: "${matchedOutcome.outcomeName}".`);
    systemParts.push(`Meaning: ${matchedOutcome.possibleOutcome}`);
    systemParts.push(`\nYOUR INSTRUCTIONS:\n${followUpPrompt}`);
    systemParts.push('\nRespond to the customer. Follow instructions precisely.');

    const result = await callAIWithRetry(() =>
      generateText({
        model, system: systemParts.join('\n'), messages: history,
        temperature: botSettings.temperature ?? 0.7,
        maxTokens: botSettings.maxTokens ?? 1024,
        abortSignal: AbortSignal.timeout(45000),
      })
    );

    const responseText = result.text?.trim();
    if (!responseText) return { sent: false, messageId: null };

    const { BotService } = await import('../bot/BotService.js');
    const sendResult = await BotService.sendBotResponse({
      tenantId, conversationId,
      contactId: (conv.contact?._id || conv.contact)?.toString(),
      channelType: conv.channel,
      channelAccountId: (conv.channelAccount?._id || conv.channelAccount)?.toString(),
      botResponse: responseText, tenantDB,
      skipModeCheck: true,
    });

    console.log(`[OutcomeMatching] ✅ Follow-up SENT for "${matchedOutcome.outcomeName}" (${responseText.length} chars)`);
    return { sent: true, messageId: sendResult?.messageId || null };
  }

  static extractTextContent(message) {
    if (message.type === 'text' && message.content) {
      return typeof message.content === 'string' ? message.content : message.content.text;
    }
    if (['image', 'video', 'document', 'audio'].includes(message.type)) {
      const caption = message.caption || message.content?.caption || message.metadata?.caption;
      if (caption) return caption;
      if (message.type === 'document') {
        const fn = message.filename || message.content?.filename || message.metadata?.filename;
        if (fn) return fn;
      }
    }
    if (message.type === 'interactive' || message.type === 'button') {
      const t = message.content?.button_reply?.title || message.content?.list_reply?.title
        || message.content?.title || message.content;
      if (t && typeof t === 'string') return t;
    }
    if (typeof message.content === 'string' && message.content.trim()) return message.content;
    return null;
  }

  static async manualMatch(tenantId, conversationId, automationId, owmOutcomeId, userId) {
    try {
      const tenantDB = await getTenantDB(tenantId);
      const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
      const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);

      const conversation = await Conversation.findById(conversationId).lean();
      if (!conversation) throw new Error('Conversation not found');

      await this.initializeOutcomes(tenantId, conversationId,
        conversation.contact?.toString() || conversation.contact, automationId);

      const match = await OWMOutcomeMatch.findOneAndUpdate(
        { conversationId: toObjectId(conversationId), automationId: toObjectId(automationId), owmOutcomeId: toObjectId(owmOutcomeId) },
        {
          $set: { status: 1, stage: 'matched', matchSource: 'manual', matchedBy: userId, matchedAt: new Date(), updatedAt: new Date() },
          $setOnInsert: { tenantId, conversationId: toObjectId(conversationId), contactId: conversation.contact, automationId: toObjectId(automationId), owmOutcomeId: toObjectId(owmOutcomeId), createdAt: new Date() },
        },
        { upsert: true, new: true }
      );
      return match.toObject();
    } catch (error) {
      console.error('[OutcomeMatching] Manual match error:', error);
      throw error;
    }
  }

  static async getMatchesForConversation(tenantId, conversationId, automationId = null) {
    try {
      const tenantDB = await getTenantDB(tenantId);
      const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);

      const query = { conversationId: toObjectId(conversationId) };
      if (automationId) query.automationId = toObjectId(automationId);

      return await OWMOutcomeMatch.find(query)
        .populate('owmOutcomeId', 'outcomeName possibleOutcome order')
        .sort({ status: -1, matchedAt: -1, createdAt: 1 })
        .lean();
    } catch (error) {
      console.error('[OutcomeMatching] Get matches error:', error);
      return [];
    }
  }
}

export default OutcomeMatchingService;
