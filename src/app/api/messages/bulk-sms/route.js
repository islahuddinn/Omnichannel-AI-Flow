// src/app/api/messages/bulk-sms/route.js
import { NextResponse } from 'next/server';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import ConversationSchema from '@/models/schemas/Conversation';
import ContactSchema from '@/models/schemas/Contact';
import MessageSchema from '@/models/schemas/Message';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import DepartmentSchema from '@/models/schemas/Department';
import WebChatSessionSchema from '@/models/schemas/WebChatSession';
import ChannelServiceFactory from '@/services/channel/ChannelServiceFactory';
import SocketEmitter from '@/services/socket/SocketEmitter';
import MessageLogService from '@/services/message/MessageLogService';
import mongoose from 'mongoose';
import crypto from 'crypto';

/**
 * POST /api/messages/bulk-sms
 * Send bulk SMS messages and create conversations
 */
export async function POST(request) {
  let tenantCtx;
  try {
    tenantCtx = await getTenantContext(request);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { channelAccountId, content, rcpts, contacts } = body;

    if (!channelAccountId || !content || !rcpts || !Array.isArray(rcpts) || rcpts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'channelAccountId, content, and rcpts array are required' },
        { status: 400 }
      );
    }

    // ✅ Validate recipient count limit
    const MAX_BULK_RECIPIENTS = 1000;
    if (rcpts.length > MAX_BULK_RECIPIENTS) {
      return NextResponse.json(
        { success: false, error: `Too many recipients: ${rcpts.length}. Maximum ${MAX_BULK_RECIPIENTS} per request.` },
        { status: 400 }
      );
    }

    // ✅ Validate contacts array matches rcpts
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'contacts array is required' },
        { status: 400 }
      );
    }

    const tenantDB = await getTenantDB(tenantCtx.tenantId);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    const WebChatSession = tenantDB.models.WebChatSession || tenantDB.model('WebChatSession', WebChatSessionSchema);

    // Get SMS account
    const channelAccount = await CompanyAccount.findById(channelAccountId);
    if (!channelAccount || channelAccount.type !== 'sms' || !channelAccount.isActive) {
      return NextResponse.json(
        { success: false, error: 'Invalid or inactive SMS account' },
        { status: 400 }
      );
    }

    // ✅ Determine department - prioritize channel account's department
    let department = null;
    // ✅ First priority: Use department from channel account
    if (channelAccount.departmentId) {
      department = channelAccount.departmentId;
    } else if (channelAccount.departmentIds && channelAccount.departmentIds.length > 0) {
      // ✅ Use first department from departmentIds array if available
      department = channelAccount.departmentIds[0];
    }
    // ✅ Second priority: Use user's department
    if (!department && tenantCtx.user?.departments?.[0]) {
      department = tenantCtx.user.departments[0];
    }
    // ✅ Third priority: Try to get default department
    if (!department) {
      const defaultDept = await Department.findOne({ isDefault: true }).lean();
      if (defaultDept) {
        department = defaultDept._id;
      } else {
        // ✅ Fourth priority: Try to get first available department
        const firstDept = await Department.findOne().lean();
        if (firstDept) {
          department = firstDept._id;
        }
      }
    }

    // ✅ If still no department, return error
    if (!department) {
      return NextResponse.json(
        { success: false, error: 'No department available. Please assign a department to the SMS account or create a default department.' },
        { status: 400 }
      );
    }

    // ✅ Send bulk SMS using SMSAdapter
    const result = await ChannelServiceFactory.sendMessage(
      'sms',
      channelAccount,
      {
        content: { text: content },
        rcpts: rcpts, // Array of numeric phone numbers
      },
      {
        tenantId: tenantCtx.tenantId,
        emitStatus: false, // We'll handle status emission after creating conversations
      }
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to send bulk SMS' },
        { status: 500 }
      );
    }

    // ✅ Extract message IDs from result
    // For bulk SMS, messageIds is an array of UUIDs from the accepted array
    const messageIds = result.messageIds || (result.messageId ? [result.messageId] : []);
    
    // ✅ Create a map of recipient number to UUID(s) from the accepted array
    // The accepted array format: [{ r: recipient_number, i: [uuid1, uuid2, ...] }, ...]
    // Check both metadata.accepted and providerResponse.accepted
    const recipientToUuidMap = new Map();
    const acceptedArray = result.metadata?.accepted || result.providerResponse?.accepted;
    
    if (acceptedArray && Array.isArray(acceptedArray)) {
      acceptedArray.forEach(acceptedItem => {
        if (acceptedItem.r && acceptedItem.i && Array.isArray(acceptedItem.i) && acceptedItem.i.length > 0) {
          // Store the first UUID for each recipient (usually there's only one)
          // Try both numeric string and numeric number as keys
          const recipientKey = acceptedItem.r.toString();
          recipientToUuidMap.set(recipientKey, acceptedItem.i[0]);
          // Also try without leading zeros if any
          const numericKey = parseInt(recipientKey, 10).toString();
          if (numericKey !== recipientKey) {
            recipientToUuidMap.set(numericKey, acceptedItem.i[0]);
          }
        }
      });
    }
    
    // ✅ Also create a map from contact phone to index for quick lookup
    const phoneToContactIndexMap = new Map();
    contacts.forEach((contactData, index) => {
      const normalizedPhone = contactData.phone.replace(/[^0-9]/g, '');
      phoneToContactIndexMap.set(normalizedPhone, index);
    });

    const successCount = messageIds.length;

    // ✅ Create conversations and messages for each recipient
    const conversationsCreated = [];
    const errors = [];

    for (let i = 0; i < contacts.length; i++) {
      const contactData = contacts[i];
      const phoneNumber = contactData.phone;
      const contactName = contactData.name || 'Unknown';
      const contactId = contactData.contactId;
      
      // ✅ Normalize phone number properly - ensure it always has + prefix
      const { normalizePhoneNumber } = await import('@/utils/normalizers');
      let normalizedPhone = normalizePhoneNumber(phoneNumber);
      // ✅ Ensure normalizedPhone always has + prefix
      if (!normalizedPhone.startsWith('+')) {
        normalizedPhone = '+' + normalizedPhone.replace(/^\+/, '');
      }
      const phoneWithoutPlus = normalizedPhone.replace(/^\+/, '');
      const phoneWith00 = phoneWithoutPlus ? `00${phoneWithoutPlus}` : null;
      const numericPhone = phoneWithoutPlus.replace(/\D/g, '');
      
      // ✅ Get UUID for this recipient from the map
      const providerMessageId = recipientToUuidMap.get(numericPhone.toString()) || 
                                recipientToUuidMap.get(phoneWithoutPlus) ||
                                recipientToUuidMap.get(normalizedPhone) ||
                                messageIds[i] || 
                                null;

      try {
        // ✅ Find or create contact
        let contact;
        if (contactId && mongoose.Types.ObjectId.isValid(contactId)) {
          contact = await Contact.findById(contactId);
        }

        if (!contact) {
          // ✅ FIX: Use a focused set of phone variations (not 30+ conditions)
          // Key variations: normalized (+prefix), without plus, with 00 prefix
          const phoneVariations = [
            normalizedPhone,
            phoneWithoutPlus,
            phoneWith00,
            phoneNumber, // Original format
          ].filter(Boolean);

          // Remove duplicates
          const uniqueVariations = [...new Set(phoneVariations)];

          // ✅ Optimized query: check only essential phone fields
          const contactQuery = {
            $or: uniqueVariations.flatMap(phoneVar => [
              { phone: phoneVar },
              { normalizedPhone: phoneVar },
              { 'identifiers.sms': phoneVar },
              { 'identifiers.whatsapp': phoneVar },
            ])
          };

          contact = await Contact.findOne(contactQuery);

          if (contact) {
            // ✅ Update contact if phone/normalizedPhone/identifiers don't have + prefix
            const updates = {};
            if (contact.phone && !contact.phone.startsWith('+')) {
              updates.phone = normalizedPhone;
            }
            if (!contact.normalizedPhone || !contact.normalizedPhone.startsWith('+')) {
              updates.normalizedPhone = normalizedPhone;
            }
            if (!contact.identifiers?.sms || !contact.identifiers.sms.startsWith('+')) {
              updates['identifiers.sms'] = normalizedPhone;
            }

            if (Object.keys(updates).length > 0) {
              await Contact.findByIdAndUpdate(contact._id, { $set: updates });
              contact = await Contact.findById(contact._id);
            }
          }
        }

        if (!contact) {
          // ✅ CRITICAL: Ensure normalizedPhone has + prefix before storing
          const phoneToStore = normalizedPhone.startsWith('+') ? normalizedPhone : '+' + normalizedPhone;
          
          console.log(`✨ [Bulk SMS] Creating new contact:`, {
            originalPhone: phoneNumber,
            normalizedPhone: phoneToStore,
            contactName: contactName
          });
          
          // ✅ Create new contact with normalized phone and identifiers
          // ALWAYS store with + prefix for consistency
          // ✅ Use provided contactName, or phone number as name if no name provided
          const finalContactName = (contactName && contactName !== 'Manual Entry') 
            ? contactName 
            : phoneToStore; // ✅ Use phone number as name if no name provided
          contact = await Contact.create({
            name: finalContactName, // ✅ Use provided name or phone number
            displayName: finalContactName, // ✅ Also set displayName
            phone: phoneToStore, // ✅ ALWAYS store normalized phone with + prefix
            normalizedPhone: phoneToStore, // ✅ ALWAYS store normalized phone with + prefix
            identifiers: {
              sms: phoneToStore, // ✅ ALWAYS store normalized format with + prefix
              whatsapp: phoneToStore, // ✅ ALWAYS store in WhatsApp identifier with + prefix
            },
            channel: 'sms',
            tenantId: tenantCtx.tenantId,
            Contact_Type: 'Customer',
          });
          
          console.log(`✅ [Bulk SMS] Created new contact: ${contact._id}`, {
            storedPhone: contact.phone,
            storedNormalizedPhone: contact.normalizedPhone,
            storedIdentifiers: contact.identifiers
          });
          
          // ✅ Generate WebChat link for new contact
          try {
            const webchatAccount = await CompanyAccount.findOne({
              type: 'webchat',
              isActive: true
            }).lean();
            
            if (webchatAccount) {
              const linkId = crypto.randomBytes(16).toString('hex');
              // ✅ Use dynamic URL helper for port flexibility
              const { getAppUrl } = await import('@/lib/utils.js');
              const contactLink = `${getAppUrl()}/webchat/${linkId}`;
              
              // Get department for webchat session
              const webchatDepartmentId = department || webchatAccount.departmentId || (webchatAccount.departmentIds && webchatAccount.departmentIds[0]);
              
              if (webchatDepartmentId) {
                await WebChatSession.create({
                  sessionId: linkId,
                  visitorId: `visitor_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
                  widgetId: webchatAccount.identifier || webchatAccount._id.toString(),
                  channelAccountId: webchatAccount._id,
                  departmentId: webchatDepartmentId,
                  contactId: contact._id,
                  contactLink,
                  pinHash: null,
                  status: 'pending_auth',
                  isAuthenticated: false,
                  isFirstTime: false,
                  createdAt: new Date(),
                  lastActivityAt: new Date(),
                  metadata: {
                    tenantId: tenantCtx.tenantId,
                  },
                });
                
                // Update contact with webchat link
                contact.webchatLink = contactLink;
                contact.identifiers = contact.identifiers || {};
                contact.identifiers.webchat = linkId;
                await contact.save();
                
                console.log(`✅ Created WebChat link for contact ${contact._id}: ${contactLink}`);
              } else {
                console.log('⚠️ No department found for WebChat link generation');
              }
            } else {
              console.log('⚠️ No WebChat account found, skipping link generation');
            }
          } catch (webchatError) {
            console.error('⚠️ Failed to create WebChat link for contact:', webchatError);
            // Don't fail the entire operation if webchat link creation fails
          }
        }

        // ✅ Find or create conversation - MUST match by contact + channel + department
        // Use contact's department if available, otherwise use the determined department
        let conversationDepartment = contact.department || department;
        
        let conversation = await Conversation.findOne({
          contact: contact._id,
          channel: 'sms',
          channelAccount: channelAccountId,
          department: conversationDepartment, // ✅ CRITICAL: Must match department for segregation
          primaryConversation: null, // Not merged
        });

        const isNewConversation = !conversation;

        if (!conversation) {
          // ✅ Determine conversation mode based on department's AI bot enabled status
          const { getConversationModeForDepartment } = await import('@/services/conversation/ConversationModeHelper.js');
          const conversationMode = await getConversationModeForDepartment({
            departmentId: conversationDepartment,
            tenantDB
          });
          
          conversation = await Conversation.create({
            contact: contact._id,
            channelAccount: channelAccountId,
            channel: 'sms',
            department: conversationDepartment, // Single department per conversation
            status: 'active',
            mode: conversationMode, // ✅ Set mode based on department AI bot enabled status
            lastMessageAt: new Date(),
            messageCount: 0,
            unreadCount: 0,
            createdAt: new Date(),
          });
        }

        // ✅ Get final department for message
        const messageDepartmentId = conversation.department || department;

        // ✅ Create message with departmentId
        const message = await Message.create({
          conversation: conversation._id,
          contact: contact._id,
          channelAccount: channelAccountId,
          channel: 'sms',
          departmentId: messageDepartmentId, // ✅ CRITICAL: Store department ID for message segregation
          type: 'text',
          content: content,
          direction: 'outbound',
          status: providerMessageId ? 'sent' : 'pending', // ✅ FIX: Only 'sent' if we have a provider ID
          providerMessageId: providerMessageId,
          metadata: {
            ...(providerMessageId && { eurosmsUuid: providerMessageId }),
            bulkSms: true,
          },
          createdAt: new Date(),
        });

        // ✅ Log message creation
        try {
          await MessageLogService.logMessageCreated(tenantCtx.tenantId, message, {
            channelType: 'sms',
            channelAccountId: channelAccountId.toString(),
            providerMessageId: providerMessageId,
          });
        } catch (logError) {
          console.error('⚠️ Failed to log bulk SMS message:', logError);
        }

        // ✅ Update conversation
        await Conversation.findByIdAndUpdate(conversation._id, {
          lastMessage: message._id,
          lastMessageAt: new Date(),
          lastMessageContent: content,
          lastMessageType: 'text',
          lastMessageDirection: 'outbound',
          $inc: { messageCount: 1 },
        });

        // ✅ Fetch updated conversation with populated fields
        const updatedConversation = await Conversation.findById(conversation._id)
          .populate('contact', 'name displayName phone email avatar identifiers')
          .populate('channelAccount', 'type name')
          .populate('department', 'name')
          .populate('assignedTo', 'firstName lastName email')
          .lean();

        // ✅ Prepare contact data for socket emission
        const contactDataForEmission = {
          _id: contact._id,
          name: contact.name || contact.displayName || null,
          displayName: contact.displayName || contact.name || null,
          phone: contact.phone || null,
          email: contact.email || null,
          avatar: contact.avatar || null,
          identifiers: contact.identifiers || {},
        };

        // ✅ Emit new conversation event if it's a new conversation
        if (isNewConversation) {
          const conversationData = {
            _id: updatedConversation._id,
            contact: contactDataForEmission,
            contactData: contactDataForEmission,
            channelAccount: updatedConversation.channelAccount ? {
              _id: updatedConversation.channelAccount._id,
              type: updatedConversation.channelAccount.type,
              name: updatedConversation.channelAccount.name,
            } : null,
            channel: 'sms',
            department: updatedConversation.department || null,
            assignedTo: updatedConversation.assignedTo || null,
            status: 'active',
            lastMessage: message._id,
            lastMessageAt: new Date(),
            lastMessageContent: content,
            lastMessageType: 'text',
            lastMessageDirection: 'outbound',
            messageCount: 1,
            unreadCount: 0,
            createdAt: updatedConversation.createdAt,
            updatedAt: updatedConversation.updatedAt || new Date(),
            isPinned: false,
            isMerged: false,
            mode: 'auto',
            priority: 'normal',
          };

          await SocketEmitter.emitNewConversation(tenantCtx.tenantId, conversationData, {
            _id: message._id,
            content: content,
            type: 'text',
            direction: 'outbound',
            status: message.status, // ✅ FIX: Use actual message status
            createdAt: message.createdAt,
          }, contactDataForEmission, conversation.department || department);
        } else {
          // ✅ CRITICAL: For company admin unified view, find all grouped conversations
          let allGroupedConversationIds = null;
          if (conversation?.contact && conversation?.channel) {
            const contactId = conversation.contact?.toString() || conversation.contact;
            const channel = conversation.channel;
            
            const allDepartmentConversations = await Conversation.find({
              contact: contactId,
              channel: channel,
              status: { $in: ['active', 'open', 'pending'] },
              primaryConversation: { $exists: false }
            })
              .select('_id')
              .lean();
            
            if (allDepartmentConversations.length > 1) {
              allGroupedConversationIds = allDepartmentConversations.map(c => c._id);
            }
          }
          
          // ✅ Emit conversation update for existing conversations
          await SocketEmitter.emitConversationUpdate(conversation._id, {
            lastMessage: message._id,
            lastMessageAt: new Date(),
            lastMessageContent: content,
            lastMessageType: 'text',
            lastMessageDirection: 'outbound',
            messageCount: (updatedConversation?.messageCount || 0) + 1,
          }, tenantCtx.tenantId, conversation.department || department, allGroupedConversationIds);
        }

        // ✅ Emit new message event
        await SocketEmitter.emit(`conversation:${conversation._id}`, 'message:new', {
          message: {
            _id: message._id,
            conversationId: conversation._id,
            contactId: contact._id,
            contact: contactDataForEmission,
            channel: 'sms',
            channelAccount: {
              _id: channelAccountId,
              type: 'sms',
              name: channelAccount.name,
            },
            type: 'text',
            content: content,
            direction: 'outbound',
            status: message.status, // ✅ FIX: Use actual message status, not hardcoded 'sent'
            createdAt: message.createdAt,
          },
          conversationId: conversation._id.toString(),
          tenantId: tenantCtx.tenantId,
        });

        conversationsCreated.push({
          conversationId: conversation._id,
          contactId: contact._id,
          phone: phoneNumber,
          messageId: message._id,
        });
      } catch (error) {
        console.error(`❌ Error creating conversation for ${phoneNumber}:`, error);
        errors.push({
          phone: phoneNumber,
          error: error.message,
        });
      }
    }

    // ✅ FIX: Report partial success/failure accurately
    const totalRecipients = contacts.length;
    const failedCount = errors.length;
    const hasPartialFailure = failedCount > 0 && conversationsCreated.length > 0;
    const hasCompleteFailure = failedCount === totalRecipients && conversationsCreated.length === 0;

    // ✅ Include wrong numbers from provider response
    const wrongNumbers = result.wrongNumbers || [];

    return NextResponse.json({
      success: !hasCompleteFailure, // false only if ALL recipients failed
      data: {
        successCount: conversationsCreated.length,
        totalRecipients,
        conversationsCreated: conversationsCreated.length,
        conversations: conversationsCreated,
        errors: errors,
        wrongNumbers: wrongNumbers,
        messageIds: messageIds,
        ...(hasPartialFailure && {
          warning: `${failedCount} of ${totalRecipients} recipients failed`
        }),
      },
    }, { status: hasCompleteFailure ? 500 : 200 });
  } catch (error) {
    console.error('❌ Error in bulk SMS:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to send bulk SMS' },
      { status: 500 }
    );
  }
}

