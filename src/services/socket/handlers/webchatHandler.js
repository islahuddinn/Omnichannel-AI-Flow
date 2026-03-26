// src/services/socket/handlers/webchatHandler.js
/**
 * WebChat Socket.IO Handler
 * Handles real-time messaging for WebChat widget with enhanced features
 */

import { getTenantDB } from '../../../config/database.js';
import WebChatSessionSchema from '../../../models/schemas/WebChatSession.js';
import ContactSchema from '../../../models/schemas/Contact.js';
import ConversationSchema from '../../../models/schemas/Conversation.js';
import MessageSchema from '../../../models/schemas/Message.js';
import DepartmentSchema from '../../../models/schemas/Department.js';
import UserSchema from '../../../models/schemas/User.js';
import SocketEmitter from '../SocketEmitter.js';
import BotService from '../../bot/BotService.js';
import jwt from 'jsonwebtoken';
import { getWebChatSecret } from '../../../lib/auth/webchatSecret.js';

/**
 * Initialize WebChat namespace
 * @param {Server} io - Socket.IO server instance
 */
export function initializeWebChatNamespace(io) {
  const webchatNamespace = io.of('/webchat');

  // ✅ Enhanced authentication middleware
  webchatNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      try {
        const decoded = jwt.verify(token, getWebChatSecret());
        
        socket.data = {
          sessionId: decoded.sessionId,
          visitorId: decoded.visitorId,
          widgetId: decoded.widgetId,
          tenantId: decoded.tenantId,
          contactId: decoded.contactId,
          conversationId: decoded.conversationId,
        };
        
        // ✅ Verify session is authenticated
        if (!socket.data.tenantId) {
          // Try to resolve tenant from widget
          const { resolveTenant } = await import('../../../services/cache/tenantCache.js');
          const tenantData = await resolveTenant('webchat', decoded.widgetId);

          if (!tenantData) {
            return next(new Error('Invalid widget'));
          }

          socket.data.tenantId = tenantData.tenantId;
          socket.data.accountId = tenantData.accountId;
        }
        
        next();
      } catch (error) {
        console.error('Token verification failed:', error);
        return next(new Error('Invalid token'));
      }

    } catch (error) {
      console.error('WebChat auth error:', error);
      return next(new Error('Authentication failed'));
    }
  });

  webchatNamespace.on('connection', async (socket) => {
    const { sessionId, visitorId, tenantId, widgetId, contactId, conversationId } = socket.data;

    console.log(`👤 WebChat visitor connected: ${sessionId}`);

    // Get tenant database connection
    const tenantDB = await getTenantDB(tenantId);

    const WebChatSession = tenantDB.models.WebChatSession || tenantDB.model('WebChatSession', WebChatSessionSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    const User = tenantDB.models.User || tenantDB.model('User', UserSchema);

    // Load session
    // ✅ CRITICAL: Don't populate departmentId - we need the ID string, not the object
    const session = await WebChatSession.findOne({ sessionId });

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      socket.disconnect();
      return;
    }

    // ✅ Ensure departmentId is a string (not an object)
    const departmentId = session.departmentId?.toString ? session.departmentId.toString() : (session.departmentId?._id?.toString() || session.departmentId);

    // ✅ Verify session is authenticated
    if (!session.isAuthenticated) {
      socket.emit('auth:required', { 
        message: 'Authentication required',
        isFirstTime: session.isFirstTime 
      });
      // Don't disconnect - allow them to authenticate
    }

    // ✅ Join rooms
    socket.join(`webchat:${sessionId}`);
    socket.join(`widget:${widgetId}`);
    
    // ✅ CRITICAL: Always join using contact's webchat identifier if available
    // This ensures messages sent from agent/admin panel reach the visitor
    let webchatIdentifier = sessionId; // Default to sessionId
    
    if (session.contactId) {
      const contact = await Contact.findById(session.contactId).select('identifiers').lean();
      if (contact?.identifiers?.webchat) {
        webchatIdentifier = contact.identifiers.webchat;
        socket.join(`webchat:${webchatIdentifier}`);
        console.log(`✅ Visitor joined room using contact webchat identifier: webchat:${webchatIdentifier}`);
      }
    }
    
    if (conversationId || session.conversationId) {
      const convId = conversationId || session.conversationId;
      socket.join(`conversation:${convId}`);
      
      if (departmentId) {
        socket.join(`department:${departmentId}`);
      }
      
      // ✅ CRITICAL: Also join using contact's webchat identifier from conversation
      const conversation = await Conversation.findById(convId).populate('contact', 'identifiers').lean();
      if (conversation?.contact?.identifiers?.webchat) {
        const convWebchatIdentifier = conversation.contact.identifiers.webchat;
        socket.join(`webchat:${convWebchatIdentifier}`);
        webchatIdentifier = convWebchatIdentifier; // Use conversation's identifier as primary
        console.log(`✅ Visitor joined room via conversation: webchat:${convWebchatIdentifier}`);
      }
    }
    
    // ✅ Store webchatIdentifier in socket.data for later use
    socket.data.webchatIdentifier = webchatIdentifier;

    // ✅ Fetch and emit company and agent information to visitor
    let companyInfo = null;
    let agentInfo = null;
    
    try {
      // Get company info from master database
      const { getMasterDB } = await import('../../../config/database.js');
      const masterDB = await getMasterDB();
      const CompanySchema = (await import('../../../models/schemas/Company.js')).default;
      const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
      const company = await Company.findById(tenantId).lean();
      
      if (company) {
        companyInfo = {
          name: company.name,
          email: company.email,
          phone: company.phone,
          website: company.website,
          address: company.address,
        };
      }
      
      // Get agent info from conversation if assigned
      if (session.conversationId) {
        const conversation = await Conversation.findById(session.conversationId).lean();
        if (conversation?.assignedTo) {
          const agent = await User.findById(conversation.assignedTo).select('firstName lastName email avatar role').lean();
          
          if (agent) {
            agentInfo = {
              id: agent._id.toString(),
              name: `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || 'Support Agent',
              email: agent.email,
              avatar: agent.avatar,
              role: agent.role,
            };
          }
        }
      }
      
      // If no agent assigned, get first agent from department
      if (!agentInfo && departmentId) {
        const department = await Department.findById(departmentId).lean();
        
        if (department) {
          // Try first agent from department
          if (department.agents && department.agents.length > 0) {
            const firstAgent = await User.findById(department.agents[0]).select('firstName lastName email avatar role').lean();
            
            if (firstAgent) {
              agentInfo = {
                id: firstAgent._id.toString(),
                name: `${firstAgent.firstName || ''} ${firstAgent.lastName || ''}`.trim() || 'Support Agent',
                email: firstAgent.email,
                avatar: firstAgent.avatar,
                role: firstAgent.role,
              };
            }
          }
        }
      }
      
      // ✅ Emit company and agent info to visitor
      if (companyInfo || agentInfo) {
        socket.emit('session:info', {
          companyInfo,
          agentInfo,
        });
        console.log('📡 Emitted company/agent info to visitor:', { companyInfo, agentInfo });
      }
    } catch (error) {
      console.error('Error fetching company/agent info in socket handler:', error);
      // Continue without company/agent info
    }

    // ✅ Emit online status to agents
    if (session.conversationId) {
      await SocketEmitter.emit(`conversation:${session.conversationId}`, 'visitor:online', {
        sessionId,
        contactId: session.contactId,
        timestamp: new Date(),
      });
    }

    // ✅ Notify department agents
    if (departmentId) {
      await SocketEmitter.emit(`department:${departmentId}`, 'visitor:connected', {
        sessionId,
        contactId: session.contactId,
        conversationId: session.conversationId,
        timestamp: new Date(),
      });
    }

    /**
     * ✅ Handle message from visitor
     */
    socket.on('message:send', async (data) => {
      try {
        const { content, attachments, replyToId } = data;

        if (!session.isAuthenticated) {
          socket.emit('error', { message: 'Authentication required' });
          return;
        }

        console.log(`💬 [WebChat] Incoming message from visitor:`, {
          sessionId: sessionId,
          contactId: session.contactId,
          conversationId: conversationId || session.conversationId,
          hasContactInfo: !!session.contactInfo,
          phone: session.contactInfo?.phone,
          email: session.contactInfo?.email
        });

        // ✅ Use socket.data.conversationId (mutable) instead of const conversationId
        // so that cleared IDs from deleted conversations are respected in subsequent messages
        let convId = socket.data.conversationId || session.conversationId;
        let isNewConversation = false;

        // ✅ Check if conversation was deleted (soft or hard) while webchat session is still open
        if (convId) {
          const existingConvCheck = await Conversation.findById(convId).select('status').lean();
          if (!existingConvCheck || existingConvCheck.status === 'deleted') {
            console.log(`⚠️ [WebChat] Conversation ${convId} was ${!existingConvCheck ? 'permanently deleted' : 'soft-deleted'}, creating new conversation for session ${sessionId}`);
            convId = null; // Reset so a new conversation is created below
            // ✅ Clear stale conversationId from socket.data and in-memory session
            // so subsequent messages in this socket connection also create/use the new conversation
            socket.data.conversationId = null;
            session.conversationId = null;
          }
        }

        // ✅ Create conversation if doesn't exist
        if (!convId) {
          const createResult = await createConversation(session, tenantId, tenantDB, departmentId);
          convId = createResult.id;
          isNewConversation = createResult.isNew;

          await WebChatSession.findByIdAndUpdate(session._id, {
            conversationId: convId,
            lastActivityAt: new Date(),
          });

          // ✅ Update in-memory references so subsequent messages use the new conversation
          socket.data.conversationId = convId;
          session.conversationId = convId;

          socket.join(`conversation:${convId}`);
          
          // ✅ CRITICAL: Also join using contact's webchat identifier after conversation is created
          const conversation = await Conversation.findById(convId).populate('contact', 'identifiers').lean();
          if (conversation?.contact?.identifiers?.webchat) {
            socket.join(`webchat:${conversation.contact.identifiers.webchat}`);
            console.log(`✅ Visitor joined room after conversation creation: webchat:${conversation.contact.identifiers.webchat}`);
          }
        } else {
          // ✅ Even if conversation exists, check if it should be merged with other channels
          // This handles cases where webchat conversation exists but WhatsApp conversation was created later
          try {
            const existingConv = await Conversation.findById(convId).populate('contact').lean();
            if (existingConv && existingConv.contact && !existingConv.contact.autoMergeDisabled) {
              const { findMergeableConversation, autoMergeConversation, canMergeContacts, mergeContacts } = await import('../../../services/conversation/MergeService.js');
              const mergeableConv = await findMergeableConversation(tenantId, existingConv, existingConv.contact);
              
              if (mergeableConv && mergeableConv._id.toString() !== existingConv._id.toString()) {
                console.log('🔀 Auto-merging existing webchat conversation with other channel:', {
                  webchatConversationId: existingConv._id,
                  primaryConversationId: mergeableConv._id,
                  contact: existingConv.contact._id,
                  webchatChannel: 'webchat',
                  existingChannel: mergeableConv.channel
                });

                // Merge contacts if they're different
                let mergedContact = existingConv.contact;
                if (mergeableConv.contact.toString() !== existingConv.contact._id.toString()) {
                  const mergeableContact = await Contact.findById(mergeableConv.contact);
                  if (mergeableContact) {
                    const canMerge = canMergeContacts(existingConv.contact, mergeableContact);
                    
                    if (canMerge.canMerge) {
                      // Determine which contact to keep (the one from primary conversation)
                      if (mergeableConv.createdAt < existingConv.createdAt) {
                        // Primary is older, merge webchat contact into primary's contact
                        mergedContact = await mergeContacts(tenantId, mergeableConv.contact, existingConv.contact._id);
                      } else {
                        // Webchat conversation is older, merge primary's contact into webchat
                        mergedContact = await mergeContacts(tenantId, existingConv.contact._id, mergeableConv.contact);
                      }
                    }
                  }
                }

                // Perform auto-merge
                const mergeResult = await autoMergeConversation(
                  tenantId,
                  existingConv._id,
                  mergeableConv._id,
                  'system' // System user for auto-merge
                );

                // ✅ Check if merge failed due to mode mismatch or other reasons
                if (!mergeResult.success) {
                  console.log('⚠️ Auto-merge skipped for existing webchat conversation:', mergeResult.error);
                  // Continue with normal flow - don't merge but don't fail
                } else {
                  // Update conversation to use merged contact if changed
                  if (mergedContact._id.toString() !== existingConv.contact._id.toString()) {
                    await Conversation.findByIdAndUpdate(existingConv._id, {
                      contact: mergedContact._id
                    });
                  }

                  // Use primary conversation
                  const primaryConv = await Conversation.findById(mergeableConv._id);
                  console.log('✅ Auto-merge completed for existing webchat conversation, using primary conversation:', primaryConv._id);
                  
                  // Update session to use primary conversation
                  convId = primaryConv._id;
                  await WebChatSession.findByIdAndUpdate(session._id, {
                    conversationId: convId
                  });
                  socket.join(`conversation:${convId}`);
                }
              }
            }
          } catch (mergeError) {
            console.error('❌ Auto-merge failed for existing webchat conversation, continuing with current conversation:', mergeError);
            // Continue with existing conversation if merge fails
          }
        }

        // ✅ Get or create contact (create on first message)
        // First try to find by contactId or webchat identifier
        let contact = session.contactId 
          ? await Contact.findById(session.contactId)
          : await Contact.findOne({ 'identifiers.webchat': sessionId });
        
        // ✅ If not found and we have phone/email, try to find existing contact by phone/email
        // This prevents duplicate contacts when same person uses webchat and WhatsApp
        if (!contact && session.contactInfo) {
          const { normalizePhoneNumber, normalizeEmail } = await import('../../../utils/normalizers.js');
          const contactQuery = { $or: [] };
          
          // Search by phone if provided
          if (session.contactInfo.phone) {
            const normalizedPhone = normalizePhoneNumber(session.contactInfo.phone);
            const phoneWithoutPlus = normalizedPhone.replace(/^\+/, '');
            const phoneWith00 = phoneWithoutPlus ? `00${phoneWithoutPlus}` : null;
            
            contactQuery.$or.push(
              { phone: normalizedPhone },
              { phone: phoneWithoutPlus },
              { phone: session.contactInfo.phone },
              { normalizedPhone: normalizedPhone },
              { normalizedPhone: phoneWithoutPlus },
              { 'identifiers.whatsapp': normalizedPhone },
              { 'identifiers.whatsapp': phoneWithoutPlus },
              { 'identifiers.sms': normalizedPhone },
              { 'identifiers.sms': phoneWithoutPlus }
            );
            
            if (phoneWith00) {
              contactQuery.$or.push(
                { phone: phoneWith00 },
                { normalizedPhone: phoneWith00 },
                { 'identifiers.whatsapp': phoneWith00 },
                { 'identifiers.sms': phoneWith00 }
              );
            }
          }
          
          // Search by email if provided
          if (session.contactInfo.email) {
            const normalizedEmail = normalizeEmail(session.contactInfo.email);
            contactQuery.$or.push(
              { email: normalizedEmail },
              { email: session.contactInfo.email },
              { 'identifiers.email': normalizedEmail },
              { 'identifiers.email': session.contactInfo.email }
            );
          }
          
          // Only search if we have at least one search criteria
          if (contactQuery.$or.length > 0) {
            contact = await Contact.findOne(contactQuery);
            if (contact) {
              console.log(`✅ Found existing contact ${contact._id} by phone/email for webchat session ${sessionId}`);
              
              // Update contact with webchat info and ensure phone is normalized
              const updates = {};
              
              // Update webchat identifier if not set
              if (!contact.identifiers?.webchat) {
                updates['identifiers.webchat'] = sessionId;
              }
              
              // Ensure phone is normalized if we have phone info
              if (session.contactInfo?.phone) {
                const normalizedPhone = normalizePhoneNumber(session.contactInfo.phone);
                if (!contact.normalizedPhone || contact.normalizedPhone !== normalizedPhone) {
                  updates.normalizedPhone = normalizedPhone;
                }
                // Ensure phone field is set
                if (!contact.phone) {
                  updates.phone = normalizedPhone;
                }
                // Update identifiers if not set
                if (!contact.identifiers?.whatsapp && !contact.identifiers?.sms) {
                  updates['identifiers.whatsapp'] = normalizedPhone;
                  updates['identifiers.sms'] = normalizedPhone;
                }
              }
              
              if (Object.keys(updates).length > 0) {
                await Contact.findByIdAndUpdate(contact._id, { $set: updates });
                console.log(`✅ Updated contact ${contact._id} with webchat info and normalized phone`);
              }
              
              // Reload contact to get updated fields
              contact = await Contact.findById(contact._id);
              
              // Update session with found contact
              await WebChatSession.findByIdAndUpdate(session._id, {
                contactId: contact._id
              });
            }
          }
        }

        if (!contact) {
          // ✅ Create contact on first message (not during authentication)
          if (session.contactInfo) {
            contact = await Contact.create({
              name: session.contactInfo.name,
              email: session.contactInfo.email,
              phone: session.contactInfo.phone,
              identifiers: { webchat: sessionId },
              webchatLink: session.contactLink, // ✅ Save WebChat link in contact
              channel: 'webchat',
              department: session.departmentId,
              Contact_Type: 'Customer',
            });

            await WebChatSession.findByIdAndUpdate(session._id, {
              contactId: contact._id,
            });
            
            console.log(`✨ Created contact ${contact._id} on first message with WebChat link: ${session.contactLink}`);
          } else {
            // ✅ Fallback: use webchat identifier as name instead of generic "WebChat Visitor"
            const webchatIdentifier = sessionId.substring(0, 12); // Use first 12 chars of sessionId
            contact = await Contact.create({
              name: `WebChat ${webchatIdentifier}`, // ✅ Use identifier instead of generic name
              displayName: `WebChat ${webchatIdentifier}`, // ✅ Also set displayName
              identifiers: { webchat: sessionId },
              webchatLink: session.contactLink,
              channel: 'webchat',
              department: session.departmentId,
              Contact_Type: 'Customer',
            });

            await WebChatSession.findByIdAndUpdate(session._id, {
              contactId: contact._id,
            });
          }
        } else {
          // ✅ Update existing contact with WebChat link if not present or different
          let contactUpdated = false;
          if (session.contactLink && contact.webchatLink !== session.contactLink) {
            contact.webchatLink = session.contactLink;
            contactUpdated = true;
          }
          if (!contact.identifiers?.webchat) {
            contact.identifiers = contact.identifiers || {};
            contact.identifiers.webchat = sessionId;
            contactUpdated = true;
          }
          if (contactUpdated) {
            await contact.save();
            console.log(`✅ Updated contact ${contact._id} with WebChat link: ${session.contactLink}`);
          }
        }
        
        // ✅ CRITICAL: Ensure visitor joins room using contact's webchat identifier
        if (contact?.identifiers?.webchat) {
          const webchatIdentifier = contact.identifiers.webchat;
          socket.join(`webchat:${webchatIdentifier}`);
          socket.data.webchatIdentifier = webchatIdentifier; // Update stored identifier
          console.log(`✅ Visitor joined room via contact: webchat:${webchatIdentifier}`);
        } else if (contact && !contact.identifiers?.webchat) {
          // ✅ CRITICAL: Update contact with sessionId as webchat identifier if missing
          contact.identifiers = contact.identifiers || {};
          contact.identifiers.webchat = sessionId;
          await contact.save();
          socket.join(`webchat:${sessionId}`);
          socket.data.webchatIdentifier = sessionId;
          console.log(`✅ Updated contact with webchat identifier and joined room: webchat:${sessionId}`);
        }

        // ✅ Create message
        const messageContent = typeof content === 'string' 
          ? content 
          : (content?.text || content?.type || '[Media]');
        
        // ✅ Fetch replyTo message if replyToId exists
        let replyToMessage = null;
        if (replyToId) {
          replyToMessage = await Message.findById(replyToId).select('content type attachments').lean();
        }
        
        // ✅ Get conversation to extract departmentId for message segregation
        const conversationForDept = await Conversation.findById(convId).select('department').lean();
        const messageDepartmentId = conversationForDept?.department || session.departmentId;
        
        console.log(`💬 [WebChat] Creating message for conversation ${convId}, contact ${contact._id}`);
        console.log(`   Contact phone: ${contact.phone}, normalized: ${contact.normalizedPhone}, identifiers: ${JSON.stringify(contact.identifiers)}`);
        
        const message = await Message.create({
          conversation: convId,
          contact: contact._id,
          channel: 'webchat',
          channelAccount: session.channelAccountId,
          departmentId: messageDepartmentId, // ✅ CRITICAL: Store department ID for message segregation
          type: content?.type || (attachments.length > 0 ? 'document' : 'text'),
          content: messageContent,
          attachments: attachments || [],
          direction: 'inbound', // ✅ Visitor → Agent (inbound)
          status: 'sent', // ✅ Start as 'sent' (single gray tick), then progress to 'delivered' (double gray ticks), then 'read' (blue ticks)
          replyTo: replyToId || null,
          createdAt: new Date(),
        });

        // ✅ Log incoming webchat message
        try {
          const MessageLogService = (await import('../../message/MessageLogService.js')).default;
          await MessageLogService.logMessageCreated(tenantId, message, {
            channelType: 'webchat',
            channelAccountId: session.channelAccountId?.toString(),
            receivedVia: 'socket',
            hasAttachments: attachments.length > 0,
            attachmentCount: attachments.length,
            isReply: !!replyToId,
          });
        } catch (logError) {
          console.error('⚠️ Failed to log incoming webchat message:', logError);
        }

        // ✅ Populate replyTo for socket emission
        if (replyToMessage) {
          message.replyTo = {
            _id: replyToId,
            content: replyToMessage.content,
            type: replyToMessage.type,
            attachments: replyToMessage.attachments || [],
          };
        }

        // ✅ Check if AI bot is enabled and conversation is in auto mode
        // If so, don't increment unread count
        const BotService = (await import('../../../services/bot/BotService.js')).default;
        const botSettings = await BotService.getCompanyBotSettings(tenantId);
        const conversationForMode = await Conversation.findById(convId).select('mode primaryConversation').lean();
        let convModeForUnread = conversationForMode?.mode || 'auto';
        // ✅ Resolve mode from primary if this is a secondary (merged) conversation
        if (conversationForMode?.primaryConversation) {
          try {
            const primaryConv = await Conversation.findById(conversationForMode.primaryConversation).select('mode').lean();
            if (primaryConv) convModeForUnread = primaryConv.mode || 'auto';
          } catch (err) {
            console.error('⚠️ Failed to fetch primary conversation mode:', err);
          }
        }
        const isAutoMode = convModeForUnread === 'auto';
        const shouldIncrementUnread = !(botSettings.enabled && isAutoMode);
        
        // ✅ Update conversation
        await Conversation.findByIdAndUpdate(convId, {
          lastMessage: message._id,
          lastMessageAt: new Date(),
          lastMessageContent: messageContent || (attachments.length > 0 ? '[Media]' : '[Message]'),
          lastMessageType: content?.type || (attachments.length > 0 ? 'document' : 'text'),
          lastMessageDirection: 'inbound',
          $inc: { 
            messageCount: 1,
            ...(shouldIncrementUnread && { unreadCount: 1 }) // ✅ Only increment unread count if AI bot disabled or manual mode
          },
          status: 'active',
        });

        // ✅ Update session
        await WebChatSession.findByIdAndUpdate(session._id, {
          lastActivityAt: new Date(),
          $inc: { messageCount: 1 },
        });

        // ✅ Fetch updated conversation with all populated fields (matching API response structure)
        const updatedConversation = await Conversation.findById(convId)
          .populate('contact', 'name displayName phone email avatar identifiers')
          .populate('channelAccount', 'type name')
          .populate('department', 'name')
          .populate('assignedTo', 'firstName lastName email')
          .lean();

        // ✅ Calculate actual unread count after update
        const MessageModel = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
        const actualUnreadCount = await MessageModel.countDocuments({
          conversation: convId,
          direction: 'inbound',
          readAt: { $exists: false }
        });

        // ✅ Emit new conversation event if this is the first message
        if (isNewConversation) {
          console.log(`📢 Emitting new conversation event (webchat): ${convId}`);
          
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
            channel: 'webchat',
            department: updatedConversation.department ? {
              _id: updatedConversation.department._id,
              name: updatedConversation.department.name,
            } : null,
            assignedTo: updatedConversation.assignedTo || null,
            status: 'active',
            lastMessage: message._id,
            lastMessageAt: new Date(),
            lastMessageContent: messageContent || (attachments.length > 0 ? '[Media]' : '[Message]'),
            lastMessageType: content?.type || (attachments.length > 0 ? 'document' : 'text'),
            lastMessageDirection: 'inbound',
            messageCount: 1,
            unreadCount: actualUnreadCount,
            createdAt: updatedConversation.createdAt,
            updatedAt: updatedConversation.updatedAt || new Date(),
            isPinned: false,
            isMerged: false,
            mode: updatedConversation.mode || 'auto', // ✅ Default to 'auto' (Hybrid mode)
            priority: updatedConversation.priority || 'normal',
          };
          
          await SocketEmitter.emitNewConversation(tenantId, conversationData, {
            _id: message._id,
            content: messageContent,
            type: message.type,
            direction: 'inbound',
            status: 'sent', // ✅ Start as 'sent'
            createdAt: message.createdAt,
          }, {
            _id: contact._id,
            name: contact.name,
            displayName: contact.displayName,
            phone: contact.phone,
            email: contact.email,
            avatar: contact.avatar,
            identifiers: contact.identifiers,
          }, session.departmentId || departmentId);
        } else {
          // ✅ Emit conversation update (last message, unread count) for existing conversations
          const updatePayload = {
            lastMessage: message._id,
            lastMessageAt: new Date(),
            lastMessageContent: messageContent || (attachments.length > 0 ? '[Media]' : '[Message]'),
            lastMessageType: content?.type || (attachments.length > 0 ? 'document' : 'text'),
            lastMessageDirection: 'inbound',
            unreadCount: actualUnreadCount,
            messageCount: (updatedConversation?.messageCount || 0) + 1,
          };

          // ✅ Include merge-related fields if the conversation was just merged
          // This ensures the conversation list updates merge icons in real-time
          if (updatedConversation?.isMerged) {
            updatePayload.isMerged = true;
            updatePayload.mergedConversations = updatedConversation.mergedConversations || [];
          }

          // ✅ Include contact data if it changed during merge
          if (updatedConversation?.contact) {
            updatePayload.contactData = {
              _id: updatedConversation.contact._id,
              name: updatedConversation.contact.name,
              displayName: updatedConversation.contact.displayName,
              phone: updatedConversation.contact.phone,
              email: updatedConversation.contact.email,
              avatar: updatedConversation.contact.avatar,
              identifiers: updatedConversation.contact.identifiers,
            };
          }

          await SocketEmitter.emitConversationUpdate(convId, updatePayload, tenantId, session.departmentId, null);
        }

        // ✅ Prepare replyTo data for socket emission
        const replyToDataForAgents = replyToMessage ? {
          _id: replyToId,
          content: replyToMessage.content,
          type: replyToMessage.type,
          attachments: replyToMessage.attachments || [],
        } : null;

        // ✅ Emit to conversation room (agents)
        // ✅ CRITICAL: Include conversationId at top level for frontend handler
        await SocketEmitter.emit(`conversation:${convId}`, 'message:new', {
          conversationId: convId, // ✅ Top-level conversationId (required by frontend)
          message: {
            _id: message._id,
            conversationId: convId,
            contactId: contact._id,
            channel: 'webchat',
            content: messageContent,
            type: message.type,
            attachments: message.attachments || [],
            direction: 'inbound',
            status: 'sent', // ✅ Start as 'sent'
            createdAt: message.createdAt,
            replyTo: replyToDataForAgents,
          },
          contact: {
            _id: contact._id,
            name: contact.name,
            email: contact.email,
          },
        });

        // ✅ Emit initial status as 'sent' to visitor (single gray tick)
        await SocketEmitter.emit(`webchat:${sessionId}`, 'message:status', {
          messageId: message._id.toString(),
          conversationId: convId,
          status: 'sent',
          timestamp: new Date().toISOString(),
        });

        // ✅ Emit status update to 'delivered' after short delay (double gray ticks)
        setTimeout(async () => {
          await Message.findByIdAndUpdate(message._id, {
            status: 'delivered',
            deliveredAt: new Date(),
          });
          
          await SocketEmitter.emit(`webchat:${sessionId}`, 'message:status', {
            messageId: message._id.toString(),
            conversationId: convId,
            status: 'delivered',
            timestamp: new Date().toISOString(),
          });
        }, 500);

        // ── OWM Outcome Matching (before general bot) ──
        let owmHandledResponse = false;
        try {
          const allOutbound = await Message.find({
            conversation: convId,
            direction: 'outbound',
          }).select('sendingModule metadata').lean();

          const owmMsgs = allOutbound.filter(m => {
            if (m.sendingModule === 'owm') return true;
            const meta = m.metadata;
            if (!meta) return false;
            if (meta instanceof Map) return meta.has('automationId');
            if (typeof meta === 'object') return !!meta.automationId;
            return false;
          });

          if (owmMsgs.length > 0) {
            console.log(`[OWM-WEBCHAT] Found ${owmMsgs.length} OWM message(s) in conversation ${convId}`);
            const OutcomeMatchingService = (await import('../../automation/OutcomeMatchingService.js')).default;

            const automationIdSet = new Set();
            for (const m of owmMsgs) {
              const meta = m.metadata;
              let aid = null;
              if (meta instanceof Map) aid = meta.get('automationId');
              else if (meta && typeof meta === 'object') aid = meta.automationId;
              if (aid) automationIdSet.add(aid.toString());
            }

            for (const automationId of automationIdSet) {
              try {
                await OutcomeMatchingService.initializeOutcomes(
                  tenantId, convId.toString(),
                  contact._id.toString(), automationId
                );
                const matchResult = await OutcomeMatchingService.analyzeAndMatch(
                  tenantId, convId.toString(),
                  message._id.toString(), automationId
                );
                if (matchResult?.matched) {
                  owmHandledResponse = true;
                  console.log(`[OWM-WEBCHAT] Outcome "${matchResult.outcome?.outcomeName}" matched (followUp: ${matchResult.followUpSent})`);
                  break;
                }
              } catch (matchErr) {
                console.error(`[OWM-WEBCHAT] Matching error:`, matchErr.message);
              }
            }
          }
        } catch (owmErr) {
          console.error('[OWM-WEBCHAT] Error:', owmErr.message);
        }

        // AI Bot Integration: Check if conversation is in auto mode
        const hasValidContent = messageContent && typeof messageContent === 'string' && messageContent.trim().length > 0;
        let convModeForBot = updatedConversation?.mode || 'auto';
        if (updatedConversation?.primaryConversation) {
          try {
            const primaryConv = await Conversation.findById(updatedConversation.primaryConversation).select('mode').lean();
            if (primaryConv) convModeForBot = primaryConv.mode || 'auto';
          } catch (err) {
            console.error('⚠️ Failed to fetch primary conversation mode:', err);
          }
        }

        // Media message detection — switch to manual for non-text messages
        const MEDIA_TYPES = ['image', 'video', 'audio', 'voice', 'document', 'file', 'sticker', 'location', 'contact'];
        let mediaHandoff = false;
        const msgType = message.type || 'text';

        if (convModeForBot === 'auto' && !owmHandledResponse && MEDIA_TYPES.includes(msgType)) {
          try {
            const { executeHandoff } = await import('../../bot/HumanHandoffService.js');
            const contactName = contact.name || contact.displayName || 'Customer';
            const mediaLabels = { image: 'an image', video: 'a video', audio: 'a voice message', voice: 'a voice message', document: 'a document', file: 'a file' };
            const mediaLabel = mediaLabels[msgType] || 'a media file';

            await executeHandoff({ tenantDB, tenantId, conversationId: convId.toString(), contactName });
            mediaHandoff = true;

            try {
              await BotService.sendBotResponse({
                tenantId, conversationId: convId.toString(),
                contactId: contact._id.toString(), channelType: 'webchat',
                channelAccountId: session.channelAccountId?.toString(),
                botResponse: `${contactName !== 'Customer' ? contactName + ', ' : ''}I received ${mediaLabel}. Let me connect you with a team member who can assist you. A human agent will be with you shortly.`,
                tenantDB, skipModeCheck: true,
              });
            } catch (sendErr) {
              console.error('[MediaHandoff-WebChat] Failed to send message:', sendErr.message);
            }
          } catch (mediaErr) {
            console.error('[MediaHandoff-WebChat] Error:', mediaErr.message);
          }
        }

        // Human handoff detection (fast keyword pass only - AI pass runs in parallel below)
        let handoffTriggered = false;
        if (hasValidContent && convModeForBot === 'auto' && !owmHandledResponse && !mediaHandoff) {
          try {
            const HANDOFF_PATTERNS = [
              /\b(talk|speak|connect|transfer)\b.*(human|agent|person|operator|representative|rep|someone|real person|live)/i,
              /\b(human|live|real)\b.*(agent|person|chat|support|operator|help)/i,
              /\b(want|need|get)\b.*(human|agent|person|operator|representative)/i,
              /\bnot a bot\b/i, /\bstop bot\b/i, /\bno bot\b/i, /\breal person\b/i,
              /\blive agent\b/i, /\bhuman (please|plz|pls)\b/i, /\bagent (please|plz|pls)\b/i, /\boperator\b/i,
            ];
            const fastHandoff = HANDOFF_PATTERNS.some(p => p.test(messageContent));
            if (fastHandoff) {
              handoffTriggered = true;
              const contactName = contact.name || contact.displayName || 'Customer';
              const { executeHandoff } = await import('../../bot/HumanHandoffService.js');
              const { handoffMessage } = await executeHandoff({
                tenantDB, tenantId,
                conversationId: convId.toString(),
                contactName,
              });
              if (handoffMessage) {
                try {
                  await BotService.sendBotResponse({
                    tenantId, conversationId: convId.toString(),
                    contactId: contact._id.toString(), channelType: 'webchat',
                    channelAccountId: session.channelAccountId?.toString(),
                    botResponse: handoffMessage, tenantDB, skipModeCheck: true,
                  });
                } catch (sendErr) {
                  console.error('[Handoff-WebChat] Failed to send handoff message:', sendErr.message);
                }
              }
            }
          } catch (handoffErr) {
            console.error('[Handoff-WebChat] Detection error:', handoffErr.message);
          }
        }

        const hasRecentBotResponse = await Message.exists({
          conversation: convId,
          'metadata.isBotResponse': true,
          createdAt: { $gte: message.createdAt },
        });

        if (hasValidContent && convModeForBot === 'auto' && !hasRecentBotResponse && !owmHandledResponse && !handoffTriggered && !mediaHandoff) {
          console.log('🤖 Webchat conversation is in auto mode, calling AI bot...', {
            conversationId: convId.toString(),
            messageId: message._id.toString(),
            messageLength: messageContent.length,
          });

          // ✅ Emit typing indicator to visitor while bot processes the response
          socket.emit('agent:typing', {
            userId: 'bot',
            conversationId: convId,
            isTyping: true,
            timestamp: new Date()
          });

          // Call bot service asynchronously (don't block message processing)
          (async () => {
            try {
              // Get contact name for bot API
              const contactName = contact.name || contact.displayName || contact.email || contact.phone || 'User';
              
              // Prepare message for bot based on type
              let messageForBot = messageContent;
              if (message.type !== 'text') {
                // For non-text messages, provide context about the message type
                const typeDescriptions = {
                  'image': 'User sent an image',
                  'video': 'User sent a video',
                  'audio': 'User sent an audio message',
                  'voice': 'User sent a voice message',
                  'file': 'User sent a file',
                  'document': 'User sent a document',
                  'location': 'User shared a location',
                  'contact': 'User shared a contact'
                };
                const typeDesc = typeDescriptions[message.type] || `User sent a ${message.type} message`;
                messageForBot = `${typeDesc}${messageContent ? `: ${messageContent}` : ''}`;
              }
              
              // Get department ID from updatedConversation (populated) or fetch it if needed
              let departmentId = null;
              if (updatedConversation?.department) {
                // Department is populated as an object with _id
                departmentId = updatedConversation.department._id?.toString() || updatedConversation.department.toString();
              } else {
                // Fallback: fetch department from conversation if not populated
                const convForDept = await Conversation.findById(convId).select('department').lean();
                departmentId = convForDept?.department?.toString() || null;
              }
              
              // ── PARALLEL PROCESSING: AI handoff + bot response + language detection ──
              const botAbortController = new AbortController();
              const botSettings = await BotService.getCompanyBotSettings(tenantId);

              const [aiHandoffResult, botResponse, detectedLang] = await Promise.allSettled([
                // 1. AI handoff detection (Tier 2)
                (async () => {
                  if (!botSettings.provider || !botSettings.apiKey || messageContent.length < 5) return false;
                  try {
                    const { detectHumanHandoff } = await import('../../bot/HumanHandoffService.js');
                    return await detectHumanHandoff(messageContent, botSettings);
                  } catch { return false; }
                })(),

                // 2. Bot response (with abort signal)
                BotService.generateResponse({
                  tenantId, conversationId: convId.toString(),
                  contactId: contact._id.toString(), message: messageForBot,
                  platform: 'webchat', contactName, messageType: message.type,
                  departmentId, channelAccountId: session.channelAccountId?.toString() || null,
                  contactType: contact.Contact_Type || null,
                  abortSignal: botAbortController.signal,
                }),

                // 3. Language detection
                (async () => {
                  try {
                    const { detectLanguage } = await import('../../bot/AIGenerationService.js');
                    return await detectLanguage(messageContent);
                  } catch { return 'en'; }
                })(),
              ]);

              const isAIHandoff = aiHandoffResult.status === 'fulfilled' && aiHandoffResult.value === true;

              // Save detected language
              const lang = detectedLang.status === 'fulfilled' ? detectedLang.value : 'en';
              if (lang && lang !== 'en') {
                try {
                  await Message.findByIdAndUpdate(message._id, {
                    $set: { 'metadata.detectedLanguage': lang },
                  });
                  // Translate for agents (async)
                  if (botSettings.provider && botSettings.apiKey) {
                    import('../../bot/AIGenerationService.js').then(async ({ translateForAgent }) => {
                      const translation = await translateForAgent(messageContent, lang, botSettings);
                      if (translation) {
                        await Message.findByIdAndUpdate(message._id, {
                          $set: { 'metadata.translatedContent': translation, 'metadata.translatedTo': 'en' },
                        });
                      }
                    }).catch(() => {});
                  }
                } catch (langErr) {
                  console.warn('[WebChat-Language] Failed to save language:', langErr.message);
                }
              }

              // If AI detected handoff, discard bot response
              if (isAIHandoff) {
                botAbortController.abort();
                console.log('[WebChat-Parallel] AI handoff detected — discarding bot response');
                const { executeHandoff } = await import('../../bot/HumanHandoffService.js');
                const { handoffMessage } = await executeHandoff({
                  tenantDB, tenantId, conversationId: convId.toString(), contactName,
                });
                if (handoffMessage) {
                  try {
                    await BotService.sendBotResponse({
                      tenantId, conversationId: convId.toString(),
                      contactId: contact._id.toString(), channelType: 'webchat',
                      channelAccountId: session.channelAccountId?.toString(),
                      botResponse: handoffMessage, tenantDB, skipModeCheck: true,
                    });
                  } catch (sendErr) {
                    console.error('[Handoff-WebChat] Failed to send message:', sendErr.message);
                  }
                }
                return;
              }

              const botResult = botResponse.status === 'fulfilled' ? botResponse.value : null;

              if (botResult && botResult.failed) {
                console.warn(`🚨 Bot failed for webchat conversation ${convId}: ${botResult.reason}`);
                const { escalateBotFailure } = await import('../../bot/BotFailureEscalation.js');
                await escalateBotFailure({
                  tenantDB, tenantId, conversationId: convId.toString(),
                  reason: botResult.reason, departmentId,
                  errorMessage: botResult.error || null,
                });
                return;
              }

              if (botResult && botResult.response && !botResult.queued) {
                console.log('✅ AI bot direct response received for webchat, sending as message...', {
                  conversationId: convId.toString(),
                  responseLength: botResult.response.length,
                });

                const alreadyResponded = await Message.exists({
                  conversation: convId,
                  'metadata.isBotResponse': true,
                  createdAt: { $gte: message.createdAt },
                });

                if (!alreadyResponded) {
                  await BotService.sendBotResponse({
                    tenantId, conversationId: convId.toString(),
                    contactId: contact._id.toString(), channelType: 'webchat',
                    channelAccountId: session.channelAccountId.toString(),
                    botResponse: botResult.response, tenantDB,
                    botMetadata: botResult.metadata || null,
                  });
                  console.log('✅ Bot response sent successfully for webchat');
                } else {
                  console.log('⚠️ WebChat Bot response skipped - another bot response was sent while waiting for API');
                }
              } else if (botResponse.status === 'rejected') {
                console.error('❌ WebChat bot response rejected:', botResponse.reason);
              } else {
                console.log('ℹ️ No bot response received for webchat (bot may be disabled or returned empty)');
              }
            } catch (botError) {
              // Log error but don't throw - bot failures shouldn't break message processing
              console.error('❌ Error processing bot response for webchat:', botError);
              console.error('❌ Bot error details:', botError.message, botError.stack);
              // Escalate unhandled bot errors to manual mode
              try {
                const { escalateBotFailure } = await import('../../bot/BotFailureEscalation.js');
                await escalateBotFailure({
                  tenantDB,
                  tenantId,
                  conversationId: convId.toString(),
                  reason: 'api_error',
                  departmentId: departmentId,
                  errorMessage: botError.message,
                });
              } catch (escalationErr) {
                console.error('❌ Failed to escalate bot failure:', escalationErr.message);
              }
            } finally {
              // ✅ Always stop typing indicator after bot finishes (success or error)
              socket.emit('agent:typing', {
                userId: 'bot',
                conversationId: convId,
                isTyping: false,
                timestamp: new Date()
              });
            }
          })().catch(error => {
            console.error('❌ Unhandled error in bot processing for webchat:', error);
          });
        } else {
          if (hasRecentBotResponse) {
            console.log('ℹ️ Skipping bot call for webchat - bot already responded recently to this conversation');
          } else if (!hasValidContent) {
            console.log('ℹ️ Skipping bot call for webchat - message has no valid content');
          } else if (convModeForBot !== 'auto') {
            console.log('ℹ️ Skipping bot call for webchat - conversation is in manual mode');
          }
        }

        // ✅ Prepare replyTo data for socket emission (reuse the one prepared earlier)
        // This is already prepared above at line 524, but we'll ensure it's available here
        const replyToDataForAllRooms = replyToMessage ? {
          _id: replyToId,
          content: replyToMessage.content,
          type: replyToMessage.type,
          attachments: replyToMessage.attachments || [],
        } : null;

        // ✅ Emit to department room (all department agents)
        // ✅ CRITICAL: Use departmentId string, not object
        const deptId = session.departmentId?.toString ? session.departmentId.toString() : (session.departmentId?._id?.toString() || session.departmentId);
        if (deptId) {
          await SocketEmitter.emit(`department:${deptId}`, 'message:new', {
            conversationId: convId, // ✅ Top-level conversationId (required by frontend)
            message: {
              _id: message._id,
              conversationId: convId,
              contactId: contact._id,
              channel: 'webchat',
              content: messageContent,
              type: message.type,
              attachments: message.attachments || [],
              direction: 'inbound',
              status: 'sent', // ✅ Start as 'sent'
              createdAt: message.createdAt,
              replyTo: replyToDataForAllRooms, // ✅ CRITICAL: Include replyTo data
            },
            contact: {
              _id: contact._id,
              name: contact.name,
            },
          });
        }

        // ✅ Emit to tenant room (company admins)
        await SocketEmitter.emit(`tenant:${tenantId}`, 'message:new', {
          conversationId: convId, // ✅ Top-level conversationId (required by frontend)
          message: {
            _id: message._id,
            conversationId: convId,
            contactId: contact._id,
            channel: 'webchat',
            content: messageContent,
            type: message.type,
            attachments: message.attachments || [],
            direction: 'inbound',
            status: 'delivered',
            createdAt: message.createdAt,
            replyTo: replyToDataForAllRooms, // ✅ CRITICAL: Include replyTo data
          },
          contact: {
            _id: contact._id,
            name: contact.name,
          },
        });

        // ✅ Prepare replyTo data for socket emission
        const replyToData = replyToMessage ? {
          _id: replyToId,
          content: replyToMessage.content,
          type: replyToMessage.type,
          attachments: replyToMessage.attachments || [],
        } : null;

        // ✅ Acknowledge to sender with full message data - status 'sent' initially
        const sentPayload = {
          messageId: message._id,
          message: {
            _id: message._id,
            conversationId: convId,
            content: messageContent,
            type: message.type,
            attachments: message.attachments || [],
            direction: 'inbound', // ✅ Visitor's own message is inbound (from visitor to agent)
            status: 'sent', // ✅ Start with 'sent', will update to 'delivered' when agent receives
            createdAt: message.createdAt,
            replyTo: replyToData,
          },
          timestamp: message.createdAt,
          status: 'sent',
        };
        socket.emit('message:sent', sentPayload);

        // ✅ Multi-tab sync: broadcast the visitor's own message to OTHER sockets
        // of the same session (other tabs/windows/browsers) so they see it in real-time.
        // Uses socket.to() which sends to all sockets in the room EXCEPT the sender.
        const webchatIdentifier = socket.data.webchatIdentifier || sessionId;
        socket.to(`webchat:${sessionId}`).emit('message:sent', sentPayload);
        if (webchatIdentifier !== sessionId) {
          socket.to(`webchat:${webchatIdentifier}`).emit('message:sent', sentPayload);
        }

        // ✅ Emit status update - start with 'sent'
        socket.emit('message:status', {
          messageId: message._id.toString(),
          status: 'sent',
          timestamp: new Date().toISOString(),
        });

        // ✅ Update status to 'delivered' after a short delay (simulating delivery to agent)
        // In real-time, this should happen when agent actually receives the message
        // For now, we'll update it immediately since webchat is instant
        setTimeout(() => {
          // ✅ Emit to ALL sockets of this session (sender + other tabs)
          webchatNamespace.to(`webchat:${sessionId}`).emit('message:status', {
            messageId: message._id.toString(),
            status: 'delivered',
            timestamp: new Date().toISOString(),
          });
        }, 100);

        console.log(`✅ WebChat message sent: ${message._id} from session ${sessionId}`);

      } catch (error) {
        console.error('❌ WebChat message error:', error);
        socket.emit('error', { message: 'Failed to send message', error: error.message });
      }
    });

    /**
     * ✅ Handle typing indicators
     */
    socket.on('typing:start', () => {
      if (session.conversationId) {
        socket.to(`conversation:${session.conversationId}`).emit('visitor:typing', {
          sessionId,
          contactId: session.contactId,
          isTyping: true,
          timestamp: new Date(),
        });
      }
    });

    socket.on('typing:stop', () => {
      if (session.conversationId) {
        socket.to(`conversation:${session.conversationId}`).emit('visitor:typing', {
          sessionId,
          contactId: session.contactId,
          isTyping: false,
          timestamp: new Date(),
        });
      }
    });

    /**
     * ✅ Handle read receipts
     */
    socket.on('read:mark', async (data) => {
      try {
        const { messageIds } = data;
        
        if (!session.conversationId || !messageIds?.length) return;

        // ✅ Update message read status
        await Message.updateMany(
          {
            _id: { $in: messageIds },
            conversation: session.conversationId,
            direction: 'outbound',
          },
          {
            $set: {
              status: 'read',
              readAt: new Date(),
            },
          }
        );

        // ✅ Emit status updates to visitor (for real-time UI update)
        messageIds.forEach(messageId => {
          socket.emit('message:status', {
            messageId: messageId.toString(),
            conversationId: session.conversationId,
            status: 'read',
            timestamp: new Date().toISOString(),
          });
        });

        // ✅ Emit to agents
        await SocketEmitter.emit(`conversation:${session.conversationId}`, 'message:read', {
          messageIds,
          sessionId,
          contactId: session.contactId,
          timestamp: new Date(),
        });

        // ✅ Emit status updates to agents (for real-time UI update)
        for (const messageId of messageIds) {
          await SocketEmitter.emit(`conversation:${session.conversationId}`, 'message:status', {
            messageId: messageId.toString(),
            conversationId: session.conversationId,
            status: 'read',
            timestamp: new Date().toISOString(),
          });
        }

      } catch (error) {
        console.error('❌ Read receipt error:', error);
      }
    });

    /**
     * ✅ Handle message delivered status from visitor
     */
    socket.on('message:delivered', async (data) => {
      try {
        const { messageId, conversationId: convId } = data;
        
        if (!convId || !messageId) return;

        // ✅ Update message status to 'delivered'
        await Message.findByIdAndUpdate(messageId, {
          status: 'delivered',
          deliveredAt: new Date(),
        });

        // ✅ Emit status update to agents
        await SocketEmitter.emit(`conversation:${convId}`, 'message:status', {
          messageId: messageId.toString(),
          conversationId: convId,
          status: 'delivered',
          timestamp: new Date().toISOString(),
        });

      } catch (error) {
        console.error('❌ Message delivered status error:', error);
      }
    });

    /**
     * ✅ Handle message reaction from visitor
     */
    socket.on('message:react', async (data) => {
      try {
        const { messageId, emoji } = data;
        
        if (!session.conversationId || !messageId) {
          socket.emit('error', { message: 'Conversation and message ID required' });
          return;
        }

        // ✅ Get message
        const message = await Message.findById(messageId);
        if (!message) {
          socket.emit('error', { message: 'Message not found' });
          return;
        }

        // ✅ Update message reactions
        // For webchat visitors, use 'contact' field, not 'user' field
        // ✅ CRITICAL: Check if user already has this emoji - if yes, toggle it off
        if (!message.reactions) {
          message.reactions = [];
        }
        
        const existingReactionIndex = message.reactions.findIndex(
          r => (r.user?.toString() === session.contactId.toString() || r.contact?.toString() === session.contactId.toString()) && r.emoji === emoji
        );
        
        let finalEmoji = emoji;
        if (emoji) {
          if (existingReactionIndex >= 0) {
            // User already has this emoji - toggle it off (remove)
            message.reactions.splice(existingReactionIndex, 1);
            finalEmoji = null; // Indicate removal
            console.log('✅ WebChat reaction toggled off (removed)');
          } else {
            // Remove any existing reaction from this contact first (only one reaction per user)
            message.reactions = message.reactions.filter(
              r => !(r.user?.toString() === session.contactId.toString() || r.contact?.toString() === session.contactId.toString())
            );
            
            // Add new reaction with contact field
            message.reactions.push({
              emoji: emoji,
              contact: session.contactId, // ✅ Use contact field for visitors
              createdAt: new Date()
            });
            console.log('✅ WebChat reaction added');
          }
          await message.save();
        } else {
          // Remove reaction (check both user and contact fields)
          await Message.findByIdAndUpdate(messageId, {
            $pull: { 
              'reactions': { 
                $or: [
                  { user: session.contactId },
                  { contact: session.contactId }
                ]
              } 
            }
          });
          finalEmoji = null;
          console.log('✅ WebChat reaction removed');
        }

        // ✅ Get contact info for socket event
        const contact = await Contact.findById(session.contactId).select('name').lean();
        const contactName = contact?.name || 'Visitor';

        // Get department for room emission
        const conv = await Conversation.findById(session.conversationId).select('department').lean();
        const deptId = conv?.department?.toString() || null;

        // Emit real-time reaction event to agents (conversation + department + tenant rooms)
        await SocketEmitter.emitMessageReaction(
          session.conversationId,
          messageId,
          finalEmoji,
          session.contactId,
          tenantId,
          null,
          contactName,
          deptId
        );

        // ✅ Also emit to visitor for confirmation
        socket.emit('message:reacted', {
          messageId,
          emoji: finalEmoji, // Use finalEmoji
          success: true
        });

        // ✅ CRITICAL: Emit message:reaction event to WebChat namespace so visitor sees their reaction in real-time
        const reactionData = {
          messageId,
          reaction: finalEmoji, // null if removed
          userId: session.contactId,
          userName: null, // null for contact
          contactName: contactName,
          timestamp: new Date().toISOString()
        };
        
        // Emit to WebChat namespace rooms
        const webchatIdentifier = session.sessionId || session.visitorId;
        const webchatRooms = [
          `webchat:${webchatIdentifier}`,
          `webchat:${session.sessionId}`,
          `conversation:${session.conversationId}`
        ];
        
        webchatRooms.forEach(room => {
          webchatNamespace.to(room).emit('message:reaction', reactionData);
        });
        
        console.log(`✅ WebChat reaction ${emoji ? 'added' : 'removed'}: ${messageId} by visitor ${session.contactId} - emitted to WebChat namespace`);

      } catch (error) {
        console.error('❌ WebChat reaction error:', error);
        socket.emit('error', { message: 'Failed to react to message', error: error.message });
      }
    });

    /**
     * ✅ Handle file upload
     */
    socket.on('file:upload', async (data) => {
      try {
        // File uploads are handled via HTTP API, this is just for progress tracking
        socket.emit('file:upload:progress', {
          fileId: data.fileId,
          progress: 100,
          status: 'complete',
        });

      } catch (error) {
        console.error('❌ File upload error:', error);
        socket.emit('file:upload:error', {
          fileId: data.fileId,
          error: error.message,
        });
      }
    });

    /**
     * ✅ Reconnection catch-up: deliver messages missed while visitor was offline
     * Client sends lastMessageTimestamp (or lastMessageId) and receives any newer messages.
     * This handles Point 3 (offline message delivery) and Point 7 (reconnection catch-up).
     */
    socket.on('messages:catchup', async (data) => {
      try {
        const convId = session.conversationId;
        if (!convId) {
          socket.emit('messages:catchup:response', { messages: [] });
          return;
        }

        const { lastMessageTimestamp, lastMessageId } = data || {};

        // Build query for messages newer than the last one the client has
        const query = {
          conversation: convId,
          direction: 'outbound', // Only catch up on agent/bot messages (visitor already has their own)
        };

        if (lastMessageTimestamp) {
          query.createdAt = { $gt: new Date(lastMessageTimestamp) };
        } else if (lastMessageId) {
          // Find the message to get its timestamp
          const lastMsg = await Message.findById(lastMessageId).select('createdAt').lean();
          if (lastMsg) {
            query.createdAt = { $gt: lastMsg.createdAt };
          }
        } else {
          // No reference point — only fetch messages from last 5 minutes
          query.createdAt = { $gt: new Date(Date.now() - 5 * 60 * 1000) };
        }

        const missedMessages = await Message.find(query)
          .sort({ createdAt: 1 })
          .limit(50)
          .lean();

        if (missedMessages.length > 0) {
          console.log(`✅ Delivering ${missedMessages.length} missed messages to visitor ${sessionId}`);
        }

        socket.emit('messages:catchup:response', {
          messages: missedMessages.map(msg => ({
            _id: msg._id,
            conversationId: convId,
            content: msg.content,
            type: msg.type || 'text',
            attachments: msg.attachments || [],
            direction: msg.direction,
            status: msg.status,
            createdAt: msg.createdAt,
            sender: msg.sender || { type: 'agent', name: 'Support Agent' },
            replyTo: msg.replyTo || null,
          })),
        });

        // Mark delivered messages as 'delivered' if they were 'sent'
        const sentMessageIds = missedMessages
          .filter(m => m.status === 'sent')
          .map(m => m._id);
        if (sentMessageIds.length > 0) {
          await Message.updateMany(
            { _id: { $in: sentMessageIds } },
            { $set: { status: 'delivered', deliveredAt: new Date() } }
          );
        }
      } catch (error) {
        console.error('❌ Messages catch-up error:', error);
        socket.emit('messages:catchup:response', { messages: [] });
      }
    });

    /**
     * ✅ Handle queue position request
     */
    socket.on('queue:position', async () => {
      try {
        // ✅ Get queue position based on department
        if (!departmentId) return;
        
        const department = await Department.findById(departmentId).populate('agents');
        
        if (!department) return;

        // ✅ Count active agents
        const activeAgents = department.agents?.filter(agent => agent.status === 'online') || [];
        
        // ✅ Get queue length
        const queueLength = await Conversation.countDocuments({
          department: departmentId,
          channel: 'webchat',
          status: 'active',
          assignedTo: null,
        });

        const position = queueLength + 1;
        const estimatedWait = activeAgents.length > 0 
          ? Math.ceil(position / activeAgents.length) * 2 // 2 minutes per agent
          : null;

        socket.emit('queue:status', {
          position,
          queueLength,
          activeAgents: activeAgents.length,
          estimatedWaitMinutes: estimatedWait,
        });

      } catch (error) {
        console.error('❌ Queue position error:', error);
      }
    });

    /**
     * ✅ Handle disconnect
     */
    socket.on('disconnect', async () => {
      console.log(`👤 WebChat visitor disconnected: ${sessionId}`);
      
      try {
        // ✅ Update session status
        await WebChatSession.findByIdAndUpdate(session._id, {
          status: 'disconnected',
          disconnectedAt: new Date(),
          lastActivityAt: new Date(),
        });

        // ✅ Emit offline status
        if (session.conversationId) {
          await SocketEmitter.emit(`conversation:${session.conversationId}`, 'visitor:offline', {
            sessionId,
            contactId: session.contactId,
            timestamp: new Date(),
          });
        }

      } catch (error) {
        console.error('❌ Disconnect handler error:', error);
      }
    });

    /**
     * ✅ Send agent status updates to visitor
     */
    // Listen for agent online/offline events
    socket.on('request:agent:status', async () => {
      try {
        if (!departmentId) return;
        
        const department = await Department.findById(departmentId).populate('agents');
        const activeAgents = department?.agents?.filter(agent => agent.status === 'online') || [];
        
        socket.emit('agent:status', {
          isOnline: activeAgents.length > 0,
          activeAgents: activeAgents.length,
          agentName: activeAgents[0]?.name || null,
        });

      } catch (error) {
        console.error('❌ Agent status error:', error);
      }
    });
  });

  console.log('✅ WebChat namespace initialized with enhanced features');
}

/**
 * ✅ Create conversation for WebChat session
 */
async function createConversation(session, tenantId, tenantDB, departmentId) {
  try {
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);

    // ✅ Get or create contact
    // First try to find by contactId or webchat identifier
    let contact = session.contactId 
      ? await Contact.findById(session.contactId)
      : await Contact.findOne({ 'identifiers.webchat': session.sessionId });
    
    // ✅ If not found and we have phone/email, try to find existing contact by phone/email
    // This prevents duplicate contacts when same person uses webchat and WhatsApp
    if (!contact && session.contactInfo) {
      const { normalizePhoneNumber, normalizeEmail } = await import('../../../utils/normalizers.js');
      const contactQuery = { $or: [] };
      
      // Search by phone if provided
      if (session.contactInfo.phone) {
        const normalizedPhone = normalizePhoneNumber(session.contactInfo.phone);
        const phoneWithoutPlus = normalizedPhone.replace(/^\+/, '');
        const phoneWith00 = phoneWithoutPlus ? `00${phoneWithoutPlus}` : null;
        
        contactQuery.$or.push(
          { phone: normalizedPhone },
          { phone: phoneWithoutPlus },
          { phone: session.contactInfo.phone },
          { normalizedPhone: normalizedPhone },
          { normalizedPhone: phoneWithoutPlus },
          { 'identifiers.whatsapp': normalizedPhone },
          { 'identifiers.whatsapp': phoneWithoutPlus },
          { 'identifiers.sms': normalizedPhone },
          { 'identifiers.sms': phoneWithoutPlus }
        );
        
        if (phoneWith00) {
          contactQuery.$or.push(
            { phone: phoneWith00 },
            { normalizedPhone: phoneWith00 },
            { 'identifiers.whatsapp': phoneWith00 },
            { 'identifiers.sms': phoneWith00 }
          );
        }
      }
      
      // Search by email if provided
      if (session.contactInfo.email) {
        const normalizedEmail = normalizeEmail(session.contactInfo.email);
        contactQuery.$or.push(
          { email: normalizedEmail },
          { email: session.contactInfo.email },
          { 'identifiers.email': normalizedEmail },
          { 'identifiers.email': session.contactInfo.email }
        );
      }
      
      // Only search if we have at least one search criteria
      if (contactQuery.$or.length > 0) {
        contact = await Contact.findOne(contactQuery);
        if (contact) {
          console.log(`✅ Found existing contact ${contact._id} by phone/email for webchat session ${session.sessionId}`);
          
          // Update contact with webchat info and ensure phone is normalized
          const updates = {};
          
          // Update webchat identifier if not set
          if (!contact.identifiers?.webchat) {
            updates['identifiers.webchat'] = session.sessionId;
          }
          
          // Ensure phone is normalized if we have phone info
          if (session.contactInfo.phone) {
            const normalizedPhone = normalizePhoneNumber(session.contactInfo.phone);
            if (!contact.normalizedPhone || contact.normalizedPhone !== normalizedPhone) {
              updates.normalizedPhone = normalizedPhone;
            }
            // Ensure phone field is set
            if (!contact.phone) {
              updates.phone = normalizedPhone;
            }
            // Update identifiers if not set
            if (!contact.identifiers?.whatsapp && !contact.identifiers?.sms) {
              updates['identifiers.whatsapp'] = normalizedPhone;
              updates['identifiers.sms'] = normalizedPhone;
            }
          }
          
          if (Object.keys(updates).length > 0) {
            await Contact.findByIdAndUpdate(contact._id, { $set: updates });
            console.log(`✅ Updated contact ${contact._id} with webchat info and normalized phone`);
          }
          
          // Reload contact to get updated fields
          contact = await Contact.findById(contact._id);
        }
      }
    }

    // ✅ Create new contact only if still not found
    if (!contact && session.contactInfo) {
      // ✅ Use provided name, or email/phone as fallback, or webchat identifier
      const contactName = session.contactInfo.name || 
                         session.contactInfo.email || 
                         session.contactInfo.phone || 
                         `WebChat ${session.sessionId.substring(0, 12)}`;
      contact = await Contact.create({
        name: contactName, // ✅ Use provided name or identifier as fallback
        displayName: contactName, // ✅ Also set displayName
        email: session.contactInfo.email,
        phone: session.contactInfo.phone,
        identifiers: { webchat: session.sessionId },
        channel: 'webchat',
        department: session.departmentId,
        Contact_Type: 'Customer',
      });
    }

    if (!contact) {
      throw new Error('Contact is required to create conversation');
    }

    // ✅ Check for existing active WebChat conversation for this contact + department
    // ✅ CRITICAL: Must match by contact + channel + department for segregation
    let conversation = await Conversation.findOne({
      contact: contact._id,
      channel: 'webchat',
      department: departmentId, // ✅ CRITICAL: Must match department for segregation
      status: 'active',
    }).sort({ lastMessageAt: -1 }); // Get most recent
    
    if (conversation) {
      console.log(`✅ Found existing WebChat conversation ${conversation._id} for contact ${contact._id} (session ${session.sessionId}) with department ${departmentId}`);
      
      // ✅ Even if conversation exists, check if it should be merged with other channels
      // This handles cases where webchat conversation exists but WhatsApp conversation was created later
      if (!contact.autoMergeDisabled) {
        try {
          const { findMergeableConversation, autoMergeConversation, canMergeContacts, mergeContacts } = await import('../../../services/conversation/MergeService.js');
          const mergeableConv = await findMergeableConversation(tenantId, conversation, contact);
          
          if (mergeableConv && mergeableConv._id.toString() !== conversation._id.toString()) {
            console.log('🔀 Auto-merging existing webchat conversation with other channel:', {
              webchatConversationId: conversation._id,
              primaryConversationId: mergeableConv._id,
              contact: contact._id,
              webchatChannel: 'webchat',
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
                    // Primary is older, merge webchat contact into primary's contact
                    mergedContact = await mergeContacts(tenantId, mergeableConv.contact, contact._id);
                    contact = mergedContact;
                  } else {
                    // Webchat conversation is older, merge primary's contact into webchat
                    mergedContact = await mergeContacts(tenantId, contact._id, mergeableConv.contact);
                    contact = mergedContact;
                  }
                }
              }
            }

            // Perform auto-merge
            await autoMergeConversation(
              tenantId,
              conversation._id,
              mergeableConv._id,
              'system' // System user for auto-merge
            );

            // Update conversation to use merged contact if changed
            if (mergedContact._id.toString() !== contact._id.toString()) {
              await Conversation.findByIdAndUpdate(conversation._id, {
                contact: mergedContact._id
              });
              contact = mergedContact;
            }

            // Use primary conversation
            const primaryConv = await Conversation.findById(mergeableConv._id);
            console.log('✅ Auto-merge completed for existing webchat conversation, using primary conversation:', primaryConv._id);

            return { id: primaryConv._id, isNew: false };
          }
        } catch (mergeError) {
          console.error('❌ Auto-merge failed for existing webchat conversation, continuing with current conversation:', mergeError);
          // Continue with existing conversation if merge fails
        }
      }

      return { id: conversation._id, isNew: false };
    }

    // ✅ Determine conversation mode based on department's AI bot enabled status
    const { getConversationModeForDepartment } = await import('../../../services/conversation/ConversationModeHelper.js');
    const conversationMode = await getConversationModeForDepartment({
      departmentId,
      tenantDB
    });

    // ✅ Create new conversation if none exists - separate conversation per department
    conversation = await Conversation.create({
      contact: contact._id,
      channel: 'webchat',
      channelAccount: session.channelAccountId,
      department: departmentId, // Single department per conversation
      status: 'active',
      mode: conversationMode, // ✅ Set mode based on department AI bot enabled status
      createdAt: new Date(),
      lastMessageAt: new Date(),
      messageCount: 0,
      unreadCount: 0,
    });

    console.log(`✨ Created new conversation ${conversation._id} for session ${session.sessionId}`);
    
    // ✅ Auto-merge check: If new conversation, check if we should auto-merge with existing conversation
    // This merges conversations with the same contact but different channels
    if (!contact.autoMergeDisabled) {
      try {
        const { findMergeableConversation, autoMergeConversation, canMergeContacts, mergeContacts } = await import('../../../services/conversation/MergeService.js');
        const mergeableConv = await findMergeableConversation(tenantId, conversation, contact);
        
        if (mergeableConv) {
          console.log('🔀 Auto-merging webchat conversation:', {
            newConversationId: conversation._id,
            primaryConversationId: mergeableConv._id,
            contact: contact._id,
            newChannel: 'webchat',
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
            console.log('⚠️ Auto-merge skipped for new webchat conversation:', mergeResult.error);
            // Continue with normal flow - don't merge but don't fail
            // The conversation will remain separate
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
            console.log('✅ Auto-merge completed for webchat, using primary conversation:', conversation._id);
            // ✅ Merged into existing primary — not a truly new conversation for the list
            return { id: conversation._id, isNew: false };
          }
        }
      } catch (mergeError) {
        console.error('❌ Auto-merge failed in webchat handler, continuing with new conversation:', mergeError);
        // Continue with new conversation if merge fails
      }
    }

    return { id: conversation._id, isNew: true };

  } catch (error) {
    console.error('❌ Failed to create conversation:', error);
    throw error;
  }
}
