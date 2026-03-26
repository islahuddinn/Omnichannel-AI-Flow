

// src/services/channel/adapters/WhatsAppAdapter.js
import { BaseAdapter } from './BaseAdapter.js';
import crypto from 'crypto';

export class WhatsAppAdapter extends BaseAdapter {
  constructor(credentials, options = {}) {
    super(credentials, options);
    
    console.log('🔐 WhatsAppAdapter - Initializing with credentials:', {
      hasToken: !!credentials?.token,
      hasPhoneNumberId: !!credentials?.phoneNumberId,
      availableKeys: Object.keys(credentials || {})
    });
    
    this.channelType = 'whatsapp';
    this.apiVersion = 'v21.0';
    this.baseUrl = 'https://graph.facebook.com';
    this.supportedTypes = ['text', 'template', 'image', 'video', 'audio', 'document', 'interactive', 'location', 'contacts', 'reaction'];
    
    // ✅ Store account settings (including defaultTemplateLanguage) from options
    this.accountSettings = options.accountSettings || {};
    
    this.validateCredentials();
  }

  /**
   * Validate required credentials
   */
  validateCredentials() {
    super.validateCredentials();
  
    console.log('🔐 WhatsAppAdapter - Validating credentials:', {
      tokenLength: this.credentials.token?.length,
      phoneNumberId: this.credentials.phoneNumberId,
      allCredentials: this.credentials
    });
    
    // Use only 'token' field from database (no accessToken field)
    if (!this.credentials.token) {
      throw new Error('WhatsApp token is required. Available keys: ' + Object.keys(this.credentials).join(', '));
    }
    
    if (!this.credentials.phoneNumberId) {
      throw new Error('WhatsApp phone number ID is required');
    }

    // Normalize credentials - ensure we only use token field
    this.credentials = {
      ...this.credentials,
      // Token is the only auth field we use
    };
  }

  /**
   * Send message via WhatsApp Business API
   */
  async sendMessage(data) {
    try {
      // Validate template existence if sending template message
      if (data.content?.type === 'template' && data.content?.templateName) {
        const templateExists = await this.validateTemplateExists(data.content.templateName);

        if (templateExists === false) {
          // Definitively does not exist
          throw new Error(
            `WhatsApp template "${data.content.templateName}" does not exist in your WhatsApp Business account. ` +
            `Please create it in Meta Business Manager first.`
          );
        }
        // templateExists === null means validation was skipped (API unavailable)
        // templateExists === true means template was found
      }

      console.log('📤 Sending WhatsApp message:', {
        phoneNumberId: this.credentials.phoneNumberId,
        tokenLength: this.credentials.token?.length,
        messageTo: data.to,
        messageType: data.content.type
      });

      this.validateContent(data.content);
      this.log('info', 'Sending WhatsApp message', { to: data.to, type: data.content.type });

      const payload = this.buildMessagePayload(data);
      const url = `${this.baseUrl}/${this.apiVersion}/${this.credentials.phoneNumberId}/messages`;

   

      // Use token field for authentication
      const response = await this.makeRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.credentials.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      this.log('info', 'WhatsApp message sent successfully', {
        messageId: response.messages?.[0]?.id,
        recipient: response.contacts?.[0]?.wa_id
      });

      return this.formatSuccess({
        messageId: response.messages?.[0]?.id,
        whatsappMessageId: response.messages?.[0]?.id,
        status: 'sent',
        recipientId: response.contacts?.[0]?.wa_id,
        providerResponse: response,
      });

    } catch (error) {
      this.log('error', 'WhatsApp message failed', {
        error: error.message,
        code: error.response?.data?.error?.code
      });
      
      // Enhanced error handling for template issues
      if (error.message.includes('Template name does not exist') || 
          error.response?.data?.error?.code === 132001 ||
          error.response?.data?.error?.code === 131026) {
        const enhancedError = new Error(
          `WhatsApp template "${data.content?.templateName}" does not exist or is not approved. ` +
          `Please create and approve the template in Meta Business Manager. ` +
          `Original error: ${error.message}`
        );
        enhancedError.code = 'TEMPLATE_NOT_FOUND';
        throw enhancedError;
      }
      
      throw this.handleWhatsAppError(error);
    }
  }

  /**
   * Build message payload based on content type
   */
  buildMessagePayload(data) {
    const basePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.normalizePhoneNumber(data.to),
    };

    const { content, metadata = {} } = data;

    switch (content.type) {
      case 'text':
        return {
          ...basePayload,
          type: 'text',
          text: {
            body: content.text,
            preview_url: content.previewUrl || false,
          },
          ...this.buildContext(metadata),
        };

      case 'template':
        return this.buildTemplatePayload(basePayload, content);

      case 'image':
        if (!content.url && !content.link) {
          throw new Error('Image message requires url or link in content');
        }
        return {
          ...basePayload,
          type: 'image',
          image: {
            link: content.url || content.link,
            caption: content.caption,
          },
          ...this.buildContext(metadata),
        };

      case 'video':
        if (!content.url && !content.link) {
          throw new Error('Video message requires url or link in content');
        }
        return {
          ...basePayload,
          type: 'video',
          video: {
            link: content.url || content.link,
            caption: content.caption,
          },
          ...this.buildContext(metadata),
        };

      case 'audio':
        // ✅ Support both mediaId (preferred) and URL/link for audio messages
        if (content.mediaId) {
          return {
            ...basePayload,
            type: 'audio',
            audio: {
              id: content.mediaId,
            },
            ...this.buildContext(metadata),
          };
        } else if (content.url || content.link) {
          return {
            ...basePayload,
            type: 'audio',
            audio: {
              link: content.url || content.link,
            },
            ...this.buildContext(metadata),
          };
        } else {
          throw new Error('Audio message requires mediaId, url, or link in content');
        }

      case 'document':
        return {
          ...basePayload,
          type: 'document',
          document: {
            link: content.url || content.link,
            caption: content.caption,
            filename: content.filename,
          },
          ...this.buildContext(metadata),
        };

      case 'location':
        return {
          ...basePayload,
          type: 'location',
          location: {
            latitude: content.latitude,
            longitude: content.longitude,
            name: content.name,
            address: content.address,
          },
        };

      case 'contacts':
        return {
          ...basePayload,
          type: 'contacts',
          contacts: content.contacts,
        };

      case 'interactive':
        return {
          ...basePayload,
          type: 'interactive',
          interactive: content.interactiveData,
          ...this.buildContext(metadata),
        };

      case 'reaction':
        if (!content.message_id) {
          throw new Error('Reaction message requires message_id in content');
        }
        // ✅ Meta API: Empty string removes reaction, emoji string adds reaction
        const emojiValue = content.emoji || '';
        return {
          ...basePayload,
          type: 'reaction',
          reaction: {
            message_id: content.message_id,
            emoji: emojiValue, // Empty string removes reaction, emoji string adds reaction
          },
        };

      default:
        throw new Error(`Unsupported message type: ${content.type}`);
    }
  }

  /**
   * Build template message payload
   */
  buildTemplatePayload(basePayload, content) {
    console.log('📋 Building WhatsApp template payload:', {
      templateName: content.templateName,
      languageCode: content.languageCode,
      bodyParameters: content.bodyParameters,
      headerParameters: content.headerParameters,
      buttons: content.buttons
    });

    if (!content.templateName) {
      throw new Error('Template name is required for WhatsApp template messages');
    }

    // ✅ Get language code from content, or fall back to account's default template language, or 'en'
    let languageCode = content.languageCode || 
                       content.templateLanguage || 
                       this.accountSettings?.defaultTemplateLanguage || 
                       'en';
    
    // Convert to proper WhatsApp format if needed
    if (languageCode.length === 2) {
      // Map common 2-letter codes to WhatsApp format
      const languageMap = {
        'en': 'en',
        'es': 'es',
        'pt': 'pt_BR',
        'fr': 'fr',
        'de': 'de',
        'it': 'it',
        'ar': 'ar',
        'hi': 'hi',
        'id': 'id',
        'ru': 'ru',
        'zh': 'zh_CN',
      };
      languageCode = languageMap[languageCode] || languageCode;
    }

    console.log('🌐 Using template language:', {
      fromContent: content.languageCode || content.templateLanguage,
      fromAccountSettings: this.accountSettings?.defaultTemplateLanguage,
      final: languageCode
    });

    return {
      ...basePayload,
      type: 'template',
      template: {
        name: content.templateName,
        language: {
          code: languageCode, // ✅ Use calculated languageCode instead of hardcoded 'en'
        },
        components: this.buildTemplateComponents(content),
      },
    };
  }

  /**
   * Build template components (header, body, buttons)
   */
  buildTemplateComponents(content) {
    const components = [];

    // Header parameters
    if (content.headerParameters && content.headerParameters.length > 0) {
      components.push({
        type: 'header',
        parameters: content.headerParameters.map(param => {
          const paramType = param.type || 'text';
          const base = { type: paramType };

          if (paramType === 'text') {
            base.text = String(param.value ?? param.text ?? '');
          } else if (paramType === 'image') {
            base.image = { link: param.url };
          } else if (paramType === 'video') {
            base.video = { link: param.url };
          } else if (paramType === 'document') {
            base.document = { link: param.url, filename: param.filename };
          }

          return base;
        }),
      });
    }

    // Body parameters
    if (content.bodyParameters && content.bodyParameters.length > 0) {
      components.push({
        type: 'body',
        parameters: content.bodyParameters.map((param, index) => {
          const textValue = param.value ?? param.text ?? '';
          if (!textValue && textValue !== '') {
            console.warn(`Template body parameter at index ${index} has no value or text`);
          }
          return {
            type: param.type || 'text',
            text: String(textValue),
          };
        }),
      });
    }

    // Button parameters
    if (content.buttons && content.buttons.length > 0) {
      content.buttons.forEach((button, index) => {
        components.push({
          type: 'button',
          sub_type: button.sub_type || 'quick_reply',
          index: index,
          parameters: [{
            type: 'payload',
            payload: button.payload,
          }],
        });
      });
    }

    return components;
  }

  /**
   * Build reply context for message threading
   */
  buildContext(metadata) {
    if (metadata.replyToMessageId) {
      return {
        context: {
          message_id: metadata.replyToMessageId,
        },
      };
    }
    return {};
  }

  /**
   * Normalize and validate phone number to E.164 format
   */
  normalizePhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') {
      throw new Error('Phone number is required');
    }

    // Remove all non-digit characters except +
    let normalized = phone.replace(/[^\d+]/g, '');

    // Handle 00 international prefix
    if (normalized.startsWith('00')) {
      normalized = '+' + normalized.substring(2);
    }

    // Ensure it starts with +
    if (!normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }

    // Validate E.164 format: + followed by 1-15 digits, first digit non-zero
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (!e164Regex.test(normalized)) {
      throw new Error(`Invalid phone number format: "${phone}". Expected E.164 format (e.g., +1234567890)`);
    }

    return normalized;
  }

  /**
   * Handle WhatsApp API errors with comprehensive Meta error code coverage
   */
  handleWhatsAppError(error) {
    const whatsappError = error.response?.data?.error;

    if (whatsappError) {
      // Comprehensive Meta WhatsApp API error map with user-friendly messages
      const errorMap = {
        // Auth & permissions
        10: { message: 'Permission denied - check app permissions', category: 'auth', retryable: false },
        190: { message: 'Invalid or expired access token - reconnect your WhatsApp account', category: 'auth', retryable: false },
        200: { message: 'API permission error - check app role permissions', category: 'auth', retryable: false },

        // Parameter errors
        100: { message: 'Invalid parameter - check your request format', category: 'validation', retryable: false },
        131008: { message: 'Message too long - reduce message length', category: 'validation', retryable: false },
        131009: { message: 'Invalid parameter value', category: 'validation', retryable: false },
        131051: { message: 'Invalid parameter value', category: 'validation', retryable: false },
        131052: { message: 'Unsupported message type for this recipient', category: 'validation', retryable: false },

        // Recipient errors
        131021: { message: 'This phone number is not registered on WhatsApp', category: 'recipient', retryable: false },
        131026: { message: 'Message failed - recipient cannot receive messages at this time', category: 'recipient', retryable: false },
        131047: { message: 'Re-engagement message required - more than 24 hours since last reply', category: 'session', retryable: false },

        // Template errors
        131025: { message: 'Template parameter mismatch - check parameter count and format', category: 'template', retryable: false },
        132000: { message: 'Template parameter count mismatch', category: 'template', retryable: false },
        132001: { message: 'Template does not exist - create it in Meta Business Manager', category: 'template', retryable: false },
        132005: { message: 'Template parameter count mismatch', category: 'template', retryable: false },
        132007: { message: 'Template format does not match the approved template', category: 'template', retryable: false },
        132012: { message: 'Template parameter format is invalid', category: 'template', retryable: false },
        132015: { message: 'Template is not approved - submit for approval in Meta Business Manager', category: 'template', retryable: false },
        132016: { message: 'Template is paused due to low quality - review in Meta Business Manager', category: 'template', retryable: false },
        132018: { message: 'Template parameter issue - check parameter format and count', category: 'template', retryable: false },

        // Rate limiting
        130429: { message: 'Rate limit exceeded - too many messages sent, please wait', category: 'rate_limit', retryable: true },
        131048: { message: 'Messaging limit reached for this contact - try again later', category: 'rate_limit', retryable: true },
        131056: { message: 'Pair rate limit exceeded - too many messages to this number', category: 'rate_limit', retryable: true },

        // Account issues
        131030: { message: 'WhatsApp Business account is temporarily restricted - check Meta Business Manager', category: 'account', retryable: false },
        131031: { message: 'Business account verification required - verify in Meta Business Manager', category: 'account', retryable: false },
        131034: { message: 'WhatsApp account needs to be re-linked', category: 'account', retryable: false },
        131042: { message: 'Business eligibility payment issue - check billing in Meta Business Manager', category: 'billing', retryable: false },
        131045: { message: 'WhatsApp number is not part of a business account', category: 'account', retryable: false },

        // Policy & spam
        133000: { message: 'Message blocked - suspected spam', category: 'policy', retryable: false },
        131049: { message: 'Message blocked as spam by WhatsApp', category: 'policy', retryable: false },
        368: { message: 'Account temporarily blocked for policy violations - review Meta Business guidelines', category: 'policy', retryable: false },

        // Media errors
        131053: { message: 'Media upload failed - check file format and size', category: 'media', retryable: true },
        131054: { message: 'Media download failed - URL may be unreachable', category: 'media', retryable: true },

        // System errors
        1: { message: 'Unknown error from WhatsApp - try again', category: 'system', retryable: true },
        2: { message: 'WhatsApp service temporarily unavailable - try again', category: 'system', retryable: true },
        500: { message: 'WhatsApp server error - try again later', category: 'system', retryable: true },
        131000: { message: 'Something went wrong - try again', category: 'system', retryable: true },
      };

      const errorInfo = errorMap[whatsappError.code];
      const userMessage = errorInfo?.message || whatsappError.message || 'Unknown WhatsApp error';
      const category = errorInfo?.category || 'unknown';
      const retryable = errorInfo?.retryable ?? false;

      const formattedError = new Error(userMessage);
      formattedError.code = `WHATSAPP_${whatsappError.code}`;
      formattedError.metaErrorCode = whatsappError.code;
      formattedError.category = category;
      formattedError.retryable = retryable;
      formattedError.details = whatsappError;
      formattedError.userMessage = userMessage;
      return formattedError;
    }

    // Handle HTTP-level errors
    if (error.response?.status === 429) {
      const rateLimitError = new Error('WhatsApp API rate limit exceeded - try again later');
      rateLimitError.code = 'WHATSAPP_RATE_LIMIT';
      rateLimitError.category = 'rate_limit';
      rateLimitError.retryable = true;
      rateLimitError.userMessage = 'Too many messages sent - please wait and try again';
      return rateLimitError;
    }

    // Handle network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      const networkError = new Error('WhatsApp API is temporarily unreachable - try again');
      networkError.code = 'WHATSAPP_NETWORK_ERROR';
      networkError.category = 'network';
      networkError.retryable = true;
      networkError.userMessage = 'Could not reach WhatsApp - please try again';
      return networkError;
    }

    return error;
  }

  /**
   * Validate webhook signature
   */
  async validateWebhook(signature, payload) {
    try {
      // Use token for webhook validation if appSecret not available
      const secret = this.credentials.appSecret || this.credentials.token;
      
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      const providedSignature = signature.replace('sha256=', '');
      
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(providedSignature)
      );
    } catch (error) {
      this.log('error', 'Webhook validation failed', { error: error.message });
      return false;
    }
  }

  /**
   * Parse incoming webhook
   */
  async parseWebhook(payload) {
    try {
      console.log('🔍 WhatsAppAdapter.parseWebhook - Raw payload:', {
        object: payload.object,
        hasEntry: !!payload.entry,
        entryCount: payload.entry?.length || 0
      });
      
      const entry = payload.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      // ✅ Enhanced logging to debug reaction messages
      const messageTypes = value?.messages?.map(m => m.type) || [];
      const hasReactionMessages = messageTypes.includes('reaction');
      
      console.log('🔍 WhatsAppAdapter.parseWebhook - Extracted value:', {
        hasValue: !!value,
        hasMessages: !!(value?.messages?.length),
        messageCount: value?.messages?.length || 0,
        messageTypes: messageTypes,
        hasReactionMessages: hasReactionMessages,
        hasStatuses: !!(value?.statuses?.length),
        statusCount: value?.statuses?.length || 0,
        metadata: value?.metadata ? Object.keys(value.metadata) : []
      });
      
      // ✅ Log full message structure for reactions
      if (hasReactionMessages) {
        const reactionMessages = value.messages.filter(m => m.type === 'reaction');
        console.log('🔍 WhatsAppAdapter.parseWebhook - Found reaction messages:', {
          count: reactionMessages.length,
          reactions: reactionMessages.map(m => ({
            id: m.id,
            from: m.from,
            reaction: m.reaction
          }))
        });
      }

      if (!value) {
        console.log('⚠️ WhatsAppAdapter.parseWebhook - No value in webhook payload');
        return null;
      }

      // ✅ CRITICAL: Handle messages FIRST (reactions come as messages, not statuses)
      // Messages take priority because they contain actual content (reactions, text, media, etc.)
      if (value.messages && value.messages.length > 0) {
        console.log('✅ WhatsAppAdapter.parseWebhook - Found messages, parsing...');
        const parsed = this.parseIncomingMessage(value);
        console.log('✅ WhatsAppAdapter.parseWebhook - Parsed message:', {
          type: parsed.type,
          messageId: parsed.messageId,
          from: parsed.from,
          contentType: parsed.content?.type,
          isReaction: parsed.content?.type === 'reaction'
        });
        return parsed;
      }

      // Handle status updates (only if no messages found)
      // Note: Status updates are for outbound messages we sent, not incoming reactions
      if (value.statuses && value.statuses.length > 0) {
        console.log('✅ WhatsAppAdapter.parseWebhook - Found statuses, parsing...');
        const parsed = this.parseStatusUpdate(value);
        console.log('✅ WhatsAppAdapter.parseWebhook - Parsed status:', {
          type: parsed.type,
          messageId: parsed.messageId,
          status: parsed.status
        });
        return parsed;
      }

      console.log('⚠️ WhatsAppAdapter.parseWebhook - No messages or statuses found');
      return null;
    } catch (error) {
      console.error('❌ WhatsAppAdapter.parseWebhook - Error:', {
        error: error.message,
        stack: error.stack
      });
      this.log('error', 'Failed to parse webhook', { error: error.message });
      throw error;
    }
  }

  /**
   * Parse incoming message from webhook
   */
  parseIncomingMessage(value) {
    const message = value.messages?.[0];
    if (!message) {
      throw new Error('No message found in webhook payload');
    }

    const contact = value.contacts?.[0];
    const metadata = value.metadata;

    // Safely parse timestamp - fallback to current time if invalid
    let parsedTimestamp;
    if (message.timestamp) {
      const ts = parseInt(message.timestamp);
      parsedTimestamp = !isNaN(ts) ? new Date(ts * 1000) : new Date();
    } else {
      parsedTimestamp = new Date();
    }

    const parsed = {
      type: 'message',
      messageId: message.id || `unknown_${Date.now()}`,
      from: message.from || contact?.wa_id || 'unknown',
      timestamp: parsedTimestamp,
      contact: {
        waId: contact?.wa_id || message.from,
        profileName: contact?.profile?.name || null,
        name: contact?.profile?.name || null,
      },
      content: {},
      metadata: {
        context: message.context || null,
        phoneNumberId: metadata?.phone_number_id || null,
        displayPhoneNumber: metadata?.display_phone_number || null,
      },
    };

    switch (message.type) {
      case 'text':
        parsed.content = {
          type: 'text',
          text: message.text.body,
        };
        break;

      case 'image':
        parsed.content = {
          type: 'image',
          mediaId: message.image.id,
          caption: message.image.caption,
          mimeType: message.image.mime_type,
          sha256: message.image.sha256,
        };
        break;

      case 'video':
        parsed.content = {
          type: 'video',
          mediaId: message.video.id,
          caption: message.video.caption,
          mimeType: message.video.mime_type,
          sha256: message.video.sha256,
        };
        break;

      case 'audio':
        parsed.content = {
          type: 'audio',
          mediaId: message.audio.id,
          mimeType: message.audio.mime_type,
          voice: message.audio.voice,
        };
        break;

      case 'document':
        parsed.content = {
          type: 'document',
          mediaId: message.document.id,
          filename: message.document.filename,
          caption: message.document.caption,
          mimeType: message.document.mime_type,
          sha256: message.document.sha256,
        };
        break;

      case 'location':
        parsed.content = {
          type: 'location',
          latitude: message.location.latitude,
          longitude: message.location.longitude,
          name: message.location.name,
          address: message.location.address,
        };
        break;

      case 'contacts':
        parsed.content = {
          type: 'contacts',
          contacts: message.contacts,
        };
        break;

      case 'interactive':
        parsed.content = {
          type: 'interactive',
          interactiveType: message.interactive.type,
        };

        // Button reply
        if (message.interactive.button_reply) {
          parsed.content.buttonReply = {
            id: message.interactive.button_reply.id,
            title: message.interactive.button_reply.title,
          };
        }

        // List reply
        if (message.interactive.list_reply) {
          parsed.content.listReply = {
            id: message.interactive.list_reply.id,
            title: message.interactive.list_reply.title,
            description: message.interactive.list_reply.description,
          };
        }
        break;

      case 'button':
        parsed.content = {
          type: 'button',
          text: message.button.text,
          payload: message.button.payload,
        };
        break;

      case 'reaction':
        parsed.content = {
          type: 'reaction',
          messageId: message.reaction.message_id,
          emoji: message.reaction.emoji,
        };
        break;

      case 'sticker':
        parsed.content = {
          type: 'sticker',
          mediaId: message.sticker.id,
          mimeType: message.sticker.mime_type,
          sha256: message.sticker.sha256,
          animated: message.sticker.animated,
        };
        break;

      default:
        parsed.content = {
          type: 'unknown',
          rawType: message.type,
          rawMessage: message,
        };
        this.log('warn', 'Unknown message type received', { type: message.type });
    }

    return parsed;
  }

  /**
   * Parse status update from webhook
   */
  parseStatusUpdate(value) {
    const status = value.statuses?.[0];
    if (!status) {
      throw new Error('No status found in webhook payload');
    }

    // Safely parse timestamp
    let parsedTimestamp;
    if (status.timestamp) {
      const ts = parseInt(status.timestamp);
      parsedTimestamp = !isNaN(ts) ? new Date(ts * 1000) : new Date();
    } else {
      parsedTimestamp = new Date();
    }

    return {
      type: 'status',
      messageId: status.id,
      status: status.status, // sent, delivered, read, failed
      timestamp: parsedTimestamp,
      recipientId: status.recipient_id,
      conversationId: status.conversation?.id,
      pricing: status.pricing,
      errors: status.errors,
      metadata: {
        phoneNumberId: value.metadata?.phone_number_id || null,
        displayPhoneNumber: value.metadata?.display_phone_number || null,
      },
    };
  }

  /**
   * Send media message
   */
  async sendMedia(data) {
    // For WhatsApp, media is sent via sendMessage
    return await this.sendMessage(data);
  }

  /**
   * Get message status
   */
  async getMessageStatus(messageId) {
    // WhatsApp doesn't provide direct status API - use webhooks
    throw new Error('Status retrieval not supported - use webhooks for delivery status');
  }

  /**
   * Upload media to WhatsApp
   */
  async uploadMedia(fileBuffer, mimeType, filename = 'file') {
    try {
      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      
      formData.append('messaging_product', 'whatsapp');
      formData.append('type', mimeType);
      
      formData.append('file', fileBuffer, {
        filename: filename,
        contentType: mimeType,
      });

      const url = `${this.baseUrl}/${this.apiVersion}/${this.credentials.phoneNumberId}/media`;

      const formBuffer = formData.getBuffer();
      
      const response = await this.makeRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.credentials.token}`,
          ...formData.getHeaders(),
          'Content-Length': formBuffer.length,
        },
        body: formBuffer,
      });

      this.log('info', 'Media uploaded successfully', { mediaId: response.id });

      return {
        mediaId: response.id,
      };
    } catch (error) {
      this.log('error', 'Media upload failed', { error: error.message });
      throw this.handleWhatsAppError(error);
    }
  }

  /**
   * Download media from WhatsApp
   */
  async downloadMedia(mediaId) {
    try {
      // Step 1: Get media URL
      const mediaInfoUrl = `${this.baseUrl}/${this.apiVersion}/${mediaId}`;
      const mediaInfo = await this.makeRequest(mediaInfoUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.credentials.token}`,
        },
      });

      this.log('info', 'Retrieved media info', { mediaId, url: mediaInfo.url });

      // Step 2: Download media
      const response = await fetch(mediaInfo.url, {
        headers: {
          'Authorization': `Bearer ${this.credentials.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to download media: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      
      return {
        buffer: Buffer.from(buffer),
        mimeType: mediaInfo.mime_type,
        sha256: mediaInfo.sha256,
        fileSize: mediaInfo.file_size,
      };
    } catch (error) {
      this.log('error', 'Media download failed', { error: error.message, mediaId });
      throw this.handleWhatsAppError(error);
    }
  }

  /**
   * Test connection using phone number ID
   */
  async testConnection() {
    try {
      const testUrl = `${this.baseUrl}/${this.apiVersion}/${this.credentials.phoneNumberId}`;
      
      const response = await this.makeRequest(testUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.credentials.token}`,
        },
      });

      this.log('info', 'WhatsApp connection test successful', {
        phoneNumberId: this.credentials.phoneNumberId,
        businessName: response.verified_name,
        displayPhoneNumber: response.display_phone_number
      });

      return {
        success: true,
        businessName: response.verified_name,
        phoneNumber: response.display_phone_number,
        quality: response.quality_rating,
        verifiedName: response.verified_name,
      };
    } catch (error) {
      this.log('error', 'WhatsApp connection test failed', {
        error: error.message,
        code: error.response?.data?.error?.code
      });
      throw this.handleWhatsAppError(error);
    }
  }

  /**
   * Get WhatsApp templates - WITH GRACEFUL ERROR HANDLING
   * Tries businessAccountId first, then phoneNumberId as fallback
   */
  async getTemplates() {
    try {
      // ✅ Try businessAccountId first (WABA ID) - this is the correct way to fetch templates
      let url;
      if (this.credentials.businessAccountId) {
        url = `${this.baseUrl}/${this.apiVersion}/${this.credentials.businessAccountId}/message_templates`;
        console.log('📋 Fetching WhatsApp templates using businessAccountId (WABA):', url);
      } else {
        // ✅ Fallback to phoneNumberId (may not work for all accounts)
        url = `${this.baseUrl}/${this.apiVersion}/${this.credentials.phoneNumberId}/message_templates`;
        console.log('📋 Fetching WhatsApp templates using phoneNumberId (fallback):', url);
      }
      
      const response = await this.makeRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.credentials.token}`,
        },
      });

      this.log('info', 'Fetched WhatsApp templates successfully', {
        templateCount: response.data?.length || 0,
        usedBusinessAccountId: !!this.credentials.businessAccountId
      });

      return response.data || [];
    } catch (error) {
      // ✅ If error 100: can't fetch templates with phone number ID
      // This means we need businessAccountId, but don't have it
      if (error.response?.data?.error?.code === 100) {
        this.log('warn', 'Cannot fetch templates - businessAccountId (WABA) required', {
          error: error.response.data.error.message,
          hasBusinessAccountId: !!this.credentials.businessAccountId,
          suggestion: 'Add businessAccountId (WABA ID) to credentials to fetch templates'
        });
        // ✅ Return special flag object to indicate templates can't be fetched
        return { __cannotFetch: true, reason: 'businessAccountId_required' };
      }
      
      this.log('error', 'Failed to fetch WhatsApp templates', {
        error: error.message,
        code: error.response?.data?.error?.code
      });
      throw this.handleWhatsAppError(error);
    }
  }

  /**
   * Validate if template exists
   * Returns: true (exists), false (not found), or null (validation skipped/unavailable)
   */
  async validateTemplateExists(templateName) {
    try {
      console.log('Validating template existence:', { templateName });

      let templates = [];
      try {
        const result = await this.getTemplates();

        // Templates couldn't be fetched (businessAccountId required)
        if (result && typeof result === 'object' && result.__cannotFetch) {
          console.warn('Cannot fetch templates for validation (businessAccountId required) - skipping pre-send check');
          return null; // null = validation skipped, let Meta API decide
        }

        templates = Array.isArray(result) ? result : [];
      } catch (templateError) {
        console.warn('Cannot fetch templates for validation:', templateError.message);
        return null; // null = validation skipped
      }

      // No templates returned - can't validate
      if (templates.length === 0) {
        console.warn('No templates returned from API - skipping pre-send check');
        return null;
      }

      const templateExists = templates.some(template => template.name === templateName);

      if (!templateExists) {
        console.warn('Template not found:', {
          templateName,
          availableTemplates: templates.map(t => t.name).slice(0, 20)
        });
      }

      return templateExists;
    } catch (error) {
      console.error('Template validation error:', error.message);
      return null; // null = validation skipped
    }
  }

  /**
   * Create WhatsApp template
   */
  async createTemplate(templateData) {
    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${this.credentials.phoneNumberId}/message_templates`;
      
      const response = await this.makeRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.credentials.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(templateData),
      });

      this.log('info', 'WhatsApp template created successfully', {
        templateId: response.id,
        templateName: response.name
      });

      return response;
    } catch (error) {
      this.log('error', 'Failed to create WhatsApp template', {
        error: error.message,
        code: error.response?.data?.error?.code
      });
      throw this.handleWhatsAppError(error);
    }
  }

  /**
   * Delete WhatsApp template
   */
  async deleteTemplate(templateName) {
    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${this.credentials.phoneNumberId}/message_templates?name=${templateName}`;
      
      const response = await this.makeRequest(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.credentials.token}`,
        },
      });

      this.log('info', 'WhatsApp template deleted successfully', {
        templateName: templateName,
        success: response.success
      });

      return response;
    } catch (error) {
      this.log('error', 'Failed to delete WhatsApp template', {
        error: error.message,
        code: error.response?.data?.error?.code
      });
      throw this.handleWhatsAppError(error);
    }
  }

  /**
   * Get WhatsApp Business Profile
   */
  async getBusinessProfile() {
    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${this.credentials.phoneNumberId}/whatsapp_business_profile`;
      
      const response = await this.makeRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.credentials.token}`,
        },
      });

      return response.data?.[0] || {};
    } catch (error) {
      this.log('error', 'Failed to get business profile', { error: error.message });
      throw this.handleWhatsAppError(error);
    }
  }

  /**
   * Update WhatsApp Business Profile
   */
  async updateBusinessProfile(profileData) {
    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${this.credentials.phoneNumberId}/whatsapp_business_profile`;
      
      const response = await this.makeRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.credentials.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          ...profileData,
        }),
      });

      return response;
    } catch (error) {
      this.log('error', 'Failed to update business profile', { error: error.message });
      throw this.handleWhatsAppError(error);
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId) {
    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${this.credentials.phoneNumberId}/messages`;
      
      const response = await this.makeRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.credentials.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }),
      });

      return this.formatSuccess({ success: response.success });
    } catch (error) {
      this.log('error', 'Failed to mark message as read', { error: error.message });
      throw this.handleWhatsAppError(error);
    }
  }
}