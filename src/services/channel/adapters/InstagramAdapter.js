


// src/services/channel/adapters/InstagramAdapter.js
import { BaseAdapter } from './BaseAdapter.js';
import crypto from 'crypto';

export class InstagramAdapter extends BaseAdapter {
  constructor(credentials, options = {}) {
    super(credentials, options);
    this.channelType = 'instagram';
    this.apiVersion = 'v21.0';
    this.baseUrl = 'https://graph.facebook.com';
    this.supportedTypes = ['text', 'image', 'video', 'audio'];
    
    this.validateCredentials();
  }

  validateCredentials() {
    super.validateCredentials();

    if (!this.credentials.pageAccessToken) {
      throw new Error('Instagram page access token is required');
    }
    if (!this.credentials.instagramBusinessAccountId) {
      throw new Error('Instagram business account ID is required');
    }
    if (!this.credentials.appSecret) {
      throw new Error('Instagram app secret is required');
    }
  }

  async sendMessage(data) {
    try {
      this.validateContent(data.content);
      this.log('info', 'Sending Instagram message', { to: data.to, type: data.content.type });

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

      this.log('info', 'Instagram message sent successfully', {
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
      this.log('error', 'Instagram message failed', { error: error.message });
      throw this.handleInstagramError(error);
    }
  }

  buildMessagePayload(data) {
    const { to, content, metadata = {} } = data;
    
    const basePayload = {
      recipient: { id: to },
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

      default:
        throw new Error(`Unsupported message type: ${content.type}`);
    }
  }

  handleInstagramError(error) {
    const instagramError = error.response?.data?.error;
    
    if (instagramError) {
      const errorMap = {
        100: 'Invalid parameter',
        190: 'Invalid access token',
        10: 'Permission denied',
        4: 'Rate limit exceeded',
      };

      const message = errorMap[instagramError.code] || instagramError.message;
      const formattedError = new Error(`Instagram Error (${instagramError.code}): ${message}`);
      formattedError.code = `INSTAGRAM_${instagramError.code}`;
      return formattedError;
    }

    return error;
  }

  async sendMedia(data) {
    return await this.sendMessage(data);
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

  async replyToStory(storyId, message) {
    return await this.sendMessage({
      to: storyId,
      content: {
        type: 'text',
        text: message,
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
      this.log('error', 'Instagram webhook validation failed', { error: error.message });
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

      return null;
    } catch (error) {
      this.log('error', 'Failed to parse Instagram webhook', { error: error.message });
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
          title: att.title,
        })),
      };
    }

    if (message.quick_reply) {
      parsed.metadata.quickReply = {
        payload: message.quick_reply.payload,
      };
    }

    // Story mention
    if (message.is_echo && message.attachments) {
      const attachment = message.attachments[0];
      if (attachment.type === 'story_mention') {
        parsed.metadata.storyMention = {
          storyId: attachment.payload.url,
        };
      }
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

  async getUserProfile(userId) {
    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${userId}?fields=name,profile_pic&access_token=${this.credentials.pageAccessToken}`;
      
      const response = await this.makeRequest(url, { method: 'GET' });

      return {
        id: userId,
        name: response.name,
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