// src/services/email/IMAPEmailService.js
import IMAPEmailFetcher from '../channel/imap/IMAPEmailFetcher.js';
import { getTenantDB } from '../../config/database.js';
import ConversationSchema from '../../models/schemas/Conversation.js';
import ContactSchema from '../../models/schemas/Contact.js';
import MessageSchema from '../../models/schemas/Message.js';
import CompanyAccountSchema from '../../models/schemas/CompanyAccount.js';
import DepartmentSchema from '../../models/schemas/Department.js';
import UserSchema from '../../models/schemas/User.js';
import SocketEmitter from '../socket/SocketEmitter.js';
import MessageLogService from '../message/MessageLogService.js';
import BotService from '../bot/BotService.js';
import TestingPersonaSchema from '../../models/schemas/TestingPersona.js';

/**
 * IMAP Email Service - Fetches today's emails and creates conversations/messages
 */
export class IMAPEmailService {
  /**
   * Process a single incoming email (from IDLE or fetch)
   */
  static async processIncomingEmail(emailData, tenantId, channelAccountId) {
    try {
      const tenantDB = await getTenantDB(tenantId);
      
      // Load models
      const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
      const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
      const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
      const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

      // ✅ Fetch bot settings for unread count logic
      const botSettings = await BotService.getCompanyBotSettings(tenantId);

      // Get email account
      const account = await CompanyAccount.findById(channelAccountId);
      if (!account || account.type !== 'email' || !account.isActive) {
        console.warn('⚠️ Email account not found or inactive:', channelAccountId);
        return { created: false };
      }

      // ✅ Find or create contact
      // Extract email address - prioritize fromEmail, then try to extract from emailData.from
      let fromEmail = emailData.fromEmail || emailData.from;
      if (!fromEmail) {
        console.warn('⚠️ Email has no sender address, skipping');
        return { created: false };
      }

      // Extract name from emailData if available (from mailparser's parsed.from.value[0].name)
      let fromName = emailData.fromName || null;
      
      // Store original from string for parsing if needed
      const originalFrom = emailData.from || fromEmail;
      
      // If fromEmail or originalFrom contains the full format like "Name" <email@domain.com> or Name <email@domain.com>
      // Extract the email and name properly
      if (originalFrom.includes('<') && originalFrom.includes('>')) {
        // Extract email from angle brackets
        const emailMatch = originalFrom.match(/<([^>]+)>/);
        if (emailMatch && emailMatch[1]) {
          fromEmail = emailMatch[1].trim();
        }
        
        // Extract name if not already set
        if (!fromName) {
          // Try extracting name before the angle bracket
          const beforeBracket = originalFrom.split('<')[0].trim();
          if (beforeBracket && !beforeBracket.includes('@')) {
            // Remove quotes if present
            fromName = beforeBracket.replace(/^["']+|["']+$/g, '').trim();
          }
        }
      }
      
      // Clean up email - remove any remaining angle brackets, quotes, or whitespace
      fromEmail = fromEmail.replace(/[<>"']/g, '').trim();

      // Clean up name - remove quotes and extra whitespace
      if (fromName) {
        fromName = fromName.replace(/^["']+|["']+$/g, '').trim();
      }

      // ✅ Detect and skip bounce/system emails (MAILER-DAEMON, postmaster, noreply, etc.)
      // These are automated delivery failure notifications, not real customer messages
      if (IMAPEmailService.isBounceOrSystemEmail(fromEmail, fromName, emailData)) {
        // Before skipping, mark any OWM messages to bounced recipients as failed
        try {
          await IMAPEmailService.handleEmailBounceForOWM(
            tenantDB, tenantId, emailData.subject || '', emailData.text || emailData.textContent || '', emailData.to
          );
        } catch (bounceErr) {
          console.error('[IMAPEmailService] Error handling email bounce for OWM:', bounceErr.message);
        }
        console.log(`[IMAPEmailService] Skipping bounce/system email from: ${fromEmail} (${fromName || 'no name'}), subject: "${emailData.subject || 'N/A'}"`);
        return { created: false, reason: 'bounce_or_system_email' };
      }

      // If name is empty or just whitespace, extract from email or use Unknown
      if (!fromName || fromName.length === 0) {
        // Try to extract name from email address (part before @)
        const emailParts = fromEmail.split('@');
        if (emailParts[0]) {
          fromName = emailParts[0].replace(/[._-]/g, ' ').trim();
          // Capitalize first letter of each word
          fromName = fromName.split(' ').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          ).join(' ');
        } else {
          fromName = 'Unknown';
        }
      }

      // Normalize email
      const normalizedEmail = fromEmail.toLowerCase().trim();

      // ✅ Find existing contact by multiple criteria to prevent duplicates
      // Check: email (normalized), email (original), identifiers.email
      let contact = await Contact.findOne({
        $or: [
          { email: normalizedEmail },
          { email: fromEmail }, // Original format
          { 'identifiers.email': normalizedEmail },
          { 'identifiers.email': fromEmail },
        ]
      }).lean();

      let contactWasJustCreated = false;

      if (!contact) {
        // ✅ Create new contact - use provided name or email as fallback
        const contactName = fromName || normalizedEmail;
        contact = await Contact.create({
          name: contactName,
          displayName: contactName,
          email: normalizedEmail,
          identifiers: {
            email: normalizedEmail
          },
          tenantId,
          Contact_Type: 'Customer',
          createdAt: new Date(),
        });
        contactWasJustCreated = true;
        console.log('✅ Created new contact:', contact.name, normalizedEmail);

        // ✅ FIX #2: Generate WebChat link BEFORE socket emission, awaited properly
        // This ensures the link is ready when the conversation appears in UI
        try {
          const savedContact = await Contact.findById(contact._id).lean();
          if (savedContact) {
            const { generateWebChatLinkForContact } = await import('../contact/ContactService.js');
            await generateWebChatLinkForContact(savedContact, tenantDB);
          }
        } catch (webchatError) {
          console.error('⚠️ Failed to create WebChat link for contact:', webchatError.message);
          // Don't throw - webchat link creation is optional, continue with flow
        }
      } else {
        // ✅ Update existing contact if needed
        const updates = {};
        
        // Update email if not set or different
        if (!contact.email || contact.email !== normalizedEmail) {
          updates.email = normalizedEmail;
        }
        
        // Update identifiers if not set
        if (!contact.identifiers || !contact.identifiers.email) {
          updates['identifiers.email'] = normalizedEmail;
        }
        
        // ✅ Only set name if contact has NO meaningful name yet (never overwrite existing names)
        const hasNoName = !contact.name || contact.name === 'Unknown' || contact.name === normalizedEmail || contact.name === fromEmail;
        if (fromName && fromName !== 'Unknown' && hasNoName) {
          updates.name = fromName;
        }
        
        if (Object.keys(updates).length > 0) {
          await Contact.findByIdAndUpdate(contact._id, { $set: updates });
          console.log(`✅ Updated existing contact ${contact._id} with missing fields`);
        } else {
          console.log(`✅ Found existing contact: ${contact._id}`);
        }
      }

      // ✅ Get default department FIRST (needed for conversation matching)
      let departmentId = account.departmentId;
      if (!departmentId && tenantDB.models.Department) {
        const Department = tenantDB.models.Department;
        const defaultDept = await Department.findOne({ isDefault: true }).lean();
        departmentId = defaultDept?._id;
      }

      // ✅ Check if conversation exists for this contact + channel + department
      // First, check if there's a primary merged conversation that includes email
      let conversation = null;
      const { findPrimaryMergedConversation } = await import('../conversation/MergeService.js');
      const primaryMergedConv = await findPrimaryMergedConversation(tenantId, contact._id, 'email');
      
      if (primaryMergedConv) {
        // ✅ For merged conversations, check if department matches
        const mergedConv = await Conversation.findById(primaryMergedConv._id).lean();
        if (mergedConv && mergedConv.department?.toString() === departmentId?.toString()) {
          console.log(`🔀 Found primary merged conversation that includes email:`, primaryMergedConv._id);
          conversation = mergedConv;
        }
      } else {
        // ✅ Look for existing conversation with same contact, channel, AND department
        conversation = await Conversation.findOne({
          contact: contact._id,
          channel: 'email',
          department: departmentId, // ✅ CRITICAL: Must match department for segregation
          primaryConversation: null, // Not already merged into another
          status: { $in: ['active', 'open', 'pending'] }
        }).sort({ lastMessageAt: -1 }).lean();
      }

      // Check if this exact email already exists for this contact (prevent duplicate processing).
      // Uses contact ID so that different contacts with the same Message-ID are NOT deduplicated.
      const messageId = emailData.messageId || emailData.headers?.['message-id'];

      if (messageId && contact?._id) {
        const existingMessage = await Message.findOne({
          'emailData.messageId': messageId,
          channel: 'email',
          channelAccount: channelAccountId,
          contact: contact._id,
        }).lean();

        if (existingMessage) {
          return { created: false, existing: true, wasRead: existingMessage.status === 'read' || !!existingMessage.readAt };
        }
      }

      // ✅ Track if this is a new conversation BEFORE creating message
      let isNewConversation = false;

      // ✅ Get or create conversation - MUST match by contact + channel + department
      // Each department gets its own separate conversation for complete segregation
      if (!conversation) {
        // ✅ Determine conversation mode based on department's AI bot enabled status
        const { getConversationModeForDepartment } = await import('../conversation/ConversationModeHelper.js');
        const conversationMode = await getConversationModeForDepartment({
          departmentId,
          tenantDB
        });
        
        conversation = await Conversation.create({
          contact: contact._id,
          channel: 'email',
          channelAccount: channelAccountId,
          department: departmentId, // Single department per conversation
          status: 'active',
          mode: conversationMode, // ✅ Set mode based on department AI bot enabled status
          messageCount: 0,
          unreadCount: 0, // Will be set based on AI bot settings below
          tenantId,
          createdAt: new Date(emailData.date || new Date()),
          lastMessageAt: new Date(emailData.date || new Date()),
        });
        console.log('✅ Created new email conversation:', conversation._id, 'for department:', departmentId);
        
        // ✅ Auto-merge check: If new conversation, check if we should auto-merge with existing conversation
        // This merges conversations with the same contact but different channels
        if (!contact.autoMergeDisabled) {
          try {
            const { findMergeableConversation, autoMergeConversation, canMergeContacts, mergeContacts } = await import('../conversation/MergeService.js');
            const mergeableConv = await findMergeableConversation(tenantId, conversation, contact);
            
            if (mergeableConv) {
              console.log('🔀 Auto-merging email conversation:', {
                newConversationId: conversation._id,
                primaryConversationId: mergeableConv._id,
                contact: contact._id,
                newChannel: 'email',
                existingChannel: mergeableConv.channel
              });

              // Merge contacts if they're different
              let mergedContact = contact;
              if (mergeableConv.contact.toString() !== contact._id.toString()) {
                const mergeableContact = await Contact.findById(mergeableConv.contact);
                if (mergeableContact) {
                  const canMerge = canMergeContacts(contact, mergeableContact);
                  
                  if (canMerge.canMerge) {
                    // Determine which contact to keep (the one from primary conversation)
                    if (mergeableConv.createdAt < conversation.createdAt) {
                      // Primary is older, merge new contact into primary's contact
                      mergedContact = await mergeContacts(tenantId, mergeableConv.contact, contact._id);
                      contact = mergedContact;
                    } else {
                      // New conversation is older, merge primary's contact into new
                      mergedContact = await mergeContacts(tenantId, contact._id, mergeableConv.contact);
                      contact = mergedContact;
                    }
                  }
                }
              }

              // Perform auto-merge
              const mergeResult = await autoMergeConversation(
                tenantId,
                conversation._id,
                mergeableConv._id,
                'system' // System user for auto-merge
              );

              // ✅ Check if merge failed due to mode mismatch or other reasons
              if (!mergeResult.success) {
                console.log('⚠️ Auto-merge skipped for email conversation:', mergeResult.error);
                // Continue with normal flow - don't merge but don't fail
              } else {
                // Update conversation to use merged contact if changed
                if (mergedContact._id.toString() !== contact._id.toString()) {
                  await Conversation.findByIdAndUpdate(conversation._id, {
                    contact: mergedContact._id
                  });
                  contact = mergedContact;
                }

                // Use primary conversation for message creation
                conversation = await Conversation.findById(mergeableConv._id);
                console.log('✅ Auto-merge completed for email, using primary conversation:', conversation._id);
                // ✅ CRITICAL: Primary already exists in the conversation list
                // Emit conversation:update instead of conversation:new
                isNewConversation = false;
              }
            }
          } catch (mergeError) {
            console.error('❌ Auto-merge failed in email service, continuing with new conversation:', mergeError);
            // Continue with new conversation if merge fails
          }
        }

        // ✅ Set unread count based on AI bot settings
        // Use conversation.mode directly (already set from conversationMode variable above)
        const isAutoMode = conversation.mode === 'auto';
        const shouldIncrementUnread = !(botSettings.enabled && isAutoMode);
        if (shouldIncrementUnread) {
          conversation.unreadCount = 1;
          await conversation.save();
        }

        // ✅ Mark as new conversation for later emission (only if NOT already merged into existing)
        if (isNewConversation !== false) {
          isNewConversation = true;
        }
      } else {
        // ✅ Check if AI bot is enabled and conversation is in auto mode
        // If so, don't increment unread count
        const conversationMode = conversation.mode || 'auto';
        const isAutoMode = conversationMode === 'auto';
        const shouldIncrementUnread = !(botSettings.enabled && isAutoMode);
        
        // ✅ Only increment unreadCount and messageCount for NEW messages (message doesn't exist)
        // Update conversation only if this is a truly new message
        const updatedConversation = await Conversation.findByIdAndUpdate(
          conversation._id,
          {
            $inc: { 
              messageCount: 1,
              ...(shouldIncrementUnread && { unreadCount: 1 }) // ✅ Only increment unread count if AI bot disabled or manual mode
            },
            lastMessageAt: new Date(emailData.date || new Date()),
          },
          { new: true } // Return updated document
        ).select('mode').lean();
        
        // ✅ Schedule conversation mode check if conversation is in manual mode
        // This will check after 2 minutes if there are no new messages and switch to auto mode
        if (updatedConversation?.mode === 'manual') {
          try {
            const { scheduleConversationModeCheck } = await import('../conversation/ConversationModeScheduler.js');
            await scheduleConversationModeCheck(conversation._id, tenantId);
            console.log(`📅 Scheduled conversation mode check for ${conversation._id} (manual mode, email received)`);
          } catch (error) {
            console.error('❌ Failed to schedule conversation mode check:', error);
            // Don't throw - this is a non-critical operation
          }
        }
        
        // Update conversation object with new unreadCount
        conversation = updatedConversation || conversation;
      }

      // ✅ Create message
      const messageContent = emailData.text || emailData.html || emailData.subject || '';
      const lastMessagePreview = emailData.subject ? `📧 ${emailData.subject}` : '📧 Email';

      // ✅ FIX #15: Sanitize HTML content to prevent XSS
      // Remove script tags, event handlers, and dangerous elements
      let sanitizedHtml = emailData.html || '';
      if (sanitizedHtml) {
        sanitizedHtml = sanitizedHtml
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
          .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
          .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
          .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '') // Remove event handlers
          .replace(/\son\w+\s*=\s*[^\s>]*/gi, '') // Remove unquoted event handlers
          .replace(/javascript\s*:/gi, 'blocked:') // Block javascript: URLs
          .replace(/data\s*:\s*text\/html/gi, 'blocked:text/html'); // Block data:text/html
      }
      
      // ✅ CRITICAL: Process email attachments and upload to storage
      // Email attachments from mailparser have: filename, contentType, contentId, content (buffer), size
      const emailAttachments = emailData.attachments || [];
      const processedAttachments = [];
      
      // ✅ Upload attachments to S3 storage for proper URLs
      if (emailAttachments.length > 0) {
        try {
          const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
          const { v4: uuidv4 } = await import('uuid');
          
          const s3Client = new S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
          });
          
          const BUCKET_NAME = process.env.AWS_BUCKET_NAME || process.env.AWS_S3_BUCKET;
          
          for (const att of emailAttachments) {
            try {
              if (!att.content || att.content.length === 0) {
                console.warn(`⚠️ Attachment ${att.filename || att.contentId} has no content, skipping`);
                continue;
              }
              
              // ✅ Determine attachment type
              const attachmentType = att.contentType?.startsWith('image/') ? 'image' :
                    att.contentType?.startsWith('video/') ? 'video' :
                    att.contentType?.startsWith('audio/') ? 'audio' :
                    'document';
              
              // ✅ Generate filename and S3 key
              const fileExtension = att.filename?.split('.').pop() || 
                    (att.contentType?.includes('jpeg') ? 'jpg' :
                     att.contentType?.includes('png') ? 'png' :
                     att.contentType?.includes('gif') ? 'gif' :
                     att.contentType?.includes('pdf') ? 'pdf' :
                     'bin');
              const filename = att.filename || `${uuidv4()}.${fileExtension}`;
              const key = `email-attachments/${tenantId}/${uuidv4()}.${fileExtension}`;
              
              // ✅ Convert content to buffer if it's not already
              const buffer = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content);
              
              // ✅ Upload to S3
              const uploadCommand = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key,
                Body: buffer,
                ContentType: att.contentType || 'application/octet-stream',
                ACL: 'public-read',
              });
              
              await s3Client.send(uploadCommand);
              
              // ✅ Generate public URL
              const region = process.env.AWS_REGION || 'us-east-1';
              const url = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;
              
              const attachmentData = {
                type: attachmentType,
                name: att.filename || filename,
                size: att.size || buffer.length,
                mimeType: att.contentType || 'application/octet-stream',
                contentId: att.contentId || null,
                url: url // ✅ Real S3 URL for inline display
              };
              
              processedAttachments.push(attachmentData);
              console.log(`✅ Uploaded email attachment to S3: ${filename} -> ${url}`);
            } catch (attError) {
              console.error('❌ Error uploading email attachment:', attError.message);
              // ✅ FIX #3: Store base64 data URL as fallback instead of broken cid: links
              // This ensures attachments are still accessible even if S3 upload fails
              const attachmentType = att.contentType?.startsWith('image/') ? 'image' :
                    att.contentType?.startsWith('video/') ? 'video' :
                    att.contentType?.startsWith('audio/') ? 'audio' :
                    'document';
              const mimeType = att.contentType || 'application/octet-stream';
              let fallbackUrl = null;

              // For small attachments (<2MB), store as base64 data URL
              if (att.content && att.content.length < 2 * 1024 * 1024) {
                const base64 = Buffer.isBuffer(att.content) ? att.content.toString('base64') : Buffer.from(att.content).toString('base64');
                fallbackUrl = `data:${mimeType};base64,${base64}`;
              }

              processedAttachments.push({
                type: attachmentType,
                name: att.filename || att.contentId || 'attachment',
                size: att.size || (att.content?.length || 0),
                mimeType: mimeType,
                contentId: att.contentId || null,
                url: fallbackUrl, // ✅ Null or data URL - never a broken cid: link
                uploadFailed: true,
              });
            }
          }
        } catch (s3Error) {
          console.error('❌ Error initializing S3 client for email attachments:', s3Error.message);
          // ✅ FIX #3: Store as base64 data URLs when S3 is unavailable
          emailAttachments.forEach(att => {
            if (!att.content || att.content.length === 0) return;
            const mimeType = att.contentType || 'application/octet-stream';
            let fallbackUrl = null;
            // For small attachments (<2MB), store as base64 data URL
            if (att.content && att.content.length < 2 * 1024 * 1024) {
              const base64 = Buffer.isBuffer(att.content) ? att.content.toString('base64') : Buffer.from(att.content).toString('base64');
              fallbackUrl = `data:${mimeType};base64,${base64}`;
            }
            processedAttachments.push({
              type: att.contentType?.startsWith('image/') ? 'image' :
                    att.contentType?.startsWith('video/') ? 'video' :
                    att.contentType?.startsWith('audio/') ? 'audio' :
                    'document',
              name: att.filename || att.contentId || 'attachment',
              size: att.size || (att.content?.length || 0),
              mimeType: mimeType,
              contentId: att.contentId || null,
              url: fallbackUrl,
              uploadFailed: true,
            });
          });
        }
      }

      const message = await Message.create({
        conversation: conversation._id,
        contact: contact._id,
        channel: 'email',
        channelAccount: channelAccountId,
        departmentId: departmentId,
        sender: null,
        type: processedAttachments.length > 0 ? (processedAttachments[0].type || 'document') : 'text',
        content: messageContent,
        attachments: processedAttachments.length > 0 ? processedAttachments : undefined,
        emailData: {
          subject: emailData.subject || 'No Subject',
          from: emailData.fromEmail || emailData.from,
          to: emailData.to || [],
          cc: emailData.cc || [],
          bcc: emailData.bcc || [],
          html: sanitizedHtml || undefined, // ✅ FIX #15: Store sanitized HTML
          messageId: emailData.messageId || emailData.headers?.['message-id'],
          // ✅ FIX #13: Store threading headers for proper email thread reconstruction
          inReplyTo: emailData.headers?.['in-reply-to'] || null,
          references: (() => {
            // ✅ Properly parse references header - it can be a string, array, or undefined
            const refsHeader = emailData.headers?.['references'];
            if (!refsHeader) return [];
            
            // If it's already an array, use it
            if (Array.isArray(refsHeader)) {
              return refsHeader.filter(Boolean);
            }
            
            // If it's a string, parse it
            if (typeof refsHeader === 'string') {
              // Remove any extra whitespace and split by spaces or newlines
              // Email References headers are typically space-separated
              const cleaned = refsHeader.trim().replace(/\s+/g, ' ');
              // Split by space, but keep message IDs together (they're typically in angle brackets)
              const refs = cleaned.split(/\s+/).filter(ref => ref.trim().length > 0);
              return refs.map(ref => ref.trim()).filter(Boolean);
            }
            
            // Fallback: try to parse as JSON if it looks like JSON
            try {
              const parsed = JSON.parse(refsHeader);
              if (Array.isArray(parsed)) {
                // Handle nested arrays
                return parsed.flat().filter(Boolean);
              }
            } catch {
              // Not JSON, treat as single value
            }
            
            // Default: return empty array if we can't parse
            return [];
          })(),
        },
        metadata: {
          receivedVia: 'imap_idle',
          fetchedAt: new Date().toISOString(),
          headers: emailData.headers || {},
        },
        direction: 'inbound',
        status: 'delivered',
        replyTo: null,
        createdAt: new Date(emailData.date || new Date()),
      });

      // ✅ Log incoming email message
      try {
        await MessageLogService.logMessageCreated(tenantId, message, {
          channelType: 'email',
          channelAccountId: channelAccountId.toString(),
          receivedVia: 'imap_idle',
          providerMessageId: emailData.messageId || emailData.headers?.['message-id'],
          hasAttachments: processedAttachments.length > 0,
          attachmentCount: processedAttachments.length,
        });
      } catch (logError) {
        console.error('⚠️ Failed to log incoming email message:', logError);
      }

      // ✅ isNewConversation is already set above
      
      // ✅ Update conversation last message
      // NOTE: 
      // - For NEW conversations: unreadCount=1 (set at creation), messageCount=0 (needs increment)
      // - For EXISTING conversations: both unreadCount and messageCount already incremented above
      // So we only need to increment messageCount for new conversations, and never increment unreadCount here
      await Conversation.findByIdAndUpdate(conversation._id, {
        lastMessage: message._id,
        lastMessageAt: new Date(emailData.date || new Date()),
        lastMessageContent: lastMessagePreview,
        lastMessageType: 'text',
        lastMessageDirection: 'inbound',
        // ✅ Only increment messageCount for new conversations (starts at 0, needs to be 1)
        // For existing conversations, messageCount was already incremented above at line 168
        ...(isNewConversation ? { $inc: { messageCount: 1 } } : {}),
        // ✅ DO NOT increment unreadCount here - it's already set/incremented above
      });

      // ✅ Ensure Department and User models are registered for population
      const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
      const User = tenantDB.models.User || tenantDB.model('User', UserSchema);
      
      // ✅ Fetch updated conversation with all populated fields (matching API response structure)
      const updatedConversation = await Conversation.findById(conversation._id)
        .populate('contact', 'name displayName phone email avatar identifiers')
        .populate('channelAccount', 'type name')
        .populate('department', 'name')
        .populate('assignedTo', 'firstName lastName email')
        .lean();

      // ✅ FIX #16: Get unread count from conversation document instead of recounting
      // This avoids race condition where another message arrives between save and recount
      const refreshedConversation = await Conversation.findById(conversation._id).select('unreadCount messageCount').lean();
      const actualUnreadCount = refreshedConversation?.unreadCount || 1;

      // ✅ FIX #2: Wrap ALL socket emissions in try/catch to guarantee they execute
      // Even if unread count or other non-critical operations fail, real-time updates must work
      try {

      // ✅ Emit new conversation event if this is the first message
      if (isNewConversation) {
        console.log(`📢 Emitting new conversation event (email): ${conversation._id}`);
        
        // ✅ Format conversation object to match API response structure
        const contactData = updatedConversation.contact ? {
          _id: updatedConversation.contact._id,
          name: updatedConversation.contact.name,
          displayName: updatedConversation.contact.displayName,
          phone: updatedConversation.contact.phone,
          email: updatedConversation.contact.email,
          avatar: updatedConversation.contact.avatar,
          identifiers: updatedConversation.contact.identifiers,
        } : null;
        
        // ✅ Ensure dates are ISO strings for proper serialization
        const lastMessageAtDate = emailData.date ? new Date(emailData.date) : new Date();
        const createdAtDate = updatedConversation.createdAt ? new Date(updatedConversation.createdAt) : new Date();
        const updatedAtDate = updatedConversation.updatedAt ? new Date(updatedConversation.updatedAt) : new Date();
        const messageCreatedAtDate = message.createdAt ? new Date(message.createdAt) : new Date();
        
        const conversationData = {
          _id: updatedConversation._id,
          contact: contactData,
          // ✅ CRITICAL: Include contactData field (used by ConversationList component)
          contactData: contactData,
          channelAccount: updatedConversation.channelAccount ? {
            _id: updatedConversation.channelAccount._id,
            type: updatedConversation.channelAccount.type,
            name: updatedConversation.channelAccount.name,
          } : null,
          channel: 'email',
          department: updatedConversation.department ? {
            _id: updatedConversation.department._id,
            name: updatedConversation.department.name,
          } : null,
          assignedTo: updatedConversation.assignedTo || null,
          status: 'active',
          lastMessage: message._id,
          lastMessageAt: lastMessageAtDate.toISOString(), // ✅ Convert to ISO string
          lastMessageContent: lastMessagePreview,
          lastMessageType: 'text',
          lastMessageDirection: 'inbound',
          messageCount: 1,
          unreadCount: actualUnreadCount,
          createdAt: createdAtDate.toISOString(), // ✅ Convert to ISO string
          updatedAt: updatedAtDate.toISOString(), // ✅ Convert to ISO string
          isPinned: false,
          isMerged: false,
          mode: updatedConversation.mode || 'auto', // ✅ Default to 'auto' (Hybrid mode)
          priority: updatedConversation.priority || 'normal',
        };
        
        console.log(`📢 Email conversation data prepared for socket emission:`, {
          conversationId: conversationData._id,
          hasContactData: !!conversationData.contactData,
          contactName: conversationData.contactData?.name || 'N/A',
          lastMessageAt: conversationData.lastMessageAt,
          status: conversationData.status
        });
        
        await SocketEmitter.emitNewConversation(tenantId, conversationData, {
          _id: message._id,
          content: messageContent,
          type: message.type || 'text',
          direction: 'inbound',
          status: 'delivered',
          createdAt: messageCreatedAtDate.toISOString(), // ✅ Convert to ISO string
        }, {
          _id: contact._id,
          name: contact.name,
          displayName: contact.displayName,
          phone: contact.phone,
          email: contact.email,
          avatar: contact.avatar,
          identifiers: contact.identifiers,
        });
        
        console.log(`✅ Email conversation:new event emitted for conversation ${conversation._id}`);
      } else {
        // ✅ Emit conversation update (last message, unread count) for existing conversations
        const emailUpdatePayload = {
          lastMessage: message._id,
          lastMessageAt: new Date(emailData.date || new Date()),
          lastMessageContent: lastMessagePreview,
          lastMessageType: 'text',
          lastMessageDirection: 'inbound',
          unreadCount: actualUnreadCount,
          messageCount: (updatedConversation?.messageCount || 0) + 1,
        };

        // ✅ Include merge-related fields if the conversation is merged
        if (updatedConversation?.isMerged) {
          emailUpdatePayload.isMerged = true;
          emailUpdatePayload.mergedConversations = updatedConversation.mergedConversations || [];
        }

        // ✅ Include contact data if available (may have changed during merge)
        if (updatedConversation?.contact) {
          emailUpdatePayload.contactData = {
            _id: updatedConversation.contact._id,
            name: updatedConversation.contact.name,
            displayName: updatedConversation.contact.displayName,
            phone: updatedConversation.contact.phone,
            email: updatedConversation.contact.email,
            avatar: updatedConversation.contact.avatar,
            identifiers: updatedConversation.contact.identifiers,
          };
        }

        await SocketEmitter.emitConversationUpdate(conversation._id, emailUpdatePayload, tenantId, departmentId, null);
      }

      // ✅ Emit socket events for real-time updates using emitNewMessage
      // Convert message to plain object for socket emission
      const messageObj = message.toObject ? message.toObject() : message;
      
      // ✅ Use emitNewMessage for proper department-based segregation
      await SocketEmitter.emitNewMessage(conversation._id.toString(), {
        _id: messageObj._id || message._id,
        conversationId: conversation._id,
        contactId: contact._id,
        contact: {
          _id: contact._id,
          name: contact.name,
          email: contact.email,
        },
        channel: 'email', // ✅ Always include channel field for email messages
        channelAccount: {
          _id: channelAccountId,
          type: 'email', // ✅ Always include channelAccount.type for proper detection
        },
        emailData: messageObj.emailData || message.emailData, // ✅ Include emailData for email messages
        type: messageObj.type || message.type || 'text', // ✅ Include message type (may be 'document' for attachments)
        content: messageContent,
        attachments: messageObj.attachments || message.attachments || [], // ✅ CRITICAL: Include attachments in socket event
        direction: 'inbound',
        status: 'delivered',
        createdAt: messageObj.createdAt || message.createdAt,
        updatedAt: messageObj.updatedAt || message.updatedAt,
      }, tenantId, departmentId);

      // ✅ Conversation update is already emitted above (only for existing conversations)

      } catch (socketError) {
        // ✅ FIX #2: Log socket emission errors but NEVER let them break message processing
        console.error('❌ Socket emission failed for email, message was still saved:', socketError.message);
      }

      // ── OWM Outcome Matching (before general bot) ──
      let owmHandledResponse = false;
      try {
        // Find ALL outbound messages — don't use .select() on metadata (Map type issues with .lean())
        const allOutbound = await Message.find({
          conversation: conversation._id,
          direction: 'outbound',
        }).lean();

        console.log(`[OWM-EMAIL] Conversation ${conversation._id}: ${allOutbound.length} outbound messages total`);

        const owmMsgs = allOutbound.filter(m => {
          if (m.sendingModule === 'owm') return true;
          // Check metadata for automationId — handle Map, plain object, and nested formats
          const meta = m.metadata;
          if (!meta) return false;
          if (meta instanceof Map) return meta.has('automationId');
          if (typeof meta === 'object') return !!meta.automationId;
          return false;
        });

        console.log(`[OWM-EMAIL] OWM messages found: ${owmMsgs.length}${owmMsgs.length > 0 ? ` (sendingModules: ${owmMsgs.map(m => m.sendingModule || 'none').join(', ')})` : ''}`);

        if (owmMsgs.length > 0) {
          const OutcomeMatchingService = (await import('../automation/OutcomeMatchingService.js')).default;

          const automationIdSet = new Set();
          for (const m of owmMsgs) {
            const meta = m.metadata;
            let aid = null;
            if (meta instanceof Map) aid = meta.get('automationId');
            else if (meta && typeof meta === 'object') aid = meta.automationId;
            if (aid) automationIdSet.add(aid.toString());
          }

          console.log(`[OWM-EMAIL] Automation IDs: ${[...automationIdSet].join(', ') || 'none extracted'}`);

          for (const automationId of automationIdSet) {
            try {
              await OutcomeMatchingService.initializeOutcomes(
                tenantId, conversation._id.toString(),
                contact._id.toString(), automationId
              );
              const matchResult = await OutcomeMatchingService.analyzeAndMatch(
                tenantId, conversation._id.toString(),
                message._id.toString(), automationId
              );

              console.log(`[OWM-EMAIL] Match result for automation ${automationId}:`, matchResult ? {
                matched: matchResult.matched,
                outcome: matchResult.outcome?.outcomeName,
                followUpSent: matchResult.followUpSent,
              } : 'null (no match)');

              if (matchResult?.matched) {
                owmHandledResponse = true;
                break;
              }
            } catch (matchErr) {
              console.error(`[OWM-EMAIL] Matching error for automation ${automationId}:`, matchErr.message, matchErr.stack?.substring(0, 200));
            }
          }
        } else {
          console.log(`[OWM-EMAIL] No OWM messages in conversation ${conversation._id} — skipping OWM matching`);
          // Log first 3 outbound messages for debugging
          if (allOutbound.length > 0) {
            allOutbound.slice(0, 3).forEach((m, i) => {
              const meta = m.metadata;
              let metaType = 'none';
              if (meta instanceof Map) metaType = 'Map';
              else if (meta && typeof meta === 'object') metaType = `object(keys: ${Object.keys(meta).join(',')})`;
              console.log(`[OWM-EMAIL] Outbound msg ${i}: sendingModule=${m.sendingModule || 'undefined'}, metaType=${metaType}`);
            });
          }
        }
      } catch (owmErr) {
        console.error('[OWM-EMAIL] Error:', owmErr.message, owmErr.stack?.substring(0, 200));
      }

      // AI Bot Integration
      const hasValidContent = messageContent && typeof messageContent === 'string' && messageContent.trim().length > 0;
      const conversationMode = updatedConversation?.mode || 'auto';

      // Media/attachment detection — switch to manual if email has non-text attachments
      let mediaHandoff = false;
      const inboundAttachments = message.attachments || [];
      const hasMediaAttachments = inboundAttachments.some(att => {
        const type = (att.contentType || att.mimeType || '').toLowerCase();
        return type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/');
      });

      if (conversationMode === 'auto' && !owmHandledResponse && hasMediaAttachments) {
        try {
          const { executeHandoff } = await import('../bot/HumanHandoffService.js');
          const contactName = contact.name || contact.displayName || contact.email || 'Customer';
          await executeHandoff({ tenantDB, tenantId, conversationId: conversation._id.toString(), contactName });
          mediaHandoff = true;

          try {
            await BotService.sendBotResponse({
              tenantId, conversationId: conversation._id.toString(),
              contactId: contact._id.toString(), channelType: 'email',
              channelAccountId: channelAccountId?.toString(),
              botResponse: `${contactName !== 'Customer' ? contactName + ', ' : ''}I received your email with attachments. Let me connect you with a team member who can review them. A human agent will respond shortly.`,
              tenantDB, skipModeCheck: true,
            });
          } catch (sendErr) {
            console.error('[MediaHandoff-Email] Failed to send message:', sendErr.message);
          }
        } catch (mediaErr) {
          console.error('[MediaHandoff-Email] Error:', mediaErr.message);
        }
      }

      // Human handoff detection
      let handoffTriggered = false;
      if (hasValidContent && conversationMode === 'auto' && !owmHandledResponse && !mediaHandoff) {
        try {
          const { detectHumanHandoff, executeHandoff } = await import('../bot/HumanHandoffService.js');
          const botSettings = await BotService.getCompanyBotSettings(tenantId);
          const isHandoff = await detectHumanHandoff(messageContent, botSettings);
          if (isHandoff) {
            handoffTriggered = true;
            const contactName = contact.name || contact.displayName || contact.email || 'Customer';
            const { handoffMessage } = await executeHandoff({
              tenantDB, tenantId,
              conversationId: conversation._id.toString(),
              contactName,
            });
            if (handoffMessage) {
              try {
                await BotService.sendBotResponse({
                  tenantId, conversationId: conversation._id.toString(),
                  contactId: contact._id.toString(), channelType: 'email',
                  channelAccountId: channelAccountId?.toString(),
                  botResponse: handoffMessage, tenantDB, skipModeCheck: true,
                });
              } catch (sendErr) {
                console.error('[Handoff-Email] Failed to send handoff message:', sendErr.message);
              }
            }
          }
        } catch (handoffErr) {
          console.error('[Handoff-Email] Detection error:', handoffErr.message);
        }
      }

      const hasRecentBotResponse = await Message.exists({
        conversation: conversation._id,
        'metadata.isBotResponse': true,
        createdAt: { $gte: message.createdAt },
      });

      if (hasValidContent && conversationMode === 'auto' && !hasRecentBotResponse && !owmHandledResponse && !handoffTriggered && !mediaHandoff) {
        console.log('🤖 Email conversation is in auto mode, calling AI bot...', {
          conversationId: conversation._id.toString(),
          messageId: message._id.toString(),
          messageLength: messageContent.length,
        });

        // Call bot service asynchronously (don't block message processing)
        (async () => {
          try {
            // Get contact name for bot API
            const contactName = contact.name || contact.displayName || contact.email || 'User';
            
            // Prepare message for bot based on type
            let messageForBot = messageContent;
            if (message.type !== 'text') {
              // For non-text messages, provide context about the message type
              const typeDescriptions = {
                'image': 'User sent an email with an image attachment',
                'video': 'User sent an email with a video attachment',
                'audio': 'User sent an email with an audio attachment',
                'file': 'User sent an email with a file attachment',
                'document': 'User sent an email with a document attachment'
              };
              const typeDesc = typeDescriptions[message.type] || `User sent an email with a ${message.type} attachment`;
              messageForBot = `${typeDesc}${messageContent ? `. Email content: ${messageContent}` : ''}`;
            }
            
            // Call AI bot API
            const botResponse = await BotService.generateResponse({
              tenantId,
              conversationId: conversation._id.toString(),
              contactId: contact._id.toString(),
              message: messageForBot,
              platform: 'email',
              contactName,
              messageType: message.type,
              departmentId: conversation.department?.toString(),
              channelAccountId: channelAccountId?.toString() || null,
              contactType: contact.Contact_Type || null,
            });

            if (botResponse && botResponse.response) {
              console.log('✅ AI bot response received for email, sending as message...', {
                conversationId: conversation._id.toString(),
                responseLength: botResponse.response.length,
              });

              // ✅ Double-check: Verify no bot response was sent while we were waiting for API
              const doubleCheckBotMessages = await Message.find({
                conversation: conversation._id,
                'metadata.isBotResponse': true,
                createdAt: { $gte: new Date(Date.now() - 10000) } // Last 10 seconds
              }).select('_id createdAt').lean();
              
              if (doubleCheckBotMessages.length === 0) {
                // ✅ Get contact email and channel account for emailData
                const contactForBot = await Contact.findById(contact._id).select('email identifiers').lean();
                const channelAccountForBot = await CompanyAccount.findById(channelAccountId).select('identifier').lean();
                
                // ✅ Prepare emailData for bot response (reply to original email)
                // ✅ CRITICAL: Use contact email first, then fallback to emailData.fromEmail (sender's email from incoming message)
                const contactEmail = contactForBot?.email || contactForBot?.identifiers?.email || emailData.fromEmail;
                const fromEmail = channelAccountForBot?.identifier;
                const originalSubject = emailData.subject || 'Your inquiry';
                const replySubject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`;
                
                // ✅ Always create emailData if we have a contactEmail (from contact or fromEmail fallback)
                const emailDataForBot = contactEmail ? {
                  subject: replySubject,
                  to: [contactEmail],
                  from: fromEmail,
                  // ✅ Include inReplyTo and references for proper email threading
                  inReplyTo: emailData.messageId || emailData.headers?.['message-id'] || null,
                  references: (() => {
                    const refsHeader = emailData.headers?.['references'];
                    if (!refsHeader) {
                      const msgId = emailData.messageId || emailData.headers?.['message-id'];
                      return msgId ? [msgId] : [];
                    }
                    if (Array.isArray(refsHeader)) return refsHeader.filter(Boolean);
                    if (typeof refsHeader === 'string') {
                      const cleaned = refsHeader.trim().replace(/\s+/g, ' ');
                      return cleaned.split(/\s+/).filter(ref => ref.trim().length > 0).map(ref => ref.trim());
                    }
                    return [];
                  })(),
                } : null;
                
                // Send bot response as an outbound message
                await BotService.sendBotResponse({
                  tenantId,
                  conversationId: conversation._id.toString(),
                  contactId: contact._id.toString(),
                  channelType: 'email',
                  channelAccountId: channelAccountId.toString(),
                  botResponse: botResponse.response,
                  tenantDB, // Pass tenantDB for message creation
                  emailData: emailDataForBot, // ✅ Pass emailData for proper email formatting
                });

                console.log('✅ Bot response sent successfully for email');
              } else {
                console.log('⚠️ Email Bot response skipped - another bot response was sent while waiting for API');
              }
            } else {
              console.log('ℹ️ No bot response received for email (bot may be disabled or returned empty)');
            }
          } catch (botError) {
            // Log error but don't throw - bot failures shouldn't break message processing
            console.error('❌ Error processing bot response for email:', botError);
            console.error('❌ Bot error details:', botError.message, botError.stack);
          }
        })().catch(error => {
          console.error('❌ Unhandled error in bot processing for email:', error);
        });
      } else {
        if (hasRecentBotResponse) {
          console.log('ℹ️ Skipping bot call for email - bot already responded recently to this conversation');
        } else if (!hasValidContent) {
          console.log('ℹ️ Skipping bot call for email - message has no valid content');
        } else if (conversationMode !== 'auto') {
          console.log('ℹ️ Skipping bot call for email - conversation is in manual mode');
        }
      }

      console.log('✅ Processed email via IDLE:', emailData.subject, 'from', emailData.fromEmail);
      return { created: true, message, conversation };
    } catch (error) {
      console.error('❌ Error processing incoming email:', error.message);
      console.error('Email details:', {
        from: emailData.fromEmail,
        subject: emailData.subject,
        error: error.stack
      });
      return { created: false, error: error.message };
    }
  }

  /**
   * Fetch emails for a specific email account
   */
  static async fetchEmailsForAccount(tenantId, channelAccountId) {
    try {
      console.log('📧 Starting IMAP email fetch:', { tenantId, channelAccountId });

      const tenantDB = await getTenantDB(tenantId);
      
      // Load models
      const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
      const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
      const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
      const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

      // Get email account credentials (not lean - need methods)
      const account = await CompanyAccount.findById(channelAccountId);
      if (!account || account.type !== 'email' || !account.isActive) {
        console.warn('⚠️ Email account not found or inactive:', channelAccountId);
        return { fetched: 0, created: 0 };
      }

      // Decrypt credentials
      let credentials;
      if (account.getDecryptedCredentials) {
        credentials = account.getDecryptedCredentials();
      } else if (account.credentials && account.credentials.encrypted) {
        // Manual decryption if method doesn't exist
        try {
          const crypto = require('crypto');
          const algorithm = account.credentials.algorithm || 'aes-256-gcm';
          const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-32-char-encryption-key!!', 'utf8');
          const iv = Buffer.from(process.env.ENCRYPTION_IV || 'default-16chars!', 'utf8').slice(0, 16);
          
          const decipher = crypto.createDecipheriv(algorithm, key, iv);
          decipher.setAuthTag(Buffer.from(account.credentials.authTag, 'hex'));
          
          let decrypted = decipher.update(account.credentials.encrypted, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          credentials = JSON.parse(decrypted);
        } catch (decryptError) {
          console.error('❌ Failed to decrypt credentials:', decryptError.message);
          // Fallback to plain credentials if not encrypted
          credentials = account.credentials;
        }
      } else {
        credentials = account.credentials;
      }

      // ✅ Use IMAP credentials, or fallback to SMTP credentials if IMAP not configured
      const imapHost = credentials.imapHost || credentials.smtpHost;
      const imapPort = credentials.imapPort || credentials.smtpPort || 993;
      const imapUser = credentials.imapUser || credentials.smtpUser;
      const imapPass = credentials.imapPass || credentials.smtpPass;
      
      if (!imapHost || !imapUser || !imapPass) {
        console.error('❌ IMAP credentials missing for account:', account.name);
        console.error('Required: imapHost/imapUser/imapPass (or smtpHost/smtpUser/smtpPass as fallback)');
        console.error('Available credentials keys:', Object.keys(credentials || {}));
        return { fetched: 0, created: 0, error: 'IMAP credentials missing' };
      }

      // ✅ Create credentials object with resolved values
      const imapCredentials = {
        imapHost,
        imapPort: parseInt(imapPort),
        imapUser,
        imapPass,
        // Include SMTP credentials too for compatibility
        smtpHost: credentials.smtpHost,
        smtpPort: credentials.smtpPort,
        smtpUser: credentials.smtpUser,
        smtpPass: credentials.smtpPass,
        fromEmail: credentials.fromEmail || credentials.smtpUser,
      };

      // ✅ Fetch today's emails using resolved IMAP credentials
      const fetcher = new IMAPEmailFetcher(imapCredentials);
      const emails = await fetcher.fetchTodayEmails();
      await fetcher.close();

      // ✅ Only log if there are emails to process (reduces log noise)
      if (emails.length > 0) {
      console.log(`📧 Fetched ${emails.length} email(s) from today`);
      }

      let createdCount = 0;
      let skippedCount = 0;

      // ✅ Process each email
      for (const email of emails) {
        try {
          const result = await this.processIncomingEmail(email, tenantId, channelAccountId);
          if (result.created) {
            createdCount++;
          } else if (result.existing) {
            skippedCount++;
          }
        } catch (emailError) {
          console.error('❌ Error processing email:', emailError.message);
          console.error('Email details:', {
            from: email.fromEmail,
            subject: email.subject,
            error: emailError.stack
          });
          // Continue processing other emails
        }
      }

      // ✅ Only log if there was activity (reduces log noise)
      if (createdCount > 0 || skippedCount > 0) {
        console.log(`✅ IMAP email fetch complete: ${createdCount} new message(s) created, ${skippedCount} duplicate(s) skipped`);
      }
      return { fetched: emails.length, created: createdCount };
    } catch (error) {
      console.error('❌ IMAP email fetch error:', error.message);
      console.error('Stack:', error.stack);
      return { fetched: 0, created: 0, error: error.message };
    }
  }

  /**
   * Fetch emails for all active email accounts in a tenant
   */
  static async fetchEmailsForTenant(tenantId) {
    try {
      const tenantDB = await getTenantDB(tenantId);
      const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);

      // ✅ Get all active email accounts (with either IMAP or SMTP credentials)
      // Changed to fetch from ALL email accounts, not just those with imapHost
      const emailAccounts = await CompanyAccount.find({
        type: 'email',
        isActive: true,
        $or: [
          { 'credentials.imapHost': { $exists: true, $ne: null } },
          { 'credentials.smtpHost': { $exists: true, $ne: null } }
        ]
      }).lean();

      console.log(`📧 Found ${emailAccounts.length} active email account(s) for tenant ${tenantId}`);

      let totalFetched = 0;
      let totalCreated = 0;

      for (const account of emailAccounts) {
        try {
          const result = await this.fetchEmailsForAccount(tenantId, account._id);
          totalFetched += result.fetched || 0;
          totalCreated += result.created || 0;
        } catch (error) {
          console.error(`❌ Error fetching emails for account ${account.name}:`, error.message);
        }
      }

      console.log(`✅ Tenant email fetch complete: ${totalCreated} new message(s) from ${totalFetched} email(s)`);
      return { fetched: totalFetched, created: totalCreated };
    } catch (error) {
      console.error('❌ Tenant IMAP fetch error:', error.message);
      return { fetched: 0, created: 0, error: error.message };
    }
  }

  /**
   * Detect bounce notifications, delivery failure emails, and automated system emails.
   * These should not create conversations or trigger the AI bot.
   * @param {string} fromEmail - Sender email address (cleaned)
   * @param {string} fromName - Sender display name
   * @param {object} emailData - Full email data including subject, headers, content
   * @returns {boolean} true if this is a bounce/system email that should be skipped
   */
  static isBounceOrSystemEmail(fromEmail, fromName, emailData = {}) {
    const email = (fromEmail || '').toLowerCase().trim();
    const name = (fromName || '').toLowerCase().trim();
    const subject = (emailData.subject || '').toLowerCase();
    const textContent = (emailData.text || emailData.textContent || '').toLowerCase().substring(0, 2000);

    // 1. Check sender email address patterns
    const bounceEmailPrefixes = [
      'mailer-daemon@',
      'mailer_daemon@',
      'mailerdaemon@',
      'postmaster@',
      'mail-daemon@',
      'automail@',
      'auto-notify@',
    ];

    const bounceEmailPatterns = [
      /^mailer-daemon/,
      /^postmaster/,
      /^mail-daemon/,
      /^noreply@.*\.mail\.protection\.outlook\.com/,
      /^bounce[s]?[-+@]/,
      /^bounce@/,
      /^return[-_]?bounce/,
      /^prvs=.*=bounce/,
    ];

    for (const prefix of bounceEmailPrefixes) {
      if (email.startsWith(prefix)) return true;
    }

    for (const pattern of bounceEmailPatterns) {
      if (pattern.test(email)) return true;
    }

    // 2. Check sender display name
    const bounceNames = [
      'mailer-daemon',
      'mail delivery system',
      'mail delivery subsystem',
      'postmaster',
      'mail daemon',
      'automatic mail delivery system',
      'microsoft outlook',
      'mail administrator',
    ];

    for (const bounceName of bounceNames) {
      if (name === bounceName || name.includes(bounceName)) return true;
    }

    // 3. Check subject line for delivery failure indicators
    const bounceSubjectPatterns = [
      /^(undeliverable|undelivered)/,
      /^(mail delivery|delivery status|delivery failure|delivery notification)/,
      /^(returned mail|return(ed)? to sender)/,
      /^(failure notice|failed delivery)/,
      /^(non[- ]?deliver)/,
      /^(warning: message .* delayed)/,
      /^(auto[- ]?reply|automatic reply|out of office)/,
      /^(message not delivered)/,
      /^(delivery has failed)/,
      /^(delayed|rejected):/,
      /undeliverable:/,
      /delivery (status )?notification ?\(failure\)/,
      /message delivery failed/,
    ];

    for (const pattern of bounceSubjectPatterns) {
      if (pattern.test(subject)) return true;
    }

    // 4. Check email headers for bounce indicators
    const headers = emailData.headers || {};
    const autoSubmitted = (headers['auto-submitted'] || headers['Auto-Submitted'] || '').toLowerCase();
    if (autoSubmitted && autoSubmitted !== 'no') {
      return true;
    }

    const precedence = (headers['precedence'] || headers['Precedence'] || '').toLowerCase();
    if (['bulk', 'junk', 'auto_reply'].includes(precedence)) {
      return true;
    }

    const contentType = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
    if (contentType.includes('delivery-status') || contentType.includes('report-type=delivery-status')) {
      return true;
    }

    const xAutoResponseSuppress = (headers['x-auto-response-suppress'] || headers['X-Auto-Response-Suppress'] || '').toLowerCase();
    if (xAutoResponseSuppress && xAutoResponseSuppress !== 'none') {
      return true;
    }

    // 5. Check body content for common bounce patterns (first 2000 chars only)
    const bounceBodyIndicators = [
      'this is an automatically generated delivery status notification',
      'delivery to the following recipient failed',
      'delivery to the following recipients failed',
      'your message was not delivered',
      'the email account that you tried to reach does not exist',
      'message delivery has failed',
      'this message was created automatically by mail delivery software',
      'a message that you sent could not be delivered',
      'undeliverable message',
      'the following addresses had permanent fatal errors',
      'remote host said: 550',
      'remote host said: 553',
      'remote host said: 554',
    ];

    for (const indicator of bounceBodyIndicators) {
      if (textContent.includes(indicator)) return true;
    }

    return false;
  }

  /**
   * Handle bounce emails for all OWM messages (not just testing personas).
   * Extracts the failed recipient from the bounce content, finds the most recent
   * non-failed outbound OWM message to that recipient, marks it as 'failed',
   * and if it belongs to a testing persona, increments the persona's counter.
   */
  static async handleEmailBounceForOWM(tenantDB, tenantId, subject, textBody, toField) {
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const TestingPersona = tenantDB.models.TestingPersona || tenantDB.model('TestingPersona', TestingPersonaSchema);

    // Extract email addresses from bounce content
    const allText = `${subject || ''} ${textBody || ''} ${toField || ''}`;
    const emailRegex = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
    const foundEmails = [...new Set((allText.match(emailRegex) || []).map(e => e.toLowerCase()))];

    if (foundEmails.length === 0) return;

    // Filter out system addresses
    const systemPrefixes = ['mailer-daemon', 'postmaster', 'mail-daemon', 'noreply', 'no-reply'];
    const recipientEmails = foundEmails.filter(email => {
      const local = email.split('@')[0].toLowerCase();
      return !systemPrefixes.some(p => local.startsWith(p));
    });

    if (recipientEmails.length === 0) return;

    // Find the most recent non-failed OWM outbound messages to any of these emails
    for (const email of recipientEmails) {
      const failedMessage = await Message.findOne({
        direction: 'outbound',
        sendingModule: 'owm',
        status: { $in: ['pending', 'sending', 'sent'] },
        $or: [
          { 'metadata.recipientEmail': email },
          { to: email },
          { 'metadata.to': email }
        ]
      }).sort({ createdAt: -1 });

      if (!failedMessage) continue;

      await Message.findByIdAndUpdate(failedMessage._id, {
        $set: {
          status: 'failed',
          failedAt: new Date(),
          errorMessage: `Email bounced: delivery to ${email} failed`
        }
      });

      console.log(`[IMAPEmailService] Marked OWM message ${failedMessage._id} as failed (bounce for ${email})`);

      // If it was a testing persona message, update the persona's counter
      if (failedMessage.metadata?.isTestingPersona && failedMessage.metadata?.automationId) {
        try {
          const persona = await TestingPersona.findOne({
            tenantId,
            automationId: failedMessage.metadata.automationId,
            $or: [
              { email: email.toLowerCase() },
              { phone: email }
            ]
          });

          if (persona) {
            await TestingPersona.findByIdAndUpdate(persona._id, {
              $inc: { 'statistics.messagesFailed': 1 }
            });
            console.log(`[IMAPEmailService] Incremented messagesFailed for testing persona "${persona.name}"`);
          }
        } catch (err) {
          console.error('[IMAPEmailService] Error updating testing persona failed count:', err.message);
        }
      }
    }
  }
}

export default IMAPEmailService;
