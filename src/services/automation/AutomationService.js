// src/services/automation/AutomationService.js
import { getTenantDB } from '../../config/database.js';
import AutomationSchema from '../../models/schemas/Automation.js';
import AutomationExecutionSchema from '../../models/schemas/AutomationExecution.js';
import ContactSchema from '../../models/schemas/Contact.js';
import DealSchema from '../../models/schemas/Deal.js';
import ConversationSchema from '../../models/schemas/Conversation.js';
import MessageSchema from '../../models/schemas/Message.js';
import TemplateSchema from '../../models/schemas/Template.js';
import CompanyAccountSchema from '../../models/schemas/CompanyAccount.js';
import MessageLogSchema from '../../models/schemas/MessageLog.js';
import { publishToQueue, publishOutboundMessage, QUEUES } from '../../lib/queue/rabbitmq.js';
import SocketEmitter from '../socket/SocketEmitter.js';

// Batched sending configuration
const BATCH_SIZE = 10;        // Number of concurrent sends per batch
const BATCH_DELAY_MS = 1000;  // Delay between batches to avoid overwhelming RabbitMQ

export class AutomationService {
  /**
   * Execute an automation - send messages to filtered contacts
   * Uses batched parallel sending and records execution history.
   */
  static async executeAutomation(automationId, tenantId, executionMeta = {}) {
    const tenantDB = await getTenantDB(tenantId);

    // Register schemas
    const Automation = tenantDB.models.Automation || tenantDB.model('Automation', AutomationSchema);
    const AutomationExecution = tenantDB.models.AutomationExecution || tenantDB.model('AutomationExecution', AutomationExecutionSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Deal = tenantDB.models.Deal || tenantDB.model('Deal', DealSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const MessageLog = tenantDB.models.MessageLog || tenantDB.model('MessageLog', MessageLogSchema);

    // Get automation
    const automation = await Automation.findById(automationId)
      .populate('channels.channelAccountId')
      .populate('channels.templateId')
      .lean();

    if (!automation) {
      const error = new Error('Automation not found');
      error.code = 'AUTOMATION_NOT_FOUND';
      error.retryable = false;
      throw error;
    }

    if (!automation.isPublished) {
      const error = new Error('Automation is not published');
      error.code = 'AUTOMATION_NOT_PUBLISHED';
      error.retryable = false;
      throw error;
    }

    // ✅ IMP 2: Create execution history record
    const execution = await AutomationExecution.create({
      automationId,
      tenantId,
      status: 'running',
      executionType: executionMeta.executionType || 'immediate',
      scheduledFor: executionMeta.scheduledFor || null,
      startedAt: new Date(),
      triggeredBy: executionMeta.triggeredBy || automation.createdBy?._id || automation.createdBy,
      triggerConditionsSnapshot: automation.triggerConditions || {},
      channelsSnapshot: (automation.channels || []).map(ch => ({
        channel: ch.channel,
        channelAccountId: ch.channelAccountId?._id || ch.channelAccountId,
        templateId: ch.templateId?._id || ch.templateId,
      })),
    });

    // Filter contacts based on conditions
    console.log(`[AutomationService] Executing automation ${automationId} (execution ${execution._id})`);

    // Log automation execution started
    await MessageLog.create({
      automationId: automationId,
      logType: 'automation',
      eventType: 'execution_started',
      message: `Automation "${automation.name}" execution started (execution ${execution._id})`,
      status: 'info',
      tenantId: tenantId,
      userId: automation.createdBy?._id || automation.createdBy,
      data: {
        automationId: automationId.toString(),
        automationName: automation.name,
        executionId: execution._id.toString(),
      },
    });

    let filteredContacts;
    try {
      filteredContacts = await this.filterContacts(automation, tenantDB, Contact, Deal);
    } catch (filterError) {
      // Mark execution as failed if filtering itself errors
      await AutomationExecution.findByIdAndUpdate(execution._id, {
        status: 'failed',
        completedAt: new Date(),
        error: { message: filterError.message, code: filterError.code || 'FILTER_ERROR' },
      });
      throw filterError;
    }

    console.log(`[AutomationService] Found ${filteredContacts.length} contacts matching conditions`);

    // Update execution with contact count
    await AutomationExecution.findByIdAndUpdate(execution._id, {
      totalContacts: filteredContacts.length,
    });

    if (filteredContacts.length === 0) {
      console.log(`[AutomationService] No contacts match automation conditions: ${automationId}`);

      // Log no contacts found
      await MessageLog.create({
        automationId: automationId,
        logType: 'automation',
        eventType: 'no_contacts',
        message: `Automation "${automation.name}" found no contacts matching conditions`,
        status: 'warning',
        tenantId: tenantId,
        userId: automation.createdBy?._id || automation.createdBy,
        data: {
          automationId: automationId.toString(),
          automationName: automation.name,
          executionId: execution._id.toString(),
        },
      });

      // Mark execution as completed with 0 results
      await AutomationExecution.findByIdAndUpdate(execution._id, {
        status: 'completed',
        completedAt: new Date(),
        totalSent: 0,
        totalFailed: 0,
      });

      return { sent: 0, failed: 0, executionId: execution._id.toString() };
    }

    // Log contacts found
    await MessageLog.create({
      automationId: automationId,
      logType: 'automation',
      eventType: 'contacts_found',
      message: `Automation "${automation.name}" found ${filteredContacts.length} contacts matching conditions`,
      status: 'info',
      tenantId: tenantId,
      userId: automation.createdBy?._id || automation.createdBy,
      data: {
        automationId: automationId.toString(),
        automationName: automation.name,
        contactCount: filteredContacts.length,
        executionId: execution._id.toString(),
      },
    });

    // ✅ IMP 5: Batched parallel sending instead of sequential 1-second delays
    let sent = 0;
    let failed = 0;

    console.log(`[AutomationService] 📤 Starting batched send to ${filteredContacts.length} contacts (batch size: ${BATCH_SIZE})...`);

    for (let batchStart = 0; batchStart < filteredContacts.length; batchStart += BATCH_SIZE) {
      const batch = filteredContacts.slice(batchStart, batchStart + BATCH_SIZE);
      const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(filteredContacts.length / BATCH_SIZE);

      // Add delay between batches (not before the first batch)
      if (batchStart > 0) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }

      console.log(`[AutomationService] 📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} contacts)...`);

      // Process batch concurrently
      const batchResults = await Promise.allSettled(
        batch.map(async (contact) => {
          try {
            console.log(`[AutomationService] 📨 Processing contact:`, {
              contactId: contact._id,
              contactName: contact.name || contact.displayName || 'Unknown',
            });

            await this.sendMessageToContact(
              contact,
              automation,
              tenantId,
              tenantDB,
              Conversation,
              Message,
              MessageLog
            );
            return { success: true, contactId: contact._id };
          } catch (error) {
            console.error(`[AutomationService] ❌ Failed to send message to contact ${contact._id}:`, {
              error: error.message,
              contactId: contact._id,
            });

            // Log failed message
            await MessageLog.create({
              automationId: automationId,
              logType: 'automation',
              eventType: 'message_failed',
              message: `Failed to send message to contact ${contact._id} via automation "${automation.name}"`,
              status: 'error',
              tenantId: tenantId,
              contactId: contact._id,
              userId: automation.createdBy?._id || automation.createdBy,
              data: {
                automationId: automationId.toString(),
                automationName: automation.name,
                contactId: contact._id.toString(),
                error: error.message,
                executionId: execution._id.toString(),
              },
            });

            return { success: false, contactId: contact._id, error: error.message };
          }
        })
      );

      // Tally batch results
      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value.success) {
          sent++;
        } else {
          failed++;
        }
      }

      console.log(`[AutomationService] 📦 Batch ${batchNum} complete: ${sent} sent, ${failed} failed so far`);
    }

    // Update automation statistics
    await Automation.updateOne(
      { _id: automationId },
      {
        $inc: {
          'statistics.totalSent': sent,
          'statistics.totalFailed': failed,
        },
        $set: {
          'statistics.lastExecutedAt': new Date(),
        },
      }
    );

    // ✅ IMP 2: Mark execution as completed
    await AutomationExecution.findByIdAndUpdate(execution._id, {
      status: failed === filteredContacts.length ? 'failed' : 'completed',
      completedAt: new Date(),
      totalSent: sent,
      totalFailed: failed,
    });

    // Log automation execution completed
    await MessageLog.create({
      automationId: automationId,
      logType: 'automation',
      eventType: 'execution_completed',
      message: `Automation "${automation.name}" execution completed: ${sent} sent, ${failed} failed`,
      status: failed > 0 ? 'warning' : 'success',
      tenantId: tenantId,
      userId: automation.createdBy?._id || automation.createdBy,
      data: {
        automationId: automationId.toString(),
        automationName: automation.name,
        sent,
        failed,
        totalContacts: filteredContacts.length,
        executionId: execution._id.toString(),
      },
    });

    return { sent, failed, executionId: execution._id.toString() };
  }

  /**
   * Filter contacts based on automation conditions
   */
  static async filterContacts(automation, tenantDB, Contact, Deal) {
    const { contactType, conditions } = automation.triggerConditions;

    // Build contact query
    const contactQuery = {};
    
    // Filter by contact type - make it optional to include contacts without Contact_Type set
    if (contactType === 'handyman') {
      contactQuery.$or = [
        { Contact_Type: 'Handyman' },
        { Contact_Type: { $exists: false } },
        { Contact_Type: null }
      ];
    } else if (contactType === 'customer') {
      contactQuery.$or = [
        { Contact_Type: 'Customer' },
        { Contact_Type: { $exists: false } },
        { Contact_Type: null }
      ];
    }

    // Apply conditions
    const contactConditions = conditions.filter((c) => c.entity === 'contact');
    if (contactConditions.length > 0) {
      const queryParts = [];
      
      for (let i = 0; i < contactConditions.length; i++) {
        const cond = contactConditions[i];
        const query = this.buildConditionQuery(cond);
        
        // Skip empty queries
        if (Object.keys(query).length === 0) {
          continue;
        }
        
        // Check logical operator
        if (i === 0 || cond.logicalOperator === 'AND') {
          // AND: add as separate condition
          queryParts.push(query);
        } else {
          // OR: combine with previous using $or
          const lastPart = queryParts[queryParts.length - 1];
          queryParts[queryParts.length - 1] = {
            $or: [lastPart, query]
          };
        }
      }
      
      // Combine all query parts
      if (queryParts.length > 0) {
        // If we already have $or from Contact_Type, we need to combine properly
        if (contactQuery.$or) {
          // Contact_Type filter exists, combine with $and
          contactQuery.$and = [
            { $or: contactQuery.$or },
            ...(queryParts.length === 1 ? [queryParts[0]] : queryParts)
          ];
          delete contactQuery.$or;
        } else {
          if (queryParts.length === 1) {
            Object.assign(contactQuery, queryParts[0]);
          } else {
            contactQuery.$and = queryParts;
          }
        }
      }
    }

    // Handle deal conditions - get contacts associated with filtered deals
    const dealConditions = conditions.filter((c) => c.entity === 'deal');
    let dealContactIds = [];
    
    if (dealConditions.length > 0) {
      const dealQuery = {};
      const andConditions = [];
      let currentGroup = [];
      
      for (let i = 0; i < dealConditions.length; i++) {
        const cond = dealConditions[i];
        const query = this.buildConditionQuery(cond);
        
        if (i === 0 || cond.logicalOperator === 'AND') {
          currentGroup.push(query);
        } else {
          if (currentGroup.length > 0) {
            andConditions.push({ $and: currentGroup });
          }
          currentGroup = [query];
        }
      }
      
      if (currentGroup.length > 0) {
        andConditions.push({ $and: currentGroup });
      }
      
      if (andConditions.length > 0) {
        Object.assign(dealQuery, { $and: andConditions });
      }

      // Get deals and extract contact IDs
      const deals = await Deal.find(dealQuery).select('contact').lean();
      dealContactIds = deals.map(d => d.contact).filter(Boolean);
    }

    // Combine contact conditions with deal-based contacts
    if (dealContactIds.length > 0) {
      contactQuery._id = { $in: dealContactIds };
    }

    // Fetch contacts
    console.log(`[AutomationService] Contact query:`, JSON.stringify(contactQuery, null, 2));
    const contacts = await Contact.find(contactQuery).lean();
    console.log(`[AutomationService] Found ${contacts.length} contacts after filtering`);
    return contacts;
  }

  /**
   * Build MongoDB query from condition
   */
  static buildConditionQuery(condition) {
    const { field, selectedValue } = condition;
    
    if (!field || selectedValue === undefined || selectedValue === null || selectedValue === '') {
      return {};
    }

    const fieldPath = field;
    const isBooleanField = fieldPath === 'Is_Active' || fieldPath === 'isActive' || fieldPath === 'blocked' || fieldPath === 'emailVerified';
    
    // Process single value
    let processedValue = selectedValue;
    
    if (isBooleanField) {
      if (selectedValue === 'true' || selectedValue === true || selectedValue === 'True' || selectedValue === 'TRUE') {
        processedValue = true;
      } else if (selectedValue === 'false' || selectedValue === false || selectedValue === 'False' || selectedValue === 'FALSE') {
        processedValue = false;
      } else if (typeof selectedValue === 'boolean') {
        processedValue = selectedValue;
      } else {
        return {};
      }
    } else if (typeof selectedValue === 'string' && selectedValue !== '' && !isNaN(selectedValue) && !isNaN(parseFloat(selectedValue))) {
      const numValue = Number(selectedValue);
      if (!isNaN(numValue)) {
        processedValue = numValue;
      }
    }

    if (fieldPath.includes('customFields.')) {
      const customFieldKey = fieldPath.replace('customFields.', '');
      // Handle both structures: customFields.fieldId.value and customFields.fieldId (direct value)
      return {
        $or: [
          { [`customFields.${customFieldKey}.value`]: processedValue },
          { [`customFields.${customFieldKey}`]: processedValue }
        ]
      };
    }

    return {
      [fieldPath]: processedValue
    };
  }

  /**
   * Send message to a contact using automation channels
   * @param {Object} [options] - Optional. Set { isTestingPersona: true } when sending to testing personas (for stats).
   */
  static async sendMessageToContact(contact, automation, tenantId, tenantDB, Conversation, Message, MessageLog, options = {}) {
    const { channels } = automation;
    
    if (!channels || channels.length === 0) {
      throw new Error('No channels configured for automation');
    }

    // Sort channels by array index (order in which they were added)
    // Channels are already in the correct order in the array
    const sortedChannels = [...channels];

    // Try each channel in order until one succeeds
    let lastError = null;
    
    for (const channelConfig of sortedChannels) {
      try {
        const channelAccount = channelConfig.channelAccountId;
        const template = channelConfig.templateId;
        
        // Get channel type - check both populated object and direct reference
        let channelType = null;
        if (typeof channelAccount === 'object' && channelAccount !== null) {
          channelType = channelAccount.type || channelConfig.channel;
        } else {
          // If not populated, use the channel field from config
          channelType = channelConfig.channel;
        }
        
        if (!channelType) {
          console.error(`[AutomationService] Invalid channel account:`, channelAccount);
          throw new Error('Invalid channel account - missing type');
        }
        
        console.log(`[AutomationService] Attempting to send via ${channelType} channel`);

        // ✅ CRITICAL: Extract channelAccountId safely as a string once and reuse everywhere
        // With .lean() + .populate(), channelAccount is a plain object with _id as ObjectId
        const channelAccountId = String(channelAccount?._id || channelAccount || '');
        if (!channelAccountId || channelAccountId === 'undefined' || channelAccountId === 'null') {
          throw new Error('Invalid channel account - missing ID');
        }
        console.log(`[AutomationService] 🔑 Channel account ID: ${channelAccountId} (type: ${typeof channelAccount._id})`);

        
        // ✅ ISSUE 3 FIX: Match department to contact's department when possible
        // Instead of always using departments[0], check if the contact belongs to
        // one of the automation's departments and use that for conversation segregation.
        let departmentId = null;
        if (automation.departments && automation.departments.length > 0) {
          const automationDeptIds = automation.departments.map(d =>
            (typeof d === 'object' ? d._id : d)?.toString()
          );

          // Check if the contact has a department that matches one of the automation's departments
          const contactDeptId = contact.department
            ? (typeof contact.department === 'object' ? contact.department._id : contact.department)?.toString()
            : null;

          if (contactDeptId && automationDeptIds.includes(contactDeptId)) {
            // Use the contact's own department (matches one of the automation's departments)
            departmentId = contact.department;
            if (typeof departmentId === 'object') departmentId = departmentId._id;
          } else {
            // Fallback: use the first automation department
            departmentId = typeof automation.departments[0] === 'object'
              ? automation.departments[0]._id
              : automation.departments[0];
          }
        }

        // Fallback: Get department from channel account if automation doesn't have one
        if (!departmentId && typeof channelAccount === 'object' && channelAccount.departmentId) {
          departmentId = typeof channelAccount.departmentId === 'object'
            ? channelAccount.departmentId._id
            : channelAccount.departmentId;
        }
        
        // Find best matching conversation in a single query.
        // Fetches all active conversations for this contact+channel+department,
        // then picks the one matching channelAccount (preferred) or the most recent.
        const candidateConversations = await Conversation.find({
          contact: contact._id,
          channel: channelType,
          ...(departmentId && { department: departmentId }),
          status: { $in: ['active', 'open', 'pending'] },
          primaryConversation: null,
        }).sort({ lastMessageAt: -1 }).limit(5).lean();

        // Prefer exact channelAccount match, fall back to most recent
        let conversation = candidateConversations.find(
          c => c.channelAccount?.toString() === channelAccountId.toString()
        ) || candidateConversations[0] || null;

        if (!conversation) {
          // ✅ Determine conversation mode based on department's AI bot enabled status
          const { getConversationModeForDepartment } = await import('../conversation/ConversationModeHelper.js');
          const conversationMode = await getConversationModeForDepartment({
            departmentId: departmentId,
            tenantDB
          });
          
          conversation = await Conversation.create({
            contact: contact._id,
            channelAccount: channelAccountId,
            channel: channelType,
            department: departmentId,
            tenantId,
            status: 'active',
            mode: conversationMode,
            lastMessageAt: new Date(),
            messageCount: 1, // We're about to add the OWM message
            unreadCount: 0,
          });
          
          // Convert to plain object for consistency with findOne().lean()
          conversation = conversation.toObject ? conversation.toObject() : conversation;
        }
        
        // ✅ Get final department ID for message (from conversation, automation, or channel account)
        const messageDepartmentId = conversation.department || departmentId || null;

        // Prepare message content - match the structure used in regular message sending
        const templateObj = typeof template === 'object' ? template : null;
        const templateId = typeof template === 'object' ? template._id : template;
        const templateName = typeof template === 'object' ? (template.name || template.templateName) : null;
        const contactIdentifier = this.getContactIdentifier(contact, channelType);
        
        if (!contactIdentifier) {
          throw new Error(`Contact ${contact._id} has no identifier for channel ${channelType}`);
        }

        // Build content object matching the structure used in /api/messages/send
        let content = {};
        let messageContent = '';
        let messageType = 'text';
        let emailData = null;

        if (channelType === 'whatsapp' && templateObj) {
          // WhatsApp template message
          messageType = 'template';
          messageContent = templateName || 'Template';
          content = {
            type: 'template',
            templateName: templateName || templateObj.templateName,
            languageCode: templateObj.templateLanguage || templateObj.languageCode || 'en',
            bodyParameters: templateObj.bodyParameters || templateObj.parameters || [],
            parameters: templateObj.bodyParameters || templateObj.parameters || [],
          };
        } else if (channelType === 'email') {
          // Email message
          messageType = 'text';
          const emailBody = channelConfig.customContent?.body || templateObj?.body || templateObj?.templateBody || '';
          const emailSubject = channelConfig.customContent?.subject || templateObj?.subject || 'No Subject';
          messageContent = emailBody;
          content = {
            type: 'text',
            text: emailBody,
          };
          emailData = {
            subject: emailSubject,
            to: [contactIdentifier],
          };
        } else if (channelType === 'sms') {
          // SMS message
          messageType = 'text';
          const smsBody = channelConfig.customContent?.body || templateObj?.body || templateObj?.templateBody || '';
          messageContent = smsBody;
          content = {
            type: 'text',
            text: smsBody,
          };
        } else {
          // Default: text message
          messageType = 'text';
          const textBody = channelConfig.customContent?.body || templateObj?.body || templateObj?.templateBody || '';
          messageContent = textBody;
          content = {
            type: 'text',
            text: textBody,
          };
        }

        // Create message record - match the structure used in regular message sending
        // ✅ CRITICAL: Only include emailData for email channel to avoid index conflicts
        const messageData = {
          conversation: conversation._id,
          contact: contact._id,
          channel: channelType,
          channelAccount: channelAccountId,
          departmentId: messageDepartmentId, // ✅ CRITICAL: Store department ID for message segregation
          sender: automation.createdBy,
          type: messageType,
          content: messageContent,
          sendingModule: 'owm', // ✅ Mark message as sent from OWM automation
          metadata: {
            automationId: automation._id.toString(), // ✅ Store as string for consistent querying on Map fields
            automationName: automation.name,
            templateId: templateId ? templateId.toString() : null,
            templateName: templateName,
            ...(options.isTestingPersona && { isTestingPersona: true }),
            ...(content.type === 'template' && {
              templateLanguage: content.languageCode,
              templateParameters: content.bodyParameters || content.parameters,
            }),
          },
          direction: 'outbound',
          status: 'pending',
          createdAt: new Date(),
        };
        
        // ✅ Only add emailData for email channel (prevents null emailData.messageId in index)
        if (channelType === 'email' && emailData) {
          messageData.emailData = {
            subject: emailData.subject,
            to: emailData.to,
          };
        }
        
        const message = await Message.create(messageData);

        // ✅ Initialize all outcome tracking records for this conversation/automation
        // This ensures all outcomes are tracked (matched and unmatched)
        try {
          const OutcomeMatchingService = (await import('./OutcomeMatchingService.js')).default;
          await OutcomeMatchingService.initializeOutcomes(
            tenantId,
            conversation._id.toString(),
            contact._id.toString(),
            automation._id.toString()
          );
        } catch (outcomeInitError) {
          console.error(`[AutomationService] Failed to initialize outcomes for conversation ${conversation._id}:`, outcomeInitError);
          // Don't fail the message sending if outcome initialization fails
        }

        // Enqueue message for sending - use the same structure as regular message sending
        const queueData = {
          messageId: message._id.toString(),
          conversationId: conversation._id.toString(),
          contactId: contact._id.toString(),
          channelType,
          channelAccountId: channelAccountId,
          content: content, // ✅ Use the properly structured content object
          ...(emailData && { emailData }), // ✅ Include emailData for email channel
          metadata: {
            automationId: automation._id.toString(),
            automationName: automation.name,
            targetIdentifier: contactIdentifier,
          },
          tenantId,
          userId: (automation.createdBy?._id || automation.createdBy)?.toString(),
        };

        try {
          await publishOutboundMessage(queueData);
          console.log(`[AutomationService] ✅ Message queued to RabbitMQ for contact ${contact._id} via ${channelType}:`, {
            messageId: message._id.toString(),
            conversationId: conversation._id.toString(),
            contactId: contact._id.toString(),
            channelType,
            channelAccountId: channelAccountId.toString(),
            contentType: content.type,
            templateName: content.templateName || 'N/A',
            queueName: QUEUES.MESSAGE_OUTBOUND,
          });
        } catch (queueError) {
          console.error(`[AutomationService] ❌ Failed to queue message ${message._id} to RabbitMQ:`, queueError);
          // Mark message as failed so it doesn't stay pending forever
          await Message.findByIdAndUpdate(message._id, {
            status: 'failed',
            failedAt: new Date(),
            errorMessage: 'Failed to queue message for delivery',
            $set: {
              'metadata.error': 'Failed to queue message for delivery: ' + (queueError.message || 'Unknown error'),
              'metadata.errorCategory': 'queue',
              'metadata.failedAt': new Date(),
            },
          });
          throw new Error(`Failed to queue message for contact ${contact._id}: ${queueError.message}`);
        }

        // Log message queued for automation
        await MessageLog.create({
          messageId: message._id,
          automationId: automation._id,
          logType: 'automation',
          eventType: 'message_queued',
          channel: channelType,
          message: `Message queued for contact via automation "${automation.name}" on ${channelType}`,
          status: 'info',
          tenantId: tenantId,
          contactId: contact._id,
          conversationId: conversation._id,
          userId: automation.createdBy?._id || automation.createdBy,
          data: {
            automationId: automation._id.toString(),
            automationName: automation.name,
            messageId: message._id.toString(),
            channelType,
            templateId: templateId?.toString(),
            templateName: templateName,
          },
        });

        // Update conversation
        await Conversation.updateOne(
          { _id: conversation._id },
          {
            lastMessageAt: new Date(),
            lastMessage: message._id,
          }
        );

        // ✅ CRITICAL: Emit socket event immediately for real-time display
        // This ensures messages appear in real-time when conversation is selected
        const messageDataForEmission = {
          _id: message._id,
          conversationId: conversation._id.toString(),
          contactId: contact._id.toString(),
          channelType: channelType,
          channel: channelType,
          content: messageContent,
          type: messageType,
          direction: 'outbound',
          status: 'pending', // Will be updated to 'sent' by messageOutboundWorker
          createdAt: message.createdAt,
          sender: automation.createdBy?._id || automation.createdBy || null,
          metadata: message.metadata,
          ...(messageType === 'template' && {
            templateName: templateName,
            templateLanguage: content.languageCode,
            templateParameters: content.bodyParameters || content.parameters,
          }),
          // ✅ Include emailData for email messages
          ...(channelType === 'email' && message.emailData && { emailData: message.emailData }),
        };

        // ✅ Get department ID from conversation
        const deptId = conversation.department || messageDepartmentId;

        // ✅ Check for grouped conversations (for company admin unified view)
        let allGroupedConversationIds = null;
        if (conversation.contact && conversation.channel) {
          const contactId = typeof conversation.contact === 'object' 
            ? conversation.contact._id || conversation.contact 
            : conversation.contact;
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

        // ✅ Emit to conversation room and tenant room for real-time updates
        await SocketEmitter.emitNewMessage(
          conversation._id,
          messageDataForEmission,
          tenantId,
          deptId,
          allGroupedConversationIds
        );

        // ✅ Also emit to tenant room with contact info for conversation list updates
        await SocketEmitter.emit(`tenant:${tenantId}`, 'message:new', {
          message: messageDataForEmission,
          conversationId: conversation._id.toString(),
          contact: {
            _id: contact._id,
            name: contact.name || contact.displayName,
            identifier: contactIdentifier,
          },
        });

        console.log(`[AutomationService] ✅ Message created and socket event emitted for real-time display:`, {
          messageId: message._id.toString(),
          conversationId: conversation._id.toString(),
          channelType,
        });

        // Success - return result with message and conversation IDs
        return {
          messageId: message._id.toString(),
          conversationId: conversation._id.toString(),
          channelType,
          status: 'pending',
        };
      } catch (error) {
        const channelName = channelConfig.channel || (typeof channelConfig.channelAccountId === 'object' ? channelConfig.channelAccountId?.type : 'unknown');
        const channelIdx = sortedChannels.indexOf(channelConfig) + 1;
        const totalChannels = sortedChannels.length;

        console.error(`[AutomationService] ❌ Channel ${channelIdx}/${totalChannels} (${channelName}) failed:`, error.message);
        lastError = error;

        // Log fallback attempt if there are more channels to try
        if (channelIdx < totalChannels) {
          const nextChannel = sortedChannels[channelIdx];
          const nextChannelName = nextChannel?.channel || 'unknown';
          console.log(`[AutomationService] 🔄 Falling back to channel ${channelIdx + 1}/${totalChannels} (${nextChannelName})...`);
        }
        // Continue to next channel
      }
    }

    // All channels failed
    console.error(`[AutomationService] ❌ All ${sortedChannels.length} channels failed for contact ${contact._id}. Last error: ${lastError?.message}`);
    throw lastError || new Error('All channels failed');
  }

  /**
   * Get contact identifier for a channel type
   * Matches the logic used in /api/messages/send
   */
  static getContactIdentifier(contact, channelType) {
    // First check channel-specific identifiers
    if (contact.identifiers && contact.identifiers[channelType]) {
      return contact.identifiers[channelType];
    }
    
    // ✅ WebChat: Use webchat identifier or sessionId
    if (channelType === 'webchat') {
      return contact.identifiers?.webchat || contact.sessionId || null;
    }
    
    // ✅ Fallback to general phone field for WhatsApp/SMS
    if ((channelType === 'whatsapp' || channelType === 'sms') && contact.phone) {
      return contact.phone;
    }
    
    // ✅ Fallback to email for email channel - check main email field
    if (channelType === 'email' && contact.email) {
      return contact.email;
    }
    
    // Return null if no identifier found
    return null;
  }
}

export default AutomationService;

