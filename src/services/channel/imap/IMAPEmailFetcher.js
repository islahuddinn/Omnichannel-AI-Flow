// src/services/channel/imap/IMAPEmailFetcher.js
import Imap from 'imap';
import { simpleParser } from 'mailparser';

/**
 * IMAP Email Fetcher - Fetches today's emails from IMAP server
 */
export class IMAPEmailFetcher {
  constructor(credentials) {
    this.credentials = credentials;
    this.imap = null;
  }

  /**
   * Connect to IMAP server
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        // ✅ Use IMAP credentials, fallback to SMTP if not provided
        const imapHost = this.credentials.imapHost || this.credentials.smtpHost;
        const imapPort = parseInt(this.credentials.imapPort || this.credentials.smtpPort || 993);
        const imapUser = this.credentials.imapUser || this.credentials.smtpUser;
        const imapPass = this.credentials.imapPass || this.credentials.smtpPass;
        
        console.log('📧 Connecting to IMAP:', {
          host: imapHost,
          port: imapPort,
          user: imapUser ? `${imapUser.substring(0, 3)}***` : 'missing',
          hasPassword: !!imapPass
        });
        
        this.imap = new Imap({
          user: imapUser,
          password: imapPass,
          host: imapHost,
          port: imapPort,
          tls: true,
          tlsOptions: { rejectUnauthorized: false },
          connTimeout: 30000,
          authTimeout: 30000,
        });

        this.imap.once('ready', () => {
          console.log('✅ IMAP connected successfully');
          resolve();
        });

        this.imap.once('error', (err) => {
          console.error('❌ IMAP connection error:', err.message);
          reject(err);
        });

        this.imap.once('end', () => {
          console.log('🔌 IMAP connection ended');
        });

        this.imap.connect();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Open inbox mailbox
   */
  async openInbox() {
    return new Promise((resolve, reject) => {
      this.imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          console.error('❌ Failed to open INBOX:', err.message);
          reject(err);
        } else {
          console.log('✅ INBOX opened:', box.messages.total, 'total messages');
          resolve(box);
        }
      });
    });
  }

  /**
   * Fetch emails from today only
   */
  async fetchTodayEmails() {
    try {
      await this.connect();
      await this.openInbox();

      // ✅ Calculate today's date for IMAP search
      // IMAP SINCE searches for emails on or after the specified date (ignoring time)
      // Use local date (not UTC) as email servers typically use local date for SINCE searches
      const now = new Date();
      const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      // For safety, search from yesterday to ensure we catch all of today's emails
      // (IMAP SINCE is inclusive, so searching SINCE yesterday will include today)
      const yesterdayLocal = new Date(todayLocal);
      yesterdayLocal.setDate(yesterdayLocal.getDate() - 1);

      console.log('📧 Fetching emails from today:', {
        searchDate: yesterdayLocal.toISOString(),
        todayLocal: todayLocal.toISOString(),
        now: now.toISOString(),
        localTime: now.toLocaleString()
      });

      // ✅ IMAP search criteria: SINCE requires exactly one Date argument
      // From README example: imap.search([ 'UNSEEN', ['SINCE', 'May 20, 2010'] ], ...)
      // The format is: [criterion1, [criterion2, arg], ...] where:
      // - criterion1 can be a string like 'UNSEEN' or an array like ['SINCE', Date]
      // - Each criterion in the array is either:
      //   - A string: 'UNSEEN', 'ALL', etc.
      //   - An array: ['SINCE', Date] where first element is criterion, rest are args
      // For just SINCE (without other criteria): [['SINCE', Date]]
      // ✅ Use yesterday's date to ensure we catch all of today's emails (SINCE is inclusive)
      const searchDate = new Date(yesterdayLocal);
      // ✅ Format: Array containing one element which is itself ['SINCE', Date]
      const searchCriteria = [['SINCE', searchDate]];

      return new Promise((resolve, reject) => {
        this.imap.search(searchCriteria, (err, results) => {
          if (err) {
            console.error('❌ IMAP search error:', err.message);
            reject(err);
            return;
          }

          if (!results || results.length === 0) {
            console.log('📭 No emails found for today');
            this.imap.end();
            resolve([]);
            return;
          }

          console.log(`📧 Found ${results.length} email(s) for today`);

          // ✅ Fetch email headers and bodies
          const fetch = this.imap.fetch(results, {
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
                stream.once('end', () => {
                  // Body stream ended
                });
              });

            msg.once('end', async () => {
              try {
                const parsed = await simpleParser(buffer);
                
                // ✅ Only process emails received today (double-check date)
                // Use the email's date as received by the server
                const emailDate = new Date(parsed.date || parsed.headers.get('date'));
                
                // Get today's date (local timezone) for comparison
                const now = new Date();
                const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const emailDateLocal = new Date(emailDate.getFullYear(), emailDate.getMonth(), emailDate.getDate());
                
                // ✅ Include emails from today (compare dates, ignore time)
                // Filter to only keep emails from today (we fetched from yesterday, but only want today's)
                const isToday = emailDateLocal.getTime() === todayLocal.getTime();
                
                if (isToday) {
                  // ✅ Removed verbose log - deduplication happens in processIncomingEmail
                  // Extract name and email from mailparser's parsed.from structure
                  const fromValue = parsed.from?.value?.[0];
                  const fromName = fromValue?.name || null;
                  const fromEmail = fromValue?.address || parsed.from?.text || 'Unknown';
                  
                  emails.push({
                    messageId: parsed.messageId || `email-${Date.now()}-${seqno}`,
                    from: parsed.from?.text || fromEmail,
                    fromEmail: fromEmail,
                    fromName: fromName, // Pass name separately for proper extraction
                    to: parsed.to?.value?.map(a => a.address) || [parsed.to?.text] || [],
                    cc: parsed.cc?.value?.map(a => a.address) || [],
                    bcc: parsed.bcc?.value?.map(a => a.address) || [],
                    subject: parsed.subject || 'No Subject',
                    text: parsed.text || '',
                    html: parsed.html || '',
                    date: emailDate.toISOString(),
                    dateLocal: emailDateLocal.toISOString(),
                    attachments: parsed.attachments || [],
                    headers: {
                      'message-id': parsed.messageId,
                      'in-reply-to': parsed.inReplyTo || parsed.headers.get('in-reply-to'),
                      'references': parsed.references || parsed.headers.get('references'),
                      'auto-submitted': parsed.headers.get('auto-submitted') || '',
                      'precedence': parsed.headers.get('precedence') || '',
                      'content-type': parsed.headers.get('content-type')?.value || parsed.headers.get('content-type') || '',
                      'x-auto-response-suppress': parsed.headers.get('x-auto-response-suppress') || '',
                    },
                    raw: parsed,
                  });
                }

                processed++;
                if (processed === results.length) {
                  this.imap.end();
                  console.log(`✅ Fetched ${emails.length} email(s) from today`);
                  resolve(emails);
                }
              } catch (parseError) {
                console.error('❌ Failed to parse email:', parseError.message);
                processed++;
                if (processed === results.length) {
                  this.imap.end();
                  resolve(emails);
                }
              }
            });

            msg.once('error', (err) => {
              console.error('❌ Error processing email message:', err.message);
              processed++;
              if (processed === results.length) {
                this.imap.end();
                resolve(emails);
              }
            });
          });

          fetch.once('error', (err) => {
            console.error('❌ IMAP fetch error:', err.message);
            this.imap.end();
            reject(err);
          });
        });
      });
    } catch (error) {
      if (this.imap) {
        this.imap.end();
      }
      throw error;
    }
  }

  /**
   * Close IMAP connection
   */
  async close() {
    if (this.imap) {
      this.imap.end();
      this.imap = null;
    }
  }
}

export default IMAPEmailFetcher;

