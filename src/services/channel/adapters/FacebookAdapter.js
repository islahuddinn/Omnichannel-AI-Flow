



// src/services/channel/adapters/FacebookAdapter.js
import { BaseAdapter } from './BaseAdapter.js';
import crypto from 'crypto';

export class FacebookAdapter extends BaseAdapter {
  constructor(credentials, options = {}) {
    super(credentials, options);
    this.channelType = 'facebook';
    this.apiVersion = 'v21.0';
    this.baseUrl = 'https://graph.facebook.com';
    this.supportedTypes = ['text', 'image', 'video', 'audio', 'file', 'template', 'interactive'];
    
    this.validateCredentials();
  }

  validateCredentials() {
    super.validateCredentials();

    if (!this.credentials.pageAccessToken) {
      throw new Error('Facebook page access token is required');
    }
    if (!this.credentials.pageId) {
      throw new Error('Facebook page ID is required');
    }
    if (!this.credentials.appSecret) {
      throw new Error('Facebook app secret is required');
    }
  }

  async sendMessage(data) {
    try {
      this.validateContent(data.content);
      this.log('info', 'Sending Facebook message', { to: data.to, type: data.content.type });

      const payload = this.buildMessagePayload(data);
      const url = `${this.baseUrl}/${this.apiVersion}/me/messages`;

      const response = await this.makeRequest(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...payload,
          access_token: this.credentials.pageAccessToken,
        }),
      });

      this.log('info', 'Facebook message sent successfully', {
        messageId: response.message_id,
        recipient: response.recipient_id
      });

      return this.formatSuccess({
        messageId: response.message_id,
        status: 'sent',
        recipientId: response.recipient_id,
        providerResponse: response,
      });

    } catch (error) {
      this.log('error', 'Facebook message failed', { error: error.message });
      throw this.handleFacebookError(error);
    }
  }

  buildMessagePayload(data) {
    const { to, content, metadata = {} } = data;
    
    const basePayload = {
      recipient: { id: to },
      messaging_type: metadata.messagingType || 'RESPONSE',
    };

    switch (content.type) {
      case 'text':
        return {
          ...basePayload,
          message: {
            text: content.text,
          },
        };

      case 'image':
      case 'video':
      case 'audio':
      case 'file':
        return {
          ...basePayload,
          message: {
            attachment: {
              type: content.type,
              payload: {
                url: content.url,
                is_reusable: content.reusable || true,
              },
            },
          },
        };

      case 'template':
        return {
          ...basePayload,
          message: {
            attachment: {
              type: 'template',
              payload: content.templateData,
            },
          },
        };

      case 'interactive':
        return {
          ...basePayload,
          message: {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'generic',
                elements: content.elements,
              },
            },
          },
        };

      default:
        throw new Error(`Unsupported message type: ${content.type}`);
    }
  }

  handleFacebookError(error) {
    const facebookError = error.response?.data?.error;
    
    if (facebookError) {
      const errorMap = {
        100: 'Invalid parameter',
        190: 'Invalid access token',
        10: 'Permission denied',
        4: 'Rate limit exceeded',
        368: 'Temporary block for spam',
      };

      const message = errorMap[facebookError.code] || facebookError.message;
      const formattedError = new Error(`Facebook Error (${facebookError.code}): ${message}`);
      formattedError.code = `FACEBOOK_${facebookError.code}`;
      return formattedError;
    }

    return error;
  }

  async sendMedia(data) {
    return await this.sendMessage(data);
  }

  async sendTemplate(to, templateData) {
    return await this.sendMessage({
      to,
      content: {
        type: 'template',
        templateData,
      },
    });
  }

  async sendQuickReplies(to, text, quickReplies) {
    return await this.sendMessage({
      to,
      content: {
        type: 'text',
        text,
        quickReplies: quickReplies.map(qr => ({
          content_type: 'text',
          title: qr.title,
          payload: qr.payload,
        })),
      },
    });
  }

  async sendTypingIndicator(to, action = 'typing_on') {
    try {
      const url = `${this.baseUrl}/${this.apiVersion}/me/messages`;

      await this.makeRequest(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: to },
          sender_action: action,
          access_token: this.credentials.pageAccessToken,
        }),
      });

      return this.formatSuccess({ sent: true });
    } catch (error) {
      this.log('error', 'Failed to send typing indicator', { error: error.message });
      throw error;
    }
  }

  async validateWebhook(signature, payload) {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.credentials.appSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

      const providedSignature = signature.replace('sha256=', '');
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(providedSignature)
      );
    } catch (error) {
      this.log('error', 'Facebook webhook validation failed', { error: error.message });
      return false;
    }
  }

  async parseWebhook(payload) {
    try {
      const entry = payload.entry?.[0];
      const messaging = entry?.messaging?.[0];

      if (!messaging) return null;

      if (messaging.message) {
        return this.parseIncomingMessage(messaging);
      }

      if (messaging.delivery) {
        return this.parseDeliveryReceipt(messaging);
      }

      if (messaging.read) {
        return this.parseReadReceipt(messaging);
      }

      if (messaging.postback) {
        return this.parsePostback(messaging);
      }

      return null;
    } catch (error) {
      this.log('error', 'Failed to parse Facebook webhook', { error: error.message });
      throw error;
    }
  }

  parseIncomingMessage(messaging) {
    const message = messaging.message;

    const parsed = {
      type: 'message',
      messageId: message.mid,
      from: messaging.sender.id,
      to: messaging.recipient.id,
      timestamp: new Date(messaging.timestamp),
      content: {},
      metadata: {},
    };

    if (message.text) {
      parsed.content = {
        type: 'text',
        text: message.text,
      };
    }

    if (message.attachments) {
      parsed.content = {
        type: 'media',
        attachments: message.attachments.map(att => ({
          type: att.type,
          url: att.payload?.url,
          coordinates: att.payload?.coordinates,
          title: att.title,
        })),
      };
    }

    if (message.quick_reply) {
      parsed.metadata.quickReply = {
        payload: message.quick_reply.payload,
      };
    }

    if (messaging.referral) {
      parsed.metadata.referral = messaging.referral;
    }

    return parsed;
  }

  parseDeliveryReceipt(messaging) {
    return {
      type: 'status',
      status: 'delivered',
      messageIds: messaging.delivery.mids,
      watermark: messaging.delivery.watermark,
      timestamp: new Date(messaging.timestamp),
    };
  }

  parseReadReceipt(messaging) {
    return {
      type: 'status',
      status: 'read',
      watermark: messaging.read.watermark,
      timestamp: new Date(messaging.timestamp),
    };
  }

  parsePostback(messaging) {
    return {
      type: 'postback',
      from: messaging.sender.id,
      payload: messaging.postback.payload,
      title: messaging.postback.title,
      timestamp: new Date(messaging.timestamp),
      referral: messaging.postback.referral,
    };
  }

  async getUserProfile(userId) {
    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${userId}?fields=first_name,last_name,profile_pic&access_token=${this.credentials.pageAccessToken}`;
      
      const response = await this.makeRequest(url, { method: 'GET' });

      return {
        id: userId,
        firstName: response.first_name,
        lastName: response.last_name,
        profilePic: response.profile_pic,
      };
    } catch (error) {
      this.log('error', 'Failed to get user profile', { error: error.message });
      throw error;
    }
  }

  async getMessageStatus(messageId) {
    throw new Error('Status retrieval not supported - use delivery/read webhooks');
  }
}