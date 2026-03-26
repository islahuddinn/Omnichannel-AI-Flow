// src/services/messaging/MessageSenderService.js
import ChannelServiceFactory from '../channel/ChannelServiceFactory.js';

export class MessageSenderService {
  /**
   * Send message through appropriate channel
   */
  static async sendMessage(messageData) {
    const {
      channelType,
      channelAccount,
      contactIdentifier,
      content,
      messageId,
      tenantId
    } = messageData;

    try {
      console.log(`📤 Sending ${channelType} message to ${contactIdentifier}`, {
        messageId,
        contentType: content.type,
        account: channelAccount.name
      });

      // Validate message before sending
      this.validateMessage(messageData);

      // Prepare message data for channel service
      const channelMessageData = {
        to: contactIdentifier,
        content: content
      };

      // Send message using appropriate channel service
      const result = await ChannelServiceFactory.sendMessage(
        channelType,
        channelAccount,
        channelMessageData
      );

      console.log(`✅ Message sent successfully:`, {
        messageId,
        channelMessageId: result.messageId,
        channelType
      });

      return {
        success: true,
        messageId: messageId,
        channelMessageId: result.messageId,
        recipientId: result.recipientId,
        sentAt: new Date(),
        meta: result.meta
      };

    } catch (error) {
      console.error(`❌ Failed to send ${channelType} message:`, error.message, {
        messageId,
        contactIdentifier,
        account: channelAccount.name
      });

      return {
        success: false,
        messageId: messageId,
        error: error.message,
        failedAt: new Date()
      };
    }
  }

  /**
   * Validate message before sending
   */
  static validateMessage(messageData) {
    const { channelType, channelAccount, contactIdentifier, content } = messageData;

    if (!channelType) {
      throw new Error('Channel type is required');
    }

    if (!channelAccount) {
      throw new Error('Channel account is required');
    }

    if (!contactIdentifier) {
      throw new Error('Contact identifier is required');
    }

    if (!content || !content.type) {
      throw new Error('Message content with type is required');
    }

    // Channel-specific validations
    switch (channelType) {
      case 'whatsapp':
        this.validateWhatsAppMessage(content, channelAccount);
        break;
      
      // Add other channel validations as needed
      // Note: Only WhatsApp has 24-hour session validation
      // Other channels like SMS, Email don't have this restriction
      
      default:
        // No special validation for other channels
        break;
    }

    return true;
  }

  /**
   * WhatsApp-specific validations (excluding 24-hour session check)
   * 24-hour session is checked separately in the API route
   */
  static validateWhatsAppMessage(content, channelAccount) {
    // Check if account has required credentials (token field, not accessToken)
    if (!channelAccount.credentials?.token || !channelAccount.credentials?.phoneNumberId) {
      throw new Error('WhatsApp account missing required credentials (token, phoneNumberId)');
    }

    // Template message validations
    if (content.type === 'template') {
      if (!content.templateName) {
        throw new Error('Template name is required for template messages');
      }
    }

    // Media message validations - allow mediaId as alternative to url
    if (['image', 'document', 'video'].includes(content.type)) {
      if (!content.url && !content.link && !content.mediaId) {
        throw new Error(`URL or mediaId is required for ${content.type} messages`);
      }
    }

    // Audio supports mediaId, url, or link
    if (content.type === 'audio') {
      if (!content.url && !content.link && !content.mediaId) {
        throw new Error('URL, link, or mediaId is required for audio messages');
      }
    }

    // Location message validations
    if (content.type === 'location') {
      if (!content.latitude || !content.longitude) {
        throw new Error('Latitude and longitude are required for location messages');
      }
    }
  }

  /**
   * Format content for different channels
   */
  static formatContentForChannel(channelType, originalContent) {
    // Clone the content to avoid mutations
    const content = { ...originalContent };

    switch (channelType) {
      case 'whatsapp':
        // Ensure WhatsApp-specific formatting
        if (content.type === 'text' && content.text) {
          // Truncate very long messages if needed
          if (content.text.length > 4096) {
            content.text = content.text.substring(0, 4096);
          }
        }
        break;
      
      // Add other channel formatting as needed
      // Note: Other channels may have different length limits
      
      default:
        break;
    }

    return content;
  }
}

export default MessageSenderService;