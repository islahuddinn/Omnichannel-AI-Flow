// src/services/bot/BotFailureEscalation.js
/**
 * Bot Failure Escalation Service
 *
 * When the AI bot fails to respond in auto mode, this service:
 * 1. Switches the conversation to manual mode (so agents can see it)
 * 2. Recalculates and sets the correct unread count
 * 3. Records bot failure metadata on the conversation
 * 4. Emits real-time socket events for instant frontend updates
 * 5. Cancels any pending bot queue items for the conversation
 *
 * Called from webhookWorker.js and webchatHandler.js when bot returns a failure.
 */

import SocketEmitter from '../socket/SocketEmitter.js';
import ConversationSchema from '../../models/schemas/Conversation.js';
import MessageSchema from '../../models/schemas/Message.js';

/**
 * Escalate a bot failure — switch conversation to manual and notify agents in real-time.
 *
 * @param {Object} params
 * @param {Object} params.tenantDB - Tenant database connection
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.conversationId - Conversation ID
 * @param {string} params.reason - Failure reason: 'timeout'|'api_error'|'empty_response'|'circuit_breaker_open'
 * @param {string} [params.departmentId] - Department ID for socket routing
 * @param {string} [params.errorMessage] - Optional error detail for logging
 */
export async function escalateBotFailure({
  tenantDB,
  tenantId,
  conversationId,
  reason,
  departmentId = null,
  errorMessage = null,
}) {
  try {
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    // 1. Fetch current conversation state
    const conversation = await Conversation.findById(conversationId)
      .select('mode unreadCount contact channel department botFailure')
      .lean();

    if (!conversation) return;

    // 2. Skip if already escalated (prevents duplicate escalation from retries/race conditions)
    if (conversation.mode === 'manual' && conversation.botFailure?.failed) {
      return;
    }

    // 3. Calculate actual unread count from unread inbound messages
    const actualUnreadCount = await Message.countDocuments({
      conversation: conversationId,
      direction: 'inbound',
      readAt: { $exists: false },
    });
    // Ensure at least 1 unread (the message that triggered the failed bot call)
    const newUnreadCount = Math.max(actualUnreadCount, 1);

    // 4. Atomic update: mode → manual, set correct unread count, record failure metadata
    const now = new Date();
    const updatedConversation = await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $set: {
          mode: 'manual',
          unreadCount: newUnreadCount,
          'botFailure.failed': true,
          'botFailure.reason': reason,
          'botFailure.failedAt': now,
          'botFailure.escalatedAt': now,
          updatedAt: now,
        },
        $inc: {
          'botFailure.failureCount': 1,
        },
      },
      { new: true }
    ).select('mode unreadCount contact channel department botFailure').lean();

    if (!updatedConversation) return;

    const deptId = departmentId || updatedConversation.department?.toString();

    // 5. Propagate mode change to merged conversations
    try {
      const { propagateModeToMergedConversations } = await import('../conversation/MergeService.js');
      await propagateModeToMergedConversations(tenantId, conversationId, 'manual');
    } catch (err) {
      // MergeService may not exist in all setups — non-fatal
      if (err.code !== 'MODULE_NOT_FOUND' && err.code !== 'ERR_MODULE_NOT_FOUND') {
        console.error('Failed to propagate mode to merged conversations:', err.message);
      }
    }

    // 6. Cancel pending bot queue items for this conversation
    try {
      const QueueSchema = (await import('../../models/schemas/Queue.js')).default;
      const Queue = tenantDB.models.Queue || tenantDB.model('Queue', QueueSchema);
      await Queue.updateMany(
        {
          status: 'pending',
          details: { $regex: `"conversational_id"\\s*:\\s*"${conversationId}"` },
        },
        {
          $set: {
            status: 'completed',
            result: JSON.stringify({ cancelled: true, reason: 'bot_failure_escalation' }),
            completedBy: 'system',
            updated_at: new Date().toISOString(),
          },
        }
      );
    } catch (cancelErr) {
      console.error('Failed to cancel pending queue items:', cancelErr.message);
    }

    // 7. Get grouped conversation IDs for company admin unified view
    let allGroupedConversationIds = null;
    if (updatedConversation.contact && updatedConversation.channel) {
      const allConvs = await Conversation.find({
        contact: updatedConversation.contact,
        channel: updatedConversation.channel,
        status: { $in: ['active', 'open', 'pending'] },
        primaryConversation: { $exists: false },
      }).select('_id').lean();
      if (allConvs.length > 1) {
        allGroupedConversationIds = allConvs.map(c => c._id);
      }
    }

    // 8. Emit conversation:update with mode, unread, and botFailure — agents see it instantly
    await SocketEmitter.emitConversationUpdate(
      conversationId,
      {
        mode: 'manual',
        unreadCount: newUnreadCount,
        botFailure: updatedConversation.botFailure,
      },
      tenantId,
      deptId,
      allGroupedConversationIds
    );

    // 9. Emit dedicated bot:failure event for frontend alerts/toasts
    const failurePayload = {
      conversationId: conversationId.toString(),
      reason,
      failedAt: now.toISOString(),
      unreadCount: newUnreadCount,
      errorMessage: errorMessage || null,
    };

    // To conversation room (if agent has it open)
    await SocketEmitter.emit(`conversation:${conversationId}`, 'bot:failure', failurePayload);
    // To department room (agent list/queue)
    if (deptId) {
      await SocketEmitter.emit(`department:${deptId}`, 'bot:failure', failurePayload);
    }
    // To tenant room (admin dashboards)
    await SocketEmitter.emit(`tenant:${tenantId}`, 'bot:failure', failurePayload);

    console.log(`🚨 Bot failure escalation: conversation ${conversationId} → manual, unread: ${newUnreadCount}, reason: ${reason}`);

    // Generate conversation summary for the agent (async, non-blocking)
    import('./ConversationIntelligenceService.js').then(({ analyzeConversation }) => {
      analyzeConversation({ tenantDB, tenantId, conversationId, handoffReason: 'bot_failure' }).catch(() => {});
    }).catch(() => {});
  } catch (error) {
    // Escalation itself must never crash the message processing pipeline
    console.error('❌ Bot failure escalation error:', error.message);
  }
}
