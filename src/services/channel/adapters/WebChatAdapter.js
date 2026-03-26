

// src/services/channel/adapters/WebChatAdapter.js
import { BaseAdapter } from './BaseAdapter.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export class WebChatAdapter extends BaseAdapter {
  constructor(credentials, options = {}) {
    super(credentials, options);
    this.channelType = 'webchat';
    this.supportedTypes = ['text', 'image', 'video', 'audio', 'file', 'document', 'card'];
    this.sessions = new Map(); // { sessionId -> { messages: [], status, createdAt, closedAt, closeReason } }
    this.MAX_SESSIONS = 10000;
    this.MAX_MESSAGES_PER_SESSION = 100;

    this.validateCredentials();
  }

  validateCredentials() {
    super.validateCredentials();

    if (!this.credentials.widgetId) {
      throw new Error('WebChat widget ID is required');
    }
    if (!this.credentials.secretKey) {
      throw new Error('WebChat secret key is required');
    }
  }

  async sendMessage(data) {
    try {
      const { to, metadata = {}, replyTo } = data;

      // ✅ CRITICAL: Convert template messages to text for WebChat (WebChat doesn't support structured templates)
      // Similar to SMS, we need to extract the template body and send it as plain text
      let content = data.content;
      if (content?.type === 'template') {
        // Extract template text from various possible sources
        const templateText = content.text ||
          content.renderedText ||
          metadata?.renderedText ||
          metadata?.templateBody ||
          content.body ||
          content.templateName || // Fallback to template name if no body available
          '';

        // Convert template to text message
        content = {
          ...content,
          type: 'text',
          text: templateText,
        };

        this.log('info', 'Converting WebChat template to text', {
          templateName: content.templateName,
          textLength: templateText.length,
          textPreview: templateText.substring(0, 50)
        });
      }

      // ✅ CRITICAL: Convert document type to file type for WebChat (WebChat uses 'file' for documents)
      if (content?.type === 'document') {
        content = {
          ...content,
          type: 'file', // WebChat uses 'file' type for documents
        };

        this.log('info', 'Converting WebChat document to file type', {
          originalType: 'document',
          hasAttachments: !!(data.attachments && data.attachments.length > 0)
        });
      }

      // Validate content after conversion
      this.validateContent(content);
      this.log('info', 'Sending WebChat message', { to: data.to, type: content.type });
      
      // ✅ Use the actual messageId from metadata if available (from messageOutboundWorker)
      const messageId = metadata.messageId || this.generateMessageId();
      
      // ✅ CRITICAL: Get attachments from data.attachments (passed from messageOutboundWorker)
      // Voice messages have attachments in data.attachments, not in content.attachments
      const messageAttachments = data.attachments || content.attachments || [];
      
      // ✅ Prepare message data for delivery
      // ✅ Use converted content (template converted to text if needed)
      const messageForDelivery = {
        id: messageId,
        _id: messageId,
        sessionId: to,
        conversationId: metadata.conversationId,
        webchatIdentifier: to, // ✅ Store webchat identifier
        type: content.type || 'text',
        text: content.text || content.content || '',
        content: content.text || content.content || '',
        media: content.media,
        attachments: messageAttachments, // ✅ Use attachments from data, not just content
        replyTo: replyTo || null, // ✅ CRITICAL: Include replyTo data for replies
        timestamp: new Date().toISOString(),
        direction: 'outbound', // ✅ Messages from agent are outbound to visitor
        sender: {
          type: 'agent',
          name: metadata.agentName || 'Support Agent',
          avatar: metadata.agentAvatar,
        },
      };
      
      // ✅ Log attachment info for debugging
      if (messageAttachments.length > 0) {
        console.log('✅ WebChatAdapter: Including attachments in message:', {
          messageId,
          attachmentCount: messageAttachments.length,
          attachmentTypes: messageAttachments.map(a => a.type || a.mimeType || 'unknown'),
          hasUrls: messageAttachments.every(a => a.url || a.path || a.fileUrl)
        });
      } else if (content.type === 'audio') {
        console.warn('⚠️ WebChatAdapter: Audio message has no attachments:', {
          messageId,
          hasAttachmentsInData: !!(data.attachments && data.attachments.length > 0),
          hasAttachmentsInContent: !!(content.attachments && content.attachments.length > 0)
        });
      }
      
      // ✅ Actually deliver via Socket.IO
      await this.deliverToClient(to, messageForDelivery);
      
      // ✅ CRITICAL: Also emit status update to WebChat namespace
      try {
        const SocketManager = (await import('../../socket/SocketManager.js')).default;
        const io = SocketManager.getIO();
        if (io) {
          const webchatNamespace = io.of('/webchat');
          if (webchatNamespace && metadata.conversationId) {
            // Emit status update
            webchatNamespace.to(`webchat:${to}`).emit('message:status', {
              messageId: messageId,
              conversationId: metadata.conversationId,
              status: 'sent',
              timestamp: new Date().toISOString(),
            });
            
            // Emit delivered status after short delay
            setTimeout(() => {
              webchatNamespace.to(`webchat:${to}`).emit('message:status', {
                messageId: messageId,
                conversationId: metadata.conversationId,
                status: 'delivered',
                timestamp: new Date().toISOString(),
              });
            }, 500);
          }
        }
      } catch (statusError) {
        console.warn('⚠️ Failed to emit WebChat status update:', statusError.message);
      }

      this.log('info', 'WebChat message delivered', { messageId });

      return this.formatSuccess({
        messageId,
        channelMessageId: messageId,
        status: 'delivered',
        deliveredAt: new Date().toISOString(),
      });

    } catch (error) {
      this.log('error', 'WebChat message failed', { error: error.message });
      throw error;
    }
  }

  async sendMedia(data) {
    return await this.sendMessage(data);
  }

  async deliverToClient(sessionId, message) {
    // ✅ CRITICAL: Actually emit to Socket.IO WebChat namespace
    try {
      const SocketManager = (await import('../../socket/SocketManager.js')).default;
      const io = SocketManager.getIO();
      
      if (!io) {
        console.warn('⚠️ Socket.IO not initialized, cannot deliver WebChat message');
        return false;
      }
      
      const webchatNamespace = io.of('/webchat');
      if (!webchatNamespace) {
        console.warn('⚠️ WebChat namespace not found');
        return false;
      }
      
      // ✅ Emit message:new event to WebChat namespace
      // The widget listens for 'message:new' events
      // ✅ CRITICAL: Ensure attachments are properly formatted for voice messages
      const normalizedAttachments = (message.attachments || []).map(att => {
        // Ensure audio attachments have all required fields
        if (att.type === 'audio' || att.mimeType?.startsWith('audio/')) {
          return {
            ...att,
            type: att.type || 'audio',
            url: att.url || att.path || att.fileUrl,
            duration: att.duration || 0,
            size: att.size || 0,
            mimeType: att.mimeType || 'audio/mpeg',
            name: att.name || 'Voice message',
          };
        }
        return att;
      });
      
      const eventData = {
        message: {
          _id: message.id || message._id,
          conversationId: message.conversationId,
          content: message.text || message.content,
          type: message.type || 'text',
          attachments: normalizedAttachments, // ✅ Use normalized attachments
          replyTo: message.replyTo || null, // ✅ CRITICAL: Include replyTo for replies
          direction: 'outbound', // ✅ Messages from agent are outbound
          status: 'sent',
          createdAt: message.timestamp || new Date().toISOString(),
          sender: message.sender || {
            type: 'agent',
            name: 'Support Agent',
          },
        },
        conversationId: message.conversationId,
        timestamp: new Date().toISOString(),
      };
      
      // ✅ CRITICAL: Get room info to check if sockets are connected
      const roomName = `webchat:${sessionId}`;
      let roomSize = 0;
      try {
        // Try to get room size from adapter
        if (webchatNamespace.adapter && webchatNamespace.adapter.rooms) {
          const room = webchatNamespace.adapter.rooms.get(roomName);
          roomSize = room ? room.size : 0;
        }
      } catch (e) {
        // Fallback: just emit, room size check is optional
      }
      
      // ✅ Emit to the specific WebChat session room
      webchatNamespace.to(roomName).emit('message:new', eventData);
      
      // ✅ Also emit to the webchat identifier room if different from sessionId
      if (message.webchatIdentifier && message.webchatIdentifier !== sessionId) {
        const identifierRoomName = `webchat:${message.webchatIdentifier}`;
        let identifierRoomSize = 0;
        try {
          if (webchatNamespace.adapter && webchatNamespace.adapter.rooms) {
            const identifierRoom = webchatNamespace.adapter.rooms.get(identifierRoomName);
            identifierRoomSize = identifierRoom ? identifierRoom.size : 0;
          }
        } catch (e) {
          // Ignore
        }
        
        webchatNamespace.to(identifierRoomName).emit('message:new', eventData);
        
        console.log(`✅ WebChat message also emitted to identifier room ${identifierRoomName}:`, {
          messageId: message.id || message._id,
          roomSize: identifierRoomSize,
          hasAttachments: normalizedAttachments.length > 0
        });
      }
      
      console.log(`✅ WebChat message delivered to session ${sessionId}:`, {
        messageId: message.id || message._id,
        sessionId,
        roomName,
        roomSize,
        hasWebchatNamespace: !!webchatNamespace,
        hasAttachments: normalizedAttachments.length > 0,
        attachmentCount: normalizedAttachments.length
      });
      
      // ✅ Warn if no sockets in room
      if (roomSize === 0) {
        console.warn('⚠️ WebChat message emitted but no sockets in room:', {
          roomName,
          sessionId,
          webchatIdentifier: message.webchatIdentifier,
          messageId: message.id || message._id,
          suggestion: 'Check if WebChat client is connected and has joined the room'
        });
      }
      
      // Store message in session history (with size limits)
      if (!this.sessions.has(sessionId)) {
        // Evict oldest session if at capacity
        if (this.sessions.size >= this.MAX_SESSIONS) {
          const oldestKey = this.sessions.keys().next().value;
          this.sessions.delete(oldestKey);
        }
        this.sessions.set(sessionId, { messages: [], status: 'active', createdAt: new Date() });
      }
      const sessionData = this.sessions.get(sessionId);
      if (sessionData.messages.length >= this.MAX_MESSAGES_PER_SESSION) {
        sessionData.messages.shift(); // Remove oldest message
      }
      sessionData.messages.push(message);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to deliver WebChat message via Socket.IO:', error);
      return false;
    }
  }

  generateMessageId() {
    return `wc_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  }

  generateSessionToken(sessionData) {
    try {
      const token = jwt.sign(
        {
          sessionId: sessionData.sessionId,
          widgetId: this.credentials.widgetId,
          visitorId: sessionData.visitorId,
          metadata: sessionData.metadata,
        },
        this.credentials.secretKey,
        {
          expiresIn: '30d',
        }
      );

      return token;
    } catch (error) {
      this.log('error', 'Failed to generate session token', { error: error.message });
      throw error;
    }
  }

  verifySessionToken(token) {
    try {
      const decoded = jwt.verify(token, this.credentials.secretKey);
      return decoded;
    } catch (error) {
      this.log('error', 'Invalid session token', { error: error.message });
      return null;
    }
  }

  async validateWebhook(signature, payload) {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.credentials.secretKey)
        .update(JSON.stringify(payload))
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(signature)
      );
    } catch (error) {
      this.log('error', 'WebChat webhook validation failed', { error: error.message });
      return false;
    }
  }

  async parseWebhook(payload) {
    try {
      return {
        type: payload.type, // 'message', 'session_start', 'session_end'
        sessionId: payload.sessionId,
        visitorId: payload.visitorId,
        timestamp: new Date(payload.timestamp),
        data: payload.data,
      };
    } catch (error) {
      this.log('error', 'Failed to parse WebChat webhook', { error: error.message });
      throw error;
    }
  }

  async createSession(visitorData) {
    try {
      const sessionId = this.generateSessionId();
      
      const session = {
        sessionId,
        visitorId: visitorData.visitorId || this.generateVisitorId(),
        widgetId: this.credentials.widgetId,
        metadata: {
          ip: visitorData.ip,
          userAgent: visitorData.userAgent,
          referrer: visitorData.referrer,
          page: visitorData.page,
          language: visitorData.language,
          timezone: visitorData.timezone,
        },
        createdAt: new Date(),
        status: 'active',
      };

      // Generate JWT token
      const token = this.generateSessionToken(session);

      // Store session
      this.sessions.set(sessionId, { messages: [], status: 'active', createdAt: new Date() });

      return {
        session,
        token,
      };

    } catch (error) {
      this.log('error', 'Failed to create session', { error: error.message });
      throw error;
    }
  }

  generateSessionId() {
    return `session_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  generateVisitorId() {
    return `visitor_${crypto.randomBytes(12).toString('hex')}`;
  }

  async getSessionMessages(sessionId) {
    const sessionData = this.sessions.get(sessionId);
    return sessionData?.messages || [];
  }

  async closeSession(sessionId, reason = 'agent_closed') {
    const sessionData = this.sessions.get(sessionId);
    if (sessionData) {
      sessionData.status = 'closed';
      sessionData.closedAt = new Date();
      sessionData.closeReason = reason;
      // Clean up messages to free memory
      sessionData.messages = [];
    }

    return this.formatSuccess({ closed: true });
  }

  async getMessageStatus(messageId) {
    // WebChat has instant delivery
    return {
      messageId,
      status: 'delivered',
      deliveredAt: new Date().toISOString(),
    };
  }

  async sendTypingIndicator(sessionId, isTyping = true) {
    this.log('info', 'Sending typing indicator', { sessionId, isTyping });

    try {
      const SocketManager = (await import('../../socket/SocketManager.js')).default;
      const io = SocketManager.getIO();
      if (io) {
        const webchatNamespace = io.of('/webchat');
        webchatNamespace.to(`webchat:${sessionId}`).emit('agent:typing', {
          userId: 'agent',
          isTyping,
          timestamp: new Date(),
        });
      }
    } catch (err) {
      this.log('warn', 'Failed to emit typing indicator', { error: err.message });
    }

    return this.formatSuccess({ sent: true });
  }

  async transferToAgent(sessionId, agentId) {
    this.log('info', 'Transferring session to agent', { sessionId, agentId });
    
    // In real implementation, handle agent transfer logic
    return this.formatSuccess({ transferred: true });
  }
}