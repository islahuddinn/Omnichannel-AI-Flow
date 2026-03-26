// src/services/channel/imap/IMAPIdleManager.js
import Imap from 'imap';
import { IMAPEmailService } from '../../email/IMAPEmailService.js';
import { getTenantDB } from '../../../config/database.js';

/**
 * IMAP IDLE Manager - Real-time email fetching using IMAP IDLE
 * Listens for new emails and processes them immediately when they arrive
 */
export class IMAPIdleManager {
  constructor() {
    this.connections = new Map(); // Map<channelAccountId, imapConnection>
    this.reconnectTimeouts = new Map(); // Map<connectionKey, timeoutId> - prevent multiple reconnects
    this.reconnectAttempts = new Map(); // Map<connectionKey, attemptCount> - for exponential backoff
    this.fetchInProgress = new Map(); // ✅ FIX #1: Guard against concurrent fetches
    this.isRunning = false;
  }

  /**
   * Start IDLE for an email account
   */
  async startIdleForAccount(tenantId, channelAccountId, credentials) {
    const connectionKey = `${tenantId}:${channelAccountId}`;
    
    // Don't start if already running for this account
    if (this.connections.has(connectionKey)) {
      console.log(`📧 IDLE already running for account: ${channelAccountId}`);
      return;
    }

    try {
      console.log(`📧 Starting IMAP IDLE for account: ${channelAccountId}`);
      
      // Use IMAP credentials, fallback to SMTP
      const imapHost = credentials.imapHost || credentials.smtpHost;
      const imapPort = parseInt(credentials.imapPort || credentials.smtpPort || 993);
      const imapUser = credentials.imapUser || credentials.smtpUser;
      const imapPass = credentials.imapPass || credentials.smtpPass;

      const imap = new Imap({
        user: imapUser,
        password: imapPass,
        host: imapHost,
        port: imapPort,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 30000,
        authTimeout: 30000,
        keepalive: {
          interval: 10000, // Send NOOP every 10 seconds to keep connection alive
          idleInterval: 15000, // Re-enter IDLE every 15 seconds for near real-time email detection
          forceNoop: false // Use IDLE when supported, NOOP otherwise
        }
      });

      imap.once('ready', async () => {
        console.log(`✅ IMAP IDLE connection ready for account: ${channelAccountId}`);
        
        // ✅ Reset reconnect attempt counter on successful connection
        this.reconnectAttempts.delete(connectionKey);
        if (this.reconnectTimeouts.has(connectionKey)) {
          clearTimeout(this.reconnectTimeouts.get(connectionKey));
          this.reconnectTimeouts.delete(connectionKey);
        }
        
        try {
          await this.openInbox(imap);
          await this.startIdle(imap, tenantId, channelAccountId);
          
          // Store connection
          this.connections.set(connectionKey, {
            imap,
            tenantId,
            channelAccountId,
            lastChecked: new Date()
          });
        } catch (error) {
          console.error(`❌ Failed to start IDLE for account ${channelAccountId}:`, error.message);
          imap.end();
        }
      });

      imap.once('error', (err) => {
        // ✅ Suppress benign network errors (common in long-lived IMAP connections)
        const isBenignError = 
          err.code === 'ECONNRESET' || 
          err.code === 'ETIMEDOUT' || 
          err.code === 'EPIPE' ||
          err.code === 'ECONNREFUSED' ||
          err.message?.includes('ECONNRESET') ||
          err.message?.includes('ETIMEDOUT') ||
          err.message?.includes('EPIPE') ||
          err.message?.includes('Connection reset') ||
          err.message?.includes('read ECONNRESET');
        
        if (isBenignError) {
          // ✅ Log at debug level (suppress from console, but keep for debugging)
          // These are expected network issues that will be handled by reconnection
          if (Math.random() < 0.1) { // Only log 10% of benign errors to reduce noise
            console.log(`ℹ️ IMAP connection reset for account ${channelAccountId} (will reconnect automatically)`);
          }
        } else {
          // ✅ Log actual errors that need attention
          console.error(`❌ IMAP IDLE error for account ${channelAccountId}:`, err.message);
        }
        
        // Clean up connection
        this.connections.delete(connectionKey);
        
        // ✅ Prevent multiple simultaneous reconnection attempts
        if (this.reconnectTimeouts.has(connectionKey)) {
          clearTimeout(this.reconnectTimeouts.get(connectionKey));
        }
        
        // ✅ Exponential backoff for reconnection (30s, 60s, 120s, max 5min)
        const attemptCount = (this.reconnectAttempts.get(connectionKey) || 0) + 1;
        this.reconnectAttempts.set(connectionKey, attemptCount);
        const delay = Math.min(30000 * Math.pow(2, attemptCount - 1), 300000); // Max 5 minutes
        
        const timeoutId = setTimeout(() => {
          this.reconnectAttempts.delete(connectionKey);
          this.reconnectTimeouts.delete(connectionKey);
          console.log(`🔄 Reconnecting IMAP IDLE for account: ${channelAccountId} (attempt ${attemptCount})`);
          this.startIdleForAccount(tenantId, channelAccountId, credentials);
        }, delay);
        
        this.reconnectTimeouts.set(connectionKey, timeoutId);
      });

      imap.once('end', () => {
        // ✅ Suppress log for expected disconnections (handled by error handler)
        // Only log if it's an unexpected end (not from error handler)
        if (!this.reconnectTimeouts.has(connectionKey)) {
          console.log(`🔌 IMAP IDLE connection ended for account: ${channelAccountId}`);
        }
        this.connections.delete(connectionKey);
        // Clear reconnect timeout if connection ended cleanly
        if (this.reconnectTimeouts.has(connectionKey)) {
          clearTimeout(this.reconnectTimeouts.get(connectionKey));
          this.reconnectTimeouts.delete(connectionKey);
        }
        this.reconnectAttempts.delete(connectionKey);
      });

      // Connect
      imap.connect();
    } catch (error) {
      console.error(`❌ Failed to setup IMAP IDLE for account ${channelAccountId}:`, error.message);
    }
  }

  /**
   * Open INBOX mailbox
   */
  async openInbox(imap) {
    return new Promise((resolve, reject) => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          console.error('❌ Failed to open INBOX:', err.message);
          reject(err);
        } else {
          console.log('✅ INBOX opened for IDLE:', box.messages.total, 'total messages');
          resolve(box);
        }
      });
    });
  }

  /**
   * Start IDLE and listen for new emails
   */
  async startIdle(imap, tenantId, channelAccountId) {
    // Check if server supports IDLE
    if (!imap || !imap.serverSupports || !imap.serverSupports('IDLE')) {
      console.warn('⚠️ IMAP server does not support IDLE, falling back to periodic check');
      // Fallback to periodic check if IDLE not supported
      this.setupPeriodicCheck(imap, tenantId, channelAccountId);
      return;
    }

    // ✅ Store IDLE callback for resuming
    const connectionKey = `${tenantId}:${channelAccountId}`;
    const connection = this.connections.get(connectionKey);
    
    // Listen for new emails via IDLE 'mail' event
    imap.on('mail', async (numNewMsgs) => {
      console.log(`📧 New email(s) detected via IDLE: ${numNewMsgs} new message(s)`);

      // Prevent concurrent fetch calls but QUEUE a re-fetch if emails arrive during processing.
      // This ensures no emails are dropped when multiple arrive while a batch is processing.
      const fetchKey = `${tenantId}:${channelAccountId}`;
      if (this.fetchInProgress.get(fetchKey)) {
        // Mark that we need to re-fetch after current batch completes
        this.fetchPending = this.fetchPending || new Map();
        this.fetchPending.set(fetchKey, true);
        console.log('⏳ Fetch in progress — queued re-fetch after current batch');
        return;
      }

      this.fetchInProgress.set(fetchKey, true);
      try {
        await this.fetchNewEmails(imap, tenantId, channelAccountId);

        // Process any emails that arrived while we were fetching
        while (this.fetchPending?.get(fetchKey)) {
          this.fetchPending.set(fetchKey, false);
          console.log('📧 Processing queued re-fetch (emails arrived during previous batch)');
          await this.fetchNewEmails(imap, tenantId, channelAccountId);
        }
      } catch (error) {
        console.error('❌ Error fetching new emails via IDLE:', error.message);
      } finally {
        this.fetchInProgress.set(fetchKey, false);
        this.fetchPending?.set(fetchKey, false);
      }
    });

    // ✅ The imap library automatically handles IDLE via keepalive configuration
    // No need to manually call imap.idle() - it's handled internally
    // The 'mail' event will fire automatically when new emails arrive
    if (imap.serverSupports && imap.serverSupports('IDLE')) {
      console.log('✅ IMAP IDLE will be managed automatically via keepalive - listening for new emails in real-time');
    } else {
      console.warn('⚠️ IMAP server does not support IDLE, using periodic checks as fallback');
      // Fallback to periodic check if IDLE not supported
      this.setupPeriodicCheck(imap, tenantId, channelAccountId);
    }
  }

  /**
   * Resume IDLE after fetching emails
   * Note: The imap library automatically resumes IDLE via keepalive,
   * so we don't need to manually resume it
   */
  resumeIdle(imap) {
    // The imap library automatically handles IDLE resumption via keepalive
    // No manual intervention needed - IDLE will resume automatically
    // This method is kept for API compatibility but does nothing
  }

  /**
   * Setup periodic check as fallback (if IDLE not supported)
   */
  setupPeriodicCheck(imap, tenantId, channelAccountId) {
    const checkInterval = setInterval(async () => {
      try {
        if (imap.state === 'authenticated') {
          // ✅ Silently fetch - deduplication prevents reprocessing
          await this.fetchNewEmails(imap, tenantId, channelAccountId);
        } else {
          clearInterval(checkInterval);
        }
      } catch (error) {
        // ✅ Only log actual errors, not routine operations
        if (!error.message?.includes('does not exist') && !error.message?.includes('ENOTFOUND')) {
          console.error('❌ Periodic check error:', error.message);
        }
      }
    }, 60000); // ✅ Increased to 60 seconds to reduce processing frequency
  }

  /**
   * Fetch new emails received today
   */
  async fetchNewEmails(imap, tenantId, channelAccountId) {
    try {
      // Calculate today's date (local timezone)
      const now = new Date();
      const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const yesterdayLocal = new Date(todayLocal);
      yesterdayLocal.setDate(yesterdayLocal.getDate() - 1);

      // Search for emails since yesterday (to catch all of today)
      const searchCriteria = [['SINCE', yesterdayLocal]];

      return new Promise((resolve, reject) => {
        imap.search(searchCriteria, async (err, results) => {
          if (err) {
            console.error('❌ IMAP search error during IDLE:', err.message);
            reject(err);
            return;
          }

          if (!results || results.length === 0) {
            // ✅ Don't log when no emails found (reduces log noise)
            resolve([]);
            return;
          }

          // ✅ Removed verbose log - deduplication prevents reprocessing

          // Fetch email bodies
          const fetch = imap.fetch(results, {
            bodies: '',
            struct: true,
          });

          const emails = [];
          let processed = 0;

          fetch.on('message', (msg, seqno) => {
            let buffer = '';

            msg.on('body', (stream, info) => {
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
            });

            msg.once('end', async () => {
              try {
                const { simpleParser } = await import('mailparser');
                const parsed = await simpleParser(buffer);
                
                // ✅ Only process emails from today
                const emailDate = new Date(parsed.date || parsed.headers.get('date'));
                const emailDateLocal = new Date(emailDate.getFullYear(), emailDate.getMonth(), emailDate.getDate());
                const isToday = emailDateLocal.getTime() === todayLocal.getTime();

                if (isToday) {
                  // ✅ Removed verbose log - deduplication happens in processIncomingEmail
                  // Extract name and email from mailparser's parsed.from structure
                  const fromValue = parsed.from?.value?.[0];
                  const fromName = fromValue?.name || null;
                  const fromEmail = fromValue?.address || parsed.from?.text || 'Unknown';
                  
                  const messageId = parsed.messageId || `email-${Date.now()}-${seqno}`;
                  
                  // Pre-check: skip if this exact messageId + sender email already processed.
                  // Uses fromEmail (not contact ID, which isn't resolved yet) so different
                  // senders with the same Message-ID are NOT blocked here.
                  // Final dedup happens in IMAPEmailService.processIncomingEmail with contact ID.
                  try {
                    const tenantDB = await getTenantDB(tenantId);
                    const MessageSchema = (await import('../../../models/schemas/Message.js')).default;
                    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

                    const existingMessage = await Message.findOne({
                      'emailData.messageId': messageId,
                      'emailData.from': fromEmail,
                      channel: 'email',
                      channelAccount: channelAccountId,
                    }).select('_id').lean();

                    if (existingMessage) {
                      processed++;
                      if (processed === results.length) {
                        if (emails.length > 0) {
                          console.log(`✅ Processed ${emails.length} new email(s) from today via IDLE`);
                        }
                        resolve(emails);
                      }
                      return;
                    }
                  } catch (dedupError) {
                    console.error('⚠️ Deduplication check failed:', dedupError.message);
                  }
                  
                  // Push to RabbitMQ for parallel processing (decoupled from IMAP)
                  // This lets IMAP return to IDLE immediately instead of blocking on AI calls
                  const emailPayload = {
                    messageId,
                    from: parsed.from?.text || fromEmail,
                    fromEmail,
                    fromName,
                    to: parsed.to?.value?.map(a => a.address) || [parsed.to?.text] || [],
                    cc: parsed.cc?.value?.map(a => a.address) || [],
                    bcc: parsed.bcc?.value?.map(a => a.address) || [],
                    subject: parsed.subject || 'No Subject',
                    text: parsed.text || '',
                    html: parsed.html || '',
                    date: emailDate.toISOString(),
                    attachments: (parsed.attachments || []).map(att => ({
                      filename: att.filename,
                      contentType: att.contentType,
                      size: att.size,
                      // Convert buffer to base64 for queue transport
                      content: att.content ? att.content.toString('base64') : null,
                    })),
                    headers: {
                      'message-id': parsed.messageId,
                      'in-reply-to': parsed.inReplyTo || parsed.headers.get('in-reply-to'),
                      'references': parsed.references || parsed.headers.get('references'),
                      'auto-submitted': parsed.headers.get('auto-submitted') || '',
                      'precedence': parsed.headers.get('precedence') || '',
                      'content-type': parsed.headers.get('content-type')?.value || parsed.headers.get('content-type') || '',
                      'x-auto-response-suppress': parsed.headers.get('x-auto-response-suppress') || '',
                    },
                    tenantId,
                    channelAccountId,
                  };

                  try {
                    const { publishToQueue, QUEUES } = await import('../../../lib/queue/rabbitmq.js');
                    await publishToQueue(QUEUES.EMAIL_INBOUND, emailPayload);
                    emails.push({ subject: parsed.subject, from: fromEmail });
                  } catch (queueErr) {
                    // Fallback: process directly if queue fails
                    console.error('⚠️ Failed to queue email, processing directly:', queueErr.message);
                    const result = await IMAPEmailService.processIncomingEmail(emailPayload, tenantId, channelAccountId);
                    if (result.created) {
                      emails.push({ subject: parsed.subject, from: fromEmail });
                    }
                  }
                }

                processed++;
                if (processed === results.length) {
                  // ✅ Only log if there were new emails created (reduces log noise)
                  if (emails.length > 0) {
                    console.log(`✅ Processed ${emails.length} new email(s) from today via IDLE`);
                  }
                  resolve(emails);
                }
              } catch (parseError) {
                console.error('❌ Failed to parse email during IDLE:', parseError.message);
                processed++;
                if (processed === results.length) {
                  resolve(emails);
                }
              }
            });
          });

          fetch.once('error', (err) => {
            console.error('❌ IMAP fetch error during IDLE:', err.message);
            reject(err);
          });
        });
      });
    } catch (error) {
      console.error('❌ Error in fetchNewEmails:', error.message);
      throw error;
    }
  }

  /**
   * Stop IDLE for an account
   */
  async stopIdleForAccount(tenantId, channelAccountId) {
    const connectionKey = `${tenantId}:${channelAccountId}`;
    const connection = this.connections.get(connectionKey);

    // ✅ Clear any pending reconnection attempts
    if (this.reconnectTimeouts.has(connectionKey)) {
      clearTimeout(this.reconnectTimeouts.get(connectionKey));
      this.reconnectTimeouts.delete(connectionKey);
    }
    this.reconnectAttempts.delete(connectionKey);
    this.fetchInProgress.delete(connectionKey);

    if (connection) {
      if (connection.imap && connection.imap.state !== 'disconnected') {
        // ✅ FIX #12: Wait for connection to actually close before returning
        try {
          await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              // Force destroy if end() doesn't complete in 5 seconds
              try { connection.imap.destroy(); } catch { /* ignore */ }
              resolve();
            }, 5000);

            connection.imap.once('end', () => {
              clearTimeout(timeout);
              resolve();
            });
            connection.imap.end();
          });
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
      this.connections.delete(connectionKey);
      console.log(`🛑 Stopped IDLE for account: ${channelAccountId}`);
    }
  }

  /**
   * Stop all IDLE connections
   */
  stopAll() {
    console.log('🛑 Stopping all IMAP IDLE connections...');
    
    // ✅ Clear all reconnection timeouts
    for (const timeoutId of this.reconnectTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.reconnectTimeouts.clear();
    this.reconnectAttempts.clear();
    
    for (const [connectionKey, connection] of this.connections.entries()) {
      if (connection.imap && connection.imap.state !== 'disconnected') {
        // Just close the connection - keepalive will stop automatically
        try {
          connection.imap.end();
        } catch (e) {
          // Ignore errors
        }
      }
    }
    this.connections.clear();
    this.isRunning = false;
    console.log('✅ All IMAP IDLE connections stopped');
  }
}

// Singleton instance
let idleManagerInstance = null;

export function getIMAPIdleManager() {
  if (!idleManagerInstance) {
    idleManagerInstance = new IMAPIdleManager();
  }
  return idleManagerInstance;
}

export default IMAPIdleManager;

