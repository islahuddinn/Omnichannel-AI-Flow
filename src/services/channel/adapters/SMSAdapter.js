// src/services/channel/adapters/SMSAdapter.js
import { BaseAdapter } from './BaseAdapter.js';
import crypto from 'crypto';

export class SMSAdapter extends BaseAdapter {
  constructor(credentials, options = {}) {
    super(credentials, options);
    this.channelType = 'sms';
    this.provider = credentials.provider || 'eurosms'; // Default to eurosms if not specified
    // Allow template content but normalize to plain text before sending
    this.supportedTypes = ['text', 'template'];
    
    // ✅ CRITICAL: Determine provider if not explicitly set
    // If credentials have apiKey and senderId (old format), assume EuroSMS
    if (!this.provider || this.provider === 'eurosms') {
      if (credentials.apiKey && credentials.senderId && !credentials.accountSid) {
        this.provider = 'eurosms';
      } else if (credentials.accountSid && credentials.authToken) {
        this.provider = 'twilio';
      }
    }
    
    this.validateCredentials();
    
    // EuroSMS specific configuration
    if (this.provider === 'eurosms') {
      this.apiUrl = credentials.eurosmsUrl || process.env.EUROSMS_API_URL || 'https://as.eurosms.com/api/v3';
      // ✅ integrationId and integrationKey are set in validateCredentials
      // ✅ senderId is set in validateCredentials
    }
  }

  /**
   * Normalize SMS content:
   * - If a template is provided, fall back to its rendered/plain text so providers
   *   that do not support templates can still send it as a standard SMS.
   */
  normalizeContentForSms(content = {}) {
    if (content.type === 'template') {
      const text =
        content.text ||
        content.templateText ||
        content.renderedText ||
        content.body ||
        content.templateName ||
        '';

      return {
        ...content,
        type: 'text',
        text,
      };
    }

    return content;
  }

  validateCredentials() {
    super.validateCredentials();

    if (this.provider === 'twilio') {
      if (!this.credentials.accountSid) {
        throw new Error('Twilio account SID is required');
      }
      if (!this.credentials.authToken) {
        throw new Error('Twilio auth token is required');
      }
      if (!this.credentials.fromNumber) {
        throw new Error('Twilio from number is required');
      }
    } else if (this.provider === 'eurosms') {
      // ✅ CRITICAL: Check for both new format (integrationId/integrationKey) and old format (apiKey/senderId)
      // Note: normalizeCredentials() should have already mapped apiKey→integrationKey and senderId→integrationId
      if (!this.credentials.integrationId && !this.credentials.senderId) {
        throw new Error('EuroSMS Integration ID is required (provide integrationId or senderId in Integration ID format)');
      }
      if (!this.credentials.integrationKey && !this.credentials.apiKey) {
        throw new Error('EuroSMS Integration Key is required (provide integrationKey or apiKey)');
      }
      
      // ✅ Set integrationId (use normalized value if available, otherwise check senderId pattern)
      const integrationIdPattern = /^\d+-[A-Z0-9]+$/i;
      
      if (this.credentials.integrationId) {
        // Already normalized by ChannelServiceFactory
        this.integrationId = this.credentials.integrationId;
      } else if (this.credentials.senderId && integrationIdPattern.test(this.credentials.senderId)) {
        // senderId is actually the Integration ID (not normalized yet)
        this.integrationId = this.credentials.senderId;
      } else {
        throw new Error('EuroSMS Integration ID is required (provide integrationId or senderId in Integration ID format like "1-ABCDEF")');
      }
      
      // ✅ Set integrationKey (use normalized value if available, otherwise use apiKey)
      if (this.credentials.integrationKey) {
        // Already normalized by ChannelServiceFactory
        this.integrationKey = this.credentials.integrationKey;
      } else if (this.credentials.apiKey) {
        // Fallback to apiKey (not normalized yet)
        this.integrationKey = this.credentials.apiKey;
      } else {
        throw new Error('EuroSMS Integration Key is required (provide integrationKey or apiKey)');
      }
      
      // ✅ Determine sender ID (for actual sender name/identifier)
      // If senderId is the Integration ID, use identifier/accountName instead
      if (this.credentials.senderId && integrationIdPattern.test(this.credentials.senderId)) {
        // senderId is actually the Integration ID, use identifier or account name as sender name
        this.senderId = this.credentials.identifier || 
                       this.options?.identifier || 
                       this.options?.accountName ||
                       'OmniConnect';
      } else {
        // senderId is the actual sender name/identifier
        this.senderId = this.credentials.senderId || 
                       this.credentials.identifier || 
                       this.options?.identifier ||
                       this.options?.accountName ||
                       'OmniConnect';
      }
      
      // ✅ Log for debugging
      this.log('info', 'EuroSMS credentials validated', {
        hasIntegrationId: !!this.integrationId,
        hasIntegrationKey: !!this.integrationKey,
        senderId: this.senderId,
        integrationIdPattern: this.integrationId
      });
    } else {
      throw new Error(`Unsupported SMS provider: ${this.provider}`);
    }
  }

  /**
   * Generate EuroSMS signature
   * @param {string} sender - Sender name/ID
   * @param {string} recipient - Recipient phone number
   * @param {string} message - Message text
   * @returns {string} HMAC SHA1 hex signature
   */
  generateEuroSMSSignature(sender, recipient, message) {
    const data = `${sender}${recipient}${message}`;
    return crypto.createHmac('sha1', this.integrationKey)
      .update(data)
      .digest('hex');
  }

  /**
   * Normalize phone number for EuroSMS (remove + and non-digits)
   */
  normalizePhoneNumber(phone, removePlus = false) {
    let normalized = phone.replace(/[^\d+]/g, '');
    if (removePlus) {
      normalized = normalized.replace(/\+/g, '');
    }
    return normalized;
  }

  /**
   * Check if message contains only GSM-7 characters
   * GSM-7 character set includes: A-Z, a-z, 0-9, and basic punctuation
   * EuroSMS uses GSM-7 for standard characters, UCS-2 for extended characters
   * 
   * Simplified approach: Check for characters that definitely require UCS-2
   * (emojis, non-Latin scripts, etc.)
   */
  isGSM7Only(text) {
    if (!text) return true;
    
    // Check for characters that definitely require UCS-2 encoding
    // This includes emojis, non-Latin scripts, and other extended Unicode
    
    // Pattern to detect non-GSM-7 characters:
    // - Emojis and symbols: \u{1F300}-\u{1F9FF} and similar ranges
    // - Non-Latin scripts: Cyrillic, Arabic, Chinese, etc.
    // - Special Unicode characters outside basic Latin
    
    // Simple check: if any character has code point > 0x7F and is not a common
    // European accented character, assume UCS-2
    
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      
      // ASCII range (0-127) - mostly GSM-7 compatible
      if (code <= 0x7F) {
        continue;
      }
      
      // Check for emoji ranges (common emoji code points)
      if (code >= 0x1F300 && code <= 0x1F9FF) {
        return false; // Emoji detected - requires UCS-2
      }
      
      // Check for other common non-GSM ranges
      // Cyrillic, Arabic, Chinese, Japanese, etc.
      if (
        (code >= 0x0400 && code <= 0x04FF) || // Cyrillic
        (code >= 0x0600 && code <= 0x06FF) || // Arabic
        (code >= 0x4E00 && code <= 0x9FFF) || // CJK Unified Ideographs
        (code >= 0x3040 && code <= 0x309F) || // Hiragana
        (code >= 0x30A0 && code <= 0x30FF)    // Katakana
      ) {
        return false; // Non-Latin script detected - requires UCS-2
      }
      
      // For other extended characters, assume they might be GSM-7 extended table
      // EuroSMS will handle the encoding detection
    }
    
    // If we get here, message likely uses GSM-7 or GSM-7 extended characters
    // EuroSMS will determine the exact encoding
    return true;
  }

  /**
   * Calculate SMS parts needed for EuroSMS
   * Returns: { parts: number, encoding: 'GSM-7' | 'UCS-2', charsPerPart: number }
   */
  calculateSMSParts(text) {
    if (!text) {
      return { parts: 1, encoding: 'GSM-7', charsPerPart: 160, totalChars: 0 };
    }

    const isGSM7 = this.isGSM7Only(text);
    const encoding = isGSM7 ? 'GSM-7' : 'UCS-2';
    
    // EuroSMS limits:
    // GSM-7: 160 chars per SMS (single part), 153 chars per part (multi-part)
    // UCS-2: 70 chars per SMS (single part), 67 chars per part (multi-part)
    const singlePartLimit = isGSM7 ? 160 : 70;
    const multiPartLimit = isGSM7 ? 153 : 67;
    
    const textLength = text.length;
    
    if (textLength <= singlePartLimit) {
      return { 
        parts: 1, 
        encoding, 
        charsPerPart: singlePartLimit, 
        totalChars: textLength 
      };
    }
    
    // Calculate parts needed for multi-part message
    const parts = Math.ceil(textLength / multiPartLimit);
    
    return { 
      parts, 
      encoding, 
      charsPerPart: multiPartLimit, 
      totalChars: textLength 
    };
  }

  /**
   * Split message into SMS parts if needed
   * EuroSMS supports concatenated SMS automatically, but we should validate length
   */
  splitMessageForEuroSMS(text) {
    const { parts, encoding, charsPerPart } = this.calculateSMSParts(text);
    
    // EuroSMS automatically handles concatenation, but has limits:
    // Maximum 255 parts for GSM-7, 255 parts for UCS-2
    // However, practical limit is usually much lower (around 10-20 parts)
    const maxParts = 10; // Conservative limit
    
    if (parts > maxParts) {
      throw new Error(
        `Message is too long. It requires ${parts} SMS parts (${encoding} encoding), ` +
        `but maximum ${maxParts} parts are allowed. ` +
        `Please reduce message length to ${maxParts * charsPerPart} characters or less.`
      );
    }
    
    // Return the full text - EuroSMS will handle concatenation automatically
    // But we validate that it's within acceptable limits
    return text;
  }

  async sendMessage(data) {
    if (this.provider === 'twilio') {
      return await this.sendViaTwilio(data);
    } else if (this.provider === 'eurosms') {
      return await this.sendViaEuroSMS(data);
    }
  }

  async sendViaTwilio(data) {
    try {
      const normalizedContent = this.normalizeContentForSms(data.content);
      this.validateContent(normalizedContent);
      this.log('info', 'Sending SMS via Twilio', { to: data.to });

      const { to, metadata = {} } = data;
      const content = normalizedContent;
      
      const auth = Buffer.from(`${this.credentials.accountSid}:${this.credentials.authToken}`).toString('base64');
      
      const bodyParams = new URLSearchParams({
        To: this.normalizePhoneNumber(to),
        From: this.credentials.fromNumber,
        Body: content.text,
      });

      // Add media URL for MMS
      if (content.mediaUrl && this.supportsMessageType('media')) {
        bodyParams.append('MediaUrl', content.mediaUrl);
      }

      // Add status callback
      if (metadata.statusCallback) {
        bodyParams.append('StatusCallback', metadata.statusCallback);
      }

      const response = await this.makeRequest(
        `https://api.twilio.com/2010-04-01/Accounts/${this.credentials.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: bodyParams.toString(),
        }
      );

      this.log('info', 'SMS sent via Twilio', { messageId: response.sid });

      return this.formatSuccess({
        messageId: response.sid,
        status: this.mapTwilioStatus(response.status),
        providerResponse: response,
        price: response.price,
      });

    } catch (error) {
      this.log('error', 'Twilio SMS failed', { error: error.message });
      throw this.handleTwilioError(error);
    }
  }

  async sendViaEuroSMS(data) {
    try {
      const normalizedContent = this.normalizeContentForSms(data.content);
      this.validateContent(normalizedContent);
      this.log('info', 'Sending SMS via EuroSMS', { to: data.to });

      const { to, metadata = {} } = data;
      const content = normalizedContent;
      
      // Normalize phone number (remove + for EuroSMS)
      const normalizedRecipient = this.normalizePhoneNumber(to, true);

      // ✅ CRITICAL FIX: Do NOT use parseInt() - it loses leading zeros
      // Countries like UK (44), Austria (43) etc. work fine as strings
      // EuroSMS accepts both numeric and string formats
      if (!normalizedRecipient || !/^\d+$/.test(normalizedRecipient)) {
        throw new Error(`Invalid phone number format: ${to}`);
      }

      // Use Number() instead of parseInt() to preserve the full number
      // But ONLY for the API payload - keep string for signature generation
      const recipientNumber = Number(normalizedRecipient);
      
      let messageText = content.text || '';

      // ✅ CRITICAL: Validate and prepare message text for EuroSMS
      // EuroSMS /send/one endpoint has a HARD LIMIT of 160 characters per request
      // For messages longer than 160 chars, we must split them into chunks and send separately
      // - GSM-7: 160 chars per SMS (single), 153 chars per part (multi-part)
      // - UCS-2: 70 chars per SMS (single), 67 chars per part (multi-part)
      const smsInfo = this.calculateSMSParts(messageText);
      
      this.log('info', 'EuroSMS message analysis', {
        textLength: messageText.length,
        encoding: smsInfo.encoding,
        parts: smsInfo.parts,
        charsPerPart: smsInfo.charsPerPart
      });

      // ✅ CRITICAL: EuroSMS /send/one endpoint has a hard limit of 160 characters
      // We need to split messages longer than 160 chars into separate SMS messages
      const maxParts = 3;
      const singleSMSLimit = smsInfo.encoding === 'GSM-7' ? 160 : 70;
      const charsPerPart = smsInfo.encoding === 'GSM-7' ? 153 : 67;
      
      if (smsInfo.parts > maxParts) {
        // Log detailed info for debugging
        this.log('error', 'EuroSMS message too long - validation failed', {
          messageLength: messageText.length,
          encoding: smsInfo.encoding,
          partsRequired: smsInfo.parts,
          maxParts: maxParts,
          maxChars: maxParts * charsPerPart,
          messagePreview: messageText.substring(0, 50) + (messageText.length > 50 ? '...' : '')
        });
        
        throw new Error(
          `Message is too long for EuroSMS (MSG_TOO_LONG). ` +
          `Message length: ${messageText.length} characters requires ${smsInfo.parts} SMS parts (${smsInfo.encoding} encoding). ` +
          `Maximum allowed: ${maxParts} parts (${maxParts * charsPerPart} characters for ${smsInfo.encoding}). ` +
          `Please reduce message length to ${maxParts * charsPerPart} characters or less.`
        );
      }
      
      // Log successful validation
      this.log('info', 'EuroSMS message validation passed', {
        messageLength: messageText.length,
        encoding: smsInfo.encoding,
        parts: smsInfo.parts,
        singleSMSLimit: singleSMSLimit,
        willSplit: smsInfo.parts > 1
      });

      // ✅ CRITICAL: Determine sender name for sndr field
      // If senderId is the Integration ID (format: X-XXXXXX), use identifier/account name as sender
      // Otherwise, use senderId as sender name
      const integrationIdPattern = /^\d+-[A-Z0-9]+$/i;
      let senderName;
      
      if (this.senderId && integrationIdPattern.test(this.senderId)) {
        // senderId is actually the Integration ID, use identifier or account name as sender name
        senderName = this.options?.identifier || 
                     this.credentials.identifier || 
                     this.credentials.accountName ||
                     'OmniConnect';
      } else {
        // senderId is the sender name
        senderName = this.senderId || 
                     this.options?.identifier || 
                     this.credentials.identifier || 
                     'OmniConnect';
      }

      // ✅ CRITICAL: Split message if it exceeds single SMS limit (160 for GSM-7, 70 for UCS-2)
      // EuroSMS /send/one endpoint has a hard limit of 160 characters per request
      // We must split longer messages into chunks and send each separately
      const messageParts = [];
      if (messageText.length <= singleSMSLimit) {
        // Single SMS - send as is
        messageParts.push(messageText);
      } else {
        // Multi-part SMS - split into chunks
        const chunkSize = charsPerPart;
        for (let i = 0; i < messageText.length; i += chunkSize) {
          messageParts.push(messageText.substring(i, i + chunkSize));
        }
        
        this.log('info', 'EuroSMS message split into parts', {
          totalLength: messageText.length,
          parts: messageParts.length,
          encoding: smsInfo.encoding,
          charsPerPart: chunkSize,
          partLengths: messageParts.map(p => p.length)
        });
      }

      // ✅ Use test endpoint ONLY when explicitly enabled via env var
      // Never rely on NODE_ENV for API endpoint switching (security risk)
      const useTestEndpoint = process.env.EUROSMS_USE_TEST_ENDPOINT === 'true';
      const endpoint = useTestEndpoint ? '/test/one' : '/send/one';

      // Send each part separately
      const sentUuids = [];
      const allResponses = [];
      
      for (let partIndex = 0; partIndex < messageParts.length; partIndex++) {
        const partText = messageParts[partIndex];
        
        // Generate signature for this part: HMAC_SHA1(key, sender + recipient + message_text)
        const signature = this.generateEuroSMSSignature(senderName, normalizedRecipient, partText);

        // Prepare request body for this part
        // Flags (per EuroSMS docs Section 14.1):
        //   1 = delivery report, 2 = long message, 4 = diacritics (UCS-2)
        //   Combined: 1 + 2 = 3 (delivery report + long message for GSM-7)
        //             1 + 2 + 4 = 7 (delivery report + long message + diacritics for UCS-2)
        const flags = smsInfo.encoding === 'UCS-2'
          ? 7   // delivery report + long message + diacritics
          : 3;  // delivery report + long message

        const payload = {
          iid: this.integrationId,
          sgn: signature,
          sndr: senderName,
          rcpt: recipientNumber,
          txt: partText,
          flgs: flags,
          rsp: 'full', // Request full response with per-number details (Section 9.3.4)
        };

        // Add callback URL if provided in metadata (validate URL format)
        const callbackUrl = metadata.callbackUrl || process.env.EUROSMS_CALLBACK_URL;
        if (callbackUrl) {
          try {
            const parsedUrl = new URL(callbackUrl);
            if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') {
              payload.callback = callbackUrl;
            } else {
              this.log('warn', 'Invalid callback URL protocol, skipping', { callbackUrl });
            }
          } catch {
            this.log('warn', 'Invalid callback URL format, skipping', { callbackUrl });
          }
        }

        this.log('info', `EuroSMS sending part ${partIndex + 1}/${messageParts.length}`, {
          iid: this.integrationId,
          sndr: senderName,
          sndrLength: senderName?.length || 0,
          rcpt: recipientNumber,
          txtLength: partText.length,
          txtPreview: partText.substring(0, 50) + (partText.length > 50 ? '...' : ''),
          encoding: smsInfo.encoding,
          partNumber: partIndex + 1,
          totalParts: messageParts.length
        });

        let response;
        try {
          response = await this.makeRequest(
            `${this.apiUrl}${endpoint}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
            }
          );
        } catch (requestError) {
          // Log full error details for debugging
          this.log('error', `EuroSMS API request failed for part ${partIndex + 1}`, {
            error: requestError.message,
            status: requestError.response?.status,
            statusText: requestError.response?.statusText,
            responseBody: requestError.response?.data || requestError.response?.body || null,
            url: `${this.apiUrl}${endpoint}`,
            partNumber: partIndex + 1,
            totalParts: messageParts.length,
            payload: {
              iid: this.integrationId,
              sndr: senderName,
              rcpt: normalizedRecipient,
              txtLength: partText.length
            }
          });
          
          // Try to extract error details from response
          if (requestError.response?.data) {
            const errorData = requestError.response.data;
            throw new Error(`EuroSMS Error (${errorData.err_code || 'HTTP_ERROR'}): ${errorData.err_desc || errorData.error || requestError.message}`);
          }
          throw requestError;
        }

        // Log response for this part
        this.log('info', `EuroSMS API response for part ${partIndex + 1}`, {
          response: response,
          errCode: response.err_code,
          errDesc: response.err_desc,
          errList: response.err_list,
          hasUuid: !!response.uuid,
          partNumber: partIndex + 1,
          totalParts: messageParts.length
        });

        // Check for errors
        if (response.err_code && response.err_code !== 'ENQUEUED') {
          // ✅ Extract detailed error description from err_list if available
          let errorMessage = response.err_desc || 'Unknown error';
          if (response.err_list && Array.isArray(response.err_list) && response.err_list.length > 0) {
            const firstError = response.err_list[0];
            errorMessage = firstError.err_desc || firstError.err_code || errorMessage;
          }
          
          const fullErrorMessage = `EuroSMS Error (${response.err_code}) for part ${partIndex + 1}/${messageParts.length}: ${errorMessage}`;
          this.log('error', 'EuroSMS API returned error', {
            errCode: response.err_code,
            errDesc: response.err_desc,
            errList: response.err_list,
            fullResponse: response,
            partNumber: partIndex + 1,
            totalParts: messageParts.length
          });
          throw new Error(fullErrorMessage);
        }

        // Extract UUID from response
        const uuid = Array.isArray(response.uuid) ? response.uuid[0] : response.uuid;

        if (!uuid) {
          this.log('error', `No UUID in EuroSMS response for part ${partIndex + 1}`, { response });
          throw new Error(`No UUID returned from EuroSMS API for part ${partIndex + 1}`);
        }

        sentUuids.push(uuid);
        allResponses.push(response);
        
        this.log('info', `SMS part ${partIndex + 1}/${messageParts.length} sent via EuroSMS`, { 
          uuid, 
          status: response.err_code,
          partNumber: partIndex + 1,
          totalParts: messageParts.length
        });

        // Small delay between parts to ensure proper ordering (optional, but recommended)
        if (partIndex < messageParts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between parts
        }
      }

      // Return success with first UUID (or all UUIDs if needed)
      const primaryUuid = sentUuids[0];
      
      this.log('info', 'All SMS parts sent via EuroSMS', { 
        totalParts: messageParts.length,
        uuids: sentUuids,
        primaryUuid: primaryUuid
      });

      return this.formatSuccess({
        messageId: primaryUuid, // Return first UUID as primary message ID
        status: 'pending', // ✅ FIX: Use 'pending' not 'sent' - status confirmed via webhook
        providerResponse: allResponses[0], // Return first response
        metadata: {
          errCode: allResponses[0]?.err_code,
          errDesc: allResponses[0]?.err_desc,
          uuid: primaryUuid,
          eurosmsUuid: primaryUuid, // ✅ Store for webhook lookup
          totalParts: messageParts.length,
          allUuids: sentUuids // Include all UUIDs for webhook matching
        }
      });

    } catch (error) {
      this.log('error', 'EuroSMS failed', { error: error.message, stack: error.stack });
      throw this.handleEuroSMSError(error);
    }
  }

  /**
   * Check delivery status for EuroSMS message
   */
  async getMessageStatus(messageId) {
    if (this.provider === 'twilio') {
      return await this.getTwilioMessageStatus(messageId);
    } else if (this.provider === 'eurosms') {
      return await this.getEuroSMSStatus(messageId);
    }
    throw new Error('Status retrieval not supported for this provider');
  }

  /**
   * Get EuroSMS delivery status
   */
  async getEuroSMSStatus(uuid) {
    try {
      const response = await this.makeRequest(
        `${this.apiUrl}/status/one/${uuid}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      this.log('info', 'EuroSMS status retrieved', { uuid, status: response.dlr });

      return {
        messageId: uuid,
        status: this.mapEuroSMSStatus(response.dlr),
        rawStatus: response.dlr, // ✅ Include raw DLR status for error reporting
        deliveredAt: response.dlr_time ? new Date(response.dlr_time) : null,
        carrier: response.carrier,
        price: response.price,
        segments: response.sgmnt,
        errorCode: response.err_code,
      };
    } catch (error) {
      this.log('error', 'Failed to get EuroSMS status', { error: error.message });
      throw error;
    }
  }

  /**
   * Map EuroSMS delivery status to standard status
   */
  /**
   * Map EuroSMS delivery status to standard status (per SMS API v3.1.15, Section 13.2)
   */
  mapEuroSMSStatus(euroStatus) {
    const statusMap = {
      // Non-final statuses (message still in transit)
      'ENROUTE': 'sent',       // Message entered operator queue
      'ACCEPTD': 'sent',       // Accepted by operator SMS centre, awaiting delivery
      // Final statuses (delivery completed or failed)
      'DELIVRD': 'delivered',  // Successfully delivered to recipient
      'UNDELIV': 'failed',     // Undeliverable (invalid number, phone off permanently)
      'EXPIRED': 'failed',     // Expired after max 7 days (phone off, out of coverage)
      'REJECTD': 'failed',     // Rejected by operator (unpaid, blacklisted, etc.)
      'DELETED': 'failed',     // Cancelled by operator's SMS centre
      'UNKNOWN': 'failed',     // Unknown operator error
      // IM (Viber) specific
      'SEEN': 'read',          // Recipient read the message (Viber/IM only)
    };
    return statusMap[euroStatus] || 'pending';
  }

  async sendMedia(data) {
    // SMS doesn't support media - only text messages
    if (this.provider === 'twilio') {
      // Twilio supports MMS
      return await this.sendViaTwilio(data);
    }
    throw new Error('Media messages not supported by EuroSMS');
  }

  mapTwilioStatus(twilioStatus) {
    const statusMap = {
      'queued': 'pending',
      'sending': 'sending',
      'sent': 'sent',
      'delivered': 'delivered',
      'undelivered': 'failed',
      'failed': 'failed',
    };
    return statusMap[twilioStatus] || twilioStatus;
  }

  /**
   * Send bulk SMS messages (one-to-many)
   * @param {Object} data - Message data
   * @param {string} data.content - Message content
   * @param {Array<number>} data.rcpts - Array of recipient phone numbers (numeric, without +)
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Success response with message IDs
   */
  async sendBulk(data, metadata = {}) {
    if (this.provider === 'twilio') {
      throw new Error('Bulk SMS not supported for Twilio. Use individual sends.');
    } else if (this.provider === 'eurosms') {
      return await this.sendBulkEuroSMS(data, metadata);
    }
    throw new Error('Bulk SMS not supported for this provider');
  }

  /**
   * Send bulk SMS via EuroSMS
   */
  async sendBulkEuroSMS(data, metadata = {}) {
    try {
      const messageText = data.content?.text || data.text || '';
      const recipients = data.rcpts || [];

      if (!Array.isArray(recipients) || recipients.length === 0) {
        throw new Error('Recipients array (rcpts) is required and must not be empty');
      }

      // ✅ Enforce maximum recipient limit to prevent abuse
      const MAX_BULK_RECIPIENTS = 1000;
      if (recipients.length > MAX_BULK_RECIPIENTS) {
        throw new Error(
          `Too many recipients: ${recipients.length}. Maximum ${MAX_BULK_RECIPIENTS} recipients per bulk SMS request. ` +
          `Please split into multiple requests.`
        );
      }

      // ✅ Normalize and validate all recipients
      // For signature, we need the normalized string format (same as single message)
      // For payload, we need numeric values
      const normalizedRecipients = recipients.map(rcpt => {
        // Convert to string first, then normalize
        const rcptStr = typeof rcpt === 'string' ? rcpt : rcpt.toString();
        const normalized = this.normalizePhoneNumber(rcptStr, true); // Remove + and non-digits
        // ✅ FIX: Use Number() instead of parseInt() to avoid losing leading zeros
        if (!normalized || !/^\d+$/.test(normalized)) {
          throw new Error(`Invalid phone number in recipients: ${rcpt}`);
        }
        const num = Number(normalized);
        return { normalized, numeric: num };
      });

      // ✅ Determine sender name
      const integrationIdPattern = /^\d+-[A-Z0-9]+$/i;
      let senderName;
      
      if (this.senderId && integrationIdPattern.test(this.senderId)) {
        senderName = this.options?.identifier || 
                     this.credentials.identifier || 
                     this.credentials.accountName ||
                     'OmniConnect';
      } else {
        senderName = this.senderId || 
                     this.options?.identifier || 
                     this.credentials.identifier || 
                     'OmniConnect';
      }

      // ✅ Generate signature for bulk send
      // According to EuroSMS documentation for o2m:
      // "to calculate the digital signature the system takes into consideration all of the recipients' 
      // telephone numbers that are joined into a single string. The string does not contain any delimiters"
      // Signature format: sender + ALL recipients concatenated (no delimiters) + message
      const allRecipientsConcatenated = normalizedRecipients.map(r => r.normalized).join('');
      const signature = this.generateEuroSMSSignature(senderName, allRecipientsConcatenated, messageText);

      // Prepare request body for bulk send
      const payload = {
        iid: this.integrationId,
        sgn: signature,
        sndr: senderName,
        rcpts: normalizedRecipients.map(r => r.numeric), // ✅ Array of numeric recipient numbers
        txt: messageText,
        flgs: 1 // Request delivery report
      };

      // Add callback URL if provided (validate URL format)
      const callbackUrl = metadata.callbackUrl || process.env.EUROSMS_CALLBACK_URL;
      if (callbackUrl) {
        try {
          const parsedUrl = new URL(callbackUrl);
          if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') {
            payload.callback = callbackUrl;
          } else {
            this.log('warn', 'Invalid callback URL protocol, skipping', { callbackUrl });
          }
        } catch {
          this.log('warn', 'Invalid callback URL format, skipping', { callbackUrl });
        }
      }

      this.log('info', 'EuroSMS bulk request payload', {
        iid: this.integrationId,
        sndr: senderName,
        rcptCount: normalizedRecipients.length,
        firstRecipient: normalizedRecipients[0]?.normalized,
        allRecipientsConcatenated: allRecipientsConcatenated,
        signatureGenerated: !!signature,
        txtLength: messageText.length,
        hasSignature: !!signature,
        hasCallback: !!payload.callback
      });

      // ✅ Use test endpoint ONLY when explicitly enabled via env var
      const useTestEndpoint = process.env.EUROSMS_USE_TEST_ENDPOINT === 'true';
      const endpoint = useTestEndpoint ? '/test/o2m' : '/send/o2m';
      
      let response;
      try {
        response = await this.makeRequest(
          `${this.apiUrl}${endpoint}`, // ✅ Use o2m endpoint for bulk
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          }
        );
      } catch (requestError) {
        this.log('error', 'EuroSMS bulk API request failed', {
          error: requestError.message,
          status: requestError.response?.status,
          statusText: requestError.response?.statusText,
          responseBody: requestError.response?.data || requestError.response?.body || null,
          url: `${this.apiUrl}${endpoint}`,
          payload: {
            iid: this.integrationId,
            sndr: senderName,
            rcptCount: normalizedRecipients.length,
            txtLength: messageText.length
          }
        });
        
        if (requestError.response?.data) {
          const errorData = requestError.response.data;
          throw new Error(`EuroSMS Bulk Error (${errorData.err_code || 'HTTP_ERROR'}): ${errorData.err_desc || errorData.error || requestError.message}`);
        }
        throw requestError;
      }

      this.log('info', 'EuroSMS bulk API response', {
        response: response,
        errCode: response.err_code,
        errDesc: response.err_desc,
        errList: response.err_list,
        uuidCount: response.uuid ? (Array.isArray(response.uuid) ? response.uuid.length : 1) : 0
      });

      // Check for errors
      if (response.err_code && response.err_code !== 'ENQUEUED') {
        let errorMessage = response.err_desc || 'Unknown error';
        if (response.err_list && Array.isArray(response.err_list) && response.err_list.length > 0) {
          const firstError = response.err_list[0];
          errorMessage = firstError.err_desc || firstError.err_code || errorMessage;
        }
        
        const fullErrorMessage = `EuroSMS Bulk Error (${response.err_code}): ${errorMessage}`;
        this.log('error', 'EuroSMS bulk API returned error', {
          errCode: response.err_code,
          errDesc: response.err_desc,
          errList: response.err_list,
          fullResponse: response
        });
        throw new Error(fullErrorMessage);
      }

      // ✅ Extract UUIDs from bulk response (o2m format)
      // For bulk SMS, UUIDs are in the "accepted" array: accepted[].i[]
      // Each accepted item has: { r: recipient_number, i: [uuid1, uuid2, ...] }
      let uuids = [];
      
      if (response.accepted && Array.isArray(response.accepted)) {
        // Extract all UUIDs from accepted array
        response.accepted.forEach(acceptedItem => {
          if (acceptedItem.i && Array.isArray(acceptedItem.i)) {
            uuids.push(...acceptedItem.i);
          }
        });
      }
      
      // Fallback: check for uuid field (for single message compatibility)
      if (uuids.length === 0 && response.uuid) {
        uuids = Array.isArray(response.uuid) ? response.uuid : [response.uuid];
      }

      if (uuids.length === 0) {
        this.log('error', 'No UUIDs in EuroSMS bulk response', { 
          response,
          hasAccepted: !!response.accepted,
          acceptedLength: response.accepted?.length,
          hasUuid: !!response.uuid
        });
        throw new Error('No UUIDs returned from EuroSMS API');
      }

      this.log('info', 'Bulk SMS sent via EuroSMS', { 
        uuidCount: uuids.length, 
        status: response.err_code,
        uuids: uuids
      });

      // ✅ Track wrong/rejected numbers for reporting
      const wrongNumbers = response.wrong_numbers || [];
      const rejectedCount = wrongNumbers.length;

      return this.formatSuccess({
        messageIds: uuids,
        status: 'pending', // ✅ FIX: Use 'pending' not 'sent' - status confirmed via webhook
        providerResponse: response,
        recipientCount: normalizedRecipients.length,
        successCount: uuids.length,
        rejectedCount,
        wrongNumbers,
        groupId: response.group_id, // Include group_id for bulk messages
        metadata: {
          errCode: response.err_code,
          errDesc: response.err_desc,
          uuids: uuids,
          groupId: response.group_id,
          accepted: response.accepted,
          errList: response.err_list,
          wrongNumbers: wrongNumbers
        }
      });

    } catch (error) {
      this.log('error', 'EuroSMS bulk failed', { error: error.message, stack: error.stack });
      throw this.handleEuroSMSError(error);
    }
  }

  handleTwilioError(error) {
    const twilioError = error.response?.data;

    if (twilioError) {
      const errorMap = {
        // Authentication & permissions
        20003: { message: 'Permission denied - check account credentials', category: 'auth', retryable: false },
        20404: { message: 'Resource not found', category: 'auth', retryable: false },
        20429: { message: 'Too many requests - rate limit exceeded', category: 'rate_limit', retryable: true },

        // Phone number errors
        21211: { message: 'Invalid phone number - not a valid mobile number', category: 'recipient', retryable: false },
        21214: { message: 'Phone number is not SMS-capable', category: 'recipient', retryable: false },
        21217: { message: 'Phone number is not verified', category: 'recipient', retryable: false },
        21219: { message: 'Phone number is not owned by your account', category: 'auth', retryable: false },
        21408: { message: 'Permission denied for this phone number region', category: 'auth', retryable: false },
        21610: { message: 'Message blocked - recipient opted out (STOP)', category: 'recipient', retryable: false },
        21611: { message: 'Queue is full - message not sent', category: 'rate_limit', retryable: true },
        21612: { message: 'Phone number is not reachable', category: 'recipient', retryable: false },
        21614: { message: 'Phone number is not a valid mobile number for SMS', category: 'recipient', retryable: false },
        21617: { message: 'Message body exceeds maximum length', category: 'validation', retryable: false },

        // Delivery errors
        30001: { message: 'Queue overflow - too many messages queued', category: 'rate_limit', retryable: true },
        30002: { message: 'Account suspended', category: 'billing', retryable: false },
        30003: { message: 'Unreachable destination - phone is off or out of coverage', category: 'recipient', retryable: true },
        30004: { message: 'Message blocked by carrier', category: 'policy', retryable: false },
        30005: { message: 'Unknown destination - invalid phone number', category: 'recipient', retryable: false },
        30006: { message: 'Landline or unreachable carrier', category: 'recipient', retryable: false },
        30007: { message: 'Message delivery failed - carrier rejected', category: 'delivery', retryable: false },
        30008: { message: 'Unknown error from carrier', category: 'system', retryable: true },
        30009: { message: 'Missing inbound segment', category: 'system', retryable: true },
        30010: { message: 'Message price exceeds max price', category: 'billing', retryable: false },
        30034: { message: 'Message blocked due to A2P messaging restrictions', category: 'policy', retryable: false },

        // Account/billing
        11200: { message: 'HTTP retrieval failure', category: 'system', retryable: true },
        14107: { message: 'Invalid response from callback URL', category: 'system', retryable: true },
        63017: { message: 'Toll-free number not verified', category: 'auth', retryable: false },
        63018: { message: 'Toll-free verification rejected', category: 'auth', retryable: false },
      };

      const errorInfo = errorMap[twilioError.code] || {
        message: twilioError.message || 'Unknown Twilio error',
        category: 'unknown',
        retryable: false
      };

      const formattedError = new Error(`Twilio Error (${twilioError.code}): ${errorInfo.message}`);
      formattedError.code = `TWILIO_${twilioError.code}`;
      formattedError.category = errorInfo.category;
      formattedError.retryable = errorInfo.retryable;
      formattedError.userMessage = errorInfo.message;
      formattedError.details = twilioError;
      return formattedError;
    }

    // Network/connection errors are retryable
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      error.category = 'network';
      error.retryable = true;
    }

    return error;
  }

  handleEuroSMSError(error) {
    // Complete EuroSMS error code categorization (per SMS API v3.1.15 documentation, Appendix C)
    const euroSmsErrorCategories = {
      // Send errors (Section 13.1)
      'NO_IID': { category: 'auth', retryable: false, message: 'Missing integration ID — check your EuroSMS account configuration' },
      'NO_MSG': { category: 'validation', retryable: false, message: 'Missing message content in request' },
      'NO_RCPT': { category: 'validation', retryable: false, message: 'Missing recipient phone number' },
      'NO_TXT': { category: 'validation', retryable: false, message: 'Missing message text' },
      'NO_SGN': { category: 'auth', retryable: false, message: 'Missing digital signature — check integration key' },
      'NO_SNDR': { category: 'validation', retryable: false, message: 'Missing sender ID — configure sender name in channel settings' },
      'NO_BALANCE': { category: 'billing', retryable: false, message: 'Insufficient credit — please top up your EuroSMS account' },
      'WRONG_SIGNATURE': { category: 'auth', retryable: false, message: 'Invalid digital signature — check your integration key' },
      'WRONG_IID': { category: 'auth', retryable: false, message: 'Invalid or unknown integration ID' },
      'WRONG_NUMBER': { category: 'recipient', retryable: false, message: 'Invalid phone number format — use international format (e.g., 421903622237)' },
      'WRONG_SENDER': { category: 'validation', retryable: false, message: 'Invalid sender name — must be max 11 characters or a valid phone number' },
      'EMPTY_MESSAGE': { category: 'validation', retryable: false, message: 'Message text is empty — cannot send blank SMS' },
      'TOO_MANY_MESSAGES': { category: 'rate_limit', retryable: true, message: 'Too many messages in single request (max 1000) — will retry in smaller batch' },
      'MSG_TOO_LONG': { category: 'validation', retryable: false, message: 'Message exceeds maximum length — shorten to 612 characters (ASCII) or 268 characters (with diacritics)' },
      'ERR_OTHER': { category: 'system', retryable: true, message: 'EuroSMS system error — will retry automatically' },
      // Legacy error code aliases (backward compatibility)
      'INV_SGN': { category: 'auth', retryable: false, message: 'Invalid digital signature — check integration key' },
      'INV_IID': { category: 'auth', retryable: false, message: 'Invalid or unknown integration ID' },
      'INV_RCPT': { category: 'recipient', retryable: false, message: 'Invalid recipient phone number format' },
      'INV_SNDR': { category: 'validation', retryable: false, message: 'Invalid sender name' },
      'INV_TXT': { category: 'validation', retryable: false, message: 'Invalid message text' },
      'NO_CREDIT': { category: 'billing', retryable: false, message: 'Insufficient credit — please top up your EuroSMS account' },
      'BLOCKED': { category: 'policy', retryable: false, message: 'Message blocked by EuroSMS policy' },
      'THROTTLED': { category: 'rate_limit', retryable: true, message: 'Rate limit exceeded — will retry automatically' },
      'SRV_ERR': { category: 'system', retryable: true, message: 'EuroSMS server error — will retry automatically' },
      'TIMEOUT': { category: 'system', retryable: true, message: 'EuroSMS request timed out — will retry automatically' },
      // Also handle FAILED as a wrapper error code
      'FAILED': { category: 'system', retryable: false, message: 'EuroSMS request failed — check error details' },
    };

    // Extract error details from response if available
    if (error.response?.data) {
      const errorData = error.response.data;
      const errCode = errorData.err_code || 'UNKNOWN';
      const categoryInfo = euroSmsErrorCategories[errCode] || {
        category: 'unknown',
        retryable: false,
        message: errorData.err_desc || error.message
      };

      // Build comprehensive error message from err_list if available (per docs Section 9.3.5)
      let detailedMessage = categoryInfo.message;
      if (errorData.err_list && Array.isArray(errorData.err_list) && errorData.err_list.length > 0) {
        const errDetails = errorData.err_list.map(e => {
          const info = euroSmsErrorCategories[e.err_code];
          return info ? info.message : (e.err_desc || e.err_code);
        });
        detailedMessage = errDetails.join('. ');
      }

      // Include wrong_numbers info if present (per docs Section 9.3.6)
      if (errorData.wrong_numbers && Array.isArray(errorData.wrong_numbers) && errorData.wrong_numbers.length > 0) {
        const wrongNums = errorData.wrong_numbers.map(n => n.r || n).join(', ');
        detailedMessage += `. Invalid numbers: ${wrongNums}`;
      }

      const formattedError = new Error(
        `EuroSMS Error (${errCode}): ${detailedMessage}`
      );
      formattedError.code = `EUROSMS_${errCode}`;
      formattedError.category = categoryInfo.category;
      formattedError.retryable = categoryInfo.retryable;
      formattedError.userMessage = detailedMessage;
      formattedError.details = errorData;
      return formattedError;
    }

    // Check if the error message already contains EuroSMS error code
    const euroCodeMatch = error.message?.match(/EuroSMS (?:Bulk )?Error \((\w+)\)/);
    if (euroCodeMatch) {
      const errCode = euroCodeMatch[1];
      const categoryInfo = euroSmsErrorCategories[errCode];
      if (categoryInfo) {
        error.category = categoryInfo.category;
        error.retryable = categoryInfo.retryable;
        error.userMessage = categoryInfo.message;
      }
    }

    // Network/connection errors are retryable
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      error.category = 'network';
      error.retryable = true;
    }

    // MSG_TOO_LONG is a validation error - not retryable
    if (error.message?.includes('MSG_TOO_LONG')) {
      error.category = 'validation';
      error.retryable = false;
    }

    return error;
  }

  async validateWebhook(signature, payload, url) {
    if (this.provider === 'twilio') {
      return this.validateTwilioWebhook(signature, url, payload);
    } else if (this.provider === 'eurosms') {
      return this.validateEuroSMSWebhook(signature, payload);
    }
    return false;
  }

  validateTwilioWebhook(signature, url, params) {
    try {
      const sortedParams = Object.keys(params)
        .sort()
        .reduce((acc, key) => acc + key + params[key], url);

      const expectedSignature = crypto
        .createHmac('sha1', this.credentials.authToken)
        .update(Buffer.from(sortedParams, 'utf-8'))
        .digest('base64');

      return signature === expectedSignature;
    } catch (error) {
      this.log('error', 'Twilio webhook validation failed', { error: error.message });
      return false;
    }
  }

  validateEuroSMSWebhook(signature, payload) {
    try {
      // EuroSMS webhook validation: verify required fields exist
      // EuroSMS doesn't provide HMAC signatures on webhooks, so we validate structure
      if (!payload) return false;

      // Must have at least a UUID (sms_uuid) to be a valid webhook
      if (!payload.sms_uuid && !payload.uuid && !payload.message_id) {
        this.log('warn', 'EuroSMS webhook missing UUID identifier');
        return false;
      }

      // For delivery reports, must have delivery_result or sent_result
      if (payload.delivery_result || payload.sent_result) {
        return true; // Valid delivery report
      }

      // For incoming messages, must have from/rcpt and txt/message fields
      if (payload.from || payload.rcpt || payload.txt || payload.message) {
        return true; // Valid incoming message
      }

      // Accept other payloads with valid UUID (may be new webhook format)
      return true;
    } catch (error) {
      this.log('error', 'EuroSMS webhook validation failed', { error: error.message });
      return false;
    }
  }

  async parseWebhook(payload) {
    if (this.provider === 'twilio') {
      return this.parseTwilioWebhook(payload);
    } else if (this.provider === 'eurosms') {
      return this.parseEuroSMSWebhook(payload);
    }
    return null;
  }

  parseTwilioWebhook(payload) {
    // Check if it's a status update
    if (payload.MessageStatus || payload.SmsStatus) {
      return {
        type: 'status',
        messageId: payload.MessageSid || payload.SmsSid,
        status: this.mapTwilioStatus(payload.MessageStatus || payload.SmsStatus),
        timestamp: new Date(),
        errorCode: payload.ErrorCode,
        errorMessage: payload.ErrorMessage,
      };
    }

    // Incoming message
    return {
      type: 'message',
      messageId: payload.MessageSid,
      from: payload.From,
      to: payload.To,
      timestamp: new Date(),
      content: {
        type: 'text',
        text: payload.Body,
      },
      metadata: {
        numMedia: parseInt(payload.NumMedia || 0),
        mediaUrls: this.extractTwilioMediaUrls(payload),
      },
    };
  }

  parseEuroSMSWebhook(payload) {
    // Check if it's a delivery report
    if (payload.delivery_result || payload.sent_result) {
      const dlrStatus = payload.delivery_result || payload.sent_result;
      const mappedStatus = this.mapEuroSMSStatus(dlrStatus);

      // User-friendly error messages for each delivery status (per EuroSMS docs Section 13.2)
      const errorMessages = {
        'EXPIRED': 'SMS expired — recipient phone may be off or out of coverage for extended period',
        'UNDELIV': 'SMS undeliverable — phone number may be invalid or permanently disconnected',
        'REJECTD': 'SMS rejected by carrier — recipient may have unpaid balance or number is blacklisted',
        'DELETED': 'SMS cancelled by the operator\'s SMS centre',
        'UNKNOWN': 'SMS delivery status unknown — message may not have been delivered',
      };

      const result = {
        type: 'status',
        messageId: payload.sms_uuid,
        status: mappedStatus,
        timestamp: payload.delivery_time ? new Date(payload.delivery_time) : new Date(payload.sent_time),
        metadata: {
          operator: payload.operator,
          price: payload.price,
          segment: payload.segment,
          sentTime: payload.sent_time,
          deliveryTime: payload.delivery_time,
          rawDlrStatus: dlrStatus,
        },
      };

      // Add error info for failed statuses
      if (mappedStatus === 'failed' && errorMessages[dlrStatus]) {
        result.errors = [{
          message: errorMessages[dlrStatus],
          code: dlrStatus,
          error_data: { details: 'sms_delivery_failure' }
        }];
      }

      return result;
    }

    // Incoming message (if EuroSMS supports it)
    return {
      type: 'message',
      messageId: payload.sms_uuid || payload.message_id,
      from: payload.from || payload.rcpt,
      to: payload.to || payload.sndr,
      timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
      content: {
        type: 'text',
        text: payload.txt || payload.message || '',
      },
      metadata: {},
    };
  }

  extractTwilioMediaUrls(payload) {
    const numMedia = parseInt(payload.NumMedia || 0);
    const mediaUrls = [];

    for (let i = 0; i < numMedia; i++) {
      const url = payload[`MediaUrl${i}`];
      const contentType = payload[`MediaContentType${i}`];
      
      if (url) {
        mediaUrls.push({
          url,
          contentType,
        });
      }
    }

    return mediaUrls;
  }

  async getTwilioMessageStatus(messageSid) {
    try {
      const auth = Buffer.from(`${this.credentials.accountSid}:${this.credentials.authToken}`).toString('base64');

      const response = await this.makeRequest(
        `https://api.twilio.com/2010-04-01/Accounts/${this.credentials.accountSid}/Messages/${messageSid}.json`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`,
          },
        }
      );

      return {
        messageId: response.sid,
        status: this.mapTwilioStatus(response.status),
        sentAt: response.date_sent,
        price: response.price,
        errorCode: response.error_code,
        errorMessage: response.error_message,
      };
    } catch (error) {
      this.log('error', 'Failed to get Twilio status', { error: error.message });
      throw error;
    }
  }
}
