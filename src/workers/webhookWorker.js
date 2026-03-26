// src/workers/webhookWorker.js
/**
 * ✅ RabbitMQ Webhook Worker
 * Processes incoming webhooks from all channels (WhatsApp, Email, SMS, etc.)
 */

import { consumeFromQueue, QUEUES } from '../lib/queue/rabbitmq.js';
import ChannelServiceFactory from '../services/channel/ChannelServiceFactory.js';
import { getTenantDB } from '../config/database.js';
import ConversationSchema from '../models/schemas/Conversation.js';
import ContactSchema from '../models/schemas/Contact.js';
import MessageSchema from '../models/schemas/Message.js';
import CompanyAccountSchema from '../models/schemas/CompanyAccount.js';
import DepartmentSchema from '../models/schemas/Department.js';
import UserSchema from '../models/schemas/User.js';
import SocketEmitter from '../services/socket/SocketEmitter.js';
import MessageLogService from '../services/message/MessageLogService.js';
import BotService from '../services/bot/BotService.js';
import OutcomeMatchingService from '../services/automation/OutcomeMatchingService.js';
import QueueSchema from '../models/schemas/Queue.js';
import TestingPersonaSchema from '../models/schemas/TestingPersona.js';
import mongoose from 'mongoose';

let consumer = null;
let isWorkerInitialized = false;

/**
 * Process webhook from RabbitMQ
 */
async function processWebhook(messageData, msg) {
  const { 
    channelType, 
    channelAccountId, 
    tenantId, 
    identifier,
    rawPayload,
    receivedAt,
    provider, // For SMS (eurosms, twilio)
    messageId, // For status updates
    smsUuid, // For EuroSMS
    messageSid, // For Twilio
    eventType, // 'message' or 'status'
  } = messageData;

  console.log(`📥 Processing webhook from RabbitMQ: ${channelType}`, { 
    tenantId,
    channelAccountId,
    hasPayload: !!rawPayload,
    payloadKeys: rawPayload ? Object.keys(rawPayload) : [],
    eventType,
    provider,
  });

  try {
    // ✅ Get tenant DB
    const tenantDB = await getTenantDB(tenantId);
    console.log(`✅ Tenant DB obtained for: ${tenantId}`);

    // ✅ Initialize tenant models
    const CompanyAccount =
      tenantDB.models.CompanyAccount ||
      tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const Contact =
      tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Conversation =
      tenantDB.models.Conversation ||
      tenantDB.model('Conversation', ConversationSchema);
    const Message =
      tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    // ✅ Fetch CompanyAccount
    const channelAccount = await CompanyAccount.findById(channelAccountId).lean();
    if (!channelAccount) {
      throw new Error(`Channel account not found in tenant DB: ${channelAccountId}`);
    }
    console.log(`✅ Channel account found: ${channelAccount.name || channelAccountId}`, {
      hasCredentials: !!channelAccount.credentials,
      credentialKeys: channelAccount.credentials ? Object.keys(channelAccount.credentials) : []
    });

    // ✅ Parse webhook payload
    console.log(`🔍 Parsing webhook payload for ${channelType}...`);
    const parsedData = await ChannelServiceFactory.parseWebhook(
      channelType,
      channelAccount.credentials,
      rawPayload
    );

    // ✅ Removed webhook_received logging - webhooks update message status, no need for separate logs
    // Status updates are logged via logStatusUpdate when message status actually changes

    console.log(`📋 Parsed webhook data:`, {
      type: parsedData?.type || eventType,
      hasMessage: (parsedData?.type || eventType) === 'message',
      hasStatus: (parsedData?.type || eventType) === 'status',
      messageId: parsedData?.messageId || messageId,
      from: parsedData?.from
    });

    if (!parsedData && !eventType) {
      console.log('⚠️ No actionable data in webhook - returning early');
      return { processed: false, reason: 'No actionable data' };
    }

    // ✅ Determine event type
    const finalEventType = parsedData?.type || eventType || 'message';

    if (finalEventType === 'message') {
      console.log(`💬 Processing incoming message from ${parsedData?.from || 'unknown'}...`);
      const result = await processIncomingMessage(
        tenantDB,
        tenantId,
        channelType,
        channelAccount,
        parsedData || { ...rawPayload, from: identifier }
      );
      return result;
    } else if (finalEventType === 'status') {
      console.log(`📊 Processing status update...`);
      const result = await processStatusUpdate(
        tenantDB,
        tenantId,
        channelType,
        channelAccount,
        parsedData || rawPayload,
        messageId
      );
      return result;
    } else {
      console.log(`⚠️ Unknown webhook type: ${finalEventType}`);
      return { processed: false, reason: 'Unknown webhook type' };
    }

  } catch (error) {
    console.error(`❌ Webhook processing failed:`, error);
    // Bug 13: Only mark permanent errors as non-retryable
    // Transient errors (DB timeout, network issues) should be retried
    const errorMsg = error.message || '';
    const isPermanent = errorMsg.includes('not found') ||
                        errorMsg.includes('Invalid') ||
                        errorMsg.includes('parse') ||
                        errorMsg.includes('SyntaxError') ||
                        errorMsg.includes('No actionable data') ||
                        errorMsg.includes('Missing required');
    if (isPermanent) {
      error.retryable = false;
    }
    // Transient errors: don't set retryable=false, let RabbitMQ retry them
    throw error;
  }
}

/**
 * Handle email bounce for all OWM outbound messages.
 * Extracts the failed recipient from the bounce email content, finds the most
 * recent non-failed outbound OWM message to that recipient, and marks it as 'failed'.
 * If the message belongs to a testing persona, also increments the persona's counter.
 */
async function handleEmailBounceForOWM(tenantDB, tenantId, subject, textBody, parsedData) {
  const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
  const TestingPersona = tenantDB.models.TestingPersona || tenantDB.model('TestingPersona', TestingPersonaSchema);

  // Extract email addresses from the bounce content
  const allText = `${subject || ''} ${textBody || ''} ${parsedData?.to || ''}`;
  const emailRegex = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  const foundEmails = [...new Set((allText.match(emailRegex) || []).map(e => e.toLowerCase()))];

  if (foundEmails.length === 0) return;

  // Filter out system/bounce sender addresses
  const systemPrefixes = ['mailer-daemon', 'postmaster', 'mail-daemon', 'noreply', 'no-reply'];
  const recipientEmails = foundEmails.filter(email => {
    const local = email.split('@')[0].toLowerCase();
    return !systemPrefixes.some(p => local.startsWith(p));
  });

  if (recipientEmails.length === 0) return;

  // Find the most recent non-failed OWM outbound messages to any of these emails
  for (const email of recipientEmails) {
    const failedMessage = await Message.findOne({
      direction: 'outbound',
      sendingModule: 'owm',
      status: { $in: ['pending', 'sending', 'sent'] },
      $or: [
        { 'metadata.recipientEmail': email },
        { to: email },
        { 'metadata.to': email }
      ]
    }).sort({ createdAt: -1 });

    if (!failedMessage) continue;

    await Message.findByIdAndUpdate(failedMessage._id, {
      $set: {
        status: 'failed',
        failedAt: new Date(),
        errorMessage: `Email bounced: delivery to ${email} failed`
      }
    });

    console.log(`[WebhookWorker] Marked OWM message ${failedMessage._id} as failed (bounce for ${email})`);

    // If it was a testing persona message, update the persona's counter
    if (failedMessage.metadata?.isTestingPersona && failedMessage.metadata?.automationId) {
      await updateTestingPersonaFailedCount(TestingPersona, tenantId, email, failedMessage.metadata.automationId);
    }
  }
}

/**
 * Increment messagesFailed counter on the matching testing persona.
 * Called when any OWM message with isTestingPersona metadata is marked as failed,
 * regardless of channel (email bounce, WhatsApp failure, SMS failure, etc.).
 */
async function updateTestingPersonaFailedCount(TestingPersona, tenantId, identifier, automationId) {
  try {
    // Try to find persona by email or phone
    const persona = await TestingPersona.findOne({
      tenantId,
      automationId,
      $or: [
        { email: identifier?.toLowerCase?.() },
        { phone: identifier }
      ]
    });

    if (persona) {
      await TestingPersona.findByIdAndUpdate(persona._id, {
        $inc: { 'statistics.messagesFailed': 1 }
      });
      console.log(`[WebhookWorker] Incremented messagesFailed for testing persona "${persona.name}"`);
    }
  } catch (err) {
    console.error('[WebhookWorker] Error updating testing persona failed count:', err.message);
  }
}

/**
 * Process incoming message from webhook
 */
async function processIncomingMessage(tenantDB, tenantId, channelType, channelAccount, parsedData) {
  try {
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    const { from, content: contentObj, messageId, timestamp, contact: contactInfo } = parsedData;

    // ✅ Skip bounce/system emails for email channel (MAILER-DAEMON, delivery failures, etc.)
    // But first, check if the bounce is for a testing persona message and update its failed status
    if (channelType === 'email') {
      const { IMAPEmailService } = await import('../services/email/IMAPEmailService.js');
      const bounceSubject = contentObj?.subject || parsedData?.metadata?.subject || '';
      const bounceText = contentObj?.text || (typeof contentObj === 'string' ? contentObj : '');
      if (IMAPEmailService.isBounceOrSystemEmail(
        from,
        null,
        {
          subject: bounceSubject,
          text: bounceText,
          headers: parsedData?.metadata || {},
        }
      )) {
        // Before skipping, mark any OWM outbound messages as failed
        try {
          await handleEmailBounceForOWM(tenantDB, tenantId, bounceSubject, bounceText, parsedData);
        } catch (bounceErr) {
          console.error('[WebhookWorker] Error handling email bounce for OWM:', bounceErr.message);
        }
        console.log(`[WebhookWorker] Skipping bounce/system email from: ${from}, subject: "${bounceSubject}"`);
        return { processed: false, reason: 'bounce_or_system_email' };
      }
    }

    // ✅ Convert content object to string for Message schema
    let contentString = '';
    let messageType = 'text';
    let attachments = [];
    
    if (contentObj) {
      if (typeof contentObj === 'string') {
        // Already a string
        contentString = contentObj;
      } else if (contentObj.type === 'text' && contentObj.text) {
        // Text message
        contentString = contentObj.text;
        messageType = 'text';
      } else if (contentObj.type === 'image') {
        // Image message
        contentString = contentObj.caption || '[Image]';
        messageType = 'image';
        // ✅ Store image attachment info for downloading
        if (contentObj.mediaId) {
          attachments.push({
            type: 'image',
            mediaId: contentObj.mediaId,
            mimeType: contentObj.mimeType,
            sha256: contentObj.sha256,
            caption: contentObj.caption,
          });
        }
      } else if (contentObj.type === 'video') {
        // Video message
        contentString = contentObj.caption || '[Video]';
        messageType = 'video';
        // ✅ Store video attachment info for downloading
        if (contentObj.mediaId) {
          attachments.push({
            type: 'video',
            mediaId: contentObj.mediaId,
            mimeType: contentObj.mimeType,
            sha256: contentObj.sha256,
            caption: contentObj.caption,
          });
        }
      } else if (contentObj.type === 'audio') {
        // Audio message
        contentString = '[Audio]';
        messageType = 'audio';
        // ✅ Store audio attachment info for downloading
        if (contentObj.mediaId) {
          attachments.push({
            type: 'audio',
            mediaId: contentObj.mediaId,
            mimeType: contentObj.mimeType,
            sha256: contentObj.sha256,
            voice: contentObj.voice,
          });
        }
      } else if (contentObj.type === 'document') {
        // Document message
        contentString = contentObj.caption || contentObj.filename || '[Document]';
        messageType = 'document';
        // ✅ Store document attachment info for downloading
        if (contentObj.mediaId) {
          attachments.push({
            type: 'document',
            mediaId: contentObj.mediaId,
            mimeType: contentObj.mimeType,
            sha256: contentObj.sha256,
            filename: contentObj.filename,
            caption: contentObj.caption,
          });
        }
      } else if (contentObj.type === 'sticker') {
        // Sticker message
        contentString = '[Sticker]';
        messageType = 'sticker';
        // ✅ Store sticker attachment info for downloading
        if (contentObj.mediaId) {
          attachments.push({
            type: 'sticker',
            mediaId: contentObj.mediaId,
            mimeType: contentObj.mimeType,
            sha256: contentObj.sha256,
            animated: contentObj.animated,
          });
        }
      } else if (contentObj.type === 'contacts') {
        // Contact message - extract first contact for display
        messageType = 'contact';
        if (contentObj.contacts && contentObj.contacts.length > 0) {
          const firstContact = contentObj.contacts[0];
          const name = firstContact.name?.formatted_name || 
                      `${firstContact.name?.first_name || ''} ${firstContact.name?.middle_name || ''} ${firstContact.name?.last_name || ''}`.trim() ||
                      'Unknown Contact';
          const phone = firstContact.phones?.[0]?.phone || firstContact.phones?.[0]?.wa_id || '';
          contentString = `📇 ${name}${phone ? ` - ${phone}` : ''}`;
        } else {
          contentString = '[Contact]';
        }
      } else if (contentObj.type === 'location') {
        // Location message
        contentString = contentObj.address || contentObj.name || `Location: ${contentObj.latitude}, ${contentObj.longitude}`;
        messageType = 'location';
      } else if (contentObj.type === 'reaction') {
        // Reaction message - handle separately
        contentString = contentObj.emoji ? `Reacted: ${contentObj.emoji}` : 'Reaction removed';
        messageType = 'reaction';
        // Reactions are handled separately, don't create attachment
      } else if (contentObj.type === 'interactive') {
        // Interactive message (buttons, lists)
        messageType = 'interactive';
        if (contentObj.buttonReply) {
          contentString = `Button: ${contentObj.buttonReply.title}`;
        } else if (contentObj.listReply) {
          contentString = `List: ${contentObj.listReply.title}`;
        } else {
          contentString = '[Interactive Message]';
        }
      } else {
        // Fallback: stringify the object
        contentString = JSON.stringify(contentObj);
      }
    }

    // ✅ Normalize phone/email for consistent matching
    const { normalizePhoneNumber, normalizeEmail } = await import('../utils/normalizers.js');
    let normalizedIdentifier = from;
    let phoneWithoutPlus = null;
    let phoneWith00 = null;
    
    if (channelType === 'whatsapp' || channelType === 'sms') {
      normalizedIdentifier = normalizePhoneNumber(from);
      phoneWithoutPlus = normalizedIdentifier.replace(/^\+/, '');
      // Generate 00 prefix version (00 is equivalent to +)
      phoneWith00 = phoneWithoutPlus ? `00${phoneWithoutPlus}` : null;
    } else if (channelType === 'email') {
      normalizedIdentifier = normalizeEmail(from);
    }

    // ✅ Find existing contact by multiple criteria to prevent duplicates
    // For phone channels: check phone, normalizedPhone, identifiers.whatsapp, identifiers.sms
    // Handle: + prefix, 00 prefix, or no prefix (all treated as same)
    // For email: check email, identifiers.email
    let contactQuery = {};
    
    if (channelType === 'whatsapp' || channelType === 'sms') {
      // Build array of all phone variations to search
      const phoneVariations = [
        normalizedIdentifier, // With + prefix (normalized)
        phoneWithoutPlus, // Without + prefix
        from, // Original format
      ];
      if (phoneWith00) {
        phoneVariations.push(phoneWith00); // With 00 prefix
      }
      
      contactQuery = {
        $or: []
      };
      
      // Add all variations for each field - including webchat and all phone identifier fields
      phoneVariations.forEach(phoneVar => {
        if (phoneVar) {
          contactQuery.$or.push(
            { phone: phoneVar },
            { normalizedPhone: phoneVar },
            { [`identifiers.${channelType}`]: phoneVar },
            { 'identifiers.whatsapp': phoneVar },
            { 'identifiers.sms': phoneVar },
            { 'identifiers.webchat': phoneVar }, // Also check webchat identifier (in case phone was stored there)
            { 'identifiers.call': phoneVar } // Also check call identifier
          );
        }
      });
      
      // Also search by webchat identifier if we have a webchat link (phone might be stored in webchat contact)
      // This helps find webchat contacts that have the same phone
    } else if (channelType === 'email') {
      contactQuery = {
        $or: [
          { email: normalizedIdentifier },
          { email: from }, // Original format
          { 'identifiers.email': from },
          { 'identifiers.email': normalizedIdentifier },
        ]
      };
    } else {
      // Fallback: check by identifier only
      contactQuery = {
        [`identifiers.${channelType}`]: from
      };
    }

    let contact = await Contact.findOne(contactQuery).lean();
    let contactWasJustCreated = false;

    if (contact) {
      console.log(`✅ Found existing contact ${contact._id} for ${channelType}: ${from} (phone: ${contact.phone}, normalized: ${contact.normalizedPhone})`);
    } else {
      console.log(`🔍 No contact found with primary search for ${channelType}: ${from}`);
      console.log(`   Search query: ${JSON.stringify(contactQuery, null, 2)}`);
    }
    
    // ✅ If not found, try a more comprehensive search (fallback)
    // This helps find contacts created from other channels (like webchat) that might have phone stored differently
    if (!contact && (channelType === 'whatsapp' || channelType === 'sms')) {
      console.log(`🔍 Primary contact search failed, trying comprehensive fallback search for ${channelType}: ${from}`);
      const fallbackQuery = {
        $or: [
          { phone: normalizedIdentifier },
          { phone: phoneWithoutPlus },
          { phone: from },
          { normalizedPhone: normalizedIdentifier },
          { normalizedPhone: phoneWithoutPlus },
          { normalizedPhone: from },
          { 'identifiers.whatsapp': normalizedIdentifier },
          { 'identifiers.whatsapp': phoneWithoutPlus },
          { 'identifiers.whatsapp': from },
          { 'identifiers.sms': normalizedIdentifier },
          { 'identifiers.sms': phoneWithoutPlus },
          { 'identifiers.sms': from },
          { 'identifiers.webchat': normalizedIdentifier },
          { 'identifiers.webchat': phoneWithoutPlus },
          { 'identifiers.call': normalizedIdentifier },
          { 'identifiers.call': phoneWithoutPlus }
        ]
      };
      if (phoneWith00) {
        fallbackQuery.$or.push(
          { phone: phoneWith00 },
          { normalizedPhone: phoneWith00 },
          { 'identifiers.whatsapp': phoneWith00 },
          { 'identifiers.sms': phoneWith00 },
          { 'identifiers.webchat': phoneWith00 },
          { 'identifiers.call': phoneWith00 }
        );
      }
      
      contact = await Contact.findOne(fallbackQuery).lean();
      if (contact) {
        console.log(`✅ Found existing contact ${contact._id} by phone (comprehensive fallback) for ${channelType}: ${from}`);
        console.log(`   Contact phone: ${contact.phone}, normalized: ${contact.normalizedPhone}, identifiers: ${JSON.stringify(contact.identifiers)}`);
        
        // Update contact with current channel identifier if missing
        const updates = {};
        if (!contact.identifiers || !contact.identifiers[channelType]) {
          updates[`identifiers.${channelType}`] = normalizedIdentifier;
        }
        // Ensure normalizedPhone is set
        if (!contact.normalizedPhone || contact.normalizedPhone !== normalizedIdentifier) {
          updates.normalizedPhone = normalizedIdentifier;
        }
        // Ensure phone field is set with normalized value
        if (!contact.phone || contact.phone !== normalizedIdentifier) {
          updates.phone = normalizedIdentifier;
        }
        // Update identifiers for both phone channels
        if (channelType === 'whatsapp' || channelType === 'sms') {
          if (!contact.identifiers?.whatsapp) {
            updates['identifiers.whatsapp'] = normalizedIdentifier;
          }
          if (!contact.identifiers?.sms) {
            updates['identifiers.sms'] = normalizedIdentifier;
          }
        }
        
        if (Object.keys(updates).length > 0) {
          await Contact.findByIdAndUpdate(contact._id, { $set: updates });
          console.log(`✅ Updated contact ${contact._id} with ${channelType} identifier and normalized phone`);
        }
        // Reload contact to get updated fields
        contact = await Contact.findById(contact._id).lean();
      } else {
        console.log(`❌ No contact found even with comprehensive fallback search for ${channelType}: ${from}`);
      }
    }

    if (!contact) {
      // ✅ Create new contact with normalized data
      // ✅ Use provided name or identifier (phone/email) as name - never generic names like "WhatsApp User"
      const contactName = contactInfo?.name || contactInfo?.profileName || normalizedIdentifier || from;
      const contactData = {
        identifiers: {
          [channelType]: from
        },
        channelType,
        channelAccountId: channelAccount._id,
        name: contactName, // ✅ Use provided name or identifier as fallback
        displayName: contactName, // ✅ Also set displayName
        avatar: contactInfo?.avatar,
        tenantId: tenantId, // ✅ Include tenantId for webchat link generation
        Contact_Type: 'Customer',
        createdAt: new Date(),
        lastActivityAt: new Date()
      };

      // Add normalized phone or email
      if (channelType === 'whatsapp' || channelType === 'sms') {
        contactData.phone = normalizedIdentifier; // Always store with + prefix
        contactData.normalizedPhone = normalizedIdentifier;
        // Also set identifiers for both channels with normalized number
        contactData.identifiers.whatsapp = normalizedIdentifier; // Store with + prefix
        contactData.identifiers.sms = normalizedIdentifier; // Store with + prefix
      } else if (channelType === 'email') {
        contactData.email = normalizedIdentifier;
        contactData.identifiers.email = normalizedIdentifier;
      }

      contact = await Contact.create(contactData);
      contactWasJustCreated = true;
      console.log(`✨ Created new contact: ${contact._id} with ${channelType}: ${normalizedIdentifier}`);
      
      // ✅ Generate WebChat link for newly created contact (async, non-blocking)
      // Use IIFE to run async without blocking the main flow
      (async () => {
        try {
          // Reload contact to ensure it has all fields including tenantId
          const savedContact = await Contact.findById(contact._id).lean();
          if (savedContact) {
            console.log(`🔄 Generating WebChat link for contact ${savedContact._id}...`);
            const { generateWebChatLinkForContact } = await import('../services/contact/ContactService.js');
            await generateWebChatLinkForContact(savedContact, tenantDB);
            console.log(`✅ WebChat link generation completed for contact ${savedContact._id}`);
          } else {
            console.warn(`⚠️ Contact ${contact._id} not found after save, skipping webchat link generation`);
          }
        } catch (webchatError) {
          console.error('⚠️ Failed to create WebChat link for contact:', webchatError);
          console.error('⚠️ Error details:', webchatError.stack || webchatError.message);
          // Don't throw - webchat link creation is optional
        }
      })().catch(error => {
        console.error('⚠️ Error in webchat link generation promise:', error);
        console.error('⚠️ Error stack:', error.stack);
      });
    } else {
      // ✅ Update existing contact if needed
      const updates = {};
      
      // Update phone if not set or different (for phone channels)
      if ((channelType === 'whatsapp' || channelType === 'sms') && (!contact.phone || contact.phone !== normalizedIdentifier)) {
        updates.phone = normalizedIdentifier;
        updates.normalizedPhone = normalizedIdentifier;
      }
      
      // Update email if not set (for email channel)
      if (channelType === 'email' && (!contact.email || contact.email !== normalizedIdentifier)) {
        updates.email = normalizedIdentifier;
      }
      
      // Update identifiers if not set
      if (!contact.identifiers) {
        contact.identifiers = {};
      }
      if (!contact.identifiers[channelType]) {
        updates[`identifiers.${channelType}`] = from;
      }
      
      // For phone channels, also update other phone identifiers
      if ((channelType === 'whatsapp' || channelType === 'sms')) {
        if (!contact.identifiers.whatsapp) {
          updates['identifiers.whatsapp'] = from;
        }
        if (!contact.identifiers.sms) {
          updates['identifiers.sms'] = from;
        }
      }
      
      // ✅ Only set name if contact has NO meaningful name yet (never overwrite existing names)
      const hasNoName = !contact.name || contact.name === 'Unknown' || contact.name === from || contact.name === normalizedIdentifier;
      if (hasNoName) {
        if (contactInfo?.name) {
          updates.name = contactInfo.name;
        } else if (contactInfo?.profileName) {
          updates.name = contactInfo.profileName;
        }
      }
      
      if (Object.keys(updates).length > 0) {
        await Contact.findByIdAndUpdate(contact._id, { $set: updates });
        console.log(`✅ Updated existing contact ${contact._id} with missing fields`);
      } else {
        console.log(`✅ Found existing contact: ${contact._id}`);
      }
      
      // ✅ Update contact activity (never overwrite existing name)
      await Contact.findByIdAndUpdate(contact._id, {
        lastActivityAt: new Date()
      });
    }

    // ✅ Determine department for conversation
    let departmentId = channelAccount.departmentId;
    if (!departmentId && contact.department) {
      departmentId = contact.department;
    }
    if (!departmentId) {
      // ✅ Try to get default department
      const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
      if (Department) {
        const defaultDept = await Department.findOne({ isDefault: true }).lean();
        departmentId = defaultDept?._id;
      }
    }
    
    // ✅ If still no department, try to get first department
    if (!departmentId) {
      const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
      if (Department) {
        const firstDept = await Department.findOne().lean();
        departmentId = firstDept?._id;
      }
    }

    if (!departmentId) {
      throw new Error('Department is required but could not be determined. Please configure a default department or assign department to channel account.');
    }

    // ✅ CRITICAL: Find or create conversation - MUST match by contact + channel + department
    // Each department gets its own separate conversation for complete segregation
    let conversation = await Conversation.findOne({
      contact: contact._id,
      channel: channelType,
      department: departmentId, // ✅ CRITICAL: Must match department for segregation
      status: { $in: ['active', 'open', 'pending'] }
    }).sort({ lastMessageAt: -1 });

    // ✅ If multiple conversations exist (different channelAccounts), prefer the one matching channelAccount
    if (conversation && conversation.channelAccount?.toString() !== channelAccount._id.toString()) {
      // Try to find one with matching channelAccount AND department
      const matchingConversation = await Conversation.findOne({
        contact: contact._id,
        channel: channelType,
        department: departmentId, // ✅ CRITICAL: Must match department
        channelAccount: channelAccount._id,
        status: { $in: ['active', 'open', 'pending'] }
      }).sort({ lastMessageAt: -1 });
      
      if (matchingConversation) {
        conversation = matchingConversation;
      }
    }

    // ✅ Track if conversation was just created (to determine if we should emit conversation:new)
    let conversationWasJustCreated = false;

    if (!conversation) {
      // ✅ Determine conversation mode based on department's AI bot enabled status
      const { getConversationModeForDepartment } = await import('../services/conversation/ConversationModeHelper.js');
      const conversationMode = await getConversationModeForDepartment({
        departmentId,
        tenantDB
      });
      
      // ✅ Create new conversation with department - separate conversation per department
      conversation = await Conversation.create({
        contact: contact._id,
        channelAccount: channelAccount._id,
        channel: channelType,
        department: departmentId, // Single department per conversation
        status: 'active',
        mode: conversationMode, // ✅ Set mode based on department AI bot enabled status
        lastMessageAt: new Date(),
        createdAt: new Date()
      });
      conversationWasJustCreated = true;
      console.log(`✨ Created new conversation: ${conversation._id} with department: ${departmentId} in ${conversationMode} mode (separate conversation for this department)`);
      
      // ✅ Auto-merge check: If new conversation, check if we should auto-merge with existing conversation
      // This merges conversations with the same contact but different channels
      if (!contact.autoMergeDisabled) {
        try {
          const { findMergeableConversation, autoMergeConversation, canMergeContacts, mergeContacts } = await import('../services/conversation/MergeService.js');
          const mergeableConv = await findMergeableConversation(tenantId, conversation, contact);
          
          if (mergeableConv) {
            console.log('🔀 Auto-merging conversation from webhook:', {
              newConversationId: conversation._id,
              primaryConversationId: mergeableConv._id,
              contact: contact._id,
              newChannel: channelType,
              existingChannel: mergeableConv.channel
            });

            // Merge contacts if they're different
            let mergedContact = contact;
            if (mergeableConv.contact.toString() !== contact._id.toString()) {
              const mergeableContact = await Contact.findById(mergeableConv.contact).lean();
              if (mergeableContact) {
                const canMerge = canMergeContacts(contact, mergeableContact);
                
                if (canMerge.canMerge) {
                  // Determine which contact to keep (the one from primary conversation)
                  if (mergeableConv.createdAt < conversation.createdAt) {
                    // Primary is older, merge new contact into primary's contact
                    mergedContact = await mergeContacts(tenantId, mergeableConv.contact, contact._id);
                    contact = mergedContact;
                  } else {
                    // New conversation is older, merge primary's contact into new
                    mergedContact = await mergeContacts(tenantId, contact._id, mergeableConv.contact);
                    contact = mergedContact;
                  }
                }
              }
            }

            // Perform auto-merge
            const mergeResult = await autoMergeConversation(
              tenantId,
              conversation._id,
              mergeableConv._id,
              'system' // System user for auto-merge
            );

            // ✅ Check if merge failed due to mode mismatch or other reasons
            if (!mergeResult.success) {
              console.log('⚠️ Auto-merge skipped for webhook conversation:', mergeResult.error);
              // Continue with normal flow - don't merge but don't fail
              // The conversation will remain separate
            } else {
              // Update conversation to use merged contact if changed
              if (mergedContact._id.toString() !== contact._id.toString()) {
                await Conversation.findByIdAndUpdate(conversation._id, {
                  contact: mergedContact._id
                });
                contact = mergedContact;
              }

              // Use primary conversation for message creation
              conversation = await Conversation.findById(mergeableConv._id);
              console.log('✅ Auto-merge completed, using primary conversation:', conversation._id);
              // ✅ CRITICAL: Reset flag — primary already exists in the conversation list
              // Emit conversation:update instead of conversation:new
              conversationWasJustCreated = false;
            }
          }
        } catch (mergeError) {
          console.error('❌ Auto-merge failed in webhook worker, continuing with new conversation:', mergeError);
          // Continue with new conversation if merge fails
        }
      }
    } else {
      // ✅ Update existing conversation - same department, just update timestamp
      const updateData = {
        lastMessageAt: new Date(),
        updatedAt: new Date()
      };
      
      // ✅ Set channelAccount if it's missing (for conversations created before channelAccount was required)
      if (!conversation.channelAccount) {
        updateData.channelAccount = channelAccount._id;
      }
      
      await Conversation.findByIdAndUpdate(conversation._id, updateData);
      console.log(`✅ Found existing conversation: ${conversation._id} for department ${departmentId}, updating with incoming message`);
    }

    // ✅ CRITICAL: Handle reply context from WhatsApp
    // WhatsApp sends reply information in parsedData.metadata.context.id (or context.message_id)
    let replyToMessageId = null;
    const context = parsedData?.metadata?.context;
    
    console.log('🔍 Checking for reply context in incoming message:', {
      messageId: messageId,
      messageType: messageType,
      hasContext: !!context,
      context: context,
      contextId: context?.id,
      contextMessageId: context?.message_id
    });

    if (context && (context.id || context.message_id)) {
      const contextMessageId = context.id || context.message_id;
      console.log('📎 Reply context found, searching for message:', {
        contextMessageId,
        conversationId: conversation._id.toString()
      });

      try {
        // ✅ CRITICAL: Search for the message across ALL conversations in this tenant
        // The replied-to message might be in a different conversation if conversations were merged
        const repliedToMessage = await Message.findOne({
          $or: [
            { providerMessageId: contextMessageId },
            { whatsappMessageId: contextMessageId },
            { externalId: contextMessageId }
          ],
          // ✅ Ensure it's a WhatsApp message
          channel: 'whatsapp'
        })
        .select('_id conversation channel direction')
        .lean();
        
        if (repliedToMessage) {
          replyToMessageId = repliedToMessage._id;
          console.log('✅ Found reply context message:', {
            contextMessageId,
            replyToMessageId: replyToMessageId.toString(),
            originalConversationId: repliedToMessage.conversation?.toString(),
            currentConversationId: conversation._id.toString(),
            isSameConversation: repliedToMessage.conversation?.toString() === conversation._id.toString()
          });
        } else {
          // ✅ Try searching without channel filter (in case message type is different)
          const fallbackMessage = await Message.findOne({
            $or: [
              { providerMessageId: contextMessageId },
              { whatsappMessageId: contextMessageId },
              { externalId: contextMessageId }
            ]
          }).select('_id conversation channel').lean();
          
          if (fallbackMessage) {
            replyToMessageId = fallbackMessage._id;
            console.log('✅ Found reply context message (fallback search):', {
              contextMessageId,
              replyToMessageId: replyToMessageId.toString(),
              originalConversationId: fallbackMessage.conversation?.toString(),
              channel: fallbackMessage.channel
            });
          } else {
            console.warn('⚠️ Reply context message not found in database:', {
              contextMessageId,
              searchedFields: ['providerMessageId', 'whatsappMessageId', 'externalId']
          });
        }
      }
      } catch (error) {
        console.error('❌ Error finding reply message:', error);
        console.error('❌ Error stack:', error.stack);
      }
    } else {
      console.log('ℹ️ No reply context found in message (this is a normal message, not a reply)');
    }

    // ✅ Handle reactions separately - update existing message instead of creating new one
    if (messageType === 'reaction' && contentObj?.type === 'reaction' && contentObj?.messageId) {
      console.log('🔍 Processing reaction webhook:', {
        messageId: contentObj.messageId,
        emoji: contentObj.emoji,
        from: from,
        contactId: contact?._id
      });

      // Find the message being reacted to - try multiple ID formats
      const reactedToMessage = await Message.findOne({
        $or: [
          { providerMessageId: contentObj.messageId },
          { whatsappMessageId: contentObj.messageId },
          { externalId: contentObj.messageId },
          // Also try with wamid. prefix if not already present
          { providerMessageId: contentObj.messageId.startsWith('wamid.') ? contentObj.messageId : `wamid.${contentObj.messageId}` },
          { whatsappMessageId: contentObj.messageId.startsWith('wamid.') ? contentObj.messageId : `wamid.${contentObj.messageId}` }
        ]
      }).lean();
      
      if (reactedToMessage) {
        console.log('✅ Found message to react to:', {
          messageId: reactedToMessage._id,
          conversationId: reactedToMessage.conversation,
          currentReactions: reactedToMessage.reactions?.length || 0
        });

        // Check if contact already has a reaction on this message
        const existingReaction = reactedToMessage.reactions?.find(
          r => (r.user?.toString() === contact._id.toString() || r.contact?.toString() === contact._id.toString())
        );

        // Update the message's reactions array
        const reactionData = {
          emoji: contentObj.emoji,
          user: contact._id,
          contact: contact._id,
          contactName: contact.name || contact.displayName,
          createdAt: new Date(),
        };
        
        if (contentObj.emoji) {
          // Add or update reaction (remove old one first if exists)
          if (existingReaction) {
            // Remove existing reaction from this contact
            await Message.findByIdAndUpdate(reactedToMessage._id, {
              $pull: { reactions: { user: contact._id } }
            });
          }
          // Add new reaction
          await Message.findByIdAndUpdate(reactedToMessage._id, {
            $push: { reactions: reactionData }
          });
          console.log('✅ Reaction added to message');
        } else {
          // Remove reaction
          await Message.findByIdAndUpdate(reactedToMessage._id, {
            $pull: { reactions: { user: contact._id } }
          });
          console.log('✅ Reaction removed from message');
        }
        
        // ✅ Emit reaction event via Socket.IO for real-time updates
        const conversationIdForEmit = reactedToMessage.conversation?.toString() || conversation._id.toString();
        await SocketEmitter.emitMessageReaction(
          conversationIdForEmit,
          reactedToMessage._id.toString(),
          contentObj.emoji || null, // null if removed
          contact._id.toString(),
          tenantId,
          contact.name || contact.displayName,
          contact.name || contact.displayName
        );
        
        console.log(`✅ Reaction processed and socket event emitted: ${contentObj.emoji || 'removed'} on message ${reactedToMessage._id}`);
        return { processed: true, type: 'reaction', messageId: reactedToMessage._id.toString() };
      } else {
        console.warn('⚠️ Reaction received for message not found:', {
          searchedMessageId: contentObj.messageId,
          searchedFields: ['providerMessageId', 'whatsappMessageId', 'externalId']
        });
        return { processed: false, reason: 'Message not found for reaction' };
      }
    }

    // ✅ Download media for images, videos, audio, documents, stickers
    if (attachments.length > 0 && channelType === 'whatsapp') {
      try {
        const WhatsAppAdapter = (await import('../services/channel/adapters/WhatsAppAdapter.js')).WhatsAppAdapter;
        const adapter = new WhatsAppAdapter(channelAccount.credentials);
        
        for (const attachment of attachments) {
          if (attachment.mediaId) {
            try {
              // Download media from WhatsApp
              const mediaData = await adapter.downloadMedia(attachment.mediaId);
              
              // ✅ Upload to S3 storage and get URL
              const { uploadWhatsAppMediaToS3 } = await import('../lib/storage/s3.js');
              // ✅ Handle file extensions for all media types including stickers
              let fileExtension = attachment.mimeType?.split('/')[1] || 'bin';
              if (attachment.mimeType?.includes('jpeg')) fileExtension = 'jpg';
              else if (attachment.mimeType?.includes('png')) fileExtension = 'png';
              else if (attachment.mimeType?.includes('gif')) fileExtension = 'gif';
              else if (attachment.mimeType?.includes('pdf')) fileExtension = 'pdf';
              else if (attachment.mimeType?.includes('webp')) fileExtension = 'webp'; // For stickers
              else if (attachment.mimeType?.includes('mp4')) fileExtension = 'mp4';
              else if (attachment.mimeType?.includes('mp3')) fileExtension = 'mp3';
              else if (attachment.mimeType?.includes('ogg')) fileExtension = 'ogg';
              else if (attachment.mimeType?.includes('amr')) fileExtension = 'amr';
              else if (attachment.mimeType?.includes('aac')) fileExtension = 'aac';
              else if (attachment.mimeType?.includes('m4a')) fileExtension = 'm4a';
              const fileName = `${attachment.type}_${Date.now()}.${fileExtension}`;
              
              // Get conversation ID for S3 key generation
              const conversationId = conversation._id.toString();
              
              const uploadResult = await uploadWhatsAppMediaToS3(
                mediaData.buffer,
                attachment.mimeType || 'application/octet-stream',
                tenantId,
                conversationId,
                fileName
              );
              
              // Update attachment with URL
              attachment.url = uploadResult.url;
              attachment.path = uploadResult.key;
              attachment.size = mediaData.fileSize;
              
              console.log(`✅ Downloaded and stored ${attachment.type} media:`, {
                mediaId: attachment.mediaId,
                url: attachment.url,
                size: attachment.size
              });
            } catch (mediaError) {
              console.error(`❌ Failed to download ${attachment.type} media:`, mediaError);
              // Continue with other attachments even if one fails
            }
          }
        }
      } catch (error) {
        console.error('❌ Error downloading media:', error);
        // Continue with message creation even if media download fails
      }
    }

    // ✅ Extract contact data for contact messages
    let contactData = null;
    if (messageType === 'contact' && contentObj?.type === 'contacts' && contentObj?.contacts?.length > 0) {
      const firstContact = contentObj.contacts[0];
      contactData = {
        name: firstContact.name?.formatted_name || 
               `${firstContact.name?.first_name || ''} ${firstContact.name?.middle_name || ''} ${firstContact.name?.last_name || ''}`.trim() ||
               'Unknown Contact',
        firstName: firstContact.name?.first_name,
        middleName: firstContact.name?.middle_name,
        lastName: firstContact.name?.last_name,
        displayPhoneNumber: firstContact.phones?.[0]?.phone || firstContact.phones?.[0]?.wa_id,
        phoneNumber: firstContact.phones?.[0]?.phone || firstContact.phones?.[0]?.wa_id,
        phones: firstContact.phones || [],
        emails: firstContact.emails || [],
        addresses: firstContact.addresses || [],
        urls: firstContact.urls || [],
        org: firstContact.org || null,
        birthday: firstContact.birthday,
        vcard: firstContact.vcard,
      };
    }

    // ✅ Extract location data for location messages
    let locationData = null;
    if (messageType === 'location' && contentObj?.type === 'location') {
      locationData = {
        latitude: contentObj.latitude,
        longitude: contentObj.longitude,
        name: contentObj.name,
        address: contentObj.address,
      };
    }

    // Idempotency check: skip if this message was already processed (duplicate webhook)
    if (messageId) {
      const existingMessage = await Message.findOne({
        $or: [
          { providerMessageId: messageId },
          { whatsappMessageId: messageId },
          { externalId: messageId }
        ],
        channel: channelType,
        direction: 'inbound'
      }).select('_id').lean();

      if (existingMessage) {
        console.log(`Duplicate message detected, skipping: ${messageId} (existing: ${existingMessage._id})`);
        return { processed: false, reason: 'Duplicate message', existingMessageId: existingMessage._id.toString() };
      }
    }

    // Create message with departmentId for segregation
    const message = await Message.create({
      conversation: conversation._id,
      contact: contact._id,
      channelAccount: channelAccount._id,
      channel: channelType,
      type: messageType,
      direction: 'inbound',
      content: contentString,
      status: 'delivered',
      providerMessageId: messageId,
      whatsappMessageId: messageId,
      departmentId: departmentId,
      replyTo: replyToMessageId,
      attachments: attachments.length > 0 ? attachments : undefined,
      contactData: contactData,
      locationData: locationData,
      metadata: {
        originalContent: contentObj,
        contentType: contentObj?.type || 'text',
        ...(context && (context.id || context.message_id) && {
          replyContextMessageId: context.id || context.message_id
        }),
      },
      createdAt: timestamp ? new Date(timestamp) : new Date()
    });

    console.log(`✅ Message created: ${message._id}`, {
      messageId: message._id.toString(),
      hasReplyTo: !!replyToMessageId,
      replyToMessageId: replyToMessageId?.toString()
    });

    // ✅ Log incoming message from webhook
    try {
      await MessageLogService.logMessageCreated(tenantId, message, {
        channelType: channelType,
        channelAccountId: channelAccount._id.toString(),
        receivedVia: 'webhook',
        providerMessageId: messageId,
        messageType: messageType,
      });
    } catch (logError) {
      console.error('⚠️ Failed to log incoming webhook message:', logError);
    }

    // ── OWM Outcome Matching ──
    let owmHandledResponse = false;

    if (message.direction === 'inbound') {
      console.log(`[OWM-CHECK] Inbound message ${message._id} in conversation ${conversation._id} — checking for OWM...`);
      try {
        // Step 1: Find ALL outbound messages in this conversation that could be OWM
        // Use multiple strategies to catch OWM messages regardless of how they were created
        const allOutbound = await Message.find({
          conversation: conversation._id,
          direction: 'outbound',
        }).select('sendingModule metadata').lean();

        // Filter for OWM messages using multiple criteria
        const owmMessages = allOutbound.filter(m => {
          // Check sendingModule field
          if (m.sendingModule === 'owm') return true;
          // Check metadata for automationId (Map or plain object)
          const meta = m.metadata;
          if (!meta) return false;
          if (meta instanceof Map) return meta.has('automationId');
          if (typeof meta === 'object') return !!meta.automationId;
          return false;
        });

        console.log(`[OWM-CHECK] Total outbound: ${allOutbound.length}, OWM messages: ${owmMessages.length}`);

        if (owmMessages.length > 0) {
          // Extract automation IDs — handle Map, plain object, and nested formats
          const automationIdSet = new Set();
          for (const m of owmMessages) {
            let aid = null;
            const meta = m.metadata;
            if (meta instanceof Map) {
              aid = meta.get('automationId');
            } else if (meta && typeof meta === 'object') {
              aid = meta.automationId;
            }
            if (aid) {
              automationIdSet.add(aid.toString());
            }
          }

          console.log(`[OWM] Extracted ${automationIdSet.size} unique automation ID(s): ${[...automationIdSet].join(', ')}`);

          if (automationIdSet.size > 0) {
            // Step 2: Initialize outcomes (ensures records exist even if original init failed)
            for (const automationId of automationIdSet) {
              try {
                const initialized = await OutcomeMatchingService.initializeOutcomes(
                  tenantId,
                  conversation._id.toString(),
                  (conversation.contact?._id || conversation.contact)?.toString(),
                  automationId
                );
                console.log(`[OWM] Initialized ${initialized.length} outcome(s) for automation ${automationId}`);
              } catch (initErr) {
                console.error(`[OWM] Init failed for automation ${automationId}:`, initErr.message);
              }
            }

            // Step 3: Run AI matching
            for (const automationId of automationIdSet) {
              try {
                console.log(`[OWM] Running AI matching for automation ${automationId}...`);
                const matchResult = await OutcomeMatchingService.analyzeAndMatch(
                  tenantId,
                  conversation._id.toString(),
                  message._id.toString(),
                  automationId
                );

                console.log(`[OWM] Match result:`, matchResult ? {
                  matched: matchResult.matched,
                  outcome: matchResult.outcome?.outcomeName,
                  confidence: matchResult.confidence,
                  followUpSent: matchResult.followUpSent,
                } : 'null (no match)');

                if (matchResult?.matched && matchResult?.followUpSent) {
                  owmHandledResponse = true;
                  break;
                }
                if (matchResult?.matched) {
                  owmHandledResponse = true;
                  break;
                }
              } catch (matchError) {
                console.error(`[OWM] Matching error for automation ${automationId}:`, matchError.message, matchError.stack?.substring(0, 200));
              }
            }
          }
        }
      } catch (outcomeError) {
        console.error('[OWM] Fatal error in outcome matching:', outcomeError.message, outcomeError.stack?.substring(0, 200));
      }
    }

    // ✅ Get message content preview for conversation
    const messageContentPreview = contentString || '[Message]';
    
    // ✅ Check if AI bot is enabled and conversation is in auto mode
    // If so, don't increment unread count
    // BotService is already imported at the top of the file
    const botSettings = await BotService.getCompanyBotSettings(tenantId);
    // ✅ Resolve mode from primary if this is a secondary (merged) conversation
    let conversationMode = conversation.mode || 'auto';
    if (conversation.primaryConversation) {
      try {
        const primaryConv = await Conversation.findById(conversation.primaryConversation)
          .select('mode').lean();
        if (primaryConv) {
          conversationMode = primaryConv.mode || 'auto';
          console.log(`🔀 Using primary conversation mode for merged secondary ${conversation._id}: ${conversationMode}`);
        }
      } catch (err) {
        console.error('⚠️ Failed to fetch primary conversation mode:', err);
      }
    }
    const isAutoMode = conversationMode === 'auto';
    const shouldIncrementUnread = !(botSettings.enabled && isAutoMode);
    
    // ✅ Update conversation with last message and increment counts
    const conversationUpdate = {
      lastMessage: message._id,
      lastMessageAt: new Date(),
      lastMessageContent: contentString,
      lastMessageType: messageType,
      lastMessageDirection: 'inbound',
      updatedAt: new Date(),
      $inc: { 
        messageCount: 1,
        ...(shouldIncrementUnread && { unreadCount: 1 }) // ✅ Only increment unread count if AI bot disabled or manual mode
      }
    };
    
    const updatedConversation = await Conversation.findByIdAndUpdate(conversation._id, conversationUpdate, { new: true })
      .select('mode department contact channel')
      .lean();
    
    // ✅ Schedule conversation mode check if conversation is in manual mode
    // This will check after 2 minutes if there are no new messages and switch to auto mode
    if (updatedConversation?.mode === 'manual') {
      try {
        const { scheduleConversationModeCheck } = await import('../services/conversation/ConversationModeScheduler.js');
        await scheduleConversationModeCheck(conversation._id, tenantId);
        console.log(`📅 Scheduled conversation mode check for ${conversation._id} (manual mode, inbound message received)`);
      } catch (error) {
        console.error('❌ Failed to schedule conversation mode check:', error);
        // Don't throw - this is a non-critical operation
      }
    }
    
    // ✅ Ensure Department and User models are registered
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    const User = tenantDB.models.User || tenantDB.model('User', UserSchema);
    
    // ✅ Fetch updated conversation with all populated fields (matching API response structure)
    const populatedConversation = await Conversation.findById(conversation._id)
      .populate('contact', 'name displayName phone email avatar identifiers')
      .populate('channelAccount', 'type name')
      .populate('department', 'name')
      .populate('assignedTo', 'firstName lastName email')
      .lean();

    // ✅ Calculate actual unread count after update
    const MessageModel = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const actualUnreadCount = await MessageModel.countDocuments({
      conversation: conversation._id,
      direction: 'inbound',
      readAt: { $exists: false }
    });

    // ✅ Format conversation object for emission
    const formattedContactData = populatedConversation?.contact ? {
      _id: populatedConversation.contact._id,
      name: populatedConversation.contact.name,
      displayName: populatedConversation.contact.displayName,
      phone: populatedConversation.contact.phone,
      email: populatedConversation.contact.email,
      avatar: populatedConversation.contact.avatar,
      identifiers: populatedConversation.contact.identifiers,
    } : null;
    
    // ✅ CRITICAL: Only emit new conversation event if conversation was JUST created in this function
    // Don't emit if conversation already existed (prevents duplicate conversations in list)
    if (conversationWasJustCreated) {
      console.log(`📢 Emitting new conversation event: ${conversation._id}`);
      
      const conversationData = {
        _id: populatedConversation?._id || conversation._id,
        contact: formattedContactData,
        // ✅ CRITICAL: Include contactData field (used by ConversationList component)
        contactData: formattedContactData,
        channelAccount: populatedConversation?.channelAccount ? {
          _id: populatedConversation.channelAccount._id,
          type: populatedConversation.channelAccount.type,
          name: populatedConversation.channelAccount.name,
        } : null,
        channel: channelType,
        department: populatedConversation?.department ? {
          _id: populatedConversation.department._id,
          name: populatedConversation.department.name,
        } : null,
        assignedTo: populatedConversation?.assignedTo || null,
        status: 'active',
        lastMessage: message._id,
        lastMessageAt: new Date(),
        lastMessageContent: contentString,
        lastMessageType: messageType,
        lastMessageDirection: 'inbound',
        messageCount: populatedConversation?.messageCount || 1,
        unreadCount: actualUnreadCount,
        createdAt: populatedConversation?.createdAt || conversation.createdAt,
        updatedAt: populatedConversation?.updatedAt || new Date(),
        isPinned: false,
        isMerged: false,
        mode: populatedConversation?.mode || updatedConversation?.mode || 'auto', // ✅ Default to 'auto' (Hybrid mode)
        priority: populatedConversation?.priority || 'normal',
      };
      
      // ✅ CRITICAL: Extract departmentId for department-based segregation
      const deptId = populatedConversation?.department?._id || populatedConversation?.department || updatedConversation?.department?._id || updatedConversation?.department || departmentId;
      
      await SocketEmitter.emitNewConversation(tenantId, conversationData, {
        _id: message._id,
        content: contentString,
        type: messageType,
        direction: 'inbound',
        status: 'delivered',
        createdAt: message.createdAt,
      }, {
        _id: contact._id,
        name: contact.name,
        displayName: contact.displayName,
        phone: contact.phone,
        email: contact.email,
        avatar: contact.avatar,
        identifiers: contact.identifiers,
      }, deptId);
    } else {
      // ✅ Emit conversation update (last message, unread count) for existing conversations
      // This updates the existing conversation in the list without creating a duplicate
      console.log(`📢 Emitting conversation update event: ${conversation._id}`);
      
      // ✅ CRITICAL: Extract departmentId for department-based segregation
      const deptId = populatedConversation?.department?._id || populatedConversation?.department || updatedConversation?.department?._id || updatedConversation?.department || departmentId;
      
      // ✅ CRITICAL: For company admin unified view, find all grouped conversations
      // This ensures conversation updates are emitted to all grouped conversation rooms
      let allGroupedConversationIds = null;
      if (conversation?.contact && conversation?.channel) {
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
      
      const webhookUpdatePayload = {
        lastMessage: message._id,
        lastMessageAt: new Date(),
        lastMessageContent: contentString,
        lastMessageType: messageType,
        lastMessageDirection: 'inbound',
        unreadCount: actualUnreadCount,
        messageCount: populatedConversation?.messageCount || updatedConversation?.messageCount || 1,
      };

      // ✅ Include merge-related fields if the conversation is merged
      // This ensures the conversation list updates merge icons in real-time
      const convForMerge = populatedConversation || updatedConversation;
      if (convForMerge?.isMerged) {
        webhookUpdatePayload.isMerged = true;
        webhookUpdatePayload.mergedConversations = convForMerge.mergedConversations || [];
      }

      // ✅ Include contact data if available (may have changed during merge)
      if (formattedContactData) {
        webhookUpdatePayload.contactData = formattedContactData;
      }

      await SocketEmitter.emitConversationUpdate(conversation._id, webhookUpdatePayload, tenantId, deptId, allGroupedConversationIds);
    }

    // ✅ Emit new message event
    await emitIncomingMessage(tenantId, conversation._id, message, contact);

    // ── Sentiment Detection (non-blocking) ──
    // Check every inbound message for frustrated/angry sentiment and auto-escalate priority
    if (message.direction === 'inbound' && contentString && contentString.length >= 10) {
      try {
        const { detectSentiment } = await import('../services/bot/ConversationIntelligenceService.js');
        const sentiment = await detectSentiment(contentString);
        if (sentiment === 'frustrated' || sentiment === 'angry') {
          const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
          const conv = await Conversation.findById(conversation._id).select('priority department').lean();
          if (conv && conv.priority !== 'urgent') {
            const newPriority = sentiment === 'angry' ? 'urgent' : 'high';
            await Conversation.findByIdAndUpdate(conversation._id, { $set: { priority: newPriority } });

            const deptId = conv.department?.toString();
            await SocketEmitter.emitConversationUpdate(
              conversation._id, { priority: newPriority }, tenantId, deptId
            );

            if (deptId) {
              await SocketEmitter.emit(`department:${deptId}`, 'conversation:priority_escalation', {
                conversationId: conversation._id.toString(),
                sentiment, priority: newPriority,
                message: contentString.substring(0, 200),
                timestamp: new Date().toISOString(),
              });
            }
            await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:priority_escalation', {
              conversationId: conversation._id.toString(),
              sentiment, priority: newPriority,
              timestamp: new Date().toISOString(),
            });

            console.log(`[Sentiment] Conversation ${conversation._id} escalated to ${newPriority} (${sentiment})`);
          }
        }
      } catch (sentimentErr) {
        // Non-blocking — don't fail message processing
      }
    }

    // AI Bot Integration
    const hasValidContent = contentString && typeof contentString === 'string' && contentString.trim().length > 0;
    const convModeForBot = conversationMode;
    
    // Check if bot already responded to THIS specific inbound message (prevent duplicates).
    // Only skip if a bot response was created AFTER this inbound message's timestamp,
    // not just any bot response in the last 30 seconds.
    const hasRecentBotResponse = await Message.exists({
      conversation: conversation._id,
      'metadata.isBotResponse': true,
      createdAt: { $gte: message.createdAt }, // Bot response created after this inbound message
    });

    // ── Media Message Detection ──
    // If customer sends image, video, audio, or document in auto mode, switch to manual
    // AI cannot process media content — a human agent needs to handle it
    const MEDIA_TYPES = ['image', 'video', 'audio', 'voice', 'document', 'file', 'sticker', 'location', 'contact'];
    let mediaHandoff = false;

    if (convModeForBot === 'auto' && !owmHandledResponse && MEDIA_TYPES.includes(messageType)) {
      try {
        const { executeHandoff } = await import('../services/bot/HumanHandoffService.js');
        const contactName = contact.name || contact.displayName || contact.phone || contact.email || 'Customer';

        const mediaLabels = {
          image: 'an image', video: 'a video', audio: 'a voice message',
          voice: 'a voice message', document: 'a document', file: 'a file',
          sticker: 'a sticker', location: 'a location', contact: 'a contact card',
        };
        const mediaLabel = mediaLabels[messageType] || 'a media file';

        const { handoffMessage } = await executeHandoff({
          tenantDB, tenantId,
          conversationId: conversation._id.toString(),
          contactName,
        });

        const customMessage = `${contactName !== 'Customer' ? contactName + ', ' : ''}I received ${mediaLabel}. Let me connect you with a team member who can assist you with this. A human agent will be with you shortly.`;

        mediaHandoff = true;

        try {
          await BotService.sendBotResponse({
            tenantId,
            conversationId: conversation._id.toString(),
            contactId: contact._id.toString(),
            channelType,
            channelAccountId: channelAccount._id.toString(),
            botResponse: customMessage,
            tenantDB,
            skipModeCheck: true,
          });
        } catch (sendErr) {
          console.error('[MediaHandoff] Failed to send message:', sendErr.message);
        }

        console.log(`[MediaHandoff] ${messageType} message detected — switched to manual mode`);
      } catch (mediaErr) {
        console.error('[MediaHandoff] Error:', mediaErr.message);
      }
    }

    // ── Parallel Processing: Handoff Detection + Bot Response + Language Detection ──
    // Instead of sequential handoff → bot, we run them in parallel:
    //   1. Fast keyword handoff check (instant, ~0ms)
    //   2. If no keyword match: AI handoff + bot response run concurrently
    //   3. If AI handoff detected, discard bot response
    let handoffTriggered = false;
    if (hasValidContent && convModeForBot === 'auto' && !owmHandledResponse && !mediaHandoff) {
      try {
        const { detectHumanHandoff: _detectKeywordHandoff } = await import('../services/bot/HumanHandoffService.js');
        // Tier 1: Fast keyword check only (no AI call)
        const HANDOFF_PATTERNS = [
          /\b(talk|speak|connect|transfer)\b.*(human|agent|person|operator|representative|rep|someone|real person|live)/i,
          /\b(human|live|real)\b.*(agent|person|chat|support|operator|help)/i,
          /\b(want|need|get)\b.*(human|agent|person|operator|representative)/i,
          /\bnot a bot\b/i, /\bstop bot\b/i, /\bno bot\b/i, /\breal person\b/i,
          /\blive agent\b/i, /\bhuman (please|plz|pls)\b/i, /\bagent (please|plz|pls)\b/i, /\boperator\b/i,
        ];
        const fastHandoff = HANDOFF_PATTERNS.some(p => p.test(contentString));

        if (fastHandoff) {
          handoffTriggered = true;
          const contactName = contact.name || contact.displayName || contact.phone || contact.email || 'Customer';
          const { executeHandoff } = await import('../services/bot/HumanHandoffService.js');
          const { handoffMessage } = await executeHandoff({
            tenantDB, tenantId,
            conversationId: conversation._id.toString(),
            contactName,
          });
          if (handoffMessage) {
            try {
              await BotService.sendBotResponse({
                tenantId, conversationId: conversation._id.toString(),
                contactId: contact._id.toString(), channelType,
                channelAccountId: channelAccount._id.toString(),
                botResponse: handoffMessage, tenantDB, skipModeCheck: true,
              });
            } catch (sendErr) {
              console.error('[Handoff] Failed to send handoff message:', sendErr.message);
            }
          }
        }
      } catch (handoffErr) {
        console.error('[Handoff] Detection error:', handoffErr.message);
      }
    }

    if (hasValidContent && convModeForBot === 'auto' && !hasRecentBotResponse && !owmHandledResponse && !handoffTriggered && !mediaHandoff) {
      const Queue = tenantDB.models.Queue || tenantDB.model('Queue', QueueSchema);
      const existingPendingQueue = await Queue.findOne({
        status: { $in: ['pending', 'processing'] },
        details: { $regex: `"conversational_id"\\s*:\\s*"${conversation._id.toString()}"` }
      }).lean();

      if (existingPendingQueue) {
        console.log('Skipping bot call — pending queue item already exists for this conversation (debounce)');
      } else {
      // Rate limit check
      const { shouldBotRespond, recordBotResponse } = await import('../services/bot/BotRateLimiter.js');
      if (!shouldBotRespond(conversation._id.toString())) {
        console.log('ℹ️ Skipping bot call — rate limited (responded recently to this conversation)');
      } else {

      console.log('🤖 Conversation is in auto mode, calling AI bot (parallel processing)...', {
        conversationId: conversation._id.toString(),
        messageId: message._id.toString(),
        messageType,
        messageLength: contentString.length,
      });

      // Call bot service asynchronously (don't block message processing)
      (async () => {
        try {
          const contactName = contact.name || contact.displayName || contact.phone || contact.email || 'User';

          let messageForBot = contentString;
          if (messageType !== 'text') {
            const typeDescriptions = {
              'image': 'User sent an image', 'video': 'User sent a video',
              'audio': 'User sent an audio message', 'voice': 'User sent a voice message',
              'file': 'User sent a file', 'document': 'User sent a document',
              'sticker': 'User sent a sticker', 'location': 'User shared a location',
              'contact': 'User shared a contact', 'interactive': 'User responded to an interactive message'
            };
            const typeDesc = typeDescriptions[messageType] || `User sent a ${messageType} message`;
            messageForBot = `${typeDesc}${contentString ? `: ${contentString}` : ''}`;
          }

          // ── PARALLEL PROCESSING ──
          // Run AI handoff detection, bot response generation, and language detection concurrently.
          // Use AbortController so we can cancel bot response if handoff is detected.
          const botAbortController = new AbortController();
          const botSettings = await BotService.getCompanyBotSettings(tenantId);

          const [aiHandoffResult, botResponse, detectedLang] = await Promise.allSettled([
            // 1. AI-powered handoff detection (Tier 2)
            (async () => {
              if (!botSettings.provider || !botSettings.apiKey || contentString.length < 5) return false;
              try {
                const { detectHumanHandoff } = await import('../services/bot/HumanHandoffService.js');
                return await detectHumanHandoff(contentString, botSettings);
              } catch { return false; }
            })(),

            // 2. Bot response generation (with abort signal)
            BotService.generateResponse({
              tenantId, conversationId: conversation._id.toString(),
              contactId: contact._id.toString(), message: messageForBot,
              platform: channelType, contactName, messageType,
              departmentId: conversation.department?.toString(),
              channelAccountId: channelAccount._id.toString(),
              contactType: contact.Contact_Type || null,
              abortSignal: botAbortController.signal,
            }),

            // 3. Language detection (fast, non-blocking)
            (async () => {
              try {
                const { detectLanguage } = await import('../services/bot/AIGenerationService.js');
                return await detectLanguage(contentString);
              } catch { return 'en'; }
            })(),
          ]);

          const isAIHandoff = aiHandoffResult.status === 'fulfilled' && aiHandoffResult.value === true;

          // Store detected language on the message metadata
          const lang = detectedLang.status === 'fulfilled' ? detectedLang.value : 'en';
          if (lang && lang !== 'en') {
            try {
              await Message.findByIdAndUpdate(message._id, {
                $set: { 'metadata.detectedLanguage': lang },
              });

              // Generate English translation for agents (async, non-blocking)
              if (botSettings.provider && botSettings.apiKey) {
                import('../services/bot/AIGenerationService.js').then(async ({ translateForAgent }) => {
                  const translation = await translateForAgent(contentString, lang, botSettings);
                  if (translation) {
                    await Message.findByIdAndUpdate(message._id, {
                      $set: { 'metadata.translatedContent': translation, 'metadata.translatedTo': 'en' },
                    });
                    // Emit translation update in real-time
                    import('../services/socket/SocketEmitter.js').then(({ default: SocketEmitter }) => {
                      SocketEmitter.emit(`conversation:${conversation._id}`, 'message:translation', {
                        messageId: message._id.toString(),
                        detectedLanguage: lang,
                        translatedContent: translation,
                      });
                    }).catch(() => {});
                  }
                }).catch(() => {});
              }
            } catch (langErr) {
              console.warn('[Language] Failed to save detected language:', langErr.message);
            }
          }

          // If AI detected handoff, discard bot response and execute handoff
          if (isAIHandoff) {
            botAbortController.abort(); // Cancel bot if still running
            console.log('[Parallel] AI handoff detected — discarding bot response');
            handoffTriggered = true;
            const { executeHandoff } = await import('../services/bot/HumanHandoffService.js');
            const { handoffMessage } = await executeHandoff({
              tenantDB, tenantId,
              conversationId: conversation._id.toString(),
              contactName,
            });
            if (handoffMessage) {
              try {
                await BotService.sendBotResponse({
                  tenantId, conversationId: conversation._id.toString(),
                  contactId: contact._id.toString(), channelType,
                  channelAccountId: channelAccount._id.toString(),
                  botResponse: handoffMessage, tenantDB, skipModeCheck: true,
                });
              } catch (sendErr) {
                console.error('[Handoff] Failed to send handoff message:', sendErr.message);
              }
            }
            return;
          }

          // Process bot response
          const botResult = botResponse.status === 'fulfilled' ? botResponse.value : null;

          if (botResult && botResult.failed) {
            console.warn(`🚨 Bot failed for conversation ${conversation._id}: ${botResult.reason}`);
            const { escalateBotFailure } = await import('../services/bot/BotFailureEscalation.js');
            await escalateBotFailure({
              tenantDB, tenantId,
              conversationId: conversation._id.toString(),
              reason: botResult.reason,
              departmentId: conversation.department?.toString(),
              errorMessage: botResult.error || null,
            });
            return;
          }

          if (botResult && botResult.response && !botResult.queued) {
            console.log('✅ AI bot direct response received, sending as message...', {
              conversationId: conversation._id.toString(),
              responseLength: botResult.response.length,
            });

            const alreadyResponded = await Message.exists({
              conversation: conversation._id,
              'metadata.isBotResponse': true,
              createdAt: { $gte: message.createdAt },
            });

            if (!alreadyResponded) {
              const sendResult = await BotService.sendBotResponse({
                tenantId, conversationId: conversation._id.toString(),
                contactId: contact._id.toString(), channelType,
                channelAccountId: channelAccount._id.toString(),
                botResponse: botResult.response, tenantDB,
                botMetadata: botResult.metadata || null, // Pass AI metadata for analytics
              });

              if (sendResult?.reason === 'mode_changed') {
                console.log('ℹ️ Bot response discarded — conversation mode changed during processing');
              } else {
                console.log('✅ Bot response sent successfully');
                recordBotResponse(conversation._id.toString());
              }
            } else {
              console.log('⚠️ Bot response skipped - another bot response was sent while waiting for API');
            }
          } else if (botResponse.status === 'rejected') {
            console.error('❌ Bot response rejected:', botResponse.reason);
          } else {
            console.log('ℹ️ No bot response received (bot may be disabled or returned empty)');
          }
        } catch (botError) {
          console.error('❌ Error processing bot response:', botError);
          console.error('❌ Bot error details:', botError.message, botError.stack);
          try {
            const { escalateBotFailure } = await import('../services/bot/BotFailureEscalation.js');
            await escalateBotFailure({
              tenantDB, tenantId,
              conversationId: conversation._id.toString(),
              reason: 'api_error',
              departmentId: conversation.department?.toString(),
              errorMessage: botError.message,
            });
          } catch (escalationErr) {
            console.error('❌ Failed to escalate bot failure:', escalationErr.message);
          }
        }
      })().catch(error => {
        console.error('❌ Unhandled error in bot processing:', error);
      });
      } // end debounce else
      } // end rate limit check
    } else {
      if (mediaHandoff) {
        console.log(`ℹ️ Skipping bot call - ${messageType} message received, switched to manual mode`);
      } else if (handoffTriggered) {
        console.log('ℹ️ Skipping bot call - customer requested human agent (handoff)');
      } else if (owmHandledResponse) {
        console.log('ℹ️ Skipping bot call - OWM outcome matched and handled this message');
      } else if (hasRecentBotResponse) {
        console.log('ℹ️ Skipping bot call - bot already responded recently to this conversation');
      } else if (!hasValidContent) {
        console.log('ℹ️ Skipping bot call - message has no valid content');
      } else if (convModeForBot !== 'auto') {
        console.log('ℹ️ Skipping bot call - conversation is in manual mode');
      }
    }

    console.log(`✅ Incoming message processed: ${message._id}`);
    return { processed: true, type: 'message', messageId: message._id.toString() };

  } catch (error) {
    console.error('Failed to process incoming message:', error);
    throw error;
  }
}

/**
 * Process status update from webhook
 */
async function processStatusUpdate(tenantDB, tenantId, channelType, channelAccount, parsedData, messageId) {
  try {
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    // Find message by provider message ID or parsed message ID
    const providerMessageId = parsedData?.messageId || parsedData?.id || messageId;

    // Try to find the message - with retry for race condition
    // (status update may arrive before message creation completes)
    let message = await Message.findOne({
      $or: [
        { providerMessageId: providerMessageId },
        { whatsappMessageId: providerMessageId },
        { externalId: providerMessageId },
        { 'metadata.providerMessageId': providerMessageId }
      ]
    }).lean();

    // Retry once after a short delay if not found (race condition with message creation)
    if (!message) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      message = await Message.findOne({
        $or: [
          { providerMessageId: providerMessageId },
          { whatsappMessageId: providerMessageId },
          { externalId: providerMessageId },
          { 'metadata.providerMessageId': providerMessageId }
        ]
      }).lean();
    }

    if (!message) {
      console.log(`Message not found for status update (after retry): ${providerMessageId}`);
      return { processed: false, reason: 'Message not found' };
    }

    // Update message status
    const newStatus = parsedData?.status || 'delivered';

    // Validate status transition - prevent backward transitions (e.g. read→sent)
    // 'failed' can override any status, 'retrying' messages can transition forward
    const STATUS_ORDER = { retrying: -1, sending: 0, sent: 1, delivered: 2, read: 3 };
    const currentOrder = STATUS_ORDER[message.status] ?? -1;
    const newOrder = STATUS_ORDER[newStatus] ?? -1;
    if (newStatus !== 'failed' && currentOrder >= 0 && newOrder >= 0 && newOrder < currentOrder) {
      console.log(`ℹ️ Skipping backward status transition for message ${message._id}: ${message.status} → ${newStatus}`);
      return { processed: false, reason: 'backward_status_transition' };
    }

    // Extract error details from webhook (supports WhatsApp/Meta, EuroSMS, and Twilio formats)
    let errorInfo = {};
    if (newStatus === 'failed') {
      // WhatsApp/Meta format
      if (parsedData?.errors && parsedData.errors.length > 0) {
        const metaError = parsedData.errors[0];
        errorInfo = {
          errorMessage: metaError.message || 'Message delivery failed',
          'metadata.error': metaError.message || 'Message delivery failed',
          'metadata.metaErrorCode': metaError.code,
          'metadata.errorCategory': metaError.error_data?.details || 'delivery_failure',
          'metadata.errorTitle': metaError.title,
        };
      }
      // EuroSMS format (delivery reports with rawDlrStatus)
      else if (parsedData?.metadata?.rawDlrStatus) {
        const dlrStatus = parsedData.metadata.rawDlrStatus;
        const euroErrorMessages = {
          'EXPIRED': 'SMS expired — recipient phone may be off or out of coverage',
          'UNDELIV': 'SMS undeliverable — phone number may be invalid or disconnected',
          'REJECTD': 'SMS rejected by carrier — recipient may have unpaid balance or number is blacklisted',
          'DELETED': 'SMS cancelled by the operator\'s SMS centre',
          'UNKNOWN': 'SMS delivery status unknown — message may not have been delivered',
        };
        const errMsg = euroErrorMessages[dlrStatus] || `SMS delivery failed (${dlrStatus})`;
        errorInfo = {
          errorMessage: errMsg,
          'metadata.error': errMsg,
          'metadata.errorCategory': 'delivery',
          'metadata.rawDlrStatus': dlrStatus,
        };
      }
      // Generic format
      else if (parsedData?.error || parsedData?.errorMessage) {
        const errMsg = parsedData.error || parsedData.errorMessage || 'Message delivery failed';
        errorInfo = {
          errorMessage: errMsg,
          'metadata.error': errMsg,
          'metadata.errorCategory': parsedData.errorCategory || 'delivery',
        };
      }
      if (Object.keys(errorInfo).length > 0) {
        errorInfo.failedAt = new Date();
      }
    }

    // Set timestamp fields based on status
    const timestampFields = {};
    if (newStatus === 'sent') timestampFields.sentAt = parsedData?.timestamp || new Date();
    if (newStatus === 'delivered') timestampFields.deliveredAt = parsedData?.timestamp || new Date();
    if (newStatus === 'read') timestampFields.readAt = parsedData?.timestamp || new Date();

    await Message.findByIdAndUpdate(message._id, {
      status: newStatus,
      ...timestampFields,
      ...errorInfo,
      $set: {
        'metadata.statusUpdatedAt': new Date(),
        'metadata.statusUpdate': parsedData,
        ...(errorInfo['metadata.error'] && { 'metadata.error': errorInfo['metadata.error'] }),
        ...(errorInfo['metadata.metaErrorCode'] && { 'metadata.metaErrorCode': errorInfo['metadata.metaErrorCode'] }),
        ...(errorInfo['metadata.errorCategory'] && { 'metadata.errorCategory': errorInfo['metadata.errorCategory'] }),
      }
    });

    // If an OWM testing persona message just failed, increment the persona's counter
    if (newStatus === 'failed' && message.sendingModule === 'owm' && message.metadata?.isTestingPersona && message.metadata?.automationId) {
      try {
        const TestingPersona = tenantDB.models.TestingPersona || tenantDB.model('TestingPersona', TestingPersonaSchema);
        const identifier = message.metadata?.recipientEmail || message.metadata?.recipientPhone || message.to;
        await updateTestingPersonaFailedCount(TestingPersona, tenantId, identifier, message.metadata.automationId);
      } catch (tpErr) {
        console.error('[WebhookWorker] Error updating testing persona failed count from status update:', tpErr.message);
      }
    }

    // Get conversation department for Socket.IO emission
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const conversation = await Conversation.findById(message.conversation).select('department').lean();
    const deptId = conversation?.department || null;

    // Emit status update via Socket.IO - include error details for failed messages
    const emitData = {
      timestamp: new Date().toISOString(),
    };
    if (newStatus === 'failed') {
      emitData.error = errorInfo.errorMessage || 'Message delivery failed';
      emitData.errorCategory = errorInfo['metadata.errorCategory'] || 'delivery';
      if (errorInfo['metadata.metaErrorCode']) emitData.metaErrorCode = errorInfo['metadata.metaErrorCode'];
      if (errorInfo['metadata.rawDlrStatus']) emitData.rawDlrStatus = errorInfo['metadata.rawDlrStatus'];
    }

    await SocketEmitter.emitMessageStatus(
      message.conversation.toString(),
      message._id.toString(),
      newStatus,
      tenantId,
      emitData,
      deptId
    );

    console.log(`Status update processed: ${message._id} → ${newStatus}${newStatus === 'failed' ? ` (error: ${errorInfo.errorMessage || 'unknown'})` : ''}`);
    return { processed: true, type: 'status', messageId: message._id.toString() };

  } catch (error) {
    console.error('Failed to process status update:', error);
    throw error;
  }
}

/**
 * Emit incoming message via Socket.IO
 */
async function emitIncomingMessage(tenantId, conversationId, message, contact) {
  try {
    console.log(`📡 emitIncomingMessage - Starting:`, {
      tenantId,
      conversationId: conversationId?.toString(),
      messageId: message._id?.toString(),
      messageType: message.type,
      hasContact: !!contact
    });
    
    // ✅ Get conversation mode and department
    const tenantDB = await getTenantDB(tenantId);
    const Conversation = tenantDB.model('Conversation');
    const CompanyAccount = tenantDB.model('CompanyAccount');
    const MessageModel = tenantDB.model('Message');
    
    const conversation = await Conversation.findById(conversationId).select('mode department contact channel').lean();
    const conversationMode = conversation?.mode || 'auto';
    const deptId = conversation?.department || null;
    
    // ✅ CRITICAL: For company admin unified view, find all grouped conversations
    // This ensures messages are emitted to all grouped conversation rooms
    let allGroupedConversationIds = null;
    if (conversation?.contact && conversation?.channel) {
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
    
    console.log(`📡 emitIncomingMessage - Conversation mode: ${conversationMode}`);
    
    // ✅ Fetch full message with populated channelAccount
    const fullMessage = await MessageModel
      .findById(message._id)
      .populate('channelAccount', 'type name')
      .lean();
    
    // ✅ CRITICAL: Fetch replyTo message if it exists and populate full data
    let replyToData = null;
    if (message.replyTo) {
      try {
        const replyToMessage = await MessageModel.findById(message.replyTo)
          .select('content type attachments sender')
          .lean();
        
        if (replyToMessage) {
          replyToData = {
            _id: message.replyTo,
            content: replyToMessage.content,
            type: replyToMessage.type,
            attachments: replyToMessage.attachments || [],
            sender: replyToMessage.sender
          };
          console.log('✅ Populated replyTo data for socket emission:', {
            replyToMessageId: message.replyTo.toString(),
            replyToType: replyToMessage.type,
            hasContent: !!replyToMessage.content
          });
        } else {
          console.warn('⚠️ ReplyTo message not found for population:', message.replyTo);
          // Still include the ID so frontend knows it's a reply
          replyToData = { _id: message.replyTo };
        }
  } catch (error) {
        console.error('❌ Error populating replyTo message:', error);
        // Still include the ID so frontend knows it's a reply
        replyToData = { _id: message.replyTo };
      }
    }
    
    // ✅ Prepare message object for emission
    const messageData = {
      _id: message._id?.toString(),
      conversationId: message.conversation?.toString() || conversationId?.toString(),
      channel: fullMessage?.channel || message.channel,
      channelAccount: fullMessage?.channelAccount ? {
        _id: fullMessage.channelAccount._id?.toString(),
        type: fullMessage.channelAccount.type,
        name: fullMessage.channelAccount.name
      } : (message.channelAccount ? {
        _id: message.channelAccount?.toString(),
        type: undefined
      } : undefined),
      content: message.content,
      type: message.type,
      direction: message.direction || 'inbound',
      status: message.status || 'delivered',
      attachments: message.attachments || [],
      contactData: message.contactData || undefined,
      locationData: message.locationData || undefined,
      emailData: message.emailData || undefined,
      createdAt: message.createdAt ? new Date(message.createdAt).toISOString() : new Date().toISOString(),
      conversationMode,
      replyTo: replyToData,
      contact: contact ? {
        _id: contact._id?.toString(),
        name: contact.name,
        avatar: contact.avatar,
        identifiers: contact.identifiers || {}
      } : undefined
    };
    
    // ✅ If channelAccount.type is missing, fetch it
    if (!messageData.channelAccount?.type && fullMessage?.channelAccount) {
      const channelAcc = await CompanyAccount.findById(fullMessage.channelAccount._id).lean();
      if (channelAcc) {
        messageData.channelAccount = {
          _id: channelAcc._id?.toString(),
          type: channelAcc.type,
          name: channelAcc.name
        };
      }
    }
    
    console.log(`📡 emitIncomingMessage - Emitting message:new event...`);
    // ✅ CRITICAL: Pass allGroupedConversationIds for company admin unified view
    await SocketEmitter.emitNewMessage(conversationId.toString(), messageData, tenantId, deptId, allGroupedConversationIds);
    
    console.log(`✅ emitIncomingMessage - Successfully emitted message:new event for: ${message._id}`);
  } catch (error) {
    console.error('❌ Failed to emit incoming message:', {
      error: error.message,
      stack: error.stack,
      tenantId,
      conversationId: conversationId?.toString(),
      messageId: message._id?.toString()
    });
  }
}

/**
 * Start webhook worker
 */
export async function startWebhookWorker() {
  // ✅ CRITICAL: Prevent multiple initializations
  if (isWorkerInitialized && consumer) {
    console.log('✅ Webhook worker already initialized, reusing existing instance');
    return consumer;
  }

  try {
    console.log('📥 Starting Webhook Processing Worker (RabbitMQ)...');
    
    // ✅ Initialize RabbitMQ connection
    const { initRabbitMQ } = await import('../lib/queue/rabbitmq.js');
    await initRabbitMQ();

    // ✅ Start consuming messages
    consumer = await consumeFromQueue(
      QUEUES.WEBHOOK_PROCESS,
      processWebhook,
      {
        requeue: true, // Requeue failed messages
        prefetch: 1, // Process one message at a time per consumer to prevent "held" message pattern
      }
    );

    console.log('🚀 Webhook worker started and listening on RabbitMQ queue:', QUEUES.WEBHOOK_PROCESS);
    isWorkerInitialized = true;
    return consumer;
  } catch (error) {
    console.error('❌ Failed to start webhook worker:', error);
    isWorkerInitialized = false;
    throw error;
  }
}

/**
 * Stop webhook worker
 */
export async function stopWebhookWorker() {
  if (consumer) {
    try {
      // ✅ Cancel consumer (handles closed channels gracefully)
      if (consumer && consumer.cancel) {
        await consumer.cancel();
      }
      consumer = null;
      isWorkerInitialized = false;
    console.log('🛑 Webhook worker stopped gracefully');
    } catch (error) {
      // ✅ Ignore "Channel closed" errors during shutdown
      if (error.message?.includes('closed') || error.name === 'IllegalOperationError') {
        console.log('⚠️ Channel already closed during shutdown, worker stopped');
        consumer = null;
        isWorkerInitialized = false;
        return;
      }
      console.error('❌ Error stopping webhook worker:', error);
    }
  }
}

export default {
  startWebhookWorker,
  stopWebhookWorker,
};
