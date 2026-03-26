// // src/services/channels/whatsapp/WhatsAppValidationService.js
// import mongoose from 'mongoose';
// import MessageSchema from '@/models/schemas/Message';

// /**
//  * Validate WhatsApp 24-hour session window
//  * This validation is ONLY for WhatsApp channel
//  */
// export async function validateWhatsAppSession(conversation, content, tenantDB) {
//   // Get Message model from tenantDB
//   const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

//   // UPDATED: Check for template in both old and new structures
//   const isTemplateMessage = content.template !== undefined;

//   const lastInboundMessage = await Message.findOne({
//     conversation: conversation._id,
//     direction: 'inbound',
//   }).sort({ createdAt: -1 });

//   // If no inbound message exists, we need to check the conversation context
//   if (!lastInboundMessage) {
//     // Count total messages in conversation
//     const existingMessages = await Message.countDocuments({
//       conversation: conversation._id
//     });

//     // If this is the very first message in the conversation
//     if (existingMessages === 0) {
//       if (isTemplateMessage) {
//         return { valid: true }; // Template messages are allowed for first contact
//       } else {
//         return {
//           valid: false,
//           message: 'Cannot initiate conversation with free-form message. Use a template message for the first contact.',
//           requiresTemplate: true,
//         };
//       }
//     }

//     // If there are existing messages but no inbound messages
//     if (isTemplateMessage) {
//       return { valid: true }; // Template messages are allowed
//     } else {
//       return {
//         valid: false,
//         message: 'Cannot send message - no active session. Use a template message.',
//         requiresTemplate: true,
//       };
//     }
//   }

//   // Calculate hours since last inbound message
//   const hoursSinceLastMessage = 
//     (Date.now() - lastInboundMessage.createdAt.getTime()) / (1000 * 60 * 60);

//   // Check if 24-hour window has expired
//   if (hoursSinceLastMessage > 24) {
//     if (isTemplateMessage) {
//       return { valid: true }; // Template messages are allowed after 24 hours
//     } else {
//       return {
//         valid: false,
//         message: '24-hour session expired. Use a template message.',
//         requiresTemplate: true,
//       };
//     }
//   }

//   // Within 24-hour window, all message types are allowed
//   return { valid: true };
// }

// /**
//  * Check if WhatsApp session is active (within 24 hours)
//  */
// export async function isWhatsAppSessionActive(conversationId, tenantDB) {
//   const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

//   const lastInboundMessage = await Message.findOne({
//     conversation: conversationId,
//     direction: 'inbound',
//   }).sort({ createdAt: -1 });

//   if (!lastInboundMessage) {
//     return false;
//   }

//   const hoursSinceLastMessage = 
//     (Date.now() - lastInboundMessage.createdAt.getTime()) / (1000 * 60 * 60);

//   return hoursSinceLastMessage <= 24;
// }

// /**
//  * Get WhatsApp session expiry time
//  */
// export async function getWhatsAppSessionExpiry(conversationId, tenantDB) {
//   const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

//   const lastInboundMessage = await Message.findOne({
//     conversation: conversationId,
//     direction: 'inbound',
//   }).sort({ createdAt: -1 });

//   if (!lastInboundMessage) {
//     return null;
//   }

//   const expiryTime = new Date(lastInboundMessage.createdAt.getTime() + (24 * 60 * 60 * 1000));
//   return expiryTime;
// }










// src/services/channel/whatsapp/WhatsAppValidationService.js
import { getTenantDB } from '@/config/database';
import ConversationSchema from '@/models/schemas/Conversation';
import MessageSchema from '@/models/schemas/Message';
import mongoose from 'mongoose';

/**
 * Validate WhatsApp session and message requirements
 * @param {Object} conversation - The conversation object
 * @param {Object} content - The message content
 * @param {Object} tenantDB - The tenant database connection
 * @param {String} channelAccountId - The specific channel account ID being used to send the message
 */
export async function validateWhatsAppSession(conversation, content, tenantDB, channelAccountId = null) {
  try {
    console.log('🔍 Validating WhatsApp session:', {
      conversationId: conversation._id,
      channelAccountId,
      contentType: content.type,
      templateName: content.templateName
    });

    // Load models safely
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    // Check if this is a template message
    const isTemplateMessage = content.type === 'template' && content.templateName;
    
    if (isTemplateMessage) {
      console.log('✅ Valid template message detected:', content.templateName);
      return {
        valid: true,
        message: 'Valid template message',
        requiresTemplate: false
      };
    }

    // For non-template messages, check if we have an active session for this specific account
    // ✅ CRITICAL: For merged conversations, check ALL merged conversation IDs
    const hasActiveSession = await checkActiveWhatsAppSession(conversation, tenantDB, channelAccountId);
    
    if (hasActiveSession) {
      console.log('✅ Active WhatsApp session found for account:', channelAccountId);
      return {
        valid: true,
        message: 'Active session found',
        requiresTemplate: false
      };
    }

    // No active session and not a template message - require template
    console.log('❌ No active session for account and not a template message:', channelAccountId);
    return {
      valid: false,
      message: 'Cannot send message - no active session for this account. Use a template message.',
      requiresTemplate: true
    };

  } catch (error) {
    console.error('❌ WhatsApp validation error:', error);
    // In case of error, be permissive to avoid blocking messages
    return {
      valid: true,
      message: 'Validation skipped due to error',
      requiresTemplate: false
    };
  }
}

/**
 * Check if there's an active WhatsApp session (24-hour window) for a specific account
 * @param {Object|String} conversation - The conversation object (with isMerged and mergedConversations) or conversation ID
 * @param {Object} tenantDB - The tenant database connection
 * @param {String} channelAccountId - The specific channel account ID to check session for
 */
async function checkActiveWhatsAppSession(conversation, tenantDB, channelAccountId = null) {
  try {
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    
    // ✅ Handle both conversation object and conversation ID string
    let conversationId;
    let isMerged = false;
    let mergedConversationIds = [];
    
    if (typeof conversation === 'string' || conversation instanceof mongoose.Types.ObjectId) {
      // If it's just an ID, fetch the conversation to check if it's merged
      const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
      const conv = await Conversation.findById(conversation)
        .select('isMerged mergedConversations')
        .lean();
      
      conversationId = conversation;
      if (conv) {
        isMerged = conv.isMerged || false;
        mergedConversationIds = (conv.mergedConversations || []).map(mc => mc.conversationId).filter(Boolean);
      }
    } else {
      // It's a conversation object
      conversationId = conversation._id || conversation.id;
      isMerged = conversation.isMerged || false;
      mergedConversationIds = (conversation.mergedConversations || []).map(mc => 
        mc.conversationId || mc
      ).filter(Boolean);
      
      // ✅ Log conversation object structure for debugging
      console.log('🔍 Conversation object in validation:', {
        hasAllDepartmentConversationIds: !!conversation._allDepartmentConversationIds,
        allDepartmentConversationIds: conversation._allDepartmentConversationIds,
        hasContact: !!conversation.contact,
        hasChannel: !!conversation.channel,
        contactId: conversation.contact?._id?.toString() || conversation.contact?.toString() || conversation.contact,
        channel: conversation.channel
      });
    }
    
    // ✅ Build list of conversation IDs to search (primary + all merged if merged)
    // ✅ CRITICAL: For company admins, also check _allDepartmentConversationIds (unified view)
    const conversationIdsToSearch = [conversationId];
    
    // ✅ CRITICAL: Check if conversation has _allDepartmentConversationIds (company admin unified view)
    // This must be checked BEFORE we potentially fetch the conversation again
    let allGroupedConversationIds = null;
    if (conversation && typeof conversation === 'object' && conversation._allDepartmentConversationIds && Array.isArray(conversation._allDepartmentConversationIds)) {
      allGroupedConversationIds = conversation._allDepartmentConversationIds;
      console.log('✅ Found _allDepartmentConversationIds in conversation object:', allGroupedConversationIds.map(id => id.toString()));
    }
    
    // ✅ If we fetched the conversation again (because it was a string/ObjectId), we lost _allDepartmentConversationIds
    // In that case, we need to find all grouped conversations ourselves
    // ✅ CRITICAL: Also check if conversation object has contact and channel but _allDepartmentConversationIds is missing
    if (!allGroupedConversationIds && typeof conversation === 'object') {
      try {
        const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
        
        // ✅ Extract contact ID - handle both populated and unpopulated cases
        let contactId = null;
        if (conversation.contact) {
          if (typeof conversation.contact === 'string' || conversation.contact instanceof mongoose.Types.ObjectId) {
            contactId = conversation.contact.toString();
          } else if (conversation.contact._id) {
            contactId = conversation.contact._id.toString();
          } else if (conversation.contact.toString) {
            contactId = conversation.contact.toString();
          }
        }
        
        const channel = conversation.channel;
        
        console.log('🔍 Attempting to find grouped conversations:', {
          hasContact: !!conversation.contact,
          contactId,
          channel,
          conversationId: conversationId.toString()
        });
        
        if (contactId && channel) {
          const allDepartmentConversations = await Conversation.find({
            contact: contactId,
            channel: channel,
            status: { $in: ['active', 'open', 'pending'] },
            primaryConversation: { $exists: false }
          })
            .select('_id')
            .lean();
          
          console.log('🔍 Found department conversations:', {
            count: allDepartmentConversations.length,
            conversationIds: allDepartmentConversations.map(c => c._id.toString())
          });
          
          if (allDepartmentConversations.length > 1) {
            allGroupedConversationIds = allDepartmentConversations.map(c => c._id);
            console.log('✅ Found grouped conversations by querying:', allGroupedConversationIds.map(id => id.toString()));
          }
        }
      } catch (error) {
        console.error('❌ Error finding grouped conversations:', error);
      }
    }
    
    // ✅ Add all grouped conversation IDs to search list
    if (allGroupedConversationIds && Array.isArray(allGroupedConversationIds)) {
      allGroupedConversationIds.forEach(deptConvId => {
        const idStr = deptConvId.toString();
        const primaryStr = conversationId.toString();
        if (idStr !== primaryStr && !conversationIdsToSearch.some(cid => cid.toString() === idStr)) {
          conversationIdsToSearch.push(deptConvId);
        }
      });
    }
    
    if (isMerged && mergedConversationIds.length > 0) {
      // Add all merged conversation IDs
      mergedConversationIds.forEach(mergedId => {
        const idStr = mergedId.toString();
        const primaryStr = conversationId.toString();
        if (idStr !== primaryStr && !conversationIdsToSearch.some(cid => cid.toString() === idStr)) {
          conversationIdsToSearch.push(mergedId);
        }
      });
    }
    
    // Convert to ObjectIds for query
    const conversationObjectIds = conversationIdsToSearch.map(id => 
      mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
    );
    
    // Build query to find the last inbound message from the specific account
    // ✅ CRITICAL: Search across ALL conversation IDs (primary + merged)
    // ✅ CRITICAL: Don't filter by status - inbound messages can have various statuses (pending, received, delivered, read, sent)
    // We only care that it's an inbound message, not its status
    let query = {
      conversation: { $in: conversationObjectIds },
      direction: 'inbound'
      // ✅ Removed status filter - inbound messages can have any status (pending, received, delivered, read, sent, etc.)
    };

    // ✅ CRITICAL: Filter by channelAccount if provided
    // This ensures we check for inbound messages from the specific account being used to send
    let channelAccountFilter = null;
    if (channelAccountId) {
      // ✅ Handle both string and ObjectId formats
      // Mongoose will auto-convert, but we ensure it's a valid ObjectId
      if (mongoose.Types.ObjectId.isValid(channelAccountId)) {
        channelAccountFilter = new mongoose.Types.ObjectId(channelAccountId);
      } else {
        // If not a valid ObjectId, try as string (shouldn't happen, but be safe)
        channelAccountFilter = channelAccountId;
      }
      query.channelAccount = channelAccountFilter;
    }
    
    console.log('🔍 Searching for inbound messages:', {
      conversationIds: conversationIdsToSearch.map(id => id.toString()),
      channelAccountId,
      channelAccountFilter: channelAccountFilter?.toString(),
      isMerged,
      mergedCount: mergedConversationIds.length,
      groupedCount: allGroupedConversationIds ? allGroupedConversationIds.length : 0,
      totalConversationsToSearch: conversationIdsToSearch.length,
      queryFilter: {
        conversationCount: conversationObjectIds.length,
        hasChannelAccountFilter: !!query.channelAccount,
        direction: query.direction
      }
    });
    
    // ✅ First try: Find inbound message with specific account filter
    let lastInboundMessage = await Message.findOne(query).sort({ createdAt: -1 });
    
    // ✅ Fallback: If no message found with account filter, try without account filter
    // This handles cases where inbound messages might not have channelAccount set correctly
    if (!lastInboundMessage && channelAccountId) {
      console.log('🔍 No inbound message found with account filter, trying without account filter...');
      const fallbackQuery = {
        conversation: { $in: conversationObjectIds },
        direction: 'inbound'
        // ✅ No channelAccount filter - find any inbound message in this conversation
      };
      
      lastInboundMessage = await Message.findOne(fallbackQuery).sort({ createdAt: -1 });
      
      if (lastInboundMessage) {
        console.log('✅ Found inbound message without account filter:', {
          messageId: lastInboundMessage._id,
          channelAccount: lastInboundMessage.channelAccount,
          createdAt: lastInboundMessage.createdAt,
          messageAccountId: lastInboundMessage.channelAccount?.toString(),
          requestedAccountId: channelAccountId.toString()
        });
      }
    }

    if (!lastInboundMessage) {
      // ✅ CRITICAL: For grouped conversations, if no inbound message found for specific account,
      // check if ANY grouped conversation has inbound messages (to any account)
      // This allows sending if any account in the grouped conversations has an active session
      if (conversationIdsToSearch.length > 1 && channelAccountId) {
        console.log('🔍 No inbound messages found for specific account, checking all grouped conversations for any inbound messages...');
        const fallbackQuery = {
          conversation: { $in: conversationObjectIds },
          direction: 'inbound'
          // ✅ Don't filter by channelAccount or status - check for ANY inbound message in grouped conversations
        };
        
        const anyInboundMessage = await Message.findOne(fallbackQuery).sort({ createdAt: -1 });
        
        if (anyInboundMessage) {
          // Check if it's within 24 hours
          const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const isWithin24Hours = anyInboundMessage.createdAt > twentyFourHoursAgo;
          
          console.log('✅ Found inbound message in grouped conversation (different account):', {
            messageId: anyInboundMessage._id,
            channelAccount: anyInboundMessage.channelAccount,
            createdAt: anyInboundMessage.createdAt,
            isWithin24Hours,
            hoursSince: (Date.now() - anyInboundMessage.createdAt.getTime()) / (1000 * 60 * 60)
          });
          
          // ✅ For grouped conversations, if ANY account has an active session, allow sending
          // This is more permissive for company admins viewing unified conversations
          return isWithin24Hours;
        }
      }
      
      const searchContext = conversationIdsToSearch.length > 1 
        ? `(searched ${conversationIdsToSearch.length} conversations)` 
        : '';
      console.log('📭 No inbound messages found in conversation', channelAccountId ? `for account ${channelAccountId}` : '', searchContext);
      return false;
    }

    // Check if the last inbound message is within 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const isWithin24Hours = lastInboundMessage.createdAt > twentyFourHoursAgo;

    console.log('⏰ Session time check:', {
      channelAccountId,
      lastMessage: lastInboundMessage.createdAt,
      lastMessageAccount: lastInboundMessage.channelAccount,
      cutoff: twentyFourHoursAgo,
      isWithin24Hours,
      hoursSinceLastMessage: (Date.now() - lastInboundMessage.createdAt.getTime()) / (1000 * 60 * 60)
    });

    return isWithin24Hours;

  } catch (error) {
    console.error('❌ Error checking WhatsApp session:', error);
    return false;
  }
}

/**
 * Check if conversation can receive free-form messages for a specific account
 * @param {Object|String} conversation - The conversation object or conversation ID
 * @param {Object} tenantDB - The tenant database connection
 * @param {String} channelAccountId - The specific channel account ID to check session for
 */
export async function canSendFreeFormMessage(conversation, tenantDB, channelAccountId = null) {
  try {
    const hasActiveSession = await checkActiveWhatsAppSession(conversation, tenantDB, channelAccountId);
    return hasActiveSession;
  } catch (error) {
    console.error('❌ Error checking free-form message eligibility:', error);
    return false;
  }
}

/**
 * Get template requirements for a conversation and specific account
 * @param {Object|String} conversation - The conversation object or conversation ID
 * @param {Object} tenantDB - The tenant database connection
 * @param {String} channelAccountId - The specific channel account ID to check session for
 */
export async function getTemplateRequirements(conversation, tenantDB, channelAccountId = null) {
  try {
    const canSendFreeForm = await canSendFreeFormMessage(conversation, tenantDB, channelAccountId);
    
    return {
      requiresTemplate: !canSendFreeForm,
      canSendFreeForm,
      message: canSendFreeForm 
        ? 'Can send free-form messages (active session)' 
        : 'Template message required (no active session)'
    };
  } catch (error) {
    console.error('❌ Error getting template requirements:', error);
    return {
      requiresTemplate: true,
      canSendFreeForm: false,
      message: 'Error checking requirements - defaulting to template requirement'
    };
  }
}