// src/services/conversation/ConversationContextService.js
/**
 * Conversation Context Service
 * Calls external API to get conversation context when conversation switches to auto mode
 */

import { getTenantDB } from '../../config/database.js';
import QueueSchema from '../../models/schemas/Queue.js';
import ConversationSchema from '../../models/schemas/Conversation.js';

/**
 * Map channel to action
 */
function getActionFromChannel(channel) {
  const channelMap = {
    'whatsapp': 'send_whatsapp',
    'webchat': 'send_message',
    'email': 'send_email',
    'sms': 'send_sms',
    'facebook': 'send_facebook',
    'instagram': 'send_instagram'
  };

  return channelMap[channel] || 'send_message'; // Default to send_message
}

/**
 * Get conversation context from external API and save to queues collection
 * @param {string} conversationId - Conversation ID (conversational_id)
 * @param {string} tenantId - Tenant ID (company_id)
 * @param {boolean} skipQueue - If true, skip saving to queue (for manual summary generation)
 * @returns {Promise<Object>} API response
 */
export async function getConversationContext(conversationId, tenantId, skipQueue = false) {
  try {
    // Get conversation to fetch channel
    const tenantDB = await getTenantDB(tenantId);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);

    const conversation = await Conversation.findById(conversationId)
      .select('channel primaryConversation')
      .lean();

    if (!conversation) {
      console.error(`❌ Conversation ${conversationId} not found`);
      return null;
    }

    // ✅ Skip secondary (merged) conversations — context should only be fetched for primaries
    if (conversation.primaryConversation) {
      console.log(`ℹ️ Conversation ${conversationId} is a secondary (merged into ${conversation.primaryConversation}), skipping context retrieval`);
      return null;
    }

    const channel = conversation.channel;
    if (!channel) {
      console.error(`❌ Conversation ${conversationId} has no channel`);
      return null;
    }

    // Bug 4: Get API URL and secret from environment variables only — no hardcoded fallbacks
    const apiUrl = process.env.CONVERSATION_CONTEXT_API_URL;
    const apiSecret = process.env.CONVERSATION_CONTEXT_API_SECRET;

    if (!apiUrl || !apiSecret) {
      console.warn('⚠️ CONVERSATION_CONTEXT_API_URL or CONVERSATION_CONTEXT_API_SECRET not configured in environment');
      return null;
    }

    // Bug 5: Add 30-second timeout with AbortController to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiSecret}`
        },
        body: JSON.stringify({
          conversational_id: conversationId,
          company_id: tenantId
        }),
        signal: controller.signal
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error(`⏱️ Conversation context API timeout after 30s for ${conversationId}`);
        return null;
      }
      throw fetchError;
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Conversation context API returned ${response.status} for ${conversationId}: ${errorText}`);
      // ✅ Return null gracefully instead of throwing — this is a non-critical operation
      return null;
    }

    const apiResponseRaw = await response.json();

    // ✅ Python API wraps data under a "data" key — unwrap it
    const apiResponse = apiResponseRaw?.data || apiResponseRaw;

    // ✅ Only save to queue if skipQueue is false (default behavior for auto mode)
    if (!skipQueue) {
      // Extract full_summary from API response
      const fullSummary = apiResponse?.full_summary || apiResponse?.message || '';

      // Map channel to action
      const action = getActionFromChannel(channel);

      // Save to queues collection with simplified structure
      const Queue = tenantDB.models.Queue || tenantDB.model('Queue', QueueSchema);
      const now = new Date().toISOString();

      // Create queue record with simplified details
      const queueRecord = await Queue.create({
        user_id: tenantId,
        action: action,
        details: JSON.stringify({
          conversational_id: conversationId,
          message: fullSummary,
          platform: channel
        }),
        perform_at: 'now',
        status: 'pending',
        created_at: now,
        updated_at: now,
        tenantId: tenantId
      });

      console.log(`✅ Conversation context saved to queue: ${queueRecord._id}`, {
        conversationId,
        tenantId,
        channel,
        action,
        queueId: queueRecord._id.toString()
      });
    } else {
      console.log(`✅ Conversation context retrieved (queue skipped) for manual summary generation`, {
        conversationId,
        tenantId,
        channel
      });
    }

    return apiResponse;
  } catch (error) {
    console.error(`❌ Error getting conversation context for ${conversationId}:`, error);

    // Don't save error to queue - just log it
    // Don't throw - this is a non-critical operation
    return null;
  }
}
