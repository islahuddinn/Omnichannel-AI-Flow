// src/workers/messageOutboundWorker.js
/**
 * ✅ RabbitMQ Message Outbound Worker
 * Processes outbound messages for all channels (WhatsApp, Email, SMS, etc.)
 */

import { consumeFromQueue, publishOutboundMessage, QUEUES } from '../lib/queue/rabbitmq.js';
import ChannelServiceFactory from '../services/channel/ChannelServiceFactory.js';
import { getTenantDB } from '../config/database.js';
import MessageSchema from '../models/schemas/Message.js';
import CompanyAccountSchema from '../models/schemas/CompanyAccount.js';
import ContactSchema from '../models/schemas/Contact.js';
import ConversationSchema from '../models/schemas/Conversation.js';
import TemplateSchema from '../models/schemas/Template.js';
import UserSchema from '../models/schemas/User.js';
import SocketEmitter from '../services/socket/SocketEmitter.js';
import MessageLogService from '../services/message/MessageLogService.js';

let consumer = null;
let webchatConsumer = null;
let isWorkerInitialized = false;

/**
 * Get contact identifier for channel
 */
function getContactIdentifier(contact, channelType) {
  // ✅ WhatsApp: Use WhatsApp identifier or phone
  if (channelType === 'whatsapp') {
    return contact.identifiers?.whatsapp || contact.phone || null;
  }
  
  // ✅ SMS: Use SMS identifier or phone
  if (channelType === 'sms') {
    return contact.identifiers?.sms || contact.phone || null;
  }
  
  // ✅ Facebook: Use Facebook identifier
  if (channelType === 'facebook') {
    return contact.identifiers?.facebook || null;
  }
  
  // ✅ Instagram: Use Instagram identifier
  if (channelType === 'instagram') {
    return contact.identifiers?.instagram || null;
  }
  
  // ✅ WebChat: Use webchat identifier or sessionId
  if (channelType === 'webchat') {
    return contact.identifiers?.webchat || contact.sessionId || null;
  }
  
  // ✅ Email: Use email identifier or email field
  if (channelType === 'email') {
    return contact.identifiers?.email || contact.email || null;
  }
  
  return null;
}

/**
 * Process outbound message from RabbitMQ
 */
async function processOutboundMessage(messageData, msg) {
  const {
    messageId,
    conversationId,
    contactId,
    channelType,
    channelAccountId,
    content,
    attachments = [],
    metadata,
    tenantId,
    userId,
    replyToId,
    forwardedFromId,
    emailData, // ✅ Email-specific data (subject, cc, bcc, etc.)
  } = messageData;

  console.log(`🚀 Processing message from RabbitMQ:`, {
    messageId,
    channelType,
    tenantId,
    hasAttachments: attachments.length > 0,
    attachmentTypes: attachments.map(a => a.type),
    hasEmailData: !!emailData,
    emailSubject: emailData?.subject,
  });
  
  // Note: Attachments will be fetched from message document if not in payload

  let message = null;
  let contact = null;
  let channelAccount = null;
  let identifier = null;

  try {
    // ✅ Use isolated per-tenant DB connection
    const tenantDB = await getTenantDB(tenantId);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);
    const User = tenantDB.models.User || tenantDB.model('User', UserSchema);

    // ✅ Helper function to safely get metadata value (handles both Map and plain object)
    // This is needed because Mongoose Maps need to be accessed with .get() method
    const getMetadataValue = (msg, key) => {
      // Check queue metadata first (plain object)
      if (metadata && typeof metadata === 'object' && !(metadata instanceof Map) && metadata[key] !== undefined) {
        return metadata[key];
      }
      // Check message metadata (could be Map or plain object)
      if (msg.metadata) {
        if (msg.metadata instanceof Map) {
          return msg.metadata.get(key);
        } else if (typeof msg.metadata === 'object' && msg.metadata[key] !== undefined) {
          return msg.metadata[key];
        }
      }
      return undefined;
    };

    // ✅ Fetch message - try multiple times with exponential backoff in case of timing issues
    // ✅ CRITICAL: Select attachments field to ensure voice messages have their attachments
    let attempts = 0;
    const maxAttempts = 5;
    while (attempts < maxAttempts && !message) {
      message = await Message.findById(messageId).select('+attachments');
      if (!message && attempts < maxAttempts - 1) {
        // ✅ Exponential backoff: 200ms, 400ms, 800ms, 1600ms
        const delay = 200 * Math.pow(2, attempts);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempts++;
      } else {
        break;
      }
    }
    
    if (!message) {
      const error = new Error(`Message ${messageId} not found in database after ${maxAttempts} attempts`);
      console.error('❌ Message not found:', {
        messageId,
        tenantId,
        channelType,
        conversationId,
        attempts: maxAttempts
      });

      // ✅ Don't log missing messages - they shouldn't exist in the first place
      // ✅ Don't throw error for missing messages - just log and skip
      // This prevents infinite requeuing of messages that don't exist
      console.warn('⚠️ Skipping message processing - message not found in database');
      return; // ✅ Exit early without throwing to prevent requeuing
    }

    // ✅ CRITICAL: Skip messages that are already sent/delivered/failed/read
    // This prevents duplicate sends when messages are redelivered by RabbitMQ
    if (['sent', 'delivered', 'read', 'failed'].includes(message.status)) {
      console.log(`⚠️ Skipping message ${messageId} - already in terminal status: ${message.status}`);
      return; // ✅ Exit early - message already processed
    }
    
    // ✅ CRITICAL: Use attachments from the message document, not from RabbitMQ payload
    // This ensures voice messages have their attachments properly included
    const messageAttachments = message.attachments || attachments || [];
    if (messageAttachments.length > 0 && (!attachments || attachments.length === 0)) {
      console.log('✅ Using attachments from message document:', {
        messageId: message._id.toString(),
        attachmentCount: messageAttachments.length,
        attachmentTypes: messageAttachments.map(a => a.type || a.mimeType)
      });
    }

    // ✅ Fetch channel account
    channelAccount = await CompanyAccount.findById(channelAccountId).lean();
    if (!channelAccount) {
      throw new Error(`Channel account ${channelAccountId} not found`);
    }

    // ✅ CRITICAL: Validate that channel account type matches channel type
    // For merged conversations, the channelAccountId might be from a different channel
    // If types don't match, find the correct channel account for this channel
    if (channelAccount.type !== channelType) {
      const oldAccountType = channelAccount.type;
      console.warn(`⚠️ Channel account type mismatch: account type is ${oldAccountType}, but sending via ${channelType}. Finding correct account...`);
      
      // Try to get the conversation to find the correct channel account
      const conversationForAccount = await Conversation.findById(conversationId)
        .select('channelAccount mergedConversations isMerged channel')
        .lean();
      
      let correctAccount = null;
      
      // For merged conversations, check mergedConversations for the correct channel account
      if (conversationForAccount?.isMerged && conversationForAccount?.mergedConversations) {
        const mergedConv = conversationForAccount.mergedConversations.find(
          mc => mc.channel === channelType
        );
        if (mergedConv?.channelAccount) {
          correctAccount = await CompanyAccount.findById(mergedConv.channelAccount).lean();
          if (correctAccount && correctAccount.type === channelType) {
            console.log(`✅ Found correct ${channelType} account from merged conversation:`, correctAccount._id);
          } else {
            correctAccount = null;
          }
        }
      }
      
      // If not found in merged conversations, try to find any active account of the correct type
      if (!correctAccount) {
        correctAccount = await CompanyAccount.findOne({
          type: channelType,
          companyId: channelAccount.companyId,
          $or: [
            { isActive: true },
            { status: 'active' }
          ]
        }).lean();
        
        if (correctAccount) {
          console.log(`✅ Found active ${channelType} account:`, correctAccount._id);
        }
      }
      
      if (correctAccount && correctAccount.type === channelType) {
        // Convert lean object to model instance for compatibility
        channelAccount = await CompanyAccount.findById(correctAccount._id);
        console.log(`✅ Using correct ${channelType} account: ${channelAccount._id} (was using ${channelAccountId} which is ${oldAccountType})`);
      } else {
        throw new Error(
          `Channel account type mismatch: account ${channelAccountId} is type ${oldAccountType}, but message is for ${channelType}. ` +
          `Please ensure the correct channel account is selected for ${channelType}.`
        );
      }
    }

    // ✅ Fetch contact
    contact = await Contact.findById(contactId).lean();
    if (!contact) {
      throw new Error(`Contact ${contactId} not found`);
    }

    console.log('👤 Contact Details:', {
      contactId: contact._id,
      name: contact.name,
      phone: contact.phone,
      identifiers: contact.identifiers,
      channelType: contact.channelType
    });

    // ✅ Get identifier for channel
    identifier = getContactIdentifier(contact, channelType);
    
    if (!identifier) {
      throw new Error(
        `Contact ${contactId} (${contact.name || 'Unnamed'}) has no identifier for channel ${channelType}`
      );
    }

    console.log(`📤 Sending message via ${channelType} to ${identifier}`, {
      accountId: channelAccount._id,
      accountName: channelAccount.name,
      contactName: contact.name,
      messageType: content?.type || message.type,
      attachmentCount: messageAttachments.length,
      hasAttachmentsInMessage: messageAttachments.length > 0,
      hasAttachmentsInPayload: attachments.length > 0
    });

    // ✅ Update message status to sending
    await Message.findByIdAndUpdate(messageId, {
      status: 'sending',
      $set: {
        'metadata.sendingStartedAt': new Date(),
        'metadata.deliveryDetails': {
          targetPhone: identifier,
          channelAccount: channelAccount.name,
        },
      },
    });

    // ✅ Note: Tracking pixel lookup is now handled via database queries (no Redis needed)

    // ✅ Get conversation to extract departmentId for department-based segregation
    const conversation = await Conversation.findById(conversationId).select('department').lean();
    const deptId = conversation?.department || null;
    
    // ✅ Emit sending status via Socket.IO
    await SocketEmitter.emitMessageStatus(conversationId, messageId, 'sending', tenantId, {
      startedAt: new Date(),
    }, deptId);

    // ✅ CRITICAL: For WhatsApp replies, convert replyToId to providerMessageId
    // WhatsApp API requires the provider message ID (whatsappMessageId) in the context field
    let replyToMessageId = null;
    if (message.replyTo && channelType === 'whatsapp') {
      try {
        const replyToMessage = await Message.findById(message.replyTo)
          .select('providerMessageId whatsappMessageId externalId')
          .lean();
        
        if (replyToMessage) {
          // Use providerMessageId, whatsappMessageId, or externalId (in that order)
          replyToMessageId = replyToMessage.providerMessageId || 
                            replyToMessage.whatsappMessageId || 
                            replyToMessage.externalId;
          
          if (replyToMessageId) {
            console.log('✅ Found WhatsApp provider message ID for reply:', {
              replyToId: message.replyTo.toString(),
              providerMessageId: replyToMessageId
            });
          } else {
            console.warn('⚠️ Reply message found but no provider message ID available:', {
              replyToId: message.replyTo.toString()
            });
          }
        } else {
          console.warn('⚠️ Reply message not found:', message.replyTo);
        }
      } catch (error) {
        console.error('❌ Error fetching reply message:', error);
      }
    }

    // ✅ Fetch replyTo message if it exists (for WebChat and other channels)
    // This must be done BEFORE creating messageDataForAdapter
    let replyToData = null;
    if (message.replyTo) {
      try {
        const replyToMessage = await Message.findById(message.replyTo).select('content type attachments').lean();
        if (replyToMessage) {
          replyToData = {
            _id: message.replyTo,
            content: replyToMessage.content,
            type: replyToMessage.type,
            attachments: replyToMessage.attachments || [],
          };
        }
      } catch (error) {
        console.error('❌ Error fetching replyTo message:', error);
      }
    }

    // ✅ Normalize template content for SMS and WebChat (providers don't support structured templates)
    const normalizeTemplateContent = () => {
      if ((channelType === 'sms' || channelType === 'webchat') && content?.type === 'template') {
        const templateText = content.text ||
          content.renderedText ||
          metadata?.renderedText ||
          metadata?.templateBody ||
          content.body ||
          content.templateName || // Fallback to template name if no body available
          '';

        return {
          normalizedContent: {
            ...content,
            type: 'text',
            text: templateText,
            renderedText: templateText,
          },
          originalTemplate: { ...content, renderedText: templateText },
        };
      }
      return { normalizedContent: content, originalTemplate: null };
    };

    const { normalizedContent, originalTemplate } = normalizeTemplateContent();

    // ✅ Prepare message data for channel adapter
    const messageDataForAdapter = {
      to: identifier,
      content: normalizedContent,
      replyTo: replyToData, // ✅ CRITICAL: Include replyTo data for WebChat and other channels
      metadata: {
        ...metadata,
        conversationId: conversationId.toString(),
        messageId: messageId.toString(),
        tenantId,
        userId,
        ...(originalTemplate && {
          originalContent: originalTemplate,
          renderedText: normalizedContent?.text,
          templateBody: originalTemplate.body || metadata?.templateBody,
        }),
        // ✅ CRITICAL: Add replyToMessageId for WhatsApp replies
        ...(replyToMessageId && { replyToMessageId }),
        // ✅ CRITICAL: For WebChat, include agent info for proper sender display
        ...(channelType === 'webchat' && {
          agentName: metadata.agentName || 'Support Agent',
          agentAvatar: metadata.agentAvatar,
        }),
      },
    };

    // ✅ Add email-specific data if email channel
    if (channelType === 'email' && emailData) {
      // ✅ Validate CC/BCC email addresses before sending
      const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const validateEmails = (emails, field) => {
        if (!emails || !Array.isArray(emails)) return [];
        const valid = [];
        for (const email of emails) {
          const addr = typeof email === 'string' ? email.trim() : email?.address?.trim();
          if (addr && EMAIL_REGEX.test(addr)) {
            valid.push(email);
          } else if (addr) {
            console.warn(`⚠️ Skipping invalid ${field} email: ${addr}`);
          }
        }
        return valid;
      };

      emailData.cc = validateEmails(emailData.cc, 'CC');
      emailData.bcc = validateEmails(emailData.bcc, 'BCC');

      messageDataForAdapter.emailData = emailData;
    }

    // ✅ CRITICAL: Use attachments from message document (for voice messages) or from payload
    // Voice messages store attachments in the message document, not always in the queue payload
    const effectiveAttachments = messageAttachments.length > 0 ? messageAttachments : (attachments || []);
    if (effectiveAttachments && effectiveAttachments.length > 0) {
      messageDataForAdapter.attachments = effectiveAttachments;
      console.log('✅ Including attachments in message data:', {
        count: effectiveAttachments.length,
        types: effectiveAttachments.map(a => a.type || a.mimeType),
        hasUrls: effectiveAttachments.every(a => a.url || a.path || a.fileUrl)
      });
    }

    // ✅ Send message via ChannelServiceFactory
    const result = await ChannelServiceFactory.sendMessage(
      channelType,
      channelAccount,
      messageDataForAdapter,
      {
        emitStatus: false, // We'll emit manually
        conversationId: conversationId.toString(),
        tenantId,
      }
    );

    // ✅ Determine status based on channel and result
    // For email: If SMTP accepted the message, mark as "delivered" (double gray ticks)
    // For other channels: Mark as "sent" (single gray tick)
    let messageStatus = 'sent';
    if (channelType === 'email' && result.emailResponse) {
      // ✅ Email: If accepted by SMTP server, mark as delivered (internet is on, message delivered)
      if (result.emailResponse.accepted && result.emailResponse.accepted.length > 0) {
        messageStatus = 'delivered'; // Double gray ticks
      }
    }

    // ✅ Update message with provider response
    const providerMsgId = result.messageId || result.channelMessageId;
    const updateData = {
      status: messageStatus,
      sentAt: new Date(),
      ...(messageStatus === 'delivered' && { deliveredAt: new Date() }),
      providerMessageId: providerMsgId,
      // ✅ CRITICAL: Also store whatsappMessageId for WhatsApp messages (needed for reply context lookup)
      ...(channelType === 'whatsapp' && providerMsgId && { whatsappMessageId: providerMsgId }),
      $set: {
        'metadata.providerResponse': result,
        'metadata.sentAt': new Date(),
        'metadata.channelMessageId': result.channelMessageId,
      },
    };

    // ✅ Add email-specific response data
    if (channelType === 'email' && result.emailResponse) {
      updateData.$set['metadata.emailResponse'] = result.emailResponse;
    }

    await Message.findByIdAndUpdate(messageId, updateData);

      // ✅ Get message content for conversation update
      // ✅ For WhatsApp templates, show only template name (not "[Template: name]")
      let messageContent;
      if (normalizedContent?.type === 'template' && channelType === 'whatsapp') {
        messageContent = normalizedContent.templateName || 'Template';
      } else {
        messageContent = normalizedContent?.text || normalizedContent?.media?.caption || 
        (normalizedContent?.template ? `[Template: ${normalizedContent.templateName}]` : '[Message]');
      }
      const messageType = normalizedContent?.type || 'text';

    // ✅ Check if this is a manual message sent in auto mode conversation
    // If so, switch conversation to manual mode when message is successfully sent
    // First, check current conversation mode
    const currentConversation = await Conversation.findById(conversationId).select('mode').lean();
    const isAutoMode = currentConversation?.mode === 'auto';
    
    // ✅ Check if this is a manual message (has sender, not bot response)
    const hasSender = !!message.sender;
    const isBotMessage = getMetadataValue(message, 'isBotResponse') === true;
    const sentAfterBot = getMetadataValue(message, 'sentAfterBotMessage') === true;
    // ✅ Message is successfully sent if status is sent, delivered, or read
    const isSuccessfulStatus = ['sent', 'delivered', 'read'].includes(messageStatus);
    
    // ✅ Switch to manual mode if:
    // 1. Conversation is in auto mode
    // 2. Message has a sender (manual message)
    // 3. Message is not a bot message
    // 4. Message was successfully sent
    // 5. Message was sent after bot message (indicates user typed message in auto mode)
    const shouldSwitchToManual = isAutoMode && 
                                 hasSender && 
                                 !isBotMessage && 
                                 sentAfterBot && 
                                 isSuccessfulStatus;
    
    // ✅ Convert metadata to plain object for logging (if it's a Map)
    const metadataForLog = message.metadata instanceof Map 
      ? Object.fromEntries(message.metadata) 
      : message.metadata;
    
    console.log('🔍 Checking if should switch to manual mode:', {
      conversationId: conversationId.toString(),
      currentMode: currentConversation?.mode,
      isAutoMode,
      hasSender,
      isBotMessage,
      sentAfterBot,
      messageStatus,
      isSuccessfulStatus,
      shouldSwitch: shouldSwitchToManual,
      messageMetadata: metadataForLog,
      queueMetadata: metadata,
      messageSender: message.sender,
      isBotResponseValue: getMetadataValue(message, 'isBotResponse'),
      sentAfterBotMessageValue: getMetadataValue(message, 'sentAfterBotMessage')
    });
    
    let conversationUpdateData = {
      lastMessage: messageId,
      lastMessageAt: new Date(),
      lastMessageContent: messageContent,
      lastMessageType: messageType,
      lastMessageDirection: 'outbound',
      updatedAt: new Date(),
      $inc: { messageCount: 1 }, // ✅ Increment message count
    };

    // ✅ Switch to manual mode if this is a manual message in auto mode
    if (shouldSwitchToManual) {
      conversationUpdateData.mode = 'manual';
      console.log(`🔄 Switching conversation ${conversationId} to manual mode after user message sent successfully`);
    }

    // ✅ Update conversation with last message (and mode if needed)
    const updatedConversation = await Conversation.findByIdAndUpdate(conversationId, conversationUpdateData, { new: true })
      .select('department messageCount contact channel mode')
      .lean();

    // ✅ Propagate mode change to all merged conversations (so bot doesn't respond on secondary channels)
    if (shouldSwitchToManual && updatedConversation?.mode === 'manual') {
      try {
        const { propagateModeToMergedConversations } = await import('../services/conversation/MergeService.js');
        await propagateModeToMergedConversations(tenantId, conversationId, 'manual');
      } catch (err) {
        console.error('⚠️ Failed to propagate mode to merged conversations:', err);
      }
    }

    // ✅ Reuse departmentId from above (already extracted at line 203)
    // Department doesn't change, so we can reuse the existing deptId

    // ✅ Prepare conversation update data
    const conversationUpdatePayload = {
      lastMessage: messageId,
      lastMessageAt: new Date(),
      lastMessageContent: messageContent,
      lastMessageType: messageType,
      lastMessageDirection: 'outbound',
      messageCount: updatedConversation?.messageCount || 0,
    };

    // ✅ CRITICAL: Always include mode if it was changed (for real-time updates)
    // Double-check the updated conversation to ensure mode was actually changed
    if (shouldSwitchToManual) {
      // Verify the mode was actually updated in the database
      if (updatedConversation?.mode === 'manual') {
        conversationUpdatePayload.mode = 'manual';
        console.log(`✅ Mode change included in socket emission: ${conversationId} -> manual`);
      } else {
        console.warn(`⚠️ Mode change expected but not found in updated conversation:`, {
          conversationId: conversationId.toString(),
          expectedMode: 'manual',
          actualMode: updatedConversation?.mode,
          shouldSwitchToManual
        });
        // Force include mode anyway if we detected it should be manual
        conversationUpdatePayload.mode = 'manual';
        console.log(`✅ Force including mode change in socket emission: ${conversationId} -> manual`);
      }
    }

    // ✅ Get all grouped conversations for company admin view
    let allGroupedConversationIds = null;
    if (updatedConversation?.contact && updatedConversation?.channel) {
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

    // ✅ Emit conversation update (last message, message count, and mode if changed)
    await SocketEmitter.emitConversationUpdate(
      conversationId, 
      conversationUpdatePayload, 
      tenantId, 
      deptId, 
      allGroupedConversationIds
    );

    // ✅ Schedule conversation mode check if conversation is in manual mode
    // This will check after 2 minutes if there are no new messages and switch to auto mode
    if (updatedConversation?.mode === 'manual') {
      try {
        const { scheduleConversationModeCheck } = await import('../services/conversation/ConversationModeScheduler.js');
        await scheduleConversationModeCheck(conversationId, tenantId);
        console.log(`📅 Scheduled conversation mode check for ${conversationId} (manual mode, message sent successfully)`);
      } catch (error) {
        console.error('❌ Failed to schedule conversation mode check:', error);
        // Don't throw - this is a non-critical operation
      }
    }

    // ✅ Note: replyToData is already fetched above (before messageDataForAdapter creation)
    // Reuse it here for messageDataForEmission
    
    // ✅ Emit new message event (for real-time message display)
    // ✅ CRITICAL: For WebChat, include the 'to' field with webchat identifier
    // ✅ Extract tempId from metadata for optimistic message matching on the frontend
    const emissionTempId = metadata?.tempId ||
      (message.metadata instanceof Map ? message.metadata.get('tempId') : message.metadata?.tempId);

    const messageDataForEmission = {
      _id: messageId,
      conversationId: conversationId.toString(),
      contactId: contactId.toString(), // ✅ Include contactId (matching manual messages)
      channelType: channelType, // ✅ Include channelType (matching manual messages)
      channel: channelType,
      channelAccount: {
        _id: channelAccount._id.toString(),
        type: channelAccount.type,
        name: channelAccount.name,
      },
      content: messageContent,
      type: messageType,
      // ✅ Include templateName for template messages (all channels, not just WhatsApp)
      ...(content?.type === 'template' && {
        templateName: content.templateName || normalizedContent?.templateName ||
          (message.metadata instanceof Map ? message.metadata.get('templateName') : message.metadata?.templateName),
      }),
      // ✅ CRITICAL: Include metadata with tempId so frontend can match optimistic messages
      ...(emissionTempId && {
        metadata: {
          tempId: emissionTempId,
          ...(content?.type === 'template' && {
            templateName: content.templateName,
          }),
        },
        tempId: emissionTempId, // Also include at top level for easier matching
      }),
      direction: 'outbound',
      status: 'sent',
      // ✅ CRITICAL: Use attachments from message document (for voice messages)
      attachments: effectiveAttachments || messageAttachments || attachments || [],
      providerMessageId: result.messageId || result.channelMessageId,
      createdAt: message.createdAt || new Date(),
      sentAt: new Date(),
      replyTo: replyToData,
      // ✅ Include email data for email messages (matching manual messages)
      // ✅ CRITICAL: Use emailData from queue payload first, then fallback to message document
      // This ensures bot messages have emailData even if there's a timing issue with database save
      ...(channelType === 'email' && (emailData || message.emailData) && {
        emailData: emailData || message.emailData
      }),
    };
    
    // ✅ Log attachment info for debugging
    const finalAttachments = effectiveAttachments || messageAttachments || attachments || [];
    if (finalAttachments.length > 0) {
      console.log('✅ Emitting message with attachments:', {
        messageId: messageId.toString(),
        attachmentCount: finalAttachments.length,
        attachmentTypes: finalAttachments.map(a => a.type || a.mimeType || 'unknown'),
        hasUrls: finalAttachments.every(a => a.url || a.path || a.fileUrl)
      });
    } else if (message.type === 'audio') {
      console.warn('⚠️ Audio message has no attachments in emission:', {
        messageId: messageId.toString(),
        messageType: message.type,
        effectiveAttachmentsCount: effectiveAttachments?.length || 0,
        messageAttachmentsCount: messageAttachments?.length || 0,
        payloadAttachmentsCount: attachments?.length || 0
      });
    }
    
    // ✅ CRITICAL: For WebChat, include 'to' field with webchat identifier for proper namespace emission
    if (channelType === 'webchat' && identifier) {
      messageDataForEmission.to = identifier;
      messageDataForEmission.contact = {
        _id: contact._id.toString(),
        identifiers: {
          webchat: identifier
        }
      };
    }
    
    // ✅ CRITICAL: Populate sender information from masterDB before emission
    // For bot messages, set sender as "AI Bot"
    // ✅ Check both message document metadata AND queue payload metadata
    const isBotResponse = getMetadataValue(message, 'isBotResponse') || false;
    
    console.log('🔍 Checking bot message:', {
      messageId: messageId.toString(),
      isBotResponse,
      messageMetadata: message.metadata?.isBotResponse,
      queueMetadata: metadata?.isBotResponse,
      channelType
    });
    
    let senderData = null;
    if (isBotResponse) {
      // Bot messages: Set sender as "AI Bot"
      senderData = {
        _id: 'bot',
        firstName: 'AI',
        lastName: 'Bot',
        fullName: 'AI Bot',
        role: 'bot',
        avatar: null
      };
      messageDataForEmission.sender = senderData;
      // ✅ Initialize metadata if not present, then merge all sources
      messageDataForEmission.metadata = {
        ...(messageDataForEmission.metadata || {}),
        ...(message.metadata || {}),
        ...(metadata || {}), // ✅ Include metadata from queue payload
        isBotResponse: true // ✅ Ensure isBotResponse is always set for bot messages
      };
      console.log('✅ Bot message sender set:', { senderData, messageId: messageId.toString() });
    } else if (message.sender) {
      try {
        const { getMasterDB } = await import('../config/database.js');
        const masterDB = await getMasterDB();
        const UserSchema = (await import('../models/schemas/User.js')).default;
        const User = masterDB.models.User || masterDB.model('User', UserSchema);
        const sender = await User.findById(message.sender).select('firstName lastName avatar role').lean();
        if (sender) {
          senderData = {
            _id: sender._id.toString(),
            firstName: sender.firstName,
            lastName: sender.lastName,
            avatar: sender.avatar,
            role: sender.role
          };
          messageDataForEmission.sender = senderData;
        }
      } catch (error) {
        console.error('❌ Failed to populate sender for real-time emission:', error);
      }
    }
    
    // ✅ Reuse departmentId from above (already extracted from updatedConversation)
    await SocketEmitter.emitNewMessage(conversationId, messageDataForEmission, tenantId, deptId, null);

    // ✅ Emit status update via Socket.IO (sent or delivered based on channel)
    // ✅ CRITICAL: Ensure messageId is string for consistent matching
    await SocketEmitter.emitMessageStatus(
      conversationId.toString(), 
      messageId.toString(), 
      messageStatus, 
      tenantId, 
      {
        providerMessageId: result.messageId || result.channelMessageId,
        sentAt: new Date(),
        ...(messageStatus === 'delivered' && { deliveredAt: new Date() }),
      },
      deptId
    );

    // ✅ Log successful message send
    await MessageLogService.logMessageSent(tenantId, message, {
      channelType,
      channelAccountId: channelAccountId.toString(),
      providerMessageId: result.messageId || result.channelMessageId,
      success: true,
    });

    console.log(`✅ Message sent successfully: ${messageId} → ${result.messageId || result.channelMessageId}`);
    
    return {
      success: true,
      messageId: messageId.toString(),
      providerMessageId: result.messageId || result.channelMessageId,
      channelMessageId: result.channelMessageId,
    };

  } catch (error) {
    console.error(`Message send failed: ${messageId}`, error.message);

    // Extract error details for storage and display
    // ✅ Generate user-friendly error message for email failures
    let userMessage = error.userMessage || error.message;
    if (channelType === 'email' && !error.userMessage) {
      const msg = error.message || '';
      if (msg.includes('EAUTH') || msg.includes('Invalid login') || msg.includes('535')) {
        userMessage = 'Email authentication failed. Please check your email account credentials.';
      } else if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT')) {
        userMessage = 'Could not connect to email server. Please check SMTP settings.';
      } else if (msg.includes('CERT') || msg.includes('certificate') || msg.includes('TLS')) {
        userMessage = 'Email server TLS/SSL error. Please check your security settings.';
      } else if (msg.includes('550') || msg.includes('rejected') || msg.includes('Recipient')) {
        userMessage = 'Email was rejected by the recipient server. The email address may be invalid.';
      } else if (msg.includes('452') || msg.includes('quota') || msg.includes('storage')) {
        userMessage = 'Recipient mailbox is full. Email could not be delivered.';
      } else if (msg.includes('421') || msg.includes('rate') || msg.includes('too many')) {
        userMessage = 'Email sending rate limit exceeded. Please try again later.';
      }
    }

    const errorDetails = {
      message: userMessage,
      code: error.code,
      metaErrorCode: error.metaErrorCode || null,
      category: error.category || 'unknown',
      retryable: error.retryable ?? false,
      details: error.details || null,
    };

    // Determine if this is a permanent failure or a transient one that will be retried
    const permanentCategories = ['validation', 'recipient', 'template', 'auth', 'policy', 'billing', 'account', 'tls', 'session'];
    const isPermanent = error.retryable === false || permanentCategories.includes(errorDetails.category);
    const isRetryable = !isPermanent && (errorDetails.category === 'rate_limit' || errorDetails.category === 'network' || errorDetails.category === 'system' || errorDetails.category === 'media');

    // Set status: 'failed' for permanent errors, 'retrying' for transient ones
    const messageStatus = isRetryable ? 'retrying' : 'failed';

    // User-friendly messages for retrying status
    if (isRetryable) {
      if (errorDetails.category === 'rate_limit') {
        errorDetails.message = `Rate limit reached — message will be retried automatically. ${errorDetails.message}`;
      } else if (errorDetails.category === 'network') {
        errorDetails.message = `Network issue — message will be retried automatically. ${errorDetails.message}`;
      } else {
        errorDetails.message = `Temporary issue — message will be retried automatically. ${errorDetails.message}`;
      }
    }

    try {
      const tenantDB = await getTenantDB(tenantId);
      const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

      await Message.findByIdAndUpdate(messageId, {
        status: messageStatus,
        ...(isPermanent && { failedAt: new Date() }),
        errorMessage: errorDetails.message,
        $set: {
          'metadata.error': errorDetails.message,
          'metadata.errorCode': errorDetails.code,
          'metadata.metaErrorCode': errorDetails.metaErrorCode,
          'metadata.errorCategory': errorDetails.category,
          'metadata.errorRetryable': isRetryable,
          'metadata.failedAt': isPermanent ? new Date() : null,
        },
      });

      // Emit status to frontend
      try {
        const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
        const failedConversation = await Conversation.findById(conversationId).select('department').lean();
        const failedDeptId = failedConversation?.department || null;

        await SocketEmitter.emitMessageStatus(conversationId, messageId, messageStatus, tenantId, {
          error: errorDetails.message,
          errorCode: errorDetails.code,
          metaErrorCode: errorDetails.metaErrorCode,
          errorCategory: errorDetails.category,
          retryable: isRetryable,
          ...(isPermanent && { failedAt: new Date() }),
        }, failedDeptId);
      } catch (emitError) {
        console.error('Failed to emit status:', emitError.message);
      }

      // Log the failure
      if (message) {
        try {
          await MessageLogService.logMessageFailed(tenantId, message, {
            message: errorDetails.message,
            code: errorDetails.code,
            metaErrorCode: errorDetails.metaErrorCode,
            category: errorDetails.category,
            channelType,
            channelAccountId: channelAccountId?.toString(),
            conversationId,
            retryable: isRetryable,
          });
        } catch (logError) {
          console.error('Failed to log message failure:', logError.message);
        }
      }
    } catch (updateError) {
      console.error('Failed to update message status:', updateError.message);
    }

    if (isPermanent) {
      error.retryable = false;
    }
    throw error;
  }
}

/**
 * ✅ Sweep for messages stuck in 'pending' or 'sending' status and re-queue them
 * This recovers messages that were lost due to consumer channel closure, process restart, etc.
 */
async function sweepStuckMessages() {
  try {
    const { publishToQueue } = await import('../lib/queue/rabbitmq.js');
    const mongoose = (await import('mongoose')).default;

    // Get tenant IDs from mongoose's tracked databases (set by getTenantDB)
    const usedDatabases = mongoose.connection?._usedDatabases;
    if (!usedDatabases || usedDatabases.size === 0) {
      return; // No tenants have been accessed yet
    }

    // Extract tenant IDs from database names (format: "tenant_<tenantId>")
    const tenantIds = Array.from(usedDatabases)
      .filter(db => db.startsWith('tenant_'))
      .map(db => db.replace('tenant_', ''));

    if (tenantIds.length === 0) return;

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    let totalRequeued = 0;

    for (const tenantId of tenantIds) {
      try {
        const tenantDB = await getTenantDB(tenantId);
        const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
        const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);

        // Find messages stuck in 'pending' or 'retrying' for more than 5 minutes
        const stuckMessages = await Message.find({
          status: { $in: ['pending', 'retrying'] },
          direction: 'outbound',
          createdAt: { $lt: fiveMinutesAgo },
          // Don't re-queue messages that were already swept recently
          'metadata.lastSweptAt': { $not: { $gt: fiveMinutesAgo } },
        }).limit(20).lean();

        for (const msg of stuckMessages) {
          try {
            const conversation = await Conversation.findById(msg.conversation || msg.conversationId).select('channel channelAccount contact').lean();
            if (!conversation) continue;

            const queueData = {
              messageId: msg._id.toString(),
              conversationId: (msg.conversation || msg.conversationId).toString(),
              contactId: (msg.contact || conversation.contact)?.toString(),
              channelType: msg.channel || conversation.channel,
              channelAccountId: (msg.channelAccount || conversation.channelAccount)?.toString(),
              content: { type: msg.type || 'text', text: msg.content },
              ...(msg.emailData && { emailData: typeof msg.emailData.toObject === 'function' ? msg.emailData.toObject() : msg.emailData }),
              metadata: typeof msg.metadata === 'object' && !(msg.metadata instanceof Map)
                ? msg.metadata
                : (msg.metadata instanceof Map ? Object.fromEntries(msg.metadata) : {}),
              tenantId,
              userId: msg.sender?.toString(),
            };

            // Mark message as swept so it's not re-queued again in the next sweep cycle
            await Message.findByIdAndUpdate(msg._id, {
              $set: { 'metadata.lastSweptAt': new Date() },
            });

            await publishOutboundMessage(queueData);
            totalRequeued++;
            console.log(`[Sweep] Re-queued stuck message ${msg._id} (pending since ${msg.createdAt})`);
          } catch (requeueErr) {
            console.error(`[Sweep] Failed to re-queue message ${msg._id}:`, requeueErr.message);
          }
        }
      } catch (tenantErr) {
        // Skip this tenant on error
      }
    }

    if (totalRequeued > 0) {
      console.log(`[Sweep] ✅ Re-queued ${totalRequeued} stuck messages`);
    }
  } catch (error) {
    console.error('[Sweep] Error during pending message sweep:', error.message);
  }
}

/**
 * Start message outbound worker
 */
export async function startMessageOutboundWorker() {
  // ✅ CRITICAL: Prevent multiple initializations
  if (isWorkerInitialized && consumer) {
    // ✅ Verify the existing consumer's channel is still active
    if (consumer.channel && consumer.channel.connection) {
      console.log('✅ Message outbound worker already initialized, reusing existing instance');
      return consumer;
    }
    // Channel is dead - reinitialize
    console.warn('⚠️ Message outbound worker channel is dead, reinitializing...');
    isWorkerInitialized = false;
    consumer = null;
  }

  try {
    console.log('📤 Starting Message Outbound Worker (RabbitMQ)...');

    // ✅ Initialize RabbitMQ connection
    const { initRabbitMQ } = await import('../lib/queue/rabbitmq.js');
    await initRabbitMQ();

    // ✅ Start consuming messages
    consumer = await consumeFromQueue(
      QUEUES.MESSAGE_OUTBOUND,
      processOutboundMessage,
      {
        requeue: true,
        maxRetries: 5,
        prefetch: 1, // Process one message at a time to prevent "held" message pattern
                     // Each message is acked before the next is delivered
      }
    );

    if (!consumer || !consumer.consumerTag) {
      throw new Error('Failed to start consumer - no consumer tag returned');
    }

    // ✅ Start dedicated webchat consumer with higher prefetch (webchat is instant, no SMTP bottleneck)
    try {
      webchatConsumer = await consumeFromQueue(
        QUEUES.MESSAGE_OUTBOUND_WEBCHAT,
        processOutboundMessage,
        {
          requeue: true,
          maxRetries: 3,
          prefetch: 5, // WebChat is instant delivery via Socket.IO, can handle concurrent messages
        }
      );
      console.log('🚀 WebChat outbound consumer started:', QUEUES.MESSAGE_OUTBOUND_WEBCHAT);
    } catch (webchatErr) {
      console.warn('⚠️ Failed to start webchat consumer (will fall back to main queue):', webchatErr.message);
    }

    console.log('🚀 Message outbound worker started and listening on RabbitMQ queue:', QUEUES.MESSAGE_OUTBOUND);
    console.log(`   - Consumer tag: ${consumer.consumerTag}`);
    console.log(`   - Queue: ${QUEUES.MESSAGE_OUTBOUND}`);
    console.log(`   - WebChat queue: ${QUEUES.MESSAGE_OUTBOUND_WEBCHAT} (dedicated)`);
    console.log(`   - Status: ACTIVE and ready to process messages`);
    console.log(`   - Worker will process: WhatsApp, Email, SMS, Facebook, Instagram, WebChat`);

    // ✅ Verify consumer is actually active by checking channel
    if (consumer.channel) {
      console.log(`   - Channel status: ${consumer.channel.connection ? 'CONNECTED' : 'DISCONNECTED'}`);
    }

    isWorkerInitialized = true;

    // ✅ Sweep for stuck pending messages after worker starts (non-blocking)
    setTimeout(() => {
      sweepStuckMessages().catch(err => {
        console.error('[Sweep] Startup sweep failed:', err.message);
      });
    }, 10000); // Wait 10 seconds after startup before sweeping

    // ✅ Run periodic sweep every 3 minutes to catch any stuck messages
    setInterval(() => {
      sweepStuckMessages().catch(err => {
        console.error('[Sweep] Periodic sweep failed:', err.message);
      });
    }, 5 * 60 * 1000); // Sweep every 5 minutes for truly stuck messages

    return consumer;
  } catch (error) {
    console.error('❌ Failed to start message worker:', error);
    isWorkerInitialized = false;
    throw error;
  }
}

/**
 * Stop message outbound worker
 */
export async function stopMessageOutboundWorker() {
  if (consumer) {
    try {
      // ✅ Cancel consumer (handles closed channels gracefully)
      if (consumer && consumer.cancel) {
        await consumer.cancel();
      }
      consumer = null;
      isWorkerInitialized = false;
      console.log('🛑 Message outbound worker stopped gracefully');
    } catch (error) {
      // ✅ Ignore "Channel closed" errors during shutdown
      if (error.message?.includes('closed') || error.name === 'IllegalOperationError') {
        console.log('⚠️ Channel already closed during shutdown, worker stopped');
        consumer = null;
        isWorkerInitialized = false;
        return;
      }
      console.error('❌ Error stopping message worker:', error);
    }
  }
}

export default {
  startMessageOutboundWorker,
  stopMessageOutboundWorker,
};
