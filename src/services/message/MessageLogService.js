// src/services/message/MessageLogService.js
import { getTenantDB } from '../../config/database.js';
import MessageLogSchema from '../../models/schemas/MessageLog.js';

class MessageLogService {
  /**
   * Create a message log entry
   * ✅ Professional: Validates data and prevents duplicate logs
   */
  static async log(tenantId, data) {
    try {
      // ✅ Validate required fields
      if (!tenantId || !data.messageId || !data.eventType) {
        // ✅ Suppress warnings for webhook logs without messageId (they're expected)
        if (data.eventType !== 'webhook_received') {
          console.warn('⚠️ MessageLogService.log: Missing required fields', {
            hasTenantId: !!tenantId,
            hasMessageId: !!data.messageId,
            hasEventType: !!data.eventType
          });
        }
        return null;
      }
      
      // ✅ CRITICAL: Skip logging for api_call and api_response - these are too granular
      // Only log final outcomes (created, sent, failed, delivered, read)
      if (data.eventType === 'api_call' || data.eventType === 'api_response') {
        return null; // Don't log these - too verbose
      }

      const tenantDB = await getTenantDB(tenantId);
      const MessageLog = tenantDB.models.MessageLog || tenantDB.model('MessageLog', MessageLogSchema);
      
      // ✅ Map status to valid enum values: 'success', 'error', 'warning', 'info'
      let logStatus = 'info';
      if (data.status === 'sent' || data.status === 'delivered' || data.status === 'read' || data.status === 'success') {
        logStatus = 'success';
      } else if (data.status === 'failed' || data.status === 'error') {
        logStatus = 'error';
      } else if (data.status === 'warning') {
        logStatus = 'warning';
      } else if (data.status === 'pending' || data.status === 'sending' || data.status === 'queued') {
        logStatus = 'info';
      }

      const logEntry = {
        messageId: data.messageId,
        conversationId: data.conversationId || null,
        contactId: data.contactId || null,
        tenantId: tenantId, // ✅ Use tenantId (required field)
        channel: data.channel || null,
        logType: data.logType || 'message',
        eventType: data.eventType,
        status: logStatus, // ✅ Use mapped status (must be one of: success, error, warning, info)
        message: data.description || `${data.eventType} event`, // ✅ Use 'message' field (required)
        data: {
          ...(data.details || {}),
          previousStatus: data.previousStatus || null,
          apiRequest: data.apiRequest || null,
          apiResponse: data.apiResponse || null,
          error: data.error || null,
          triggeredBy: data.triggeredBy || 'system',
          userId: data.userId || null,
          providerMessageId: data.providerMessageId || null,
          providerResponse: data.providerResponse || null,
          processingTime: data.processingTime || null,
          ...(data.metadata || {}),
        },
        createdAt: new Date()
      };
      
      const log = await MessageLog.create(logEntry);
      
      return log;
    } catch (error) {
      // ✅ Suppress duplicate key errors (if unique index exists)
      if (error.code === 11000 || error.message.includes('duplicate')) {
        console.warn('⚠️ Duplicate message log prevented:', data.eventType);
        return null;
      }
      
      console.error('❌ Error creating message log:', error.message);
      // Don't throw - logging failures shouldn't break the app
      return null;
    }
  }
  
  /**
   * Log message creation
   */
  static async logMessageCreated(tenantId, message, details = {}) {
    // ✅ Use channelType from details as fallback if message.channel is not set
    const channel = message.channel || details.channelType || details.channel || null;
    
    return this.log(tenantId, {
      messageId: message._id || message.id,
      conversationId: message.conversation || message.conversationId,
      contactId: message.contact || message.contactId || null,
      channel: channel,
      direction: message.direction,
      eventType: 'created',
      status: 'info', // ✅ Use 'info' instead of message.status (valid enum value)
      description: `Message created: ${message.type || 'text'}`,
      details: {
        messageType: message.type,
        content: message.content,
        hasAttachments: !!message.attachments?.length,
        attachmentCount: message.attachments?.length || 0,
        originalStatus: message.status || 'pending',
        ...details
      },
      triggeredBy: 'system'
    });
  }
  
  /**
   * Log message queued for sending
   */
  static async logMessageQueued(tenantId, message, queueData = {}) {
    // ✅ Use channelType from queueData as fallback if message.channel is not set
    const channel = message.channel || queueData.channelType || queueData.channel || null;
    
    return this.log(tenantId, {
      messageId: message._id || message.id,
      conversationId: message.conversation || message.conversationId,
      contactId: message.contact || message.contactId || null,
      channel: channel,
      direction: 'outbound',
      eventType: 'queued',
      status: 'info', // ✅ Use 'info' instead of 'pending' (valid enum value)
      description: 'Message queued for sending',
      details: {
        queueId: queueData.queueId,
        channelType: queueData.channelType,
        ...queueData
      },
      triggeredBy: 'system'
    });
  }
  
  /**
   * Log message sending attempt
   */
  static async logMessageSending(tenantId, message, requestData = {}) {
    // ✅ Use channelType from requestData as fallback if message.channel is not set
    const channel = message.channel || requestData.body?.channelType || requestData.channelType || requestData.channel || null;
    
    return this.log(tenantId, {
      messageId: message._id || message.id,
      conversationId: message.conversation || message.conversationId,
      contactId: message.contact || message.contactId || null,
      channel: channel,
      direction: 'outbound',
      eventType: 'sending',
      status: 'info', // ✅ Use 'info' instead of 'pending' (valid enum value)
      description: 'Message being sent',
      apiRequest: {
        method: requestData.method,
        url: requestData.url,
        headers: requestData.headers,
        body: requestData.body,
        timestamp: new Date()
      },
      details: requestData,
      triggeredBy: 'system'
    });
  }
  
  /**
   * Log message sent successfully
   * ✅ Professional: Only logs successful sends, failures use logMessageFailed
   */
  static async logMessageSent(tenantId, message, responseData = {}) {
    // ✅ Validate message exists
    if (!message || !message._id) {
      console.warn('⚠️ logMessageSent called with invalid message, skipping log');
      return null;
    }
    
    // ✅ Use channel from responseData as fallback if message.channel is not set
    const channel = message.channel || responseData.channelType || responseData.channel || null;
    
    return this.log(tenantId, {
      messageId: message._id || message.id,
      conversationId: message.conversation || message.conversationId,
      contactId: message.contact || message.contactId || null,
      channel: channel,
      direction: 'outbound',
      eventType: 'sent',
      status: 'success', // ✅ Use 'success' instead of 'sent' (valid enum value)
      previousStatus: message.status || 'pending',
      description: 'Message sent successfully',
      providerMessageId: responseData.providerMessageId,
      providerResponse: responseData.providerResponse,
      processingTime: responseData.processingTime,
      details: {
        channelType: responseData.channelType,
        channelAccountId: responseData.channelAccountId,
        ...responseData
      },
      triggeredBy: 'system'
    });
  }
  
  /**
   * Log message delivery status update
   */
  static async logStatusUpdate(tenantId, message, statusData = {}) {
    // ✅ Map status to valid enum values
    let logStatus = 'info';
    if (statusData.status === 'sent' || statusData.status === 'delivered' || statusData.status === 'read' || statusData.status === 'success') {
      logStatus = 'success';
    } else if (statusData.status === 'failed' || statusData.status === 'error') {
      logStatus = 'error';
    } else if (statusData.status === 'warning') {
      logStatus = 'warning';
    }
    
    return this.log(tenantId, {
      messageId: message._id || message.id,
      conversationId: message.conversation || message.conversationId,
      contactId: message.contact || message.contactId || null,
      channel: message.channel,
      direction: message.direction,
      eventType: 'status_updated',
      status: logStatus, // ✅ Use mapped status (valid enum value)
      previousStatus: statusData.previousStatus || message.status,
      description: `Message status updated: ${statusData.previousStatus || 'pending'} → ${statusData.status}`,
      details: {
        updateSource: statusData.source || 'webhook',
        providerMessageId: statusData.providerMessageId,
        originalStatus: statusData.status, // Store original status in details
        ...statusData
      },
      triggeredBy: statusData.source === 'webhook' ? 'webhook' : 'system'
    });
  }
  
  /**
   * Log message delivered
   */
  static async logMessageDelivered(tenantId, message, deliveryData = {}) {
    return this.log(tenantId, {
      messageId: message._id || message.id,
      conversationId: message.conversation || message.conversationId,
      contactId: message.contact || message.contactId || null,
      channel: message.channel,
      direction: 'outbound',
      eventType: 'delivered',
      status: 'success', // ✅ Use 'success' instead of 'delivered' (valid enum value)
      previousStatus: 'sent',
      description: 'Message delivered',
      details: {
        deliveredAt: deliveryData.deliveredAt,
        providerMessageId: deliveryData.providerMessageId,
        ...deliveryData
      },
      triggeredBy: 'webhook'
    });
  }
  
  /**
   * Log message read
   */
  static async logMessageRead(tenantId, message, readData = {}) {
    return this.log(tenantId, {
      messageId: message._id || message.id,
      conversationId: message.conversation || message.conversationId,
      contactId: message.contact || message.contactId || null,
      channel: message.channel,
      direction: 'outbound',
      eventType: 'read',
      status: 'success', // ✅ Use 'success' instead of 'read' (valid enum value)
      previousStatus: 'delivered',
      description: 'Message read',
      details: {
        readAt: readData.readAt,
        providerMessageId: readData.providerMessageId,
        ...readData
      },
      triggeredBy: 'webhook'
    });
  }
  
  /**
   * Log message failure
   */
  static async logMessageFailed(tenantId, message, errorData = {}) {
    return this.log(tenantId, {
      messageId: message._id || message.id,
      conversationId: message.conversation || message.conversationId,
      contactId: message.contact || message.contactId || null,
      channel: message.channel,
      direction: message.direction,
      eventType: 'failed',
      status: 'error', // ✅ Use 'error' instead of 'failed' (valid enum value)
      previousStatus: message.status || 'pending',
      description: `Message failed: ${errorData.message || 'Unknown error'}`,
      error: {
        message: errorData.message,
        code: errorData.code,
        stack: errorData.stack,
        details: errorData.details || {}
      },
      apiResponse: errorData.apiResponse,
      details: errorData,
      triggeredBy: 'system'
    });
  }
  
  /**
   * Log API call
   */
  static async logApiCall(tenantId, message, apiData = {}) {
    return this.log(tenantId, {
      messageId: message._id || message.id,
      conversationId: message.conversation || message.conversationId,
      channel: message.channel,
      direction: message.direction,
      eventType: 'api_call',
      status: message.status,
      description: `API call: ${apiData.method || 'POST'} ${apiData.url || ''}`,
      apiRequest: {
        method: apiData.method,
        url: apiData.url,
        headers: apiData.headers,
        body: apiData.body,
        timestamp: new Date()
      },
      details: apiData,
      triggeredBy: 'system'
    });
  }
  
  /**
   * Log API response
   */
  static async logApiResponse(tenantId, message, responseData = {}) {
    return this.log(tenantId, {
      messageId: message._id || message.id,
      conversationId: message.conversation || message.conversationId,
      channel: message.channel,
      direction: message.direction,
      eventType: 'api_response',
      status: message.status,
      description: `API response: ${responseData.status || ''} ${responseData.statusText || ''}`,
      apiResponse: {
        status: responseData.status,
        statusText: responseData.statusText,
        headers: responseData.headers,
        body: responseData.body,
        timestamp: new Date(),
        duration: responseData.duration
      },
      details: responseData,
      triggeredBy: 'system'
    });
  }
  
  /**
   * Log webhook received
   */
  static async logWebhookReceived(tenantId, message, webhookData = {}) {
    return this.log(tenantId, {
      messageId: message?._id || message?.id || null,
      conversationId: message?.conversation || message?.conversationId || null,
      contactId: message?.contact || message?.contactId || null,
      channel: message?.channel || webhookData.channel || null,
      direction: message?.direction || 'inbound',
      eventType: 'webhook_received',
      status: 'info', // ✅ Use 'info' instead of message?.status (valid enum value)
      description: `Webhook received: ${webhookData.eventType || 'status update'}`,
      details: {
        webhookPayload: webhookData.payload,
        eventType: webhookData.eventType,
        originalStatus: message?.status || 'delivered', // Store original status in details
        ...webhookData
      },
      triggeredBy: 'webhook'
    });
  }
  
  /**
   * Log message resend
   */
  static async logMessageResend(tenantId, message, resendData = {}) {
    return this.log(tenantId, {
      messageId: message._id || message.id,
      conversationId: message.conversation || message.conversationId,
      contactId: message.contact || message.contactId || null,
      channel: message.channel,
      direction: 'outbound',
      eventType: 'resend',
      status: 'info', // ✅ Use 'info' instead of 'pending' (valid enum value)
      previousStatus: 'failed',
      description: `Message resent (attempt ${resendData.attempt || 1})`,
      details: {
        resendAttempts: resendData.attempt,
        originalFailedAt: resendData.originalFailedAt,
        ...resendData
      },
      triggeredBy: resendData.userId ? 'user' : 'system',
      userId: resendData.userId
    });
  }
}

export default MessageLogService;

