// src/services/bot/BotService.js
/**
 * AI Bot Service
 * Extensible service for integrating with AI bot APIs
 * Supports multiple bot providers and can be easily extended
 */

import { publishOutboundMessage, QUEUES } from '../../lib/queue/rabbitmq.js';
import MessageSchema from '../../models/schemas/Message.js';
import ConversationSchema from '../../models/schemas/Conversation.js';
import ContactSchema from '../../models/schemas/Contact.js';
import CompanyAccountSchema from '../../models/schemas/CompanyAccount.js';
import CompanySchema from '../../models/schemas/Company.js';
import { getMasterDB } from '../../config/database.js';

// In-memory cache for department bot status (no Redis needed)
const _deptBotCache = new Map();
const DEPT_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

function getCachedDeptBot(deptId) {
  const entry = _deptBotCache.get(deptId);
  if (entry && Date.now() - entry.ts < DEPT_CACHE_TTL) return entry.value;
  _deptBotCache.delete(deptId);
  return undefined;
}

function setCachedDeptBot(deptId, value) {
  _deptBotCache.set(deptId, { value, ts: Date.now() });
}

// Company bot settings cache
const _companyBotCache = new Map();
const COMPANY_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

function getCachedCompanyBot(tenantId) {
  const entry = _companyBotCache.get(tenantId);
  if (entry && Date.now() - entry.ts < COMPANY_CACHE_TTL) return entry.value;
  _companyBotCache.delete(tenantId);
  return undefined;
}

function setCachedCompanyBot(tenantId, value) {
  _companyBotCache.set(tenantId, { value, ts: Date.now() });
}

// Export for cache invalidation when department settings change
export function invalidateDeptBotCache(deptId) {
  if (deptId) _deptBotCache.delete(deptId);
  else _deptBotCache.clear();
}

export function invalidateCompanyBotCache(tenantId) {
  if (tenantId) _companyBotCache.delete(tenantId);
  else _companyBotCache.clear();
}

// Per-tenant circuit breaker (no Redis needed)
const _circuitBreakers = new Map();
const CB_THRESHOLD = 5;        // Open after 5 consecutive failures
const CB_RESET_TIMEOUT = 30000; // Try again after 30 seconds

function _getBreaker(tenantId) {
  if (!_circuitBreakers.has(tenantId)) {
    _circuitBreakers.set(tenantId, { failures: 0, lastFailure: 0, isOpen: false });
  }
  return _circuitBreakers.get(tenantId);
}

function checkCircuitBreaker(tenantId) {
  const cb = _getBreaker(tenantId);
  if (!cb.isOpen) return true;
  if (Date.now() - cb.lastFailure > CB_RESET_TIMEOUT) {
    cb.isOpen = false;
    cb.failures = 0;
    console.log(`Bot API circuit breaker reset for tenant ${tenantId} (half-open)`);
    // Emit recovery event to tenant admins
    import('../socket/SocketEmitter.js').then(({ default: SocketEmitter }) => {
      SocketEmitter.emit(`tenant:${tenantId}`, 'bot:circuit_breaker', {
        tenantId,
        state: 'closed',
        timestamp: new Date().toISOString(),
      });
    }).catch(() => {});
    return true;
  }
  return false;
}

function recordBotAPISuccess(tenantId) {
  const cb = _getBreaker(tenantId);
  cb.failures = 0;
  cb.isOpen = false;
}

function recordBotAPIFailure(tenantId) {
  const cb = _getBreaker(tenantId);
  cb.failures++;
  cb.lastFailure = Date.now();
  if (cb.failures >= CB_THRESHOLD) {
    cb.isOpen = true;
    console.warn(`Bot API circuit breaker OPEN for tenant ${tenantId} after ${cb.failures} failures (will retry in ${CB_RESET_TIMEOUT / 1000}s)`);
    // Emit real-time alert to tenant admins
    import('../socket/SocketEmitter.js').then(({ default: SocketEmitter }) => {
      SocketEmitter.emit(`tenant:${tenantId}`, 'bot:circuit_breaker', {
        tenantId,
        state: 'open',
        failures: cb.failures,
        willRetryAt: new Date(Date.now() + CB_RESET_TIMEOUT).toISOString(),
        timestamp: new Date().toISOString(),
      });
    }).catch(() => {});
  }
}

export class BotService {
  /**
   * Check if AI bot is enabled for a company
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<boolean>} True if bot is enabled
   */
  /**
   * Get company bot settings
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} Bot settings { enabled, baseUrl }
   */
  static async getCompanyBotSettings(tenantId) {
    try {
      // Check cache first
      const cached = getCachedCompanyBot(tenantId);
      if (cached !== undefined) return cached;

      const masterDB = await getMasterDB();
      const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
      
      // Try multiple lookup strategies:
      // 1. First try by tenantDatabaseName (most common case)
      let company = await Company.findOne({ 
        tenantDatabaseName: tenantId 
      }).lean();
      
      // 2. If not found, try by _id (tenantId might be companyId)
      if (!company) {
        try {
          company = await Company.findById(tenantId).lean();
        } catch (e) {
          // Invalid ObjectId format, continue to next strategy
        }
      }
      
      // 3. If still not found and tenantId contains underscore, try extracting companyId
      if (!company && tenantId.includes('_')) {
        const parts = tenantId.split('_');
        if (parts.length > 1) {
          const possibleCompanyId = parts[parts.length - 1];
          try {
            company = await Company.findById(possibleCompanyId).lean();
          } catch (e) {
            // Invalid ObjectId format, continue
          }
        }
      }
      
      if (!company) {
        console.log('⚠️ Company not found for tenantId:', tenantId, '- AI Bot disabled by default');
        // Default settings if company not found - disabled by default
        const defaults = {
          enabled: false,
          baseUrl: '',
          apiSecret: ''
        };
        setCachedCompanyBot(tenantId, defaults);
        return defaults;
      }
      
      // Get settings from company features
      const aiBot = company.features?.aiBot || {};
      const enabled = aiBot.enabled === true;

      const settings = {
        enabled,
        // Direct AI integration fields
        provider: aiBot.provider || '',
        model: aiBot.model || '',
        apiKey: aiBot.apiKey || '',
        systemPrompt: aiBot.systemPrompt || '',
        temperature: aiBot.temperature ?? 0.7,
        maxTokens: aiBot.maxTokens ?? 1024,
        contextMessageCount: aiBot.contextMessageCount ?? 20,
        // Legacy third-party API fields
        baseUrl: aiBot.baseUrl || '',
        apiSecret: aiBot.apiSecret || '',
      };

      console.log('🤖 Company bot settings retrieved:', {
        tenantId,
        companyId: company._id?.toString(),
        enabled,
        provider: settings.provider || '(none)',
        model: settings.model || '(none)',
        hasApiKey: !!settings.apiKey,
        hasLegacyBaseUrl: !!settings.baseUrl,
      });

      setCachedCompanyBot(tenantId, settings);
      return settings;
    } catch (error) {
      console.error('❌ Error getting company bot settings:', error);
      // Default settings on error - disabled by default
      return {
        enabled: false,
        baseUrl: '',
        apiSecret: ''
      };
    }
  }

  /**
   * Generate AI response for a message
   * @param {Object} params - Bot request parameters
   * @param {string} params.tenantId - Tenant ID
   * @param {string} params.conversationId - Conversation ID
   * @param {string} params.contactId - Contact ID
   * @param {string} params.message - Incoming message content
   * @param {string} params.platform - Channel platform (whatsapp, email, etc.)
   * @param {string} params.contactName - Contact name
   * @returns {Promise<Object>} Bot response
   */
  static async generateResponse(params) {
    const {
      tenantId,
      conversationId,
      contactId,
      message,
      platform,
      contactName,
      departmentId,
      channelAccountId,
      contactType,
    } = params;

    // ✅ Check if AI bot is enabled for this department (with in-memory cache)
    if (departmentId) {
      const cachedDept = getCachedDeptBot(departmentId);
      if (cachedDept !== undefined) {
        if (!cachedDept.aiBotEnabled) {
          console.log(`🤖 AI Bot is disabled for department: ${cachedDept.name} (${departmentId}) - skipping bot call (cached)`);
          return null;
        }
        console.log(`✅ AI Bot is enabled for department: ${cachedDept.name} (${departmentId}) (cached)`);
      } else {
        try {
          const { getTenantDB } = await import('../../config/database.js');
          const DepartmentSchema = (await import('../../models/schemas/Department.js')).default;

          const tenantDB = await getTenantDB(tenantId);
          const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);

          const department = await Department.findById(departmentId).select('aiBotEnabled name').lean();

          if (department) {
            setCachedDeptBot(departmentId, { aiBotEnabled: department.aiBotEnabled, name: department.name });
          }

          if (department && !department.aiBotEnabled) {
            console.log(`🤖 AI Bot is disabled for department: ${department.name} (${departmentId}) - skipping bot call`);
            return null;
          }

          console.log(`✅ AI Bot is enabled for department: ${department?.name || 'Unknown'} (${departmentId})`);
        } catch (deptError) {
          console.error('⚠️ Failed to check department AI bot status:', deptError.message);
          // Continue with bot call on error to avoid blocking
        }
      }
    }

    // Get company bot settings - if disabled, don't respond even in auto mode
    const botSettings = await this.getCompanyBotSettings(tenantId);

    if (!botSettings.enabled) {
      console.log('🤖 AI Bot is disabled for this company - no response will be sent');
      return null;
    }

    // Determine which integration path to use
    const hasDirectConfig = botSettings.provider && botSettings.model && botSettings.apiKey;
    const hasLegacyConfig = botSettings.baseUrl && botSettings.baseUrl.trim();

    if (!hasDirectConfig && !hasLegacyConfig) {
      console.log('🤖 No AI configuration found — neither direct (provider/model/apiKey) nor legacy (baseUrl) is set');
      return null;
    }

    console.log('🤖 Bot settings check:', {
      tenantId,
      enabled: botSettings.enabled,
      directConfig: hasDirectConfig ? `${botSettings.provider}/${botSettings.model}` : false,
      legacyConfig: hasLegacyConfig || false,
    });

    // Check per-tenant circuit breaker before calling AI
    if (!checkCircuitBreaker(tenantId)) {
      console.warn(`AI circuit breaker is open for tenant ${tenantId} — skipping`);
      return { failed: true, reason: 'circuit_breaker_open' };
    }

    if (hasDirectConfig) {
      try {
        console.log('🤖 Generating AI response:', {
          provider: botSettings.provider,
          model: botSettings.model,
          tenantId,
          conversationId,
          platform,
          messageLength: message?.length || 0,
        });

        const { generateAIResponse } = await import('./AIGenerationService.js');

        const result = await generateAIResponse({
          aiConfig: botSettings,
          tenantId,
          conversationId,
          contactId,
          message,
          platform,
          contactName: contactName || 'User',
          messageType: params.messageType,
          channelAccountId,
          contactType,
          abortSignal: params.abortSignal || null,
        });

        // Track circuit breaker state
        if (result.failed) {
          recordBotAPIFailure(tenantId);
        } else {
          recordBotAPISuccess(tenantId);
        }

        return result;

      } catch (error) {
        console.error('❌ AI generation error:', error);
        recordBotAPIFailure(tenantId);
        const reason = error.name === 'AbortError' || error.name === 'TimeoutError' ? 'timeout' : 'api_error';
        return { failed: true, reason, error: error.message };
      }
    }

    // No direct AI configuration found
    console.log('🤖 AI provider not configured — set provider, model, and API key in Settings');
    return null;
  }

  /**
   * Send bot response as a message
   * Creates message in database and enqueues to RabbitMQ
   */
  static async sendBotResponse({
    tenantId,
    conversationId,
    contactId,
    channelType,
    channelAccountId,
    botResponse,
    tenantDB, // Required: tenant database connection
    userId = null, // System user for bot messages
    emailData = null, // Optional: Email-specific data (subject, to, cc, bcc) for email channel
    skipModeCheck = false, // Set true for OWM follow-ups (should send regardless of conversation mode)
    botMetadata = null, // AI response metadata (tokens, cost, response time)
  }) {
    try {
      console.log('📤 Sending bot response as message:', {
        conversationId,
        channelType,
        responseLength: botResponse?.length || 0,
      });

      // Get models from tenantDB (schemas are imported at top of file)
      const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
      const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
      const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
      const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);

      // Bug 14: Single query for both departmentId extraction AND grouped conversation lookup later
      const conversation = await Conversation.findById(conversationId)
        .select('department contact channel status mode isMerged mergedConversations').lean();
      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      // Re-check conversation mode before sending — may have switched to manual while bot was processing
      // Skip this check for OWM follow-ups (they should send regardless of mode)
      if (!skipModeCheck && conversation.mode && conversation.mode !== 'auto') {
        console.log(`Conversation ${conversationId} switched to ${conversation.mode} mode while bot was processing — discarding bot response`);
        return { success: false, reason: 'mode_changed' };
      }

      // ✅ CRITICAL: Resolve correct conversation if conversations were unmerged after bot was triggered
      // When merged, bot captures the primary conversation ID. If unmerged before response,
      // the response must go to the correct conversation for the target channel.
      if (conversation.channel !== channelType) {
        const stillMergedWithChannel = conversation.isMerged &&
          conversation.mergedConversations?.some(mc => mc.channel === channelType);
        if (!stillMergedWithChannel) {
          // Conversations were unmerged — find the correct conversation for this channel + contact
          const correctConv = await Conversation.findOne({
            contact: conversation.contact,
            channel: channelType,
            status: 'active',
            primaryConversation: { $exists: false }
          }).select('_id department').lean();
          if (correctConv) {
            console.log(`🔄 Bot response: Resolved conversation ${conversationId} (${conversation.channel}) → ${correctConv._id} (${channelType}) — conversations were unmerged`);
            conversationId = correctConv._id.toString();
            // Update department from the resolved conversation
            if (correctConv.department) {
              conversation.department = correctConv.department;
            }
          }
        }
      }

      // Get departmentId from conversation (required field)
      const departmentId = conversation.department;
      if (!departmentId) {
        throw new Error(`Conversation ${conversationId} does not have a department assigned`);
      }

      // ✅ For email channel, prepare emailData if not provided
      let finalEmailData = emailData;
      if (channelType === 'email' && !finalEmailData) {
        // Get contact and channel account to build emailData
        const contact = await Contact.findById(contactId).select('email identifiers').lean();
        const channelAccount = await CompanyAccount.findById(channelAccountId).select('identifier').lean();
        
        let contactEmail = null;
        if (contact) {
          contactEmail = contact.email || contact.identifiers?.email;
        }
        
        // ✅ CRITICAL: Get recent inbound email for contact email fallback AND original subject
        let originalSubject = null;
        if (!contactEmail) {
          try {
            const recentInboundMessage = await Message.findOne({
              conversation: conversationId,
              direction: 'inbound',
              channel: 'email'
            })
              .select('emailData')
              .sort({ createdAt: -1 })
              .lean();

            if (recentInboundMessage?.emailData?.from) {
              contactEmail = recentInboundMessage.emailData.from;
              console.log('✅ Using email from recent inbound message as fallback:', contactEmail);
            }
            // Bug 10: Get original subject from inbound email for proper threading
            if (recentInboundMessage?.emailData?.subject) {
              originalSubject = recentInboundMessage.emailData.subject;
            }
          } catch (error) {
            console.warn('⚠️ Failed to get email from recent inbound message:', error.message);
          }
        } else {
          // Bug 10: Even if we have contact email, still get the original subject
          try {
            const recentInboundMessage = await Message.findOne({
              conversation: conversationId,
              direction: 'inbound',
              channel: 'email'
            })
              .select('emailData.subject')
              .sort({ createdAt: -1 })
              .lean();
            if (recentInboundMessage?.emailData?.subject) {
              originalSubject = recentInboundMessage.emailData.subject;
            }
          } catch (error) {
            // Non-critical — fallback to default subject
          }
        }

        const fromEmail = channelAccount?.identifier;

        // Bug 10: Use original email subject with "Re:" prefix for proper threading
        const emailSubject = originalSubject
          ? (originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`)
          : 'Re: Your inquiry';

        // ✅ Always create emailData if we have a contactEmail (from contact or recent message fallback)
        if (contactEmail) {
          finalEmailData = {
            subject: emailSubject,
            to: [contactEmail],
            from: fromEmail,
          };
        }
      }

      // Create message in database
      // Note: content field must be a string, not an object (per Message schema)
      const message = await Message.create({
        conversation: conversationId,
        contact: contactId,
        channel: channelType,
        channelAccount: channelAccountId,
        departmentId: departmentId, // Required field
        sender: userId || null, // System user for bot messages
        type: 'text',
        content: botResponse, // ✅ Content must be a string, not an object
        // ✅ Store email-specific data if channel is email
        ...(channelType === 'email' && finalEmailData && {
          emailData: {
            subject: finalEmailData.subject || 'Re: Your inquiry',
            to: Array.isArray(finalEmailData.to) ? finalEmailData.to : [finalEmailData.to],
            from: finalEmailData.from,
            ...(finalEmailData.cc && { cc: Array.isArray(finalEmailData.cc) ? finalEmailData.cc : [finalEmailData.cc] }),
            ...(finalEmailData.bcc && { bcc: Array.isArray(finalEmailData.bcc) ? finalEmailData.bcc : [finalEmailData.bcc] }),
          }
        }),
        direction: 'outbound',
        status: 'pending',
        metadata: {
          isBotResponse: true,
          sentBy: userId || 'system',
          source: 'ai_bot',
          // AI analytics metadata
          ...(botMetadata && {
            responseTimeMs: botMetadata.responseTimeMs,
            inputTokens: botMetadata.inputTokens,
            outputTokens: botMetadata.outputTokens,
            totalTokens: botMetadata.totalTokens,
            costEstimate: botMetadata.costEstimate,
            aiProvider: botMetadata.provider,
            aiModel: botMetadata.model,
          }),
        },
        createdAt: new Date(),
      });

      console.log('💾 Bot message created:', {
        messageId: message._id.toString(),
        conversationId,
        ...(botMetadata && { tokens: botMetadata.totalTokens, cost: `$${botMetadata.costEstimate}`, responseMs: botMetadata.responseTimeMs }),
      });

      // ✅ CRITICAL: Emit message immediately with sender information (same as manual messages)
      // This ensures real-time display of sender name "AI Bot"
      try {
        const SocketEmitter = (await import('../socket/SocketEmitter.js')).default;
        const contact = await Contact.findById(contactId).select('name displayName phone email identifiers').lean();
        const channelAccount = await CompanyAccount.findById(channelAccountId).select('type name').lean();
        
        // Create sender data for bot messages
        const senderData = {
          _id: 'bot',
          firstName: 'AI',
          lastName: 'Bot',
          fullName: 'AI Bot',
          role: 'bot',
          avatar: null
        };

        // Build message data matching manual message structure exactly
        const messageDataForEmission = {
          _id: message._id,
          conversationId: conversationId.toString(),
          contactId: contactId.toString(),
          channelType: channelType,
          channel: channelType, // ✅ Include channel for client-side filtering
          channelAccount: channelAccount ? {
            _id: channelAccount._id.toString(),
            type: channelAccount.type,
            name: channelAccount.name,
          } : null,
          content: botResponse,
          type: 'text',
          direction: 'outbound',
          status: 'pending', // Will be updated to 'sent' by messageOutboundWorker
          createdAt: message.createdAt,
          sender: senderData, // ✅ Include sender information for real-time display
          metadata: {
            isBotResponse: true,
            sentBy: userId || 'system',
            source: 'ai_bot',
            ...(botMetadata && {
              responseTimeMs: botMetadata.responseTimeMs,
              totalTokens: botMetadata.totalTokens,
              costEstimate: botMetadata.costEstimate,
              aiProvider: botMetadata.provider,
              aiModel: botMetadata.model,
            }),
          },
          // ✅ Include email data for email messages
          ...(channelType === 'email' && finalEmailData && {
            emailData: {
              subject: finalEmailData.subject || 'Re: Your inquiry',
              to: Array.isArray(finalEmailData.to) ? finalEmailData.to : [finalEmailData.to],
              from: finalEmailData.from,
              ...(finalEmailData.cc && { cc: Array.isArray(finalEmailData.cc) ? finalEmailData.cc : [finalEmailData.cc] }),
              ...(finalEmailData.bcc && { bcc: Array.isArray(finalEmailData.bcc) ? finalEmailData.bcc : [finalEmailData.bcc] }),
            }
          })
        };

        // ✅ For WebChat, include 'to' field with webchat identifier for proper namespace emission
        if (channelType === 'webchat' && contact?.identifiers?.webchatId) {
          messageDataForEmission.to = contact.identifiers.webchatId;
          messageDataForEmission.contact = {
            _id: contact._id.toString(),
            identifiers: {
              webchat: contact.identifiers.webchatId
            }
          };
        }

        // ✅ Get all grouped conversations for company admin unified view (same as manual messages)
        // Bug 14: Reuse conversation object already fetched at line 351 instead of querying again
        let allGroupedConversationIds = null;

        if (conversation?.contact && conversation?.channel) {
          const contactIdForGrouping = conversation.contact?.toString() || conversation.contact;
          const channelForGrouping = conversation.channel;
          
          const allDepartmentConversations = await Conversation.find({
            contact: contactIdForGrouping,
            channel: channelForGrouping,
            status: { $in: ['active', 'open', 'pending'] },
            primaryConversation: { $exists: false }
          })
            .select('_id')
            .lean();
          
          if (allDepartmentConversations.length > 1) {
            allGroupedConversationIds = allDepartmentConversations.map(c => c._id);
          }
        }

        // ✅ Emit immediately using the same method as manual messages
        await SocketEmitter.emitNewMessage(
          conversationId,
          messageDataForEmission,
          tenantId,
          departmentId?.toString() || null,
          allGroupedConversationIds
        );

        console.log('✅ Bot message emitted in real-time with sender information');
      } catch (emitError) {
        // Don't fail the entire operation if emission fails
        console.error('⚠️ Failed to emit bot message in real-time:', emitError);
      }

      // Prepare content for queue (matching the format expected by messageOutboundWorker)
      // The queue expects an object with type and text for the adapter
      const content = {
        type: 'text',
        text: botResponse,
      };

      // Enqueue message to RabbitMQ (same as user-sent messages)
      const queueData = {
        messageId: message._id.toString(),
        conversationId: conversationId.toString(),
        contactId: contactId.toString(),
        channelType,
        channelAccountId: channelAccountId.toString(),
        content,
        // ✅ Include emailData for email channel
        ...(channelType === 'email' && finalEmailData && {
          emailData: {
            subject: finalEmailData.subject || 'Re: Your inquiry',
            to: Array.isArray(finalEmailData.to) ? finalEmailData.to : [finalEmailData.to],
            from: finalEmailData.from,
            ...(finalEmailData.cc && { cc: Array.isArray(finalEmailData.cc) ? finalEmailData.cc : [finalEmailData.cc] }),
            ...(finalEmailData.bcc && { bcc: Array.isArray(finalEmailData.bcc) ? finalEmailData.bcc : [finalEmailData.bcc] }),
          }
        }),
        metadata: {
          isBotResponse: true,
          sentBy: userId || 'system',
          source: 'ai_bot',
        },
        tenantId,
        userId: userId || 'system',
      };

      await publishOutboundMessage(queueData);

      // Clear any previous bot failure state now that bot responded successfully
      await Conversation.findByIdAndUpdate(conversationId, {
        $set: { 'botFailure.failed': false },
      });

      console.log('✅ Bot response queued for sending');

      return { success: true, messageId: message._id.toString() };

    } catch (error) {
      console.error('❌ Error sending bot response:', error);
      throw error;
    }
  }
}

export default BotService;

