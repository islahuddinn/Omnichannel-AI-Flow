// src/services/channel/ChannelServiceFactory.js
import { getAdapter, getAdapterCapabilities } from './adapters/index.js';
import SocketManager from '../socket/SocketManager.js';
import MessageLogService from '../message/MessageLogService.js';
import { AudioConverter } from '../media/AudioConverter.js';
import { getWebChatSecret } from '../../lib/auth/webchatSecret.js';

export class ChannelServiceFactory {
  /**
   * Send message via any supported channel
   */
  static async sendMessage(channelType, account, messageData, options = {}) {
    const { emitStatus = true, conversationId, tenantId, messageId } = options;
    
    // ✅ Declare apiStartTime before try block to avoid ReferenceError in catch block
    let apiStartTime = Date.now();
    
    try {
      console.log('🔐 ChannelServiceFactory - Sending message with:', {
        channelType,
        accountId: account._id,
        accountName: account.name,
        messageTo: messageData.to,
        messageType: messageData.content?.type
      });

      // ✅ Log template messages based on channel type
      if (messageData.content?.type === 'template') {
        if (channelType === 'whatsapp') {
          console.log('📤 Sending WhatsApp template message:', {
            templateName: messageData.content.templateName,
            language: messageData.content.languageCode,
            parametersCount: messageData.content.bodyParameters?.length || 0,
            to: messageData.to
          });
        } else if (channelType === 'email') {
          console.log('📧 Sending Email template message:', {
            templateName: messageData.content.templateName,
            subject: messageData.content.subject,
            bodyLength: messageData.content.text?.length || 0,
            to: messageData.to
          });
        } else {
          console.log(`📤 Sending ${channelType} template message:`, {
            templateName: messageData.content.templateName,
            to: messageData.to
          });
        }
      }

      // Normalize credentials for backward compatibility
      const normalizedCredentials = this.normalizeCredentials(channelType, account.credentials);
      
      // Get adapter instance
      // ✅ Pass account identifier as option for EmailAdapter to use as fromEmail fallback
      // ✅ Pass account name for SMSAdapter to use as sender name fallback
      // ✅ Pass account settings (including defaultTemplateLanguage) for WhatsAppAdapter
      const adapterOptions = {
        timeout: options.timeout || 30000,
        ...(channelType === 'email' && account.identifier && { identifier: account.identifier }),
        ...(channelType === 'sms' && account.name && { identifier: account.name, accountName: account.name }),
        ...(channelType === 'whatsapp' && account.settings && { accountSettings: account.settings }),
      };

      // ✅ For email channels: inject company-level emailSettings (fromName, signature) as fallback
      if (channelType === 'email' && tenantId) {
        try {
          const { getMasterDB } = await import('../../config/database.js');
          const CompanySchema = (await import('../../models/schemas/Company.js')).default;
          const masterDB = await getMasterDB();
          const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
          const company = await Company.findOne({ tenantDatabaseName: tenantId })
            .select('emailSettings')
            .lean();
          console.log(`📧 [EmailSettings] Fetched for tenant "${tenantId}":`, {
            found: !!company,
            hasEmailSettings: !!company?.emailSettings,
            fromName: company?.emailSettings?.fromName || '(not set)',
            signatureEnabled: company?.emailSettings?.emailSignatureEnabled || false,
          });
          if (company?.emailSettings) {
            if (company.emailSettings.fromName?.trim()) {
              adapterOptions.companyFromName = company.emailSettings.fromName.trim();
            }
            if (company.emailSettings.replyToEmail?.trim()) {
              adapterOptions.companyReplyToEmail = company.emailSettings.replyToEmail.trim();
            }
            if (company.emailSettings.emailSignatureEnabled && company.emailSettings.emailSignature) {
              adapterOptions.companyEmailSignature = company.emailSettings.emailSignature;
              adapterOptions.companyEmailSignatureEnabled = true;
            }
          }
        } catch (err) {
          console.error('❌ Could not fetch company email settings:', err.message);
        }
      }

      const adapter = getAdapter(channelType, normalizedCredentials, adapterOptions);

      // ✅ Use messageId from options (for reaction messages) or metadata
      // Declare once at the top to avoid duplicate declarations
      const targetMessageId = messageId || messageData.metadata?.messageId;

      // Emit sending status if requested
      if (emitStatus && conversationId && targetMessageId) {
        this.emitMessageStatus(conversationId, targetMessageId, 'sending', tenantId);
      }

      // ✅ CRITICAL: Convert attachments to content for WhatsApp media messages
      // WhatsApp adapter expects content.url/link, not separate attachments
      // For audio messages, upload to WhatsApp first and use mediaId for better reliability
      if (channelType === 'whatsapp' && messageData.attachments && messageData.attachments.length > 0) {
        const attachment = messageData.attachments[0]; // Use first attachment for single media
        const attachmentType = attachment.type || (attachment.mimeType?.startsWith('image/') ? 'image' : 
                                                   attachment.mimeType?.startsWith('video/') ? 'video' :
                                                   attachment.mimeType?.startsWith('audio/') ? 'audio' : 'document');
        
        // ✅ Convert attachment to content if:
        // 1. Content doesn't have URL/link, OR
        // 2. Content type matches attachment type but URL is missing (for voice messages)
        const needsConversion = !messageData.content?.url && !messageData.content?.link;
        const isMatchingTypeWithoutUrl = messageData.content?.type === attachmentType && !messageData.content?.url && !messageData.content?.link;
        
        if (needsConversion || isMatchingTypeWithoutUrl) {
          const attachmentUrl = attachment.url || attachment.path || attachment.fileUrl;
          if (attachmentUrl) {
            // ✅ For audio messages, upload to WhatsApp first for better reliability
            if (attachmentType === 'audio') {
              try {
                console.log('📤 Uploading audio to WhatsApp before sending...', {
                  url: attachmentUrl,
                  mimeType: attachment.mimeType,
                  filename: attachment.name
                });
                
                // Download the audio file from S3/URL
                const audioResponse = await fetch(attachmentUrl);
                if (!audioResponse.ok) {
                  throw new Error(`Failed to fetch audio file: ${audioResponse.status}`);
                }
                
                let audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
                
                // ✅ Detect mimeType from attachment or response headers, default to OGG for WhatsApp
                let mimeType = attachment.mimeType;
                if (!mimeType) {
                  const contentType = audioResponse.headers.get('content-type');
                  mimeType = contentType || 'audio/ogg'; // WhatsApp supports OGG, MP3, AMR
                }
                
                // ✅ Convert webm to ogg if needed (WhatsApp doesn't support webm)
                // For now, we'll try to upload as-is and let WhatsApp reject if unsupported
                // In the future, we could add audio conversion here
                // ✅ Convert webm to ogg (WhatsApp requires OGG/Opus)
                if (mimeType.includes('webm')) {
                  console.log('🔄 Converting WebM audio to OGG (Opus) for WhatsApp...');
                  try {
                    audioBuffer = await AudioConverter.convert(audioBuffer, 'ogg');
                    mimeType = 'audio/ogg';
                    
                    // Update attachment name/filename to use .ogg extension
                    if (attachment.name) attachment.name = attachment.name.replace(/\.webm$/i, '.ogg');
                    if (attachment.filename) attachment.filename = attachment.filename.replace(/\.webm$/i, '.ogg');
                    
                    console.log('✅ Audio conversion successful');
                  } catch (err) {
                    console.error('❌ Audio conversion failed, proceeding with original file (may fail):', err);
                    // Retain original behavior as fallback (change mimeType but send original content)
                    mimeType = 'audio/ogg';
                  }
                }
                
                // Upload to WhatsApp
                const filename = attachment.name || attachment.filename || `audio.${mimeType.split('/')[1] || 'ogg'}`;
                const mediaId = await adapter.uploadMedia(audioBuffer, mimeType, filename);
                
                // Use mediaId instead of URL
                messageData.content = {
                  type: 'audio',
                  mediaId: mediaId.mediaId,
                  caption: attachment.caption || messageData.content?.caption || messageData.content?.text,
                  ...(attachment.duration && { duration: attachment.duration }),
                };
                
                console.log('✅ Audio uploaded to WhatsApp, using mediaId:', {
                  mediaId: mediaId.mediaId,
                  mimeType,
                  originalMimeType: attachment.mimeType
                });
              } catch (uploadError) {
                console.warn('Failed to upload audio to WhatsApp, falling back to URL:', {
                  error: uploadError.message,
                  url: attachmentUrl,
                  mimeType: attachment.mimeType
                });

                // Check if the fallback URL format is likely supported by WhatsApp
                const supportedAudioFormats = ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'];
                if (attachment.mimeType && !supportedAudioFormats.some(f => attachment.mimeType.includes(f.split('/')[1]))) {
                  console.warn(`Audio format "${attachment.mimeType}" may not be supported by WhatsApp. Supported: ${supportedAudioFormats.join(', ')}`);
                }

                // Fallback to URL if upload fails
                messageData.content = {
                  type: attachmentType,
                  url: attachmentUrl,
                  link: attachmentUrl,
                  caption: attachment.caption || messageData.content?.caption || messageData.content?.text,
                  filename: attachment.name || attachment.filename,
                  ...(attachment.duration && { duration: attachment.duration }),
                };
              }
            } else {
              // For other media types, use URL directly
              messageData.content = {
                type: attachmentType,
                url: attachmentUrl,
                link: attachmentUrl,
                caption: attachment.caption || messageData.content?.caption || messageData.content?.text,
                filename: attachment.name || attachment.filename,
                ...(attachmentType === 'audio' && attachment.duration && { duration: attachment.duration }),
              };
            }
            
            console.log('✅ Converted attachment to content for WhatsApp:', {
              type: attachmentType,
              url: attachmentUrl,
              hasCaption: !!messageData.content.caption,
              hadContentType: !!messageData.content?.type,
              hasMediaId: !!messageData.content.mediaId
            });
          } else {
            console.warn('⚠️ Attachment has no URL for WhatsApp:', {
              attachmentType,
              hasUrl: !!attachment.url,
              hasPath: !!attachment.path,
              hasFileUrl: !!attachment.fileUrl
            });
          }
        }
      }

      // ✅ Track API start time for performance metrics
      apiStartTime = Date.now();

      // ✅ Check if this is a bulk SMS send (has rcpts array)
      let result;
      if (channelType === 'sms' && messageData.rcpts && Array.isArray(messageData.rcpts) && messageData.rcpts.length > 0) {
        // Use bulk send method for SMS
        if (typeof adapter.sendBulk === 'function') {
          result = await adapter.sendBulk(messageData);
        } else {
          throw new Error('Bulk SMS not supported by this SMS adapter');
        }
      } else {
        // Regular single message send
        result = await adapter.sendMessage(messageData);
      }

      // ✅ Note: Final logging happens in messageOutboundWorker.js
      // This keeps logging centralized and prevents duplicate logs

      // Emit sent status if requested
      // ✅ Reuse targetMessageId declared above
      if (emitStatus && conversationId && targetMessageId) {
        this.emitMessageStatus(conversationId, targetMessageId, 'sent', tenantId, {
          providerMessageId: result.messageId || result.whatsappMessageId,
        });
      }

      return result;

    } catch (error) {
      // ✅ Note: Error logging happens in messageOutboundWorker.js
      // This keeps logging centralized and prevents duplicate logs

      console.error(`❌ ChannelServiceFactory: ${channelType} message failed`, {
        error: error.message,
        accountId: account._id,
        errorCode: error.code
      });

      // Emit failure status if requested - include full error details
      const targetMessageId = messageId || messageData.metadata?.messageId;
      if (emitStatus && conversationId && targetMessageId) {
        this.emitMessageStatus(conversationId, targetMessageId, 'failed', tenantId, {
          error: error.userMessage || error.message,
          errorCode: error.code,
          metaErrorCode: error.metaErrorCode,
          errorCategory: error.category,
          retryable: error.retryable,
        });
      }
      throw error;
    }
  }

  /**
   * Prepare WhatsApp template message from database template
   */
  static prepareWhatsAppTemplateMessage(template, parameters = {}, to) {
    console.log('📋 Preparing WhatsApp template from database:', {
      templateId: template._id,
      templateName: template.name,
      templateLanguage: template.templateLanguage,
      parameters: template.parameters
    });

    if (!template.name) {
      throw new Error('Template name is required');
    }

    // Ensure proper WhatsApp language format
    let languageCode = template.templateLanguage || 'en_US';
    if (languageCode.length === 2) {
      // Convert 'en' to 'en_US' format
      languageCode = `${languageCode}_${languageCode.toUpperCase()}`;
    }

    const messageData = {
      to: to,
      content: {
        type: 'template',
        templateName: template.name,
        languageCode: languageCode,
        bodyParameters: [],
        headerParameters: [],
        buttons: []
      },
      metadata: {
        templateId: template._id,
        timestamp: new Date().toISOString()
      }
    };

    // Map parameters if provided
    if (parameters && Object.keys(parameters).length > 0) {
      messageData.content.bodyParameters = Object.entries(parameters).map(([key, value]) => ({
        type: 'text',
        value: value
      }));
    }

    return messageData;
  }

  /**
   * Send WhatsApp template message with GRACEFUL validation
   */
  static async sendWhatsAppTemplate(account, template, to, parameters = {}, options = {}) {
    try {
      console.log('🚀 Sending WhatsApp template:', {
        templateName: template.name,
        templateLanguage: template.templateLanguage,
        to: to,
        accountName: account.name
      });

      // Pre-send template validation
      try {
        const templateExists = await this.validateWhatsAppTemplate(account.credentials, template.name);

        if (templateExists === false) {
          console.warn(`Template "${template.name}" not found in WhatsApp Business account - send may fail`);
        }
        // null = validation skipped, true = found - both proceed
      } catch (validationError) {
        console.warn('Template validation skipped:', validationError.message);
      }

      // Prepare message data
      const messageData = this.prepareWhatsAppTemplateMessage(template, parameters, to);

      // Send the message
      const result = await this.sendMessage('whatsapp', account, messageData, options);

      console.log('✅ WhatsApp template sent successfully:', {
        templateName: template.name,
        messageId: result.messageId,
        recipient: to
      });

      return result;

    } catch (error) {
      console.error('❌ Failed to send WhatsApp template:', {
        templateName: template.name,
        error: error.message,
        to: to
      });
      throw error;
    }
  }

  /**
   * Normalize credentials for backward compatibility
   */
  static normalizeCredentials(channelType, credentials) {
    if (!credentials) return credentials;

    // ADD CONSOLE LOG FOR CREDENTIALS
    console.log('🔐 ChannelServiceFactory - Original credentials:', {
      channelType,
      originalCredentials: credentials,
      availableKeys: Object.keys(credentials || {})
    });

    // WhatsApp: Only use token field (no accessToken field in database)
    if (channelType === 'whatsapp') {
      const normalized = {
        ...credentials,
        // Remove businessAccountId completely as it's not needed
        businessAccountId: undefined,
      };

      // ADD CONSOLE LOG FOR NORMALIZED CREDENTIALS
      console.log('🔐 ChannelServiceFactory - Normalized WhatsApp credentials:', {
        normalizedCredentials: normalized,
        hasToken: !!normalized.token,
        hasPhoneNumberId: !!normalized.phoneNumberId
      });

      return normalized;
    }

    // ✅ WebChat: Use WEBCHAT_SECRET from env if secretKey is missing
    if (channelType === 'webchat') {
      const normalized = { ...credentials };
      // If secretKey is missing, use WEBCHAT_SECRET from environment
      if (!normalized.secretKey) {
        normalized.secretKey = getWebChatSecret();
      }
      return normalized;
    }

    // ✅ SMS/EuroSMS: Handle backward compatibility for old credential format
    if (channelType === 'sms') {
      const normalized = { ...credentials };
      
      // ✅ Check if this is EuroSMS (either provider is 'eurosms' or has apiKey/senderId pattern)
      const isEuroSMS = credentials.provider === 'eurosms' || 
                        (credentials.apiKey && credentials.senderId && !credentials.provider);
      
      if (isEuroSMS) {
        // ✅ Set provider if not already set
        if (!normalized.provider) {
          normalized.provider = 'eurosms';
        }
        
        // ✅ Map old format to new format:
        // apiKey → integrationKey
        // senderId → check if it's Integration ID format (X-XXXXXX) or use as senderId
        
        if (credentials.apiKey && !normalized.integrationKey) {
          normalized.integrationKey = credentials.apiKey;
        }
        
        // ✅ Check if senderId looks like an Integration ID (format: X-XXXXXX where X is alphanumeric)
        const integrationIdPattern = /^\d+-[A-Z0-9]+$/i;
        if (credentials.senderId) {
          if (integrationIdPattern.test(credentials.senderId)) {
            // senderId is actually the Integration ID
            normalized.integrationId = credentials.senderId;
            // Don't set senderId here - let the adapter use options.identifier or options.accountName
            // The adapter will determine the sender name from options.identifier/accountName
            delete normalized.senderId; // Remove it since it's actually the Integration ID
          } else {
            // senderId is the sender name/identifier
            normalized.senderId = credentials.senderId;
            // Try to get Integration ID from identifier if it matches the pattern
            if (credentials.identifier && integrationIdPattern.test(credentials.identifier)) {
              normalized.integrationId = credentials.identifier;
            }
          }
        }
        
        // ✅ If Integration ID is still missing, try to extract from identifier
        if (!normalized.integrationId && credentials.identifier) {
          if (integrationIdPattern.test(credentials.identifier)) {
            normalized.integrationId = credentials.identifier;
          }
        }
        
        // ✅ Use eurosmsUrl from credentials or environment variable
        if (!normalized.eurosmsUrl) {
          normalized.eurosmsUrl = process.env.EUROSMS_API_URL || 'https://as.eurosms.com/api/v3';
        }
        
        console.log('🔐 ChannelServiceFactory - Normalized EuroSMS credentials:', {
          hasIntegrationId: !!normalized.integrationId,
          hasIntegrationKey: !!normalized.integrationKey,
          hasSenderId: !!normalized.senderId,
          provider: normalized.provider,
          integrationId: normalized.integrationId,
          senderId: normalized.senderId
        });
      }
      
      return normalized;
    }

    // ✅ NOTE: Duplicate webchat block removed (already handled above)

    return credentials;
  }

  /**
   * Send media message
   */
  static async sendMedia(channelType, account, mediaData, options = {}) {
    const normalizedCredentials = this.normalizeCredentials(channelType, account.credentials);
    const adapter = getAdapter(channelType, normalizedCredentials, options);
    return await adapter.sendMedia(mediaData);
  }

  /**
   * Validate webhook signature
   */
  static async validateWebhook(channelType, credentials, signature, payload, context = {}) {
    const normalizedCredentials = this.normalizeCredentials(channelType, credentials);
    const adapter = getAdapter(channelType, normalizedCredentials);
    return await adapter.validateWebhook(signature, payload, context);
  }

  /**
   * Parse incoming webhook
   */
  static async parseWebhook(channelType, credentials, payload) {
    const normalizedCredentials = this.normalizeCredentials(channelType, credentials);
    const adapter = getAdapter(channelType, normalizedCredentials);
    return await adapter.parseWebhook(payload);
  }

  /**
   * Get message status
   */
  static async getMessageStatus(channelType, credentials, messageId) {
    const normalizedCredentials = this.normalizeCredentials(channelType, credentials);
    const adapter = getAdapter(channelType, normalizedCredentials);
    return await adapter.getMessageStatus(messageId);
  }

  /**
   * Get channel capabilities
   */
  static getCapabilities(channelType) {
    return getAdapterCapabilities(channelType);
  }

  /**
   * Validate channel credentials
   */
  static validateCredentials(channelType, credentials) {
    try {
      const normalizedCredentials = this.normalizeCredentials(channelType, credentials);
      getAdapter(channelType, normalizedCredentials);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Test channel connection - FIXED for WhatsApp token-only authentication
   */
  static async testConnection(channelType, credentials) {
    try {
      // ADD CONSOLE LOG FOR CONNECTION TESTING
      console.log('🔐 ChannelServiceFactory - Testing connection with:', {
        channelType,
        credentials: credentials,
        tokenExists: !!credentials?.token,
        phoneNumberId: credentials?.phoneNumberId
      });

      const normalizedCredentials = this.normalizeCredentials(channelType, credentials);
      const adapter = getAdapter(channelType, normalizedCredentials);
      
      // Channel-specific connection tests
      switch (channelType) {
        case 'email':
          return await adapter.verifyConnection();
        case 'whatsapp':
          // Test using only token field (no accessToken)
          return await adapter.testConnection();
        case 'sms':
          if (normalizedCredentials.provider === 'twilio') {
            // Test Twilio connection
            const auth = Buffer.from(`${normalizedCredentials.accountSid}:${normalizedCredentials.authToken}`).toString('base64');
            await adapter.makeRequest(
              `https://api.twilio.com/2010-04-01/Accounts/${normalizedCredentials.accountSid}.json`,
              {
                method: 'GET',
                headers: {
                  'Authorization': `Basic ${auth}`,
                },
              }
            );
          }
          return true;
        default:
          return true;
      }
    } catch (error) {
      console.error(`Connection test failed for ${channelType}:`, error.message);
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }

  /**
   * Emit message status via Socket.IO
   */
  static emitMessageStatus(conversationId, messageId, status, tenantId, data = {}) {
    try {
      const eventData = {
        messageId,
        conversationId,
        status,
        timestamp: new Date().toISOString(),
        ...data,
      };

      // Use SocketManager's safe emit method
      SocketManager.safeEmit(`conversation:${conversationId}`, 'message:status', eventData);

      // Emit to tenant room if tenant ID provided
      if (tenantId) {
        SocketManager.safeEmit(`tenant:${tenantId}`, 'message:status', eventData);
      }

      console.log(`📡 ChannelServiceFactory: Emitted status ${status} for message ${messageId}`);
    } catch (error) {
      console.error('Failed to emit message status:', error);
    }
  }

  /**
   * Get all supported channels with capabilities
   */
  static getAllChannels() {
    const channels = {};
    const supported = getAdapterCapabilities();
    
    Object.keys(supported).forEach(channelType => {
      channels[channelType] = supported[channelType];
    });

    return channels;
  }

  /**
   * Check if channel supports specific message type
   */
  static supportsMessageType(channelType, messageType) {
    const capabilities = getAdapterCapabilities(channelType);
    if (!capabilities) return false;

    try {
      const adapter = getAdapter(channelType, {});
      return adapter.supportsMessageType(messageType);
    } catch (error) {
      return false;
    }
  }

  /**
   * Batch send messages (for bulk operations)
   */
  static async sendBatch(channelType, account, messages, options = {}) {
    const normalizedCredentials = this.normalizeCredentials(channelType, account.credentials);
    const adapter = getAdapter(channelType, normalizedCredentials, options);
    
    const results = await Promise.allSettled(
      messages.map(message => this.sendMessage(channelType, account, message, options))
    );

    const successful = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failed = results.filter(r => r.status === 'rejected').map(r => r.reason);

    return {
      successful,
      failed,
      total: messages.length,
      successCount: successful.length,
      failureCount: failed.length,
    };
  }

  /**
   * Get WhatsApp template list using phone number ID (no business account ID needed)
   */
  static async getWhatsAppTemplates(credentials) {
    try {
      const normalizedCredentials = this.normalizeCredentials('whatsapp', credentials);
      const adapter = getAdapter('whatsapp', normalizedCredentials);
      
      // Use phone number ID directly - no business account ID needed
      const templates = await adapter.getTemplates();
      
      console.log(`📋 Fetched ${templates.length} WhatsApp templates using phone number ID`);
      
      return templates;
    } catch (error) {
      // If we can't fetch templates, return empty array instead of throwing
      if (error.message.includes('Cannot fetch templates with phone number ID') || 
          error.code === 'WHATSAPP_100') {
        console.warn('⚠️ Cannot fetch templates with current credentials, returning empty list');
        return [];
      }
      
      console.error('Failed to fetch WhatsApp templates:', error.message);
      throw error;
    }
  }

  /**
   * Validate if WhatsApp template exists
   * Returns: true (exists), false (not found), or null (validation skipped)
   */
  static async validateWhatsAppTemplate(credentials, templateName) {
    try {
      const templates = await this.getWhatsAppTemplates(credentials);

      if (!Array.isArray(templates) || templates.length === 0) {
        console.warn('No templates available for validation - skipping check:', { templateName });
        return null; // Validation skipped
      }

      const templateExists = templates.some(template => template.name === templateName);

      if (!templateExists) {
        console.warn('Template not found in account:', {
          templateName,
          availableTemplates: templates.map(t => t.name).slice(0, 20)
        });
      }

      return templateExists;
    } catch (error) {
      console.warn('Template validation failed - skipping check:', {
        templateName,
        error: error.message
      });
      return null; // Validation skipped
    }
  }

  /**
   * Get available WhatsApp templates with validation
   */
  static async getAvailableWhatsAppTemplates(credentials) {
    try {
      const templates = await this.getWhatsAppTemplates(credentials);
      
      console.log('📋 Available WhatsApp Templates:', {
        count: templates.length,
        templates: templates.map(t => ({
          name: t.name,
          status: t.status,
          category: t.category,
          language: t.language
        }))
      });
      
      return templates;
    } catch (error) {
      console.error('Failed to get available WhatsApp templates:', error.message);
      throw error;
    }
  }

  /**
   * Create WhatsApp template using phone number ID
   */
  static async createWhatsAppTemplate(credentials, templateData) {
    try {
      const normalizedCredentials = this.normalizeCredentials('whatsapp', credentials);
      const adapter = getAdapter('whatsapp', normalizedCredentials);
      
      const result = await adapter.createTemplate(templateData);
      
      console.log('✅ WhatsApp template created successfully:', result.name);
      
      return result;
    } catch (error) {
      console.error('Failed to create WhatsApp template:', error.message);
      throw error;
    }
  }

  /**
   * Delete WhatsApp template using phone number ID
   */
  static async deleteWhatsAppTemplate(credentials, templateName) {
    try {
      const normalizedCredentials = this.normalizeCredentials('whatsapp', credentials);
      const adapter = getAdapter('whatsapp', normalizedCredentials);
      
      const result = await adapter.deleteTemplate(templateName);
      
      console.log('🗑️ WhatsApp template deleted successfully:', templateName);
      
      return result;
    } catch (error) {
      console.error('Failed to delete WhatsApp template:', error.message);
      throw error;
    }
  }

  /**
   * Get WhatsApp business profile information
   */
  static async getWhatsAppBusinessProfile(credentials) {
    try {
      const normalizedCredentials = this.normalizeCredentials('whatsapp', credentials);
      const adapter = getAdapter('whatsapp', normalizedCredentials);
      
      // Test connection to get business profile
      const profile = await adapter.testConnection();
      
      console.log('📊 WhatsApp Business Profile:', profile);
      
      return profile;
    } catch (error) {
      console.error('Failed to get WhatsApp business profile:', error.message);
      throw error;
    }
  }

  /**
   * Upload media to WhatsApp
   */
  static async uploadWhatsAppMedia(credentials, fileBuffer, mimeType) {
    try {
      const normalizedCredentials = this.normalizeCredentials('whatsapp', credentials);
      const adapter = getAdapter('whatsapp', normalizedCredentials);
      
      const result = await adapter.uploadMedia(fileBuffer, mimeType);
      
      console.log('✅ WhatsApp media uploaded successfully:', result.mediaId);
      
      return result;
    } catch (error) {
      console.error('Failed to upload WhatsApp media:', error.message);
      throw error;
    }
  }

  /**
   * Download media from WhatsApp
   */
  static async downloadWhatsAppMedia(credentials, mediaId) {
    try {
      const normalizedCredentials = this.normalizeCredentials('whatsapp', credentials);
      const adapter = getAdapter('whatsapp', normalizedCredentials);
      
      const result = await adapter.downloadMedia(mediaId);
      
      console.log('✅ WhatsApp media downloaded successfully:', mediaId);
      
      return result;
    } catch (error) {
      console.error('Failed to download WhatsApp media:', error.message);
      throw error;
    }
  }

  /**
   * Send interactive message (buttons, lists, etc.)
   */
  static async sendInteractiveMessage(channelType, account, interactiveData, options = {}) {
    try {
      const messageData = {
        to: interactiveData.to,
        content: {
          type: 'interactive',
          interactiveData: interactiveData.data
        },
        metadata: interactiveData.metadata || {}
      };

      return await this.sendMessage(channelType, account, messageData, options);
    } catch (error) {
      console.error('Failed to send interactive message:', error.message);
      throw error;
    }
  }

  /**
   * Send location message
   */
  static async sendLocationMessage(channelType, account, locationData, options = {}) {
    try {
      const messageData = {
        to: locationData.to,
        content: {
          type: 'location',
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          name: locationData.name,
          address: locationData.address
        },
        metadata: locationData.metadata || {}
      };

      return await this.sendMessage(channelType, account, messageData, options);
    } catch (error) {
      console.error('Failed to send location message:', error.message);
      throw error;
    }
  }

  /**
   * Send contact message
   */
  static async sendContactMessage(channelType, account, contactData, options = {}) {
    try {
      const messageData = {
        to: contactData.to,
        content: {
          type: 'contact',
          contacts: contactData.contacts
        },
        metadata: contactData.metadata || {}
      };

      return await this.sendMessage(channelType, account, messageData, options);
    } catch (error) {
      console.error('Failed to send contact message:', error.message);
      throw error;
    }
  }

  /**
   * Send reaction message
   */
  static async sendReactionMessage(channelType, account, reactionData, options = {}) {
    try {
      // ✅ Meta API: Empty string removes reaction, emoji string adds reaction
      const emojiValue = reactionData.emoji || '';
      
      const messageData = {
        to: reactionData.to,
        content: {
          type: 'reaction',
          message_id: reactionData.messageId,
          emoji: emojiValue
        },
        metadata: reactionData.metadata || {}
      };

      console.log('📤 ChannelServiceFactory - Sending reaction:', {
        channelType,
        to: reactionData.to,
        messageId: reactionData.messageId,
        emoji: emojiValue || '(removing reaction)'
      });

      return await this.sendMessage(channelType, account, messageData, options);
    } catch (error) {
      console.error('❌ Failed to send reaction message:', error.message);
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  static async markMessageAsRead(channelType, account, messageId, options = {}) {
    try {
      const normalizedCredentials = this.normalizeCredentials(channelType, account.credentials);
      const adapter = getAdapter(channelType, normalizedCredentials);
      
      // This would typically be implemented in the adapter
      console.log(`📖 Marking message as read: ${messageId}`);
      
      // For WhatsApp, this is usually handled via webhooks
      // Return success for now as this is often handled automatically
      return { success: true, messageId };
    } catch (error) {
      console.error('Failed to mark message as read:', error.message);
      throw error;
    }
  }

  /**
   * Get message analytics
   */
  static async getMessageAnalytics(channelType, account, messageId, options = {}) {
    try {
      const normalizedCredentials = this.normalizeCredentials(channelType, account.credentials);
      const adapter = getAdapter(channelType, normalizedCredentials);
      
      // This would typically be implemented in the adapter
      console.log(`📊 Getting analytics for message: ${messageId}`);
      
      // Return mock analytics for now
      return {
        messageId,
        delivered: true,
        read: true,
        responded: false,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get message analytics:', error.message);
      throw error;
    }
  }

  /**
   * Validate message before sending
   */
  static validateMessageContent(channelType, content) {
    try {
      const capabilities = this.getCapabilities(channelType);
      
      if (!capabilities) {
        throw new Error(`Unsupported channel type: ${channelType}`);
      }

      // Validate based on channel type and content type
      switch (channelType) {
        case 'whatsapp':
          return this.validateWhatsAppContent(content);
        case 'sms':
          return this.validateSMSContent(content);
        case 'email':
          return this.validateEmailContent(content);
        case 'webchat':
          return this.validateWebChatContent(content);
        default:
          return { valid: true, warnings: [] };
      }
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Validate WhatsApp message content
   */
  static validateWhatsAppContent(content) {
    const warnings = [];

    if (content.type === 'text' && content.text && content.text.length > 4096) {
      warnings.push('WhatsApp text messages should be under 4096 characters');
    }

    if (content.type === 'template' && !content.templateName) {
      return { valid: false, error: 'Template name is required for WhatsApp template messages' };
    }

    return { valid: true, warnings };
  }

  /**
   * Validate SMS message content
   */
  static validateSMSContent(content) {
    const warnings = [];

    if (content.text && content.text.length > 160) {
      warnings.push('SMS messages should be under 160 characters to avoid multiple messages');
    }

    return { valid: true, warnings };
  }

  /**
   * Validate Email message content
   */
  static validateEmailContent(content) {
    const warnings = [];

    if (!content.subject) {
      return { valid: false, error: 'Subject is required for email messages' };
    }

    if (!content.body) {
      return { valid: false, error: 'Body is required for email messages' };
    }

    return { valid: true, warnings };
  }

  /**
   * Validate WebChat message content
   */
  static validateWebChatContent(content) {
    // WebChat is generally more permissive
    return { valid: true, warnings: [] };
  }

  /**
   * Get channel health status
   */
  static async getChannelHealth(channelType, account) {
    try {
      const normalizedCredentials = this.normalizeCredentials(channelType, account.credentials);
      const adapter = getAdapter(channelType, normalizedCredentials);
      
      // Test connection to determine health
      const isHealthy = await this.testConnection(channelType, account.credentials);
      
      return {
        channelType,
        accountId: account._id,
        accountName: account.name,
        healthy: isHealthy,
        lastChecked: new Date().toISOString(),
        status: isHealthy ? 'active' : 'inactive'
      };
    } catch (error) {
      return {
        channelType,
        accountId: account._id,
        accountName: account.name,
        healthy: false,
        lastChecked: new Date().toISOString(),
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Get all channels health status
   */
  static async getAllChannelsHealth(accounts) {
    const healthStatus = await Promise.all(
      accounts.map(async (account) => {
        return await this.getChannelHealth(account.type, account);
      })
    );

    return healthStatus;
  }

  /**
   * Rate limit check
   */
  static async checkRateLimit(channelType, account, messageType) {
    try {
      // Implement rate limiting logic here
      // This would typically check against a Redis store or database
      
      const rateLimits = {
        whatsapp: {
          template: 1000, // messages per hour
          text: 1000,
          media: 500
        },
        sms: {
          text: 100
        },
        email: {
          transactional: 1000,
          marketing: 100
        }
      };

      const limit = rateLimits[channelType]?.[messageType] || 100;
      
      // Mock implementation - always return within limits for now
      return {
        allowed: true,
        limit,
        remaining: limit - 1,
        resetTime: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
      };
    } catch (error) {
      // If rate limiting fails, allow the message
      console.error('Rate limit check failed:', error.message);
      return { allowed: true, error: error.message };
    }
  }
}

export default ChannelServiceFactory;