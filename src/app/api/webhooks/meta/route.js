
// // src/app/api/webhooks/meta/route.js
// import { NextResponse } from 'next/server';
// import { enqueueWebhook } from '@/services/queue/messageQueue';
// import { getMasterDB } from '@/config/database';
// import crypto from 'crypto';

// /**
//  * GET - Webhook Verification (Meta requirement)
//  */
// export async function GET(request) {
//   const { searchParams } = new URL(request.url);
  
//   const mode = searchParams.get('hub.mode');
//   const token = searchParams.get('hub.verify_token');
//   const challenge = searchParams.get('hub.challenge');

//   const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

//   console.log('🔍 Webhook Verification:', {
//     mode,
//     token,
//     challenge,
//     expectedToken: VERIFY_TOKEN
//   });

//   if (mode === 'subscribe' && token === VERIFY_TOKEN) {
//     console.log('✅ Meta webhook verified');
//     return new NextResponse(challenge, { status: 200 });
//   }

//   console.log('❌ Meta webhook verification failed');
//   return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
// }

// /**
//  * POST - Receive Webhook Events
//  */
// export async function POST(request) {
//   try {
//     const signature = request.headers.get('x-hub-signature-256');
//     const body = await request.text();
//     const payload = JSON.parse(body);

//     console.log('📥 Meta webhook received:', {
//       object: payload.object,
//       entryCount: payload.entry?.length
//     });

//     // Extract basic info to resolve tenant
//     const channelType = determineChannelType(payload);
//     const identifier = extractIdentifier(payload);

//     if (!identifier) {
//       console.log('⚠️ No identifier found in webhook');
//       return NextResponse.json({ status: 'ok' }, { status: 200 });
//     }

//     // Resolve tenant from identifier
//     const tenantData = await resolveTenantFromIdentifier(identifier, channelType);

//     if (!tenantData) {
//       console.log('⚠️ Tenant not found for identifier:', identifier);
//       return NextResponse.json({ status: 'ok' }, { status: 200 });
//     }

//     // Validate webhook signature
//     const isValid = await validateMetaSignature(signature, body, tenantData.appSecret);
    
//     if (!isValid) {
//       console.log('❌ Invalid webhook signature');
//       return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
//     }

//     // Enqueue webhook for processing
//     await enqueueWebhook({
//       channelType,
//       channelAccountId: tenantData.accountId,
//       tenantId: tenantData.tenantId,
//       identifier,
//       rawPayload: payload,
//       receivedAt: new Date().toISOString(),
//     });

//     console.log('✅ Meta webhook queued for processing');

//     // Return 200 OK immediately (Meta requires quick response)
//     return NextResponse.json({ status: 'ok' }, { status: 200 });

//   } catch (error) {
//     console.error('❌ Meta webhook error:', error);
    
//     // Still return 200 to prevent Meta from retrying
//     return NextResponse.json({ status: 'error' }, { status: 200 });
//   }
// }

// /**
//  * Determine channel type from payload
//  */
// function determineChannelType(payload) {
//   const entry = payload.entry?.[0];
//   const changes = entry?.changes?.[0];
  
//   // WhatsApp has messages/statuses in changes.value
//   if (changes?.value?.messages || changes?.value?.statuses) {
//     return 'whatsapp';
//   }

//   // Facebook has messaging in entry
//   if (entry?.messaging) {
//     const messaging = entry.messaging[0];
//     // Instagram recipient IDs start with 'ig_'
//     if (messaging?.recipient?.id?.startsWith('ig_')) {
//       return 'instagram';
//     }
//     return 'facebook';
//   }

//   return 'unknown';
// }

// /**
//  * Extract identifier from webhook payload
//  */
// function extractIdentifier(payload) {
//   try {
//     const entry = payload.entry?.[0];
//     const changes = entry?.changes?.[0];
//     const value = changes?.value;

//     // WhatsApp - use phone number ID
//     if (value?.metadata?.phone_number_id) {
//       return value.metadata.phone_number_id;
//     }

//     // Facebook/Instagram - use page ID
//     if (entry?.id) {
//       return entry.id;
//     }

//     return null;
//   } catch (error) {
//     console.error('Failed to extract identifier:', error);
//     return null;
//   }
// }

// /**
//  * Resolve tenant from identifier using your database
//  */
// async function resolveTenantFromIdentifier(identifier, channelType) {
//   try {
//     // Get master database connection
//     const masterDB = await getMasterDB();
    
//     // Query your CompanyAccount collection to find the tenant
//     // This assumes you have a CompanyAccount model in your master DB
//     const CompanyAccount = masterDB.model('CompanyAccount');
    
//     const account = await CompanyAccount.findOne({
//       $or: [
//         { 'credentials.phoneNumberId': identifier },
//         { 'credentials.pageId': identifier },
//         { 'credentials.instagramBusinessAccountId': identifier }
//       ]
//     }).populate('companyId');

//     if (!account) {
//       console.log(`No account found for identifier: ${identifier}`);
//       return null;
//     }

//     return {
//       tenantId: account.companyId.tenantId,
//       accountId: account._id.toString(),
//       appSecret: account.credentials.appSecret,
//     };

//   } catch (error) {
//     console.error('Failed to resolve tenant from identifier:', error);
//     return null;
//   }
// }

// /**
//  * Validate Meta webhook signature
//  */
// async function validateMetaSignature(signature, body, appSecret) {
//   try {
//     if (!signature || !appSecret) {
//       return false;
//     }

//     const expectedSignature = crypto
//       .createHmac('sha256', appSecret)
//       .update(body)
//       .digest('hex');

//     const providedSignature = signature.replace('sha256=', '');

//     return crypto.timingSafeEqual(
//       Buffer.from(expectedSignature),
//       Buffer.from(providedSignature)
//     );

//   } catch (error) {
//     console.error('Signature validation failed:', error);
//     return false;
//   }
// }













// src/app/api/webhooks/meta/route.js

import { NextResponse } from 'next/server';
import { getRedisClient } from '@/config/redis.js';
import { getTenantDB } from '@/config/database';
// ✅ BullMQ removed - webhook processing uses RabbitMQ via webhookWorker
import SocketEmitter from '@/services/socket/SocketEmitter.js';
import WhatsAppAdapter from '@/services/channel/adapters/WhatsAppAdapter.js';
import MessageSchema from '@/models/schemas/Message.js';
import ConversationSchema from '@/models/schemas/Conversation.js';
import ContactSchema from '@/models/schemas/Contact.js';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount.js';

/**
 * GET /api/webhooks/meta
 * Webhook verification
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
      return NextResponse.json(challenge, { status: 200 });
    }

    return NextResponse.json(
      { error: 'Webhook verification failed' },
      { status: 403 }
    );
  } catch (error) {
    console.error('Webhook verification error:', error);
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/webhooks/meta
 * Handle incoming WhatsApp/Facebook messages
 */
export async function POST(request) {
  try {
    const body = await request.json();

    console.log('📨 Webhook received:', JSON.stringify(body, null, 2));

    // Verify webhook signature
    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
      console.warn('⚠️ Missing webhook signature');
      return NextResponse.json({ received: true });
    }

    // Process each entry
    const entry = body.entry?.[0];
    if (!entry) {
      return NextResponse.json({ received: true });
    }

    const changes = entry.changes?.[0];
    if (!changes) {
      return NextResponse.json({ received: true });
    }

    const value = changes.value;
    const phoneNumberId = value.metadata?.phone_number_id;

    // Find tenant and company account via Redis
    const redis = await getRedisClient();
    const redisKey = `channel:whatsapp:${phoneNumberId}`;
    const cachedTenantId = await redis?.get(redisKey);

    let tenantId = cachedTenantId;

    if (!tenantId) {
      // Fallback to database lookup
      const omniMaster = await getTenantDB('omni_master');
      const CompanyAccount = omniMaster.model(
        'CompanyAccount',
        CompanyAccountSchema
      );

      const account = await CompanyAccount.findOne({
        'credentials.phoneNumberId': phoneNumberId,
      });

      if (!account) {
        console.error('Company account not found for phone:', phoneNumberId);
        return NextResponse.json({ received: true });
      }

      tenantId = account.tenantId;

      // Cache for 24 hours
      await redis?.setex(redisKey, 86400, tenantId);
    }

    console.log(`🔍 Processing for tenant: ${tenantId}`);

    // Handle incoming messages
    if (value.messages && value.messages.length > 0) {
      for (const msg of value.messages) {
        await handleIncomingMessage(msg, value, tenantId, phoneNumberId);
      }
    }

    // Handle status updates
    if (value.statuses && value.statuses.length > 0) {
      for (const status of value.statuses) {
        await handleStatusUpdate(status, tenantId, phoneNumberId);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { received: true, error: error.message },
      { status: 200 }
    );
  }
}

/**
 * Handle incoming message
 */
async function handleIncomingMessage(msg, value, tenantId, phoneNumberId) {
  try {
    const tenantDB = await getTenantDB(tenantId);
    const Message = tenantDB.model('Message', MessageSchema);
    const Conversation = tenantDB.model('Conversation', ConversationSchema);
    const Contact = tenantDB.model('Contact', ContactSchema);

    const fromPhone = value.contacts?.[0]?.wa_id;
    const senderName = value.contacts?.[0]?.profile?.name;

    if (!fromPhone) {
      console.error('No sender phone found');
      return;
    }

    console.log(`📱 Incoming message from: ${fromPhone}`);

    // ✅ Normalize phone number for consistent matching
    const { normalizePhoneNumber } = await import('@/utils/normalizers');
    const normalizedPhone = normalizePhoneNumber(fromPhone);
    const phoneWithoutPlus = normalizedPhone.replace(/^\+/, '');

    // ✅ Find existing contact by multiple criteria to prevent duplicates
    // Check: phone (with +), phone (without +), normalizedPhone, identifiers.whatsapp, identifiers.sms
    let contact = await Contact.findOne({
      $or: [
        { phone: normalizedPhone },
        { phone: phoneWithoutPlus },
        { phone: fromPhone }, // Original format
        { normalizedPhone: normalizedPhone },
        { normalizedPhone: phoneWithoutPlus },
        { normalizedPhone: fromPhone },
        { 'identifiers.whatsapp': fromPhone },
        { 'identifiers.whatsapp': normalizedPhone },
        { 'identifiers.whatsapp': phoneWithoutPlus },
        { 'identifiers.sms': fromPhone },
        { 'identifiers.sms': normalizedPhone },
        { 'identifiers.sms': phoneWithoutPlus },
      ]
    });

    let contactWasJustCreated = false;

    if (!contact) {
      // ✅ Create new contact with normalized phone and identifiers
      contact = new Contact({
        phone: normalizedPhone, // Store normalized phone with + prefix
        normalizedPhone: normalizedPhone,
        identifiers: {
          whatsapp: normalizedPhone, // Store normalized format with + prefix
          sms: normalizedPhone, // Also store in SMS identifier with + prefix
        },
        name: senderName || 'Unknown',
        channel: 'whatsapp',
        tenantId: tenantId, // ✅ Include tenantId for webchat link generation
        Contact_Type: 'Customer',
      });
      await contact.save();
      contactWasJustCreated = true;
      console.log(`✅ Contact created: ${contact._id} with phone: ${normalizedPhone}`);
      
      // ✅ Generate WebChat link for newly created contact (async, non-blocking)
      // Use IIFE to run async without blocking the main flow
      (async () => {
        try {
          // Reload contact to ensure it has all fields including _id and tenantId
          const savedContact = await Contact.findById(contact._id).lean();
          if (savedContact) {
            console.log(`🔄 Generating WebChat link for contact ${savedContact._id}...`);
            const { generateWebChatLinkForContact } = await import('@/services/contact/ContactService.js');
            await generateWebChatLinkForContact(savedContact, tenantDB);
            console.log(`✅ WebChat link generation completed for contact ${savedContact._id}`);
          } else {
            console.warn(`⚠️ Contact ${contact._id} not found after save, skipping webchat link generation`);
          }
        } catch (webchatError) {
          console.error('⚠️ Failed to create WebChat link for contact:', webchatError);
          console.error('⚠️ Error details:', webchatError.stack || webchatError.message);
          // Don't throw - webchat link creation is optional
        }
      })().catch(error => {
        console.error('⚠️ Error in webchat link generation promise:', error);
        console.error('⚠️ Error stack:', error.stack);
      });
    } else {
      // ✅ Update existing contact if needed
      const updates = {};
      
      // Update phone if not set or different
      if (!contact.phone || contact.phone !== normalizedPhone) {
        updates.phone = normalizedPhone;
      }
      
      // Update normalizedPhone if not set
      if (!contact.normalizedPhone) {
        updates.normalizedPhone = normalizedPhone;
      }
      
      // Update identifiers if not set
      if (!contact.identifiers) {
        contact.identifiers = {};
      }
      if (!contact.identifiers.whatsapp) {
        updates['identifiers.whatsapp'] = fromPhone;
      }
      if (!contact.identifiers.sms) {
        updates['identifiers.sms'] = fromPhone;
      }
      
      // ✅ Only set name if contact has NO meaningful name yet (never overwrite existing names)
      const hasNoName = !contact.name || contact.name === 'Unknown' || contact.name === fromPhone || contact.name === normalizedPhone;
      if (senderName && hasNoName) {
        updates.name = senderName;
      }
      
      if (Object.keys(updates).length > 0) {
        await Contact.findByIdAndUpdate(contact._id, { $set: updates });
        console.log(`✅ Updated existing contact ${contact._id} with missing fields`);
      } else {
        console.log(`✅ Found existing contact: ${contact._id}`);
      }
    }

    // Find or create conversation
    let conversation = await Conversation.findOne({
      contactId: contact._id,
      channel: 'whatsapp',
    }).populate('contact');

    if (!conversation) {
      conversation = new Conversation({
        contactId: contact._id,
        contact: contact._id,
        channel: 'whatsapp',
        phoneNumberId,
        mode: 'auto',
        isArchived: false,
        isPinned: false,
      });
      await conversation.save();
      console.log(`✅ Conversation created: ${conversation._id}`);

      // Emit new conversation
      await SocketEmitter.emitConversationCreated(
        conversation.toObject(),
        tenantId
      );
    }

    // Determine message type and content
    let messageType = 'text';
    let content = {};

    if (msg.type === 'text') {
      messageType = 'text';
      content = { text: msg.text.body };
    } else if (msg.type === 'image') {
      messageType = 'image';
      content = {
        url: msg.image.link || msg.image.url,
        caption: msg.image.caption,
      };
    } else if (msg.type === 'video') {
      messageType = 'video';
      content = {
        url: msg.video.link || msg.video.url,
        caption: msg.video.caption,
      };
    } else if (msg.type === 'audio') {
      messageType = 'audio';
      content = { url: msg.audio.link || msg.audio.url };
    } else if (msg.type === 'document') {
      messageType = 'document';
      content = {
        url: msg.document.link || msg.document.url,
        filename: msg.document.filename,
      };
    } else if (msg.type === 'location') {
      messageType = 'location';
      content = {
        latitude: msg.location.latitude,
        longitude: msg.location.longitude,
        address: msg.location.name,
      };
    }

    // ✅ CRITICAL: Handle reply context from WhatsApp
    // According to Meta WhatsApp API docs, reply context is in msg.context.id (not message_id)
    // Log the full message structure for debugging
    console.log('🔍 Checking for reply context in incoming message:', {
      messageId: msg.id,
      messageType: msg.type,
      hasContext: !!msg.context,
      context: msg.context,
      contextId: msg.context?.id,
      contextMessageId: msg.context?.message_id, // Some versions might use this
      fullMessage: JSON.stringify(msg, null, 2)
    });

    let replyToMessageId = null;
    // ✅ CRITICAL: Meta WhatsApp API uses context.id for reply message ID
    // Check both context.id and context.message_id for compatibility
    const contextMessageId = msg.context?.id || msg.context?.message_id;
    if (contextMessageId) {
      console.log('📎 Reply context found, searching for message:', {
        contextMessageId,
        conversationId: conversation._id.toString()
      });

      try {
        // ✅ CRITICAL: Search for the message across all conversations (important for merged conversations)
        // The replied-to message might be in a different conversation if conversations were merged
        const repliedToMessage = await Message.findOne({
          $or: [
            { providerMessageId: contextMessageId },
            { whatsappMessageId: contextMessageId },
            { externalId: contextMessageId }
          ],
          // ✅ Also ensure it's from the same tenant
          channel: 'whatsapp'
        }).select('_id conversation').lean();
        
        if (repliedToMessage) {
          replyToMessageId = repliedToMessage._id;
          console.log('✅ Found reply context message:', {
            contextMessageId,
            replyToMessageId: replyToMessageId.toString(),
            originalConversationId: repliedToMessage.conversation?.toString(),
            currentConversationId: conversation._id.toString(),
            isSameConversation: repliedToMessage.conversation?.toString() === conversation._id.toString()
          });
        } else {
          // ✅ Try searching without channel filter (in case message type is different)
          const fallbackMessage = await Message.findOne({
            $or: [
              { providerMessageId: contextMessageId },
              { whatsappMessageId: contextMessageId },
              { externalId: contextMessageId }
            ]
          }).select('_id conversation channel').lean();
          
          if (fallbackMessage) {
            replyToMessageId = fallbackMessage._id;
            console.log('✅ Found reply context message (fallback search):', {
              contextMessageId,
              replyToMessageId: replyToMessageId.toString(),
              originalConversationId: fallbackMessage.conversation?.toString(),
              channel: fallbackMessage.channel
            });
          } else {
            console.warn('⚠️ Reply context message not found in database:', {
              contextMessageId,
              searchedFields: ['providerMessageId', 'whatsappMessageId', 'externalId']
            });
            
            // ✅ Additional debugging: Check if any messages exist with similar IDs
            const similarMessages = await Message.find({
              $or: [
                { providerMessageId: { $regex: contextMessageId.substring(0, 10) } },
                { whatsappMessageId: { $regex: contextMessageId.substring(0, 10) } },
                { externalId: { $regex: contextMessageId.substring(0, 10) } }
              ]
            }).select('_id providerMessageId whatsappMessageId externalId').limit(5).lean();
            
            if (similarMessages.length > 0) {
              console.log('🔍 Found similar message IDs (for debugging):', similarMessages);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error finding reply message:', error);
        console.error('❌ Error stack:', error.stack);
      }
    } else {
      console.log('ℹ️ No reply context found in message (this is a normal message, not a reply)');
    }

    // Create message
    const message = new Message({
      conversation: conversation._id, // ✅ Use 'conversation' field, not 'conversationId'
      contact: contact._id,
      channel: 'whatsapp',
      channelAccount: phoneNumberId, // ✅ Store channelAccount reference
      departmentId: conversation.department || null, // ✅ Store departmentId for message segregation
      externalId: msg.id,
      providerMessageId: msg.id, // ✅ Store as providerMessageId
      whatsappMessageId: msg.id,
      direction: 'inbound', // ✅ Use 'inbound' instead of 'incoming'
      type: messageType,
      content,
      status: 'delivered',
      sender: contact._id,
      replyTo: replyToMessageId, // ✅ Set replyTo if this is a reply message
      metadata: {
        receivedAt: new Date(),
        channel: 'whatsapp',
        ...(contextMessageId && { 
          replyContextMessageId: contextMessageId 
        }),
      },
    });

    await message.save();
    console.log(`✅ Message created: ${message._id}`, {
      messageId: message._id.toString(),
      hasReplyTo: !!replyToMessageId,
      replyToMessageId: replyToMessageId?.toString()
    });

    // ✅ CRITICAL: Populate replyTo message data for socket emission
    // The frontend needs the full replyTo message object, not just the ID
    let messageForEmission = message.toObject();
    if (replyToMessageId) {
      try {
        const replyToMessage = await Message.findById(replyToMessageId)
          .select('content type attachments sender')
          .lean();
        
        if (replyToMessage) {
          messageForEmission.replyTo = {
            _id: replyToMessageId,
            content: replyToMessage.content,
            type: replyToMessage.type,
            attachments: replyToMessage.attachments || [],
            sender: replyToMessage.sender
          };
          console.log('✅ Populated replyTo data for socket emission:', {
            replyToMessageId: replyToMessageId.toString(),
            replyToType: replyToMessage.type,
            hasContent: !!replyToMessage.content
          });
        } else {
          console.warn('⚠️ ReplyTo message not found for population:', replyToMessageId);
          // Still include the ID so frontend knows it's a reply
          messageForEmission.replyTo = { _id: replyToMessageId };
        }
      } catch (error) {
        console.error('❌ Error populating replyTo message:', error);
        // Still include the ID so frontend knows it's a reply
        messageForEmission.replyTo = { _id: replyToMessageId };
      }
    }

    // ✅ Log incoming message
    try {
      const MessageLogService = (await import('@/services/message/MessageLogService.js')).default;
      await MessageLogService.logMessageCreated(tenantId, message, {
        channelType: 'whatsapp',
        channelAccountId: phoneNumberId,
        receivedVia: 'webhook',
        providerMessageId: msg.id,
        isReply: !!replyToMessageId,
      });
    } catch (logError) {
      console.error('⚠️ Failed to log incoming WhatsApp message:', logError);
    }

    // Create user-friendly preview
    let lastMessagePreview = content.text || '';
    if (!content.text && messageType !== 'text') {
      switch (messageType) {
        case 'image':
          lastMessagePreview = '📷 Photo';
          break;
        case 'video':
          lastMessagePreview = '🎥 Video';
          break;
        case 'audio':
          lastMessagePreview = '🎤 Audio';
          break;
        case 'document':
          lastMessagePreview = '📄 Document';
          break;
        default:
          lastMessagePreview = `[${messageType}]`;
      }
    }

    // Update conversation last message
    await Conversation.findByIdAndUpdate(conversation._id, {
      lastMessage: message._id,
      lastMessageContent: lastMessagePreview,
      lastMessageType: messageType,
      lastMessageDirection: 'inbound',
      lastMessageAt: new Date(),
    });

    // Emit new message - INSTANTLY (with populated replyTo data)
    await SocketEmitter.emitNewMessage(
      conversation._id.toString(),
      messageForEmission,
      tenantId
    );

    console.log(`📡 Message emitted to socket`);
  } catch (error) {
    console.error('Error handling incoming message:', error);
  }
}

/**
 * Handle message status update
 */
async function handleStatusUpdate(status, tenantId, phoneNumberId) {
  try {
    console.log(`📊 Status update: ${status.id} -> ${status.status}`);

    const tenantDB = await getTenantDB(tenantId);
    const Message = tenantDB.model('Message', MessageSchema);

    // Find message by WhatsApp message ID
    const message = await Message.findOne({
      whatsappMessageId: status.id,
    });

    if (!message) {
      console.warn(`Message not found for status: ${status.id}`);
      return;
    }

    // Map WhatsApp status to our status
    let appStatus = 'sent';
    if (status.status === 'delivered') appStatus = 'delivered';
    if (status.status === 'read') appStatus = 'read';
    if (status.status === 'failed') appStatus = 'failed';

    // Update message status
    await Message.findByIdAndUpdate(message._id, {
      status: appStatus,
      metadata: {
        ...message.metadata,
        whatsappStatus: status.status,
        statusUpdate: {
          status: appStatus,
          timestamp: new Date(),
          whatsappTimestamp: status.timestamp,
        },
      },
    });

    // Emit status update - INSTANTLY
    await SocketEmitter.emitMessageStatus(
      message.conversationId.toString(),
      message._id.toString(),
      appStatus,
      tenantId,
      {
        whatsappStatus: status.status,
        timestamp: new Date(status.timestamp * 1000),
      }
    );

    console.log(`✅ Status updated and emitted: ${appStatus}`);
  } catch (error) {
    console.error('Error handling status update:', error);
  }
}