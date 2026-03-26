// src/workers/queueWorker.js
/**
 * Queue Worker - Professional RabbitMQ-based Implementation
 * Processes bot-generated queue tasks asynchronously from MongoDB
 * Handles send_email, send_whatsapp, send_sms, send_message actions
 * 
 * Features:
 * - Zero server load (background processing via RabbitMQ)
 * - Auto-retry on failures (3 attempts)
 * - Professional error handling
 * - Follows same pattern as other workers
 */

import { getTenantDB, getMasterDB } from '../config/database.js';
import MessageSchema from '../models/schemas/Message.js';
import ConversationSchema from '../models/schemas/Conversation.js';
import CompanyAccountSchema from '../models/schemas/CompanyAccount.js';
import ContactSchema from '../models/schemas/Contact.js';
import QueueSchema from '../models/schemas/Queue.js';
import CompanySchema from '../models/schemas/Company.js';
import { publishToQueue, publishOutboundMessage, QUEUES } from '../lib/queue/rabbitmq.js';
import SocketEmitter from '../services/socket/SocketEmitter.js';

// Singleton guard
let queueMonitorInterval = null;
let isQueueMonitorRunning = false;

/**
 * Process a queue item - OPTIMIZED FOR INSTANT EXECUTION
 */
async function processQueueItem(queueData) {
  const { queueId, tenantId } = queueData;
  const startTime = Date.now();
  
  // ✅ Declare variables at function scope so they're accessible in catch block
  let queueItem = null;
  let channelType = null;

  try {
    if (!tenantId) {
      console.error(`❌ Queue item ${queueId} missing tenantId, skipping`);
      return;
    }

    // Remove 'tenant_' prefix if present since getTenantDB adds it
    const cleanTenantId = tenantId.replace(/^tenant_/, '');
    const tenantDB = await getTenantDB(cleanTenantId);
    const Queue = tenantDB.models.Queue || tenantDB.model('Queue', QueueSchema);

    // Fast query with lean() for minimal memory usage
    queueItem = await Queue.findById(queueId).lean();

    if (!queueItem) {
      console.error(`❌ Queue item not found: ${queueId}`);
      return;
    }

    // ✅ CRITICAL: Process items that are 'pending' OR 'processing'
    // This handles cases where items are marked as processing but worker hasn't processed them yet
    if (queueItem.status !== 'processing' && queueItem.status !== 'pending') {
      console.log(`⏭️ Skipping queue item ${queueId} - status: ${queueItem.status}`);
      return; // Skip completed/failed items
    }

    // ✅ Mark as processing if still pending (handles race conditions)
    if (queueItem.status === 'pending') {
      await Queue.findByIdAndUpdate(queueId, {
        status: 'processing',
        updated_at: new Date().toISOString()
      });
      console.log(`🔄 Marked queue item ${queueId} as processing`);
    }

    // Parse details (JSON string from bot)
    let details;
    try {
      details = typeof queueItem.details === 'string' 
        ? JSON.parse(queueItem.details) 
        : queueItem.details;
    } catch (parseError) {
      throw new Error(`Failed to parse queue details: ${parseError.message}`);
    }

    // Extract conversation and message details
    const { conversational_id, message, platform } = details;

    if (!conversational_id) {
      throw new Error('conversational_id is missing in queue item details');
    }
    if (!message) {
      // ✅ If message is empty/missing, still move conversation to manual mode
      // so agents can take over, then skip sending
      console.log(`⚠️ Queue item ${queueId} has empty message, switching to manual mode and skipping send`);
      await moveConversationToManual(tenantDB, conversational_id, cleanTenantId);

      // Mark as completed (not failed) since we handled it gracefully
      const Queue2 = tenantDB.models.Queue || tenantDB.model('Queue', QueueSchema);
      await Queue2.findByIdAndUpdate(queueId, {
        status: 'completed',
        result: JSON.stringify({ discarded: true, reason: 'empty_message_moved_to_manual' }),
        completedBy: 'omnichannel',
        updated_at: new Date().toISOString()
      });
      return;
    }

    // Determine channel type and extract message text based on action
    let messageText;
    
    // ✅ Handle "move_to_manual" action separately
    if (queueItem.action === 'move_to_manual') {
      // Extract conversation ID from details
      const conversationId = conversational_id || details.conversation_id || details.conversational_id;
      
      if (!conversationId) {
        throw new Error('conversation_id is missing in queue item details for move_to_manual action');
      }

      console.log(`🔄 Processing queue item ${queueId}:`, {
        action: queueItem.action,
        conversationId: conversationId
      });

      // Move conversation to manual mode and increment unread count
      const result = await moveConversationToManual(tenantDB, conversationId, cleanTenantId);
      
      // Update queue status to completed
      await Queue.findByIdAndUpdate(queueId, {
        status: 'completed',
        result: JSON.stringify(result),
        completedBy: 'omnichannel',
        updated_at: new Date().toISOString()
      });

      const processingTime = Date.now() - startTime;
      console.log(`✅ Queue item ${queueId} completed in ${processingTime}ms (${queueItem?.action || 'unknown'})`);
      
      return; // Exit early for move_to_manual action
    }
    
    switch (queueItem.action) {
      case 'send_email':
        channelType = 'email';
        messageText = message.html || message.text || message;
        break;
      case 'send_whatsapp':
        channelType = 'whatsapp';
        messageText = message.text || message;
        break;
      case 'send_sms':
        channelType = 'sms';
        messageText = message.text || message;
        break;
      case 'send_message': // WebChat
        channelType = 'webchat';
        messageText = message.text || message;
        break;
      default:
        throw new Error(`Unsupported action: ${queueItem.action}`);
    }

    console.log(`🔄 Processing queue item ${queueId}:`, {
      action: queueItem.action,
      channelType,
      conversationId: conversational_id,
      messageLength: messageText?.length || 0
    });

    // Send message using standard flow (creates message, emits socket events, updates conversation)
    const result = await sendMessageViaStandardFlow(tenantDB, conversational_id, messageText, channelType);

    // If message was discarded (e.g., mode changed), mark as completed with reason
    if (result?.discarded) {
      await Queue.findByIdAndUpdate(queueId, {
        status: 'completed',
        result: JSON.stringify({ discarded: true, reason: result.reason }),
        completedBy: 'omnichannel',
        updated_at: new Date().toISOString()
      });
      console.log(`Queue item ${queueId} discarded: ${result.reason}`);
      return;
    }

    // Update queue status to completed
    await Queue.findByIdAndUpdate(queueId, {
      status: 'completed',
      result: JSON.stringify(result),
      completedBy: 'omnichannel', // ✅ Mark that this was completed by the queue worker
      updated_at: new Date().toISOString()
    });

    const processingTime = Date.now() - startTime;
    console.log(`✅ Queue item ${queueId} completed in ${processingTime}ms (${queueItem?.action || 'unknown'})`);

  } catch (error) {
    console.error(`❌ Failed to process queue item ${queueId}:`, {
      error: error.message,
      stack: error.stack,
      action: queueItem?.action || 'unknown',
      channelType: channelType || 'unknown'
    });
    
    // Update queue status to failed
    try {
      if (!tenantId) throw new Error('tenantId missing, cannot update status');
      const cleanTenantId = tenantId.replace(/^tenant_/, '');
      const tenantDB = await getTenantDB(cleanTenantId);
      const Queue = tenantDB.models.Queue || tenantDB.model('Queue', QueueSchema);
      
      await Queue.findByIdAndUpdate(queueId, {
        status: 'failed',
        result: JSON.stringify({ 
          error: error.message,
          stack: error.stack,
          failedAt: new Date().toISOString()
        }),
        updated_at: new Date().toISOString()
      });
      
      console.log(`✅ Queue item ${queueId} marked as failed`);
    } catch (updateError) {
      console.error(`❌ Failed to update queue status for ${queueId}:`, updateError.message);
    }

    // Mark as non-retryable so RabbitMQ acknowledges instead of requeuing
    error.retryable = false;
    throw error; // Re-throw for RabbitMQ retry
  }
}

/**
 * Move conversation to manual mode and increment unread count
 * Emits real-time socket events for immediate UI updates
 */
async function moveConversationToManual(tenantDB, conversationId, tenantId) {
  const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
  const Queue = tenantDB.models.Queue || tenantDB.model('Queue', QueueSchema);

  try {
    // Get current conversation state
    const conversation = await Conversation.findById(conversationId)
      .select('mode unreadCount contact channel department status')
      .lean();

    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Skip if already in manual mode
    if (conversation.mode === 'manual') {
      console.log(`ℹ️ Conversation ${conversationId} is already in manual mode`);
      return { 
        conversationId: conversationId.toString(), 
        mode: 'manual', 
        alreadyManual: true 
      };
    }

    // Update conversation: set mode to manual and increment unread count
    const currentUnreadCount = conversation.unreadCount || 0;
    const newUnreadCount = currentUnreadCount + 1;

    const updatedConversation = await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $set: {
          mode: 'manual',
          unreadCount: newUnreadCount,
          updatedAt: new Date()
        }
      },
      { new: true }
    )
      .select('mode unreadCount contact channel department status')
      .lean();

    if (!updatedConversation) {
      throw new Error(`Failed to update conversation ${conversationId}`);
    }

    console.log(`✅ Moved conversation ${conversationId} to manual mode and incremented unread count to ${newUnreadCount}`);

    // ✅ Propagate mode change to all merged conversations
    try {
      const { propagateModeToMergedConversations } = await import('../services/conversation/MergeService.js');
      await propagateModeToMergedConversations(tenantId, conversationId, 'manual');
    } catch (err) {
      console.error('⚠️ Failed to propagate mode to merged conversations:', err);
    }

    // Cancel any pending bot queue items for this conversation
    try {
      const result = await Queue.updateMany(
        {
          status: 'pending',
          'details': { $regex: `"conversational_id"\\s*:\\s*"${conversationId}"` }
        },
        {
          $set: {
            status: 'completed',
            result: JSON.stringify({ cancelled: true, reason: 'moved_to_manual' }),
            completedBy: 'system',
            updated_at: new Date().toISOString()
          }
        }
      );
      if (result.modifiedCount > 0) {
        console.log(`Cancelled ${result.modifiedCount} pending bot queue items for conversation ${conversationId} (moved to manual)`);
      }
    } catch (cancelErr) {
      console.error('⚠️ Failed to cancel pending bot queue items:', cancelErr.message);
    }

    // ✅ Get all grouped conversations for company admin view
    let allGroupedConversationIds = null;
    if (updatedConversation.contact && updatedConversation.channel) {
      const contactId = updatedConversation.contact?.toString() || updatedConversation.contact;
      const channel = updatedConversation.channel;
      
      const allDepartmentConversations = await Conversation.find({
        contact: contactId,
        channel: channel,
        status: { $in: ['active', 'open', 'pending'] },
        primaryConversation: { $exists: false }
      })
        .select('_id')
        .lean();
      
      if (allDepartmentConversations.length > 1) {
        allGroupedConversationIds = allDepartmentConversations.map(c => c._id);
      }
    }

    // ✅ Emit real-time socket event with mode change and unread count update
    await SocketEmitter.emitConversationUpdate(
      conversationId,
      {
        mode: 'manual',
        unreadCount: newUnreadCount
      },
      tenantId,
      updatedConversation.department?.toString() || null,
      allGroupedConversationIds
    );

    console.log(`✅ Emitted real-time update: conversation ${conversationId} -> manual mode, unreadCount: ${newUnreadCount}`);

    return {
      conversationId: conversationId.toString(),
      mode: 'manual',
      unreadCount: newUnreadCount,
      previousMode: conversation.mode
    };
  } catch (error) {
    console.error(`❌ Error moving conversation ${conversationId} to manual mode:`, error);
    throw error;
  }
}

/**
 * Send message using the standard flow (creates message + emits socket events + updates conversation)
 */
async function sendMessageViaStandardFlow(tenantDB, conversational_id, message, channelType) {
  const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
  const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
  const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

  // Get conversation details
  const conversation = await Conversation.findById(conversational_id)
    .select('contact channelAccount department channel mode isMerged mergedConversations')
    .lean();

  if (!conversation) {
    throw new Error(`Conversation not found: ${conversational_id}`);
  }

  // Re-check conversation mode before sending
  if (conversation.mode && conversation.mode !== 'auto') {
    console.log(`Conversation ${conversational_id} switched to ${conversation.mode} mode — discarding queued bot response`);
    return { discarded: true, reason: 'mode_changed' };
  }

  // ✅ CRITICAL: Resolve correct conversation if conversations were unmerged after bot was triggered
  // Queue items store conversationId from trigger time. If unmerged before processing,
  // the message must go to the correct conversation for the target channel.
  if (channelType && conversation.channel !== channelType) {
    const stillMergedWithChannel = conversation.isMerged &&
      conversation.mergedConversations?.some(mc => mc.channel === channelType);
    if (!stillMergedWithChannel) {
      // Conversations were unmerged — find the correct conversation for this channel + contact
      const correctConv = await Conversation.findOne({
        contact: conversation.contact,
        channel: channelType,
        status: 'active',
        primaryConversation: { $exists: false }
      }).select('_id channelAccount department').lean();
      if (correctConv) {
        console.log(`🔄 Queue bot response: Resolved conversation ${conversational_id} (${conversation.channel}) → ${correctConv._id} (${channelType}) — conversations were unmerged`);
        conversational_id = correctConv._id.toString();
        conversation.channelAccount = correctConv.channelAccount || conversation.channelAccount;
        conversation.department = correctConv.department || conversation.department;
      }
    }
  }

  // Get contact
  const contact = await Contact.findById(conversation.contact)
    .select('name displayName phone email identifiers')
    .lean();

  if (!contact) {
    throw new Error(`Contact not found: ${conversation.contact}`);
  }

  // ✅ For email channel, prepare emailData
  let emailDataForMessage = null;
  if (channelType === 'email') {
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const channelAccount = await CompanyAccount.findById(conversation.channelAccount)
      .select('identifier')
      .lean();
    
    // Get contact email
    const contactEmail = contact.email || contact.identifiers?.email;
    
    // ✅ CRITICAL: Get recent inbound email for contact email fallback AND original subject
    let finalContactEmail = contactEmail;
    let originalSubject = null;

    // Always query recent inbound email for subject (Bug 10) and email fallback
    try {
      const recentInboundMessage = await Message.findOne({
        conversation: conversational_id,
        direction: 'inbound',
        channel: 'email'
      })
        .select('emailData')
        .sort({ createdAt: -1 })
        .lean();

      if (!finalContactEmail && recentInboundMessage?.emailData?.from) {
        finalContactEmail = recentInboundMessage.emailData.from;
        console.log('✅ Using email from recent inbound message as fallback:', finalContactEmail);
      }
      // Bug 10: Get original subject from inbound email for proper threading
      if (recentInboundMessage?.emailData?.subject) {
        originalSubject = recentInboundMessage.emailData.subject;
      }
    } catch (error) {
      console.warn('⚠️ Failed to get email from recent inbound message:', error.message);
    }

    const fromEmail = channelAccount?.identifier;

    // Bug 10: Use original email subject with "Re:" prefix for proper threading
    const emailSubject = originalSubject
      ? (originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`)
      : 'Re: Your inquiry';

    // ✅ Always create emailData if we have a contactEmail (from contact or recent message fallback)
    if (finalContactEmail) {
      emailDataForMessage = {
        subject: emailSubject,
        to: [finalContactEmail],
        from: fromEmail,
      };
    }
  }

  // Create message
  const newMessage = await Message.create({
    conversation: conversational_id,
    contact: conversation.contact,
    channelAccount: conversation.channelAccount,
    departmentId: conversation.department,
    direction: 'outbound',
    channel: channelType,
    type: 'text',
    content: message,
    sendingModule: 'bot',
    status: 'pending',
    // ✅ Store email-specific data if channel is email
    ...(channelType === 'email' && emailDataForMessage && {
      emailData: {
        subject: emailDataForMessage.subject || 'Re: Your inquiry',
        to: Array.isArray(emailDataForMessage.to) ? emailDataForMessage.to : [emailDataForMessage.to],
        from: emailDataForMessage.from,
      }
    }),
    metadata: {
      isBotResponse: true,
      sentBy: 'bot',
      source: 'ai_bot'
    },
    createdAt: new Date()
  });

  console.log('💾 Bot message created:', {
    messageId: newMessage._id,
    conversationId: conversational_id,
    channel: channelType
  });

  // Publish to outbound queue (routes webchat to dedicated queue)
  // ✅ CRITICAL: Include isBotResponse in metadata so messageOutboundWorker can identify bot messages
  await publishOutboundMessage({
    messageId: newMessage._id.toString(),
    conversationId: conversational_id.toString(),
    contactId: conversation.contact.toString(),
    channelType: channelType,
    channelAccountId: conversation.channelAccount.toString(),
    content: { type: 'text', text: message },
    // ✅ Include emailData for email channel
    ...(channelType === 'email' && emailDataForMessage && {
      emailData: {
        subject: emailDataForMessage.subject || 'Re: Your inquiry',
        to: Array.isArray(emailDataForMessage.to) ? emailDataForMessage.to : [emailDataForMessage.to],
        from: emailDataForMessage.from,
      }
    }),
    metadata: {
      isBotResponse: true,
      sentBy: 'bot',
      source: 'ai_bot'
    },
    tenantId: tenantDB.name.replace(/^tenant_/, ''), // Remove tenant_ prefix
    userId: null
  });

  // Update conversation with last message
  await Conversation.findByIdAndUpdate(conversational_id, {
    lastMessage: newMessage._id,
    lastMessageContent: message.substring(0, 100),
    lastMessageType: 'text',
    lastMessageDirection: 'outbound',
    lastMessageAt: new Date(),
    status: 'active'
  });

  // Emit conversation update via SocketEmitter (uses static import)
  await SocketEmitter.emitConversationUpdate(
    conversational_id,
    {
      lastMessage: newMessage._id,
      lastMessageAt: new Date(),
      lastMessageContent: message.substring(0, 100),
      lastMessageType: 'text',
      lastMessageDirection: 'outbound',
    },
    tenantDB.name.replace(/^tenant_/, ''),
    conversation.department
  );

  // ✅ CRITICAL: Use emitNewMessage (same as manual messages) for consistent structure
  // ✅ Include sender information for bot messages - matching manual message flow
  const senderData = {
    _id: 'bot',
    firstName: 'AI',
    lastName: 'Bot',
    fullName: 'AI Bot',
    role: 'bot',
    avatar: null
  };

  const messageDataForEmission = {
    _id: newMessage._id,
    conversationId: conversational_id.toString(),
    contactId: conversation.contact.toString(),
    channelType: channelType,
    channel: channelType, // ✅ Include channel for client-side filtering (matching manual messages)
    content: message,
    type: 'text',
    direction: 'outbound',
    status: 'pending', // Will be updated to 'sent' by messageOutboundWorker
    createdAt: newMessage.createdAt,
    sender: senderData, // ✅ Include sender information for bot messages (matching manual messages)
    // ✅ Include email data for email messages
    ...(channelType === 'email' && emailDataForMessage && {
      emailData: {
        subject: emailDataForMessage.subject || 'Re: Your inquiry',
        to: Array.isArray(emailDataForMessage.to) ? emailDataForMessage.to : [emailDataForMessage.to],
        from: emailDataForMessage.from,
      }
    }),
    metadata: {
      isBotResponse: true,
      sentBy: 'bot',
      source: 'ai_bot'
    }
  };

  // ✅ For WebChat, include 'to' field with webchat identifier for proper namespace emission
  if (channelType === 'webchat' && contact.identifiers?.webchatId) {
    messageDataForEmission.to = contact.identifiers.webchatId;
    messageDataForEmission.contact = {
      _id: contact._id.toString(),
      identifiers: {
        webchat: contact.identifiers.webchatId
      }
    };
  }

  // Bug 9: Look up grouped conversations for company admin unified view (was passing null)
  const tenantId = tenantDB.name.replace(/^tenant_/, '');
  let allGroupedConversationIds = null;
  if (conversation.contact && conversation.channel) {
    const allDeptConvs = await Conversation.find({
      contact: conversation.contact,
      channel: channelType,
      status: { $in: ['active', 'open', 'pending'] },
      primaryConversation: { $exists: false }
    }).select('_id').lean();
    if (allDeptConvs.length > 1) {
      allGroupedConversationIds = allDeptConvs.map(c => c._id);
    }
  }

  // ✅ Use emitNewMessage (same method as manual messages) for consistent real-time updates
  await SocketEmitter.emitNewMessage(
    conversational_id,
    messageDataForEmission,
    tenantId,
    conversation.department,
    allGroupedConversationIds
  );

  console.log('✅ Bot message sent and emitted:', { messageId: newMessage._id });

  // Note: Conversation stays in auto mode after bot message.
  // The external AI explicitly triggers 'move_to_manual' queue action when human intervention is needed.

  return { messageId: newMessage._id.toString(), channel: channelType };
}

/**
 * Check and process pending queue items for a specific tenant
 * Called immediately after bot API response to process newly created queue items
 * Optimized for INSTANT processing with zero delay
 */
export async function checkTenantQueue(tenantId) {
  try {
    const cleanTenantId = tenantId.replace(/^tenant_/, '');
    const tenantDB = await getTenantDB(cleanTenantId);
    const Queue = tenantDB.models.Queue || tenantDB.model('Queue', QueueSchema);

    // Use lean() and limit for fastest query
    const pendingItems = await Queue.find({ 
      status: 'pending'
    })
      .sort({ created_at: 1 })
      .limit(50) // Increased limit for batch processing
      .lean();

    if (pendingItems.length > 0) {
      console.log(`⚡ Instant processing ${pendingItems.length} bot queue items`);

      // Bug 11: Process in batches of 10 to avoid overwhelming DB and RabbitMQ
      const BATCH_SIZE = 10;
      for (let i = 0; i < pendingItems.length; i += BATCH_SIZE) {
        const batch = pendingItems.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (item) => {
            // ✅ Atomically claim the item — only succeeds if status is still 'pending'
            // This prevents race conditions with monitorPendingQueues
            const claimed = await Queue.findOneAndUpdate(
              { _id: item._id, status: 'pending' },
              { status: 'processing', updated_at: new Date().toISOString() },
              { new: true }
            );

            if (!claimed) return; // Already claimed by monitor or another call

            // Then publish to RabbitMQ (non-blocking)
            await publishToQueue(QUEUES.BOT_QUEUE, {
              queueId: item._id.toString(),
              tenantId: cleanTenantId
            });
          })
        );
      }

      console.log(`✅ ${pendingItems.length} items queued for instant processing`);
    }

    return pendingItems.length;
  } catch (error) {
    console.error(`❌ Error checking queue for tenant ${tenantId}:`, error.message);
    return 0;
  }
}

/**
 * Ultra-fast monitor - runs every 2 seconds to catch any missed items
 * Silent operation - only logs when items are found
 * Optimized for minimal CPU and memory usage
 */
async function monitorPendingQueues() {
  try {
    const masterDB = await getMasterDB();
    const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
    // Bug 12: Only query companies with AI bot enabled to avoid scanning all tenant databases
    const companies = await Company.find({
      status: 'active',
      'features.aiBot.enabled': true
    }).select('tenantDatabaseName').lean();

    let totalPublished = 0;
    let totalReset = 0;
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    // Parallel tenant checking for faster processing
    await Promise.all(
      companies.map(async (company) => {
        if (!company.tenantDatabaseName) return;

        try {
          const tenantId = company.tenantDatabaseName.replace(/^tenant_/, '');
          const tenantDB = await getTenantDB(tenantId);
          const Queue = tenantDB.models.Queue || tenantDB.model('Queue', QueueSchema);

          // ✅ Reset stuck processing items (older than 2 minutes or never had updated_at set)
          const stuckItems = await Queue.find({
            status: 'processing',
            $or: [
              { updated_at: { $lt: twoMinutesAgo.toISOString() } },
              { updated_at: null },
              { updated_at: { $exists: false } }
            ]
          }).lean();

          if (stuckItems.length > 0) {
            await Promise.all(
              stuckItems.map(async (item) => {
                await Queue.findByIdAndUpdate(item._id, {
                  status: 'pending',
                  updated_at: new Date().toISOString()
                });
              })
            );
            totalReset += stuckItems.length;
          }

          // ✅ CRITICAL: Only process items that are truly "pending" (not already "processing")
          // This prevents re-queuing items that are already being processed by RabbitMQ
          const pendingItems = await Queue.find({
            status: 'pending'
          })
            .sort({ created_at: 1 })
            .limit(20)
            .lean();

          if (pendingItems.length > 0) {
            // ✅ Only log when we actually find NEW pending items (not already processing)
            console.log(`⚡ Monitor found ${pendingItems.length} NEW pending items - processing instantly`);

            // Bug 11: Process in batches of 10 to avoid overwhelming DB and RabbitMQ
            let claimedCount = 0;
            const BATCH_SIZE = 10;
            for (let i = 0; i < pendingItems.length; i += BATCH_SIZE) {
              const batch = pendingItems.slice(i, i + BATCH_SIZE);
              await Promise.all(
                batch.map(async (item) => {
                  // ✅ Atomically claim the item — only succeeds if status is still 'pending'
                  // This prevents race conditions with checkTenantQueue
                  const claimed = await Queue.findOneAndUpdate(
                    { _id: item._id, status: 'pending' },
                    { status: 'processing', updated_at: new Date().toISOString() },
                    { new: true }
                  );

                  if (!claimed) return; // Already claimed by checkTenantQueue or another monitor cycle

                  claimedCount++;
                  // Then publish to RabbitMQ (non-blocking)
                  await publishToQueue(QUEUES.BOT_QUEUE, {
                    queueId: item._id.toString(),
                    tenantId: tenantId
                  });
                })
              );
            }

            totalPublished += claimedCount;
          }
        } catch (error) {
          if (!error.message?.includes('does not exist')) {
            console.error(`❌ Monitor error for tenant:`, error.message);
          }
        }
      })
    );

    // ✅ Only log when there's actual activity to reduce log noise
    if (totalReset > 0) {
      console.log(`🔄 Monitor reset ${totalReset} stuck processing items back to pending`);
    }
    if (totalPublished > 0) {
      console.log(`✅ ${totalPublished} items queued for instant processing`);
    }
    // ✅ Don't log when no items found (reduces log spam)
  } catch (error) {
    console.error('❌ Monitor error:', error.message);
  }
}

/**
 * Start queue monitor
 */
export async function startQueueMonitor() {
  if (isQueueMonitorRunning) {
    console.log('⚠️ Queue monitor already running');
    return;
  }

  isQueueMonitorRunning = true;
  
  console.log('🚀 Starting ultra-fast queue monitor (instant processing mode)');
  
  // Run immediately on start
  await monitorPendingQueues();
  
  // Then monitor every 5 seconds (reduced frequency to prevent excessive processing)
  // Items are also processed instantly via checkTenantQueue() when bot creates them
  queueMonitorInterval = setInterval(async () => {
    await monitorPendingQueues();
  }, 5000); // 5 seconds - reduced from 2s to prevent excessive processing
  
  console.log('✅ Ultra-fast queue monitor started (checks every 5s)');
}

/**
 * Stop queue monitor
 */
export async function stopQueueMonitor() {
  if (queueMonitorInterval) {
    clearInterval(queueMonitorInterval);
    queueMonitorInterval = null;
  }
  isQueueMonitorRunning = false;
  console.log('✅ Queue monitor stopped');
}

/**
 * Create and start queue worker (RabbitMQ consumer)
 * Optimized for INSTANT processing with zero delay
 */
export async function createQueueWorker() {
  try {
    const { consumeFromQueue } = await import('../lib/queue/rabbitmq.js');
    
    const worker = await consumeFromQueue(
      QUEUES.BOT_QUEUE,
      async (jobData, msg) => {
        const startTime = Date.now();
        const { queueId, tenantId } = jobData || {};
        
        try {
          console.log(`📥 Received queue job:`, { queueId, tenantId });
          await processQueueItem(jobData);
          const processTime = Date.now() - startTime;
          console.log(`⚡ Queue item ${queueId} processed successfully in ${processTime}ms`);
        } catch (error) {
          console.error(`❌ Error processing queue job ${queueId}:`, {
            error: error.message,
            stack: error.stack,
            tenantId
          });
          throw error; // Re-throw for RabbitMQ retry
        }
      },
      {
        maxRetries: 3,
        requeue: true,
        prefetch: 50, // Process up to 50 messages simultaneously for instant performance
      }
    );

    console.log(`✅ Ultra-fast queue worker started for: ${QUEUES.BOT_QUEUE} (instant mode)`);

    // ✅ Reset stuck "processing" items on startup (items stuck for more than 2 minutes)
    try {
      await resetStuckProcessingItems();
    } catch (resetError) {
      console.error('⚠️ Failed to reset stuck processing items:', resetError.message);
    }

    // Graceful shutdown handlers
    const gracefulShutdown = async (signal) => {
      console.log(`${signal} received — shutting down queue worker gracefully...`);
      await stopQueueMonitor();
      // Allow in-flight processing to complete (5s grace period)
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log('Queue worker shutdown complete');
    };

    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.once('SIGINT', () => gracefulShutdown('SIGINT'));

    return worker;
  } catch (error) {
    console.error('❌ Failed to create queue worker:', error);
    throw error;
  }
}

/**
 * Reset items stuck in "processing" state (likely from previous crashes)
 */
async function resetStuckProcessingItems() {
  try {
    const masterDB = await getMasterDB();
    const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
    // Bug 12: Only query companies with AI bot enabled
    const companies = await Company.find({
      status: 'active',
      'features.aiBot.enabled': true
    }).select('tenantDatabaseName').lean();

    let totalReset = 0;
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    await Promise.all(
      companies.map(async (company) => {
        if (!company.tenantDatabaseName) return;

        try {
          const tenantId = company.tenantDatabaseName.replace(/^tenant_/, '');
          const tenantDB = await getTenantDB(tenantId);
          const Queue = tenantDB.models.Queue || tenantDB.model('Queue', QueueSchema);

          // Find items stuck in processing for more than 2 minutes or never had updated_at set
          const stuckItems = await Queue.find({
            status: 'processing',
            $or: [
              { updated_at: { $lt: twoMinutesAgo.toISOString() } },
              { updated_at: null },
              { updated_at: { $exists: false } }
            ]
          }).lean();

          if (stuckItems.length > 0) {
            console.log(`🔄 Resetting ${stuckItems.length} stuck processing items for tenant ${tenantId}`);
            
            await Promise.all(
              stuckItems.map(async (item) => {
                await Queue.findByIdAndUpdate(item._id, {
                  status: 'pending',
                  updated_at: new Date().toISOString()
                });
              })
            );
            
            totalReset += stuckItems.length;
          }
        } catch (error) {
          if (!error.message?.includes('does not exist')) {
            console.error(`❌ Error resetting stuck items for tenant:`, error.message);
          }
        }
      })
    );

    if (totalReset > 0) {
      console.log(`✅ Reset ${totalReset} stuck processing items back to pending`);
    }
  } catch (error) {
    console.error('❌ Error resetting stuck processing items:', error.message);
  }
}

/**
 * Cancel pending bot queue items for a conversation (when switching to manual mode)
 */
export async function cancelPendingBotQueue(tenantId, conversationId) {
  try {
    const cleanTenantId = tenantId.replace(/^tenant_/, '');
    const tenantDB = await getTenantDB(cleanTenantId);
    const Queue = tenantDB.models.Queue || tenantDB.model('Queue', QueueSchema);

    const result = await Queue.updateMany(
      {
        status: 'pending',
        'details': { $regex: `"conversational_id"\\s*:\\s*"${conversationId}"` }
      },
      {
        $set: {
          status: 'completed',
          result: JSON.stringify({ cancelled: true, reason: 'mode_switched_to_manual' }),
          completedBy: 'system',
          updated_at: new Date().toISOString()
        }
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`Cancelled ${result.modifiedCount} pending bot queue items for conversation ${conversationId}`);
    }

    return result.modifiedCount;
  } catch (error) {
    console.error(`❌ Error cancelling bot queue for conversation ${conversationId}:`, error.message);
    return 0;
  }
}

export default {
  createQueueWorker,
  startQueueMonitor,
  stopQueueMonitor,
  checkTenantQueue,
  cancelPendingBotQueue
};

