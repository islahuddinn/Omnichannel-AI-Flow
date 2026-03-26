// src/workers/conversationModeWorker.js
/**
 * Conversation Mode Worker
 * Handles automatic switching of conversations from manual to auto mode
 * after 2 minutes of inactivity (no inbound or outbound messages)
 * 
 * IMPORTANT: Only switches to auto mode if:
 * 1. Conversation is in manual mode
 * 2. Conversation has a department
 * 3. Department's AI bot is enabled
 * 4. lastMessageAt is more than 2 minutes old (2 minutes of inactivity)
 * 
 * Uses RabbitMQ delayed messages for efficient, zero-load processing
 */

import { getTenantDB } from '../config/database.js';
import ConversationSchema from '../models/schemas/Conversation.js';
import DepartmentSchema from '../models/schemas/Department.js';
import SocketEmitter from '../services/socket/SocketEmitter.js';
import { consumeFromQueue, QUEUES } from '../lib/queue/rabbitmq.js';
// getConversationContext import removed — transitional message is sent directly via BotService

let isConsuming = false;
let consumerTag = null;
let periodicCheckInterval = null; // Bug 9: Store interval ID for cleanup

/**
 * Process conversation mode check
 * Checks if conversation should switch from manual to auto mode
 */
async function processConversationModeCheck(messageData, msg) {
  const { conversationId, tenantId, scheduledAt, checkAfterTime } = messageData;

  if (!conversationId || !tenantId) {
    console.error('❌ Missing required fields in conversation mode check:', { conversationId, tenantId });
    // Note: Message acknowledgment is handled automatically by consumeFromQueue
    return;
  }

  try {
    const tenantDB = await getTenantDB(tenantId);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);

    // Get conversation with current mode and department
    const conversation = await Conversation.findById(conversationId)
      .select('mode status contact channel channelAccount department lastMessageAt updatedAt primaryConversation')
      .lean();

    if (!conversation) {
      console.log(`ℹ️ Conversation ${conversationId} not found, skipping mode check`);
      // Note: Message acknowledgment is handled automatically by consumeFromQueue
      return;
    }

    // Only process if conversation is still in manual mode
    if (conversation.mode !== 'manual') {
      console.log(`ℹ️ Conversation ${conversationId} is not in manual mode (current: ${conversation.mode}), skipping mode check`);
      // Note: Message acknowledgment is handled automatically by consumeFromQueue
      return;
    }

    // ✅ Skip secondary (merged) conversations — their mode is controlled by primary propagation
    if (conversation.primaryConversation) {
      console.log(`ℹ️ Conversation ${conversationId} is a secondary (merged into ${conversation.primaryConversation}), skipping mode check`);
      return;
    }

    // Only process active conversations
    if (!['active', 'pending', 'open'].includes(conversation.status)) {
      console.log(`ℹ️ Conversation ${conversationId} is not active (status: ${conversation.status}), skipping mode check`);
      // Note: Message acknowledgment is handled automatically by consumeFromQueue
      return;
    }

    // ✅ CRITICAL: Check if department's AI bot is enabled before switching to auto mode
    if (!conversation.department) {
      console.log(`ℹ️ Conversation ${conversationId} has no department, skipping mode check`);
      // Note: Message acknowledgment is handled automatically by consumeFromQueue
      return;
    }

    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    const department = await Department.findById(conversation.department)
      .select('aiBotEnabled name')
      .lean();

    if (!department || !department.aiBotEnabled) {
      console.log(`ℹ️ Conversation ${conversationId} department (${department?.name || 'unknown'}) has AI bot disabled, skipping mode check`);
      // Note: Message acknowledgment is handled automatically by consumeFromQueue
      return;
    }

    // ✅ CRITICAL: Check if lastMessageAt is more than 2 minutes old
    // This ensures that as long as messages are being exchanged (even over hours),
    // the conversation stays in manual mode
    // Only after 2 minutes of complete inactivity will it switch to auto mode
    if (!conversation.lastMessageAt) {
      console.log(`ℹ️ Conversation ${conversationId} has no lastMessageAt, skipping mode check`);
      // Note: Message acknowledgment is handled automatically by consumeFromQueue
      return;
    }

    const lastMessageTime = new Date(conversation.lastMessageAt).getTime();
    const updatedAtTime = conversation.updatedAt ? new Date(conversation.updatedAt).getTime() : 0;
    const now = Date.now();
    const twoMinutesInMs = 2 * 60 * 1000; // 2 minutes in milliseconds

    // Use the LATER of lastMessageAt and updatedAt (mode switch time)
    // This prevents immediate switch-back when agent toggles to manual
    // but the last message was already older than 2 minutes
    const latestActivityTime = Math.max(lastMessageTime, updatedAtTime);
    const timeSinceLastActivity = now - latestActivityTime;

    // If last activity was less than 2 minutes ago, don't switch
    if (timeSinceLastActivity < twoMinutesInMs) {
      const secondsSinceActivity = Math.floor(timeSinceLastActivity / 1000);
      console.log(`ℹ️ Conversation ${conversationId} still active (last activity ${secondsSinceActivity}s ago, need 120s), skipping mode check`);
      return;
    }

    // ✅ No recent messages - switch to auto mode

    // Update conversation mode
    await Conversation.findByIdAndUpdate(
      conversationId,
      { $set: { mode: 'auto', updatedAt: new Date() } },
      { new: true }
    );

    // ✅ Propagate mode change to all merged conversations
    try {
      const { propagateModeToMergedConversations } = await import('../services/conversation/MergeService.js');
      await propagateModeToMergedConversations(tenantId, conversationId, 'auto');
    } catch (err) {
      console.error('⚠️ Failed to propagate mode to merged conversations:', err);
    }

    // Get all grouped conversations for company admin view
    let allGroupedConversationIds = null;
    if (conversation.contact && conversation.channel) {
      const contactId = conversation.contact?.toString() || conversation.contact;
      const channel = conversation.channel;
      
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

    // Emit socket event for real-time mode change
    await SocketEmitter.emitConversationUpdate(
      conversationId,
      { mode: 'auto' },
      tenantId,
      conversation.department?.toString() || null,
      allGroupedConversationIds
    );

    console.log(`✅ Auto-switched conversation ${conversationId} from manual to auto mode (2min inactivity)`);

    // ✅ Send transitional message to customer so they know AI is now handling the conversation
    try {
      const { default: BotService } = await import('../services/bot/BotService.js');
      const contactId = conversation.contact?.toString() || conversation.contact;
      const channelAccountId = conversation.channelAccount?.toString() || conversation.channelAccount;

      if (contactId && channelAccountId) {
        await BotService.sendBotResponse({
          tenantId,
          conversationId: conversationId.toString(),
          contactId,
          channelType: conversation.channel,
          channelAccountId,
          botResponse: 'Our AI assistant has picked up this conversation to help you faster. Ask your question, or request a human agent if you prefer.',
          tenantDB,
          skipModeCheck: true,
        });
        console.log(`✅ Transitional message sent to conversation ${conversationId}`);
      }
    } catch (msgErr) {
      // Non-critical — don't fail the mode switch if message fails
      console.warn(`⚠️ Failed to send transitional message for ${conversationId}:`, msgErr.message);
    }

    // Note: getConversationContext removed — only the transitional message above is sent to the customer
    
    // Note: Message acknowledgment is handled automatically by consumeFromQueue
  } catch (error) {
    console.error(`❌ Error processing conversation mode check for ${conversationId}:`, error);
    // Don't requeue - if there's an error, we'll schedule a new check on next message
    // Note: Message acknowledgment is handled automatically by consumeFromQueue
    // Since maxRetries is 0, the message will be acknowledged even on error
    // Re-throw to let consumeFromQueue handle error acknowledgment properly  ..
    throw error;
  }
}

/**
 * Schedule mode checks for existing manual conversations that need checking
 * This finds all manual mode conversations that haven't had messages in 2+ minutes
 * and schedules immediate checks for them
 */
async function scheduleExistingManualConversations(isPeriodicCheck = false) {
  try {
    if (!isPeriodicCheck) {
    console.log('🔍 Checking for existing manual conversations that need mode checks...');
    }
    
    // Get all tenant databases (we need to check all tenants)
    // Get all companies from the master database
    const { getMasterDB } = await import('../config/database.js');
    const masterDB = await getMasterDB();
    const Company = masterDB.models.Company || masterDB.model('Company', (await import('../models/schemas/Company.js')).default);
    
    const companies = await Company.find({}).select('_id').lean();
    if (!isPeriodicCheck) {
    console.log(`📊 Found ${companies.length} companies to check for manual conversations`);
    }
    
    let totalScheduled = 0;
    
    for (const company of companies) {
      try {
        const tenantId = company._id.toString();
        const tenantDB = await getTenantDB(tenantId);
        const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
        const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
        
        // Calculate 2 minutes ago
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        
        // Find all manual mode conversations that:
        // 1. Are in manual mode
        // 2. Are active/pending/open
        // 3. Have a department
        // 4. Haven't had messages OR mode changes in the last 2+ minutes
        const manualConversations = await Conversation.find({
          mode: 'manual',
          status: { $in: ['active', 'pending', 'open'] },
          department: { $exists: true, $ne: null },
          lastMessageAt: { $lt: twoMinutesAgo },
          updatedAt: { $lt: twoMinutesAgo }, // Also check updatedAt to prevent instant switch-back after manual toggle
          primaryConversation: { $exists: false }
        })
          .select('_id department lastMessageAt updatedAt')
          .lean();
        
        if (manualConversations.length === 0) {
          continue;
        }
        
        // Get all departments with AI bot enabled
        const departmentsWithBot = await Department.find({
          aiBotEnabled: true
        })
          .select('_id')
          .lean();
        
        const departmentIdsWithBot = new Set(departmentsWithBot.map(d => d._id.toString()));
        
        // Schedule checks only for conversations with departments that have AI bot enabled
        const { scheduleConversationModeCheck } = await import('../services/conversation/ConversationModeScheduler.js');
        
        for (const conv of manualConversations) {
          const departmentId = conv.department?.toString();
          if (departmentId && departmentIdsWithBot.has(departmentId)) {
            // Schedule immediate check (0 delay since it's already been 2+ minutes)
            await scheduleConversationModeCheck(conv._id.toString(), tenantId, 0);
            totalScheduled++;
          }
        }
        
        if (manualConversations.length > 0 && !isPeriodicCheck) {
          console.log(`📅 Scheduled ${manualConversations.filter(c => departmentIdsWithBot.has(c.department?.toString())).length} mode checks for tenant ${tenantId}`);
        }
      } catch (error) {
        console.error(`❌ Error processing company ${company._id} for mode checks:`, error);
        // Continue with next company
      }
    }
    
    if (totalScheduled > 0 || !isPeriodicCheck) {
    console.log(`✅ Scheduled ${totalScheduled} mode checks for existing manual conversations`);
    }
  } catch (error) {
    console.error('❌ Error scheduling existing manual conversations:', error);
    // Don't throw - this is a background task
  }
}

/**
 * Start consuming conversation mode check messages
 */
export async function startConversationModeWorker() {
  if (isConsuming) {
    console.log('⚠️ Conversation mode worker already consuming');
    return;
  }

  try {
    console.log('🔄 Starting conversation mode worker...');
    
    consumerTag = await consumeFromQueue(
      QUEUES.CONVERSATION_MODE_CHECK,
      processConversationModeCheck,
      {
        maxRetries: 0, // Don't retry - we'll schedule new checks on next message
        prefetch: 10, // Process up to 10 checks concurrently
      }
    );

    isConsuming = true;
    console.log('✅ Conversation mode worker started successfully');
    
    // ✅ Schedule checks for existing manual conversations that need checking
    // Run this asynchronously after a short delay to not block startup
    setTimeout(() => {
      scheduleExistingManualConversations().catch(err => {
        console.error('❌ Error in background task for existing conversations:', err);
      });
    }, 5000); // Wait 5 seconds after startup to let everything initialize
    
    // Bug 9: Store interval ID so it can be cleared on stop
    periodicCheckInterval = setInterval(() => {
      scheduleExistingManualConversations(true).catch(err => {
        if (err.message && !err.message.includes('not found')) {
          console.error('❌ Error in periodic conversation mode check:', err.message);
        }
      });
    }, 60000);
    
  } catch (error) {
    console.error('❌ Failed to start conversation mode worker:', error);
    isConsuming = false;
    throw error;
  }
}

/**
 * Stop consuming conversation mode check messages
 */
export async function stopConversationModeWorker() {
  // Bug 9: Clear periodic check interval
  if (periodicCheckInterval) {
    clearInterval(periodicCheckInterval);
    periodicCheckInterval = null;
  }

  if (!isConsuming || !consumerTag) {
    return;
  }

  try {
    console.log('🛑 Stopping conversation mode worker...');
    // Bug 7: Use the cancel() method from the consumer object (not channel.cancel with wrong type)
    // Bug 8: No need to import getChannel - consumerTag already has a cancel() method
    if (consumerTag && typeof consumerTag.cancel === 'function') {
      await consumerTag.cancel();
    }
    consumerTag = null;
    isConsuming = false;
    console.log('✅ Conversation mode worker stopped');
  } catch (error) {
    console.error('❌ Error stopping conversation mode worker:', error);
  }
}
