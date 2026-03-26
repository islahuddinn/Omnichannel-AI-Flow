
// src/services/channel/adapters/EmailAdapter.js
import { BaseAdapter } from './BaseAdapter.js';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import crypto from 'crypto';
import { getAppUrl } from '../../../lib/utils.js';

// ✅ Simple email format validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailAdapter extends BaseAdapter {
  constructor(credentials, options = {}) {
    super(credentials, options);
    this.channelType = 'email';
    this.supportedTypes = ['text', 'html', 'template'];
    this.transporter = null;

    this.validateCredentials();
    this.initializeTransporter();
  }

  validateCredentials() {
    super.validateCredentials();

    if (!this.credentials.smtpHost) {
      throw new Error('SMTP host is required');
    }
    if (!this.credentials.smtpPort) {
      throw new Error('SMTP port is required');
    }
    if (!this.credentials.smtpUser) {
      throw new Error('SMTP username is required');
    }
    if (!this.credentials.smtpPass) {
      throw new Error('SMTP password is required');
    }

    // ✅ Validate SMTP port is a recognized email port
    const port = parseInt(this.credentials.smtpPort);
    const recognizedPorts = [25, 465, 587, 2525];
    if (!recognizedPorts.includes(port)) {
      this.log('warn', `SMTP port ${port} is non-standard. Common ports: 465 (SSL), 587 (STARTTLS), 25 (unencrypted)`);
    }

    // ✅ Use fromEmail if provided, otherwise fall back to identifier or smtpUser
    // Priority: 1) fromEmail in credentials, 2) identifier from CompanyAccount, 3) smtpUser if it's an email
    if (!this.credentials.fromEmail) {
      if (this.options?.identifier && EMAIL_REGEX.test(this.options.identifier)) {
        this.credentials.fromEmail = this.options.identifier;
      } else if (this.credentials.smtpUser && EMAIL_REGEX.test(this.credentials.smtpUser)) {
        this.credentials.fromEmail = this.credentials.smtpUser;
      } else {
        throw new Error('From email address is required. Please set fromEmail in credentials, or ensure CompanyAccount identifier is a valid email address.');
      }
    }

    // ✅ FIX #10: Validate fromEmail is actually a valid email address
    if (!EMAIL_REGEX.test(this.credentials.fromEmail)) {
      throw new Error(`Invalid From email address: "${this.credentials.fromEmail}". Please provide a valid email address.`);
    }
  }

  initializeTransporter() {
    const port = parseInt(this.credentials.smtpPort);

    // ✅ FIX #5: Allow user to explicitly set secure flag, with smart defaults
    // Priority: 1) credentials.smtpSecure (explicit), 2) port-based detection
    let secure;
    if (this.credentials.smtpSecure !== undefined) {
      // User explicitly set the secure flag
      secure = this.credentials.smtpSecure === true || this.credentials.smtpSecure === 'true';
    } else {
      // Smart defaults: port 465 = SSL, everything else = STARTTLS
      secure = port === 465;
    }

    this.transporter = nodemailer.createTransport({
      host: this.credentials.smtpHost,
      port: port,
      secure: secure,
      auth: {
        user: this.credentials.smtpUser,
        pass: this.credentials.smtpPass,
      },
      tls: {
        // ✅ FIX #5: Default to rejecting unauthorized certs in production
        // Allow override via credentials for self-signed certs
        rejectUnauthorized: this.credentials.tlsRejectUnauthorized !== false &&
                           this.credentials.tlsRejectUnauthorized !== 'false',
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });

    this.log('info', 'SMTP transporter initialized', {
      host: this.credentials.smtpHost,
      port: port,
      secure: secure,
      tlsRejectUnauthorized: this.transporter.options.tls.rejectUnauthorized,
    });
  }

  async sendMessage(data) {
    try {
      // ✅ CRITICAL: For email, content.type might not be set, so validate differently
      if (!data.content || typeof data.content !== 'object') {
        throw new Error('Message content is required');
      }

      // ✅ Ensure content has a type (default to 'text' for email)
      if (!data.content.type) {
        data.content.type = 'text';
      }

      this.validateContent(data.content);
      this.log('info', 'Sending email', { to: data.to, subject: data.emailData?.subject || data.content?.subject });

      const { to, content, metadata = {}, emailData } = data;

      // ✅ CRITICAL: Use emailData.subject if available (from worker), otherwise use content.subject
      // FIX #6: Only use "New Message" if truly no subject was intended (not silently)
      const emailSubject = emailData?.subject || content.subject || '';
      if (!emailSubject) {
        this.log('warn', 'Email being sent without subject line', { to });
      }

      // ✅ CRITICAL: Use emailData for cc/bcc if available
      const emailCc = emailData?.cc || metadata.cc;
      const emailBcc = emailData?.bcc || metadata.bcc;
      const emailTo = emailData?.to?.[0] || to;

      // ✅ FIX #11: Validate all recipient emails before sending
      const allRecipients = [emailTo, ...(Array.isArray(emailCc) ? emailCc : emailCc ? [emailCc] : []), ...(Array.isArray(emailBcc) ? emailBcc : emailBcc ? [emailBcc] : [])].filter(Boolean);
      for (const recipient of allRecipients) {
        // Handle "Name <email>" format
        const emailMatch = recipient.match(/<([^>]+)>/);
        const emailToCheck = emailMatch ? emailMatch[1] : recipient;
        if (!EMAIL_REGEX.test(emailToCheck.trim())) {
          throw new Error(`Invalid recipient email address: "${recipient}". Please check the email and try again.`);
        }
      }

      // ✅ Generate tracking pixel URL for read receipts (if messageId is available)
      const trackingPixelUrl = metadata.messageId
        ? `${getAppUrl()}/api/tracking/email/${metadata.messageId}/read.gif`
        : null;

      // ✅ Prepare email body
      let htmlContent = content.html || this.textToHtml(content.text);

      // ✅ FIX #23: Generate text fallback from HTML if only HTML available
      let textContent = content.text;
      if (!textContent && content.html) {
        textContent = this.htmlToText(content.html);
      }

      // ✅ Append company email signature if enabled
      const emailSignature = this.options?.companyEmailSignature;
      const signatureEnabled = this.options?.companyEmailSignatureEnabled;
      if (signatureEnabled && emailSignature) {
        const signatureHtml = `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${emailSignature}</div>`;
        // Insert before </body> if present, otherwise append
        if (htmlContent && htmlContent.includes('</body>')) {
          htmlContent = htmlContent.replace('</body>', `${signatureHtml}</body>`);
        } else if (htmlContent) {
          htmlContent += signatureHtml;
        }
        // Also append plain text version of signature
        if (textContent) {
          const signaturePlainText = this.htmlToText(emailSignature);
          textContent += `\n\n--\n${signaturePlainText}`;
        }
      }

      // Add tracking pixel at the end of HTML body
      if (trackingPixelUrl && htmlContent) {
        htmlContent = htmlContent.replace(
          '</body>',
          `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" /></body>`
        );
        if (!htmlContent.includes('</body>')) {
          htmlContent += `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;
        }
      }

      // ✅ FIX #25: Warn if subject is too long
      if (emailSubject && emailSubject.length > 78) {
        this.log('warn', `Email subject exceeds recommended 78 chars (${emailSubject.length} chars). May wrap in some email clients.`);
      }

      // ✅ Sender name priority: 1) Channel credential fromName (non-empty), 2) Company emailSettings fromName, 3) 'OmniConnect'
      const credFromName = this.credentials.fromName?.trim();
      const companyFromName = this.options?.companyFromName?.trim();
      const senderName = credFromName || companyFromName || 'Hodinový Manžel S.R.O';
      this.log('info', `Email sender name resolved: "${senderName}" (credential: "${credFromName || ''}", company: "${companyFromName || ''}")`);
      // ✅ Reply-to priority: 1) metadata.replyTo (per-message), 2) Company emailSettings replyToEmail, 3) undefined (uses from address)
      const replyToAddress = metadata.replyTo || this.options?.companyReplyToEmail || undefined;

      const mailOptions = {
        from: {
          name: senderName,
          address: this.credentials.fromEmail,
        },
        to: emailTo,
        subject: emailSubject,
        text: textContent,
        html: htmlContent,
        replyTo: replyToAddress,
        cc: emailCc,
        bcc: emailBcc,
        // ✅ Generate a proper Message-ID for this email
        messageId: this.generateMessageId(),
        headers: {
          'X-Message-ID': metadata.messageId || this.generateMessageId(),
          'X-Conversation-ID': metadata.conversationId,
          'X-Tenant-ID': metadata.tenantId,
          ...(trackingPixelUrl && { 'X-Tracking-Pixel': trackingPixelUrl }),
        },
      };

      // Add attachments - support both content.attachments and data.attachments
      const emailAttachments = content.attachments || data.attachments || [];
      if (emailAttachments.length > 0) {
        mailOptions.attachments = emailAttachments.map(att => ({
          filename: att.filename || att.name,
          path: att.url || att.path,
          contentType: att.contentType || att.mimeType,
        }));
      }

      // ✅ FIX #9: Always set threading headers for proper email threading
      // If we have conversation context, use it for threading
      if (metadata.inReplyTo) {
        mailOptions.inReplyTo = metadata.inReplyTo;
        mailOptions.references = metadata.references || metadata.inReplyTo;
      } else if (metadata.conversationMessageId) {
        // Fallback: use conversation's last message ID for threading
        mailOptions.inReplyTo = metadata.conversationMessageId;
        mailOptions.references = metadata.conversationReferences || metadata.conversationMessageId;
      }

      const info = await this.transporter.sendMail(mailOptions);

      // ✅ FIX #17: Log detailed SMTP response for debugging
      this.log('info', 'Email sent successfully', {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response,
        envelope: info.envelope,
      });

      // ✅ Check for rejected recipients
      if (info.rejected && info.rejected.length > 0) {
        this.log('warn', 'Some recipients were rejected by SMTP server', {
          rejected: info.rejected,
          accepted: info.accepted,
        });
      }

      return this.formatSuccess({
        messageId: info.messageId,
        status: 'sent',
        emailResponse: {
          messageId: info.messageId,
          accepted: info.accepted,
          rejected: info.rejected,
          response: info.response,
          envelope: info.envelope,
        },
        providerResponse: {
          accepted: info.accepted,
          rejected: info.rejected,
          response: info.response,
        },
      });

    } catch (error) {
      // ✅ FIX #17: Detailed SMTP error logging with categories
      const errorInfo = this.categorizeEmailError(error);
      this.log('error', 'Email send failed', {
        error: error.message,
        code: error.code,
        command: error.command,
        responseCode: error.responseCode,
        category: errorInfo.category,
        retryable: errorInfo.retryable,
        userMessage: errorInfo.userMessage,
      });

      // Attach category info to error for upstream handling
      error.category = errorInfo.category;
      error.retryable = errorInfo.retryable;
      error.userMessage = errorInfo.userMessage;
      throw error;
    }
  }

  /**
   * Categorize email errors for proper handling and user display
   */
  categorizeEmailError(error) {
    const code = error.code;
    const responseCode = error.responseCode;
    const message = error.message || '';

    // Authentication errors
    if (code === 'EAUTH' || responseCode === 535 || message.includes('authentication')) {
      return { category: 'auth', retryable: false, userMessage: 'Email authentication failed. Please check SMTP credentials.' };
    }

    // Connection errors
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'ESOCKET') {
      return { category: 'network', retryable: true, userMessage: 'Could not connect to email server. Will retry.' };
    }

    // TLS/SSL errors
    if (code === 'ETLS' || message.includes('TLS') || message.includes('SSL') || message.includes('certificate')) {
      return { category: 'tls', retryable: false, userMessage: 'Email server TLS/SSL error. Check SMTP security settings.' };
    }

    // Recipient errors
    if (responseCode === 550 || responseCode === 551 || responseCode === 553) {
      return { category: 'recipient', retryable: false, userMessage: 'Recipient email address rejected by mail server.' };
    }

    // Mailbox full
    if (responseCode === 552 || message.includes('quota') || message.includes('full')) {
      return { category: 'recipient', retryable: false, userMessage: 'Recipient mailbox is full.' };
    }

    // Rate limiting
    if (responseCode === 421 || responseCode === 450 || message.includes('rate') || message.includes('throttl')) {
      return { category: 'rate_limit', retryable: true, userMessage: 'Email rate limit reached. Will retry later.' };
    }

    // Blocked/policy
    if (responseCode === 554 || message.includes('spam') || message.includes('blocked') || message.includes('blacklist')) {
      return { category: 'policy', retryable: false, userMessage: 'Email blocked by recipient mail server (possible spam detection).' };
    }

    // Message too large
    if (responseCode === 552 || message.includes('size') || message.includes('too large')) {
      return { category: 'validation', retryable: false, userMessage: 'Email too large. Try reducing attachment sizes.' };
    }

    // Default
    return { category: 'unknown', retryable: false, userMessage: `Email send failed: ${message}` };
  }

  async sendMedia(data) {
    // For email, media means attachments
    return await this.sendMessage(data);
  }

  textToHtml(text) {
    if (!text) return '';

    return text
      .split('\n\n')
      .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  /**
   * ✅ FIX #23: Convert HTML to plain text (fallback for text-only email clients)
   */
  htmlToText(html) {
    if (!html) return '';
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li>/gi, '- ')
      .replace(/<[^>]+>/g, '') // Strip remaining HTML tags
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
      .trim();
  }

  generateMessageId() {
    const domain = this.credentials.fromEmail.split('@')[1] || 'omniconnect.com';
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');

    return `<${timestamp}.${random}@${domain}>`;
  }

  async validateWebhook(signature, payload) {
    // For services like SendGrid that use webhooks
    if (this.credentials.webhookVerificationKey) {
      try {
        const verify = crypto.createVerify('SHA256');
        verify.update(JSON.stringify(payload));

        return verify.verify(
          this.credentials.webhookVerificationKey,
          signature,
          'base64'
        );
      } catch (error) {
        this.log('error', 'Email webhook validation failed', { error: error.message });
        return false;
      }
    }

    return true;
  }

  async parseWebhook(payload) {
    try {
      // ✅ Determine event type from webhook payload
      // Support SendGrid, Mailgun, and generic webhook formats
      const eventType = payload.event || payload.type || payload['event-data']?.event;

      // ✅ FIX #20: Handle bounce/complaint/unsubscribe webhooks
      if (eventType === 'bounce' || eventType === 'dropped' || eventType === 'failed' ||
          eventType === 'permanent_fail' || eventType === 'temporary_fail') {
        return {
          type: 'status',
          messageId: payload.sg_message_id || payload['Message-Id'] || payload['event-data']?.message?.headers?.['message-id'],
          status: 'failed',
          errorMessage: this.getBounceErrorMessage(payload, eventType),
          errorCode: payload.reason || eventType,
          timestamp: new Date(payload.timestamp ? payload.timestamp * 1000 : Date.now()),
        };
      }

      if (eventType === 'delivered') {
        return {
          type: 'status',
          messageId: payload.sg_message_id || payload['Message-Id'] || payload['event-data']?.message?.headers?.['message-id'],
          status: 'delivered',
          timestamp: new Date(payload.timestamp ? payload.timestamp * 1000 : Date.now()),
        };
      }

      if (eventType === 'open' || eventType === 'opened') {
        return {
          type: 'status',
          messageId: payload.sg_message_id || payload['Message-Id'] || payload['event-data']?.message?.headers?.['message-id'],
          status: 'read',
          timestamp: new Date(payload.timestamp ? payload.timestamp * 1000 : Date.now()),
        };
      }

      // Default: parse as incoming message
      return {
        type: 'message',
        messageId: payload.headers?.['Message-ID'] || this.generateMessageId(),
        from: payload.from || payload.email,
        to: payload.to,
        timestamp: new Date(payload.timestamp || Date.now()),
        content: {
          type: 'email',
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
          attachments: this.parseAttachments(payload),
        },
        metadata: {
          cc: payload.cc,
          spamScore: payload.spam_score,
          inReplyTo: payload.headers?.['In-Reply-To'],
          references: payload.headers?.['References'],
        },
      };
    } catch (error) {
      this.log('error', 'Failed to parse email webhook', { error: error.message });
      throw error;
    }
  }

  /**
   * ✅ FIX #20: Extract meaningful bounce error message
   */
  getBounceErrorMessage(payload, eventType) {
    const bounceMessages = {
      'bounce': 'Email bounced - recipient address does not exist or is unavailable',
      'dropped': 'Email dropped by provider - previously bounced or unsubscribed',
      'failed': 'Email delivery failed',
      'permanent_fail': 'Permanent delivery failure - email address may not exist',
      'temporary_fail': 'Temporary delivery failure - will retry automatically',
    };

    // Try to get specific reason from payload
    const specificReason = payload.reason || payload.diag || payload['event-data']?.['delivery-status']?.description;
    if (specificReason) {
      return `${bounceMessages[eventType] || 'Email delivery failed'}: ${specificReason}`;
    }

    return bounceMessages[eventType] || 'Email delivery failed';
  }

  parseAttachments(payload) {
    const attachments = [];

    if (payload.attachments) {
      const attachmentCount = parseInt(payload.attachments);
      for (let i = 1; i <= attachmentCount; i++) {
        const info = payload[`attachment-info${i}`];
        if (info) {
          try {
            const parsed = JSON.parse(info);
            attachments.push({
              filename: parsed.filename,
              type: parsed.type,
              contentId: parsed['content-id'],
            });
          } catch {
            // Skip malformed attachment info
          }
        }
      }
    }

    return attachments;
  }

  async parseRawEmail(rawEmail) {
    try {
      const parsed = await simpleParser(rawEmail);

      return {
        type: 'message',
        messageId: parsed.messageId,
        from: parsed.from.text,
        to: parsed.to?.text,
        timestamp: parsed.date,
        content: {
          type: 'email',
          subject: parsed.subject,
          text: parsed.text,
          html: parsed.html,
          attachments: parsed.attachments.map(att => ({
            filename: att.filename,
            contentType: att.contentType,
            size: att.size,
            content: att.content,
          })),
        },
        metadata: {
          cc: parsed.cc?.text,
          bcc: parsed.bcc?.text,
          inReplyTo: parsed.inReplyTo,
          references: parsed.references,
        },
      };
    } catch (error) {
      this.log('error', 'Failed to parse raw email', { error: error.message });
      throw error;
    }
  }

  async getMessageStatus(messageId) {
    // SMTP doesn't provide delivery status - use webhooks for bounce handling
    throw new Error('Status retrieval not supported for email - use webhooks for bounces');
  }

  async verifyConnection() {
    try {
      await this.transporter.verify();
      this.log('info', 'SMTP connection verified');
      return true;
    } catch (error) {
      this.log('error', 'SMTP verification failed', { error: error.message });
      return false;
    }
  }

  close() {
    if (this.transporter) {
      this.transporter.close();
      this.log('info', 'SMTP connection closed');
    }
  }
}
