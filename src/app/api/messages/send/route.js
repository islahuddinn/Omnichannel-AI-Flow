
// // src/app/api/messages/send/route.js
// import { NextResponse } from 'next/server';
// import { getTenantContext } from '@/middleware/tenant';
// import { getTenantDB } from '@/config/database';
// import ConversationSchema from '@/models/schemas/Conversation';
// import ContactSchema from '@/models/schemas/Contact';
// import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
// import MessageSchema from '@/models/schemas/Message';
// import { enqueueOutboundMessage } from '@/services/queue/messageQueue';
// import SocketEmitter from '@/services/socket/SocketEmitter'; // ✅ Use SocketEmitter instead
// import { findOrCreateContact } from '@/services/contact/ContactService';
// import { validateWhatsAppSession } from '@/services/channel/whatsapp/WhatsAppValidationService';
// import mongoose from 'mongoose';

// // Cache models per tenant to avoid OverwriteModelError
// const modelCache = new Map();

// /**
//  * Get or create model for tenant database
//  */
// function getModel(tenantDB, modelName, schema) {
//   const cacheKey = `${tenantDB.name}-${modelName}`;
  
//   if (modelCache.has(cacheKey)) {
//     return modelCache.get(cacheKey);
//   }

//   // Check if model already exists
//   if (tenantDB.models[modelName]) {
//     modelCache.set(cacheKey, tenantDB.models[modelName]);
//     return tenantDB.models[modelName];
//   }

//   // Create new model
//   const model = tenantDB.model(modelName, schema);
//   modelCache.set(cacheKey, model);
//   return model;
// }

// /**
//  * Clear model cache for tenant (useful for testing)
//  */
// export function clearModelCache(tenantId) {
//   const keysToDelete = [];
//   for (const [key] of modelCache) {
//     if (key.startsWith(tenantId)) {
//       keysToDelete.push(key);
//     }
//   }
//   keysToDelete.forEach(key => modelCache.delete(key));
// }

// /**
//  * Get contact identifier based on channel type
//  */
// function getContactIdentifier(contact, channelType) {
//   // First check channel-specific identifiers
//   if (contact.identifiers && contact.identifiers[channelType]) {
//     return contact.identifiers[channelType];
//   }
  
//   // Fallback to general phone field for WhatsApp/SMS
//   if ((channelType === 'whatsapp' || channelType === 'sms') && contact.phone) {
//     return contact.phone;
//   }
  
//   // Fallback to email for email channel
//   if (channelType === 'email' && contact.email) {
//     return contact.email;
//   }
  
//   // Return null if no identifier found
//   return null;
// }

// /**
//  * Debug template message structure
//  */
// function debugTemplateMessage(content) {
//   console.log('🔍 Template Message Debug:', {
//     contentType: content.type,
//     templateName: content.templateName,
//     templateLanguage: content.templateLanguage,
//     languageCode: content.languageCode,
//     parameters: content.parameters,
//     bodyParameters: content.bodyParameters,
//     headerParameters: content.headerParameters,
//     keys: Object.keys(content)
//   });
  
//   // Check if it meets WhatsApp template requirements
//   const isValidTemplate = content.type === 'template' && 
//                          content.templateName;
  
//   console.log('✅ Template valid?', isValidTemplate);
//   return isValidTemplate;
// }

// /**
//  * POST /api/messages/send
//  * Send a new message (enqueues to BullMQ)
//  */
// export async function POST(request) {
//   let tenantCtx;
//   try {
//     tenantCtx = await getTenantContext(request);
//   } catch (error) {
//     return NextResponse.json(
//       { success: false, message: 'Unauthorized' },
//       { status: 401 }
//     );
//   }

//   try {
//     const body = await request.json();
//     const {
//       conversationId,
//       contactId,
//       identifier,
//       channelType,
//       channelAccountId,
//       content,
//       metadata = {},
//     } = body;

//     console.log('📨 Send message request:', {
//       conversationId,
//       channelType,
//       channelAccountId,
//       contentType: content?.type,
//       templateName: content?.templateName
//     });

//     // Debug template message structure
//     if (content?.type === 'template') {
//       debugTemplateMessage(content);
//     }

//     // Handle new conversation creation
//     if (conversationId === 'new') {
//       return await handleNewConversationMessage(tenantCtx, body);
//     }

//     // Validate existing conversation ID
//     if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
//       return NextResponse.json(
//         { success: false, message: 'Invalid conversation ID' },
//         { status: 400 }
//       );
//     }

//     // Validate content
//     if (!content || typeof content !== 'object') {
//       return NextResponse.json(
//         { success: false, message: 'Message content is required' },
//         { status: 400 }
//       );
//     }

//     const tenantDB = await getTenantDB(tenantCtx.tenantId);

//     // Load models using cache to prevent OverwriteModelError
//     const Conversation = getModel(tenantDB, 'Conversation', ConversationSchema);
//     const Contact = getModel(tenantDB, 'Contact', ContactSchema);
//     const CompanyAccount = getModel(tenantDB, 'CompanyAccount', CompanyAccountSchema);
//     const Message = getModel(tenantDB, 'Message', MessageSchema);

//     // Verify conversation exists
//     const conversation = await Conversation.findById(conversationId).populate('channelAccount');
    
//     if (!conversation) {
//       return NextResponse.json(
//         { success: false, message: 'Conversation not found' },
//         { status: 404 }
//       );
//     }

//     // Determine channel and account
//     const effectiveChannelType = channelType || conversation.channel;
//     const effectiveChannelAccountId = channelAccountId || conversation.channelAccount?._id;

//     if (!effectiveChannelType || !effectiveChannelAccountId) {
//       return NextResponse.json(
//         { success: false, message: 'Channel type and account ID are required' },
//         { status: 400 }
//       );
//     }

//     // Contact resolution with identifier mapping
//     let contact;
//     let contactCreated = false;
//     let identifierToUse = null;

//     if (contactId) {
//       contact = await Contact.findById(contactId);
//       if (!contact) {
//         return NextResponse.json(
//           { success: false, message: 'Contact not found' },
//           { status: 404 }
//         );
//       }

//       // Get identifier based on channel type
//       identifierToUse = getContactIdentifier(contact, effectiveChannelType);
      
//       if (!identifierToUse) {
//         return NextResponse.json(
//           { 
//             success: false, 
//             message: `Contact "${contact.name || contactId}" has no ${effectiveChannelType} identifier. Available identifiers: ${JSON.stringify(contact.identifiers)}`,
//             contactId: contactId,
//             availableIdentifiers: contact.identifiers,
//             requiresContactUpdate: true
//           },
//           { status: 400 }
//         );
//       }

//       console.log('✅ Contact identifier resolved:', {
//         contactId: contact._id,
//         name: contact.name,
//         channel: effectiveChannelType,
//         identifier: identifierToUse,
//         source: contact.identifiers?.[effectiveChannelType] ? 'identifiers' : 'phone'
//       });
//     } else if (identifier) {
//       // When creating new contact, ensure identifier is provided
//       if (!identifier) {
//         return NextResponse.json(
//           { success: false, message: 'Identifier (phone number) is required when creating new contact' },
//           { status: 400 }
//         );
//       }
//       identifierToUse = identifier;
//       contact = await findOrCreateContact({
//         tenantDB,
//         identifier: identifierToUse,
//         channelType: effectiveChannelType,
//         channelAccountId: effectiveChannelAccountId,
//         metadata: metadata.contactMetadata || {},
//       });
//       contactCreated = true;
      
//       console.log('✅ New contact created:', {
//         contactId: contact._id,
//         identifier: identifierToUse,
//         channel: effectiveChannelType
//       });
//     } else if (conversation.contact) {
//       contact = await Contact.findById(conversation.contact);
//       if (!contact) {
//         return NextResponse.json(
//           { success: false, message: 'Contact associated with conversation not found' },
//           { status: 404 }
//         );
//       }
      
//       // Get identifier based on channel type
//       identifierToUse = getContactIdentifier(contact, effectiveChannelType);
      
//       if (!identifierToUse) {
//         return NextResponse.json(
//           { 
//             success: false, 
//             message: `Contact "${contact.name || conversation.contact}" has no ${effectiveChannelType} identifier. Available identifiers: ${JSON.stringify(contact.identifiers)}`,
//             contactId: conversation.contact,
//             availableIdentifiers: contact.identifiers,
//             requiresContactUpdate: true
//           },
//           { status: 400 }
//         );
//       }

//       console.log('✅ Conversation contact identifier resolved:', {
//         contactId: contact._id,
//         name: contact.name,
//         channel: effectiveChannelType,
//         identifier: identifierToUse
//       });
//     } else {
//       return NextResponse.json(
//         { success: false, message: 'Cannot determine contact' },
//         { status: 400 }
//       );
//     }

//     // Verify channel account
//     const channelAccount = await CompanyAccount.findById(effectiveChannelAccountId);
//     if (!channelAccount) {
//       return NextResponse.json(
//         { success: false, message: 'Channel account not found' },
//         { status: 404 }
//       );
//     }

//     // WhatsApp validation - with improved template detection
//     if (effectiveChannelType === 'whatsapp') {
//       console.log('🔍 WhatsApp validation - checking content:', {
//         contentType: content.type,
//         templateName: content.templateName,
//         hasTemplate: content.type === 'template' && content.templateName
//       });

//       // Check if this is clearly a template message
//       const isTemplateMessage = content.type === 'template' && content.templateName;
      
//       if (isTemplateMessage) {
//         console.log('✅ Valid WhatsApp template message detected:', content.templateName);
//         // Skip session validation for template messages - they're always allowed
//       } else {
//         // Only validate session for non-template messages
//         const validationResult = await validateWhatsAppSession(conversation, content, tenantDB);
        
//         if (!validationResult.valid) {
//           return NextResponse.json(
//             { 
//               success: false, 
//               message: validationResult.message,
//               requiresTemplate: validationResult.requiresTemplate,
//             },
//             { status: 400 }
//           );
//         }
//       }
//     }

//     // Create message record
//     const messageContent = content.text || 
//       (content.media ? `[${content.media.type}]` : 
//       (content.template ? `[Template: ${content.templateName}]` : 
//       JSON.stringify(content)));

//     const message = await Message.create({
//       conversation: conversationId,
//       contact: contact._id,
//       channel: effectiveChannelType,
//       channelAccount: effectiveChannelAccountId,
//       sender: tenantCtx.userId,
//       content: messageContent,
//       metadata: {
//         ...metadata,
//         sentBy: tenantCtx.userId,
//         channelName: channelAccount.name,
//         originalContent: content,
//         targetIdentifier: identifierToUse,
//         // Store template-specific metadata
//         ...(content.type === 'template' && {
//           templateName: content.templateName,
//           templateLanguage: content.templateLanguage || content.languageCode,
//           templateParameters: content.parameters || content.bodyParameters
//         })
//       },
//       direction: 'outbound',
//       status: 'pending',
//       createdAt: new Date(),
//     });

//     console.log('💾 Message created:', {
//       messageId: message._id,
//       type: content.type,
//       template: content.templateName,
//       to: identifierToUse,
//       channel: effectiveChannelType
//     });

//     // Enqueue message for processing - NON-BLOCKING
//     enqueueOutboundMessage({
//       messageId: message._id.toString(),
//       conversationId: conversationId.toString(),
//       contactId: contact._id.toString(),
//       channelType: effectiveChannelType,
//       channelAccountId: effectiveChannelAccountId.toString(),
//       content: content,
//       metadata: {
//         ...metadata,
//         sentBy: tenantCtx.userId,
//         targetIdentifier: identifierToUse,
//       },
//       tenantId: tenantCtx.tenantId,
//       userId: tenantCtx.userId,
//     }).then(job => {
//       console.log(`✅ Message queued: ${job?.id}`, {
//         to: identifierToUse,
//         channel: effectiveChannelType
//       });
//     }).catch(error => {
//       console.error('❌ Failed to queue message:', error);
//     });

//     // Update conversation
//     await Conversation.findByIdAndUpdate(conversationId, {
//       lastMessageAt: new Date(),
//       lastMessageContent: messageContent,
//       status: 'active',
//       contact: contact._id,
//     });

//     // ✅ Emit socket events directly via Socket.IO (instead of direct Socket.IO)
//     const messageData = {
//       _id: message._id,
//       conversationId,
//       contactId: contact._id,
//       channelType: effectiveChannelType,
//       content: messageContent,
//       direction: 'outbound',
//       status: 'pending',
//       createdAt: message.createdAt,
//       sender: tenantCtx.userId,
//       metadata: message.metadata,
//     };

//     // Emit to conversation room via Redis
//     await SocketEmitter.emit(`conversation:${conversationId}`, 'message:new', {
//       message: messageData,
//     });

//     // Emit to tenant room via Redis
//     await SocketEmitter.emit(`tenant:${tenantCtx.tenantId}`, 'message:new', {
//       message: messageData,
//       contact: {
//         _id: contact._id,
//         name: contact.name,
//         identifier: identifierToUse,
//       },
//     });

//     // RESPOND IMMEDIATELY - don't wait for queue processing
//     return NextResponse.json({
//       success: true,
//       message: 'Message queued for delivery',
//       data: {
//         messageId: message._id,
//         contactId: contact._id,
//         contactCreated,
//         status: 'pending',
//         queuedAt: new Date(),
//         channelType: effectiveChannelType,
//         identifier: identifierToUse,
//         immediateResponse: true,
//         isTemplate: content.type === 'template',
//         templateName: content.templateName,
//       },
//     });

//   } catch (error) {
//     console.error('❌ Send message error:', error);
//     return NextResponse.json(
//       { 
//         success: false, 
//         message: 'Failed to send message',
//         error: error.message,
//       },
//       { status: 500 }
//     );
//   }
// }

// /**
//  * Handle message sending for new conversations
//  */
// async function handleNewConversationMessage(tenantCtx, body) {
//   const {
//     contactId,
//     identifier,
//     channelType,
//     channelAccountId,
//     content,
//     metadata = {},
//     departmentId,
//   } = body;

//   console.log('🆕 Creating new conversation:', {
//     channelType,
//     channelAccountId,
//     contactId,
//     identifier,
//     contentType: content?.type,
//     templateName: content?.templateName
//   });

//   // Debug template message structure for new conversations
//   if (content?.type === 'template') {
//     debugTemplateMessage(content);
//   }

//   // Validate required fields for new conversation
//   if (!channelType || !channelAccountId) {
//     return NextResponse.json(
//       { success: false, message: 'channelType and channelAccountId are required for new conversations' },
//       { status: 400 }
//     );
//   }

//   // Validate content
//   if (!content || typeof content !== 'object') {
//     return NextResponse.json(
//       { success: false, message: 'Message content is required' },
//       { status: 400 }
//     );
//   }

//   const tenantDB = await getTenantDB(tenantCtx.tenantId);
  
//   // Load models using cache
//   const Conversation = getModel(tenantDB, 'Conversation', ConversationSchema);
//   const Contact = getModel(tenantDB, 'Contact', ContactSchema);
//   const CompanyAccount = getModel(tenantDB, 'CompanyAccount', CompanyAccountSchema);
//   const Message = getModel(tenantDB, 'Message', MessageSchema);

//   // Contact resolution for new conversation
//   let contact;
//   let contactCreated = false;
//   let identifierToUse = null;

//   if (contactId) {
//     contact = await Contact.findById(contactId);
//     if (!contact) {
//       return NextResponse.json(
//         { success: false, message: 'Contact not found' },
//         { status: 404 }
//       );
//     }

//     // Get identifier based on channel type
//     identifierToUse = getContactIdentifier(contact, channelType);
    
//     if (!identifierToUse) {
//       return NextResponse.json(
//         { 
//           success: false, 
//           message: `Contact "${contact.name || contactId}" has no ${channelType} identifier. Available identifiers: ${JSON.stringify(contact.identifiers)}`,
//           contactId: contactId,
//           availableIdentifiers: contact.identifiers,
//           requiresContactUpdate: true
//         },
//         { status: 400 }
//       );
//     }

//     console.log('✅ Existing contact identifier resolved:', {
//       contactId: contact._id,
//       name: contact.name,
//       channel: channelType,
//       identifier: identifierToUse
//     });
//   } else if (identifier) {
//     identifierToUse = identifier;
//     contact = await findOrCreateContact({
//       tenantDB,
//       identifier: identifierToUse,
//       channelType,
//       channelAccountId,
//       metadata: metadata.contactMetadata || {},
//     });
//     contactCreated = true;
    
//     console.log('✅ New contact created for conversation:', {
//       contactId: contact._id,
//       identifier: identifierToUse,
//       channel: channelType
//     });
//   } else {
//     return NextResponse.json(
//       { success: false, message: 'contactId or identifier is required for new conversations' },
//       { status: 400 }
//     );
//   }

//   // Verify channel account
//   const channelAccount = await CompanyAccount.findById(channelAccountId);
//   if (!channelAccount) {
//     return NextResponse.json(
//       { success: false, message: 'Channel account not found' },
//       { status: 404 }
//     );
//   }

//   if (channelAccount.type !== channelType) {
//     return NextResponse.json(
//       { success: false, message: `Channel account type mismatch. Expected ${channelType}, got ${channelAccount.type}` },
//       { status: 400 }
//     );
//   }

//   // WhatsApp template requirement for new conversations
//   if (channelType === 'whatsapp') {
//     const isTemplateMessage = content.type === 'template' && content.templateName;
    
//     if (!isTemplateMessage) {
//       return NextResponse.json(
//         { 
//           success: false, 
//           message: 'Cannot initiate WhatsApp conversation with free-form message. Use a template message for the first contact.',
//           requiresTemplate: true,
//         },
//         { status: 400 }
//       );
//     } else {
//       console.log('✅ Valid template message for new WhatsApp conversation:', content.templateName);
//     }
//   }

//   // Determine department
//   let department = departmentId;
//   if (!department && contact.department) {
//     department = contact.department;
//   }
//   if (!department && channelAccount.departmentId) {
//     department = channelAccount.departmentId;
//   }
//   if (!department && tenantCtx.user?.departments?.[0]) {
//     department = tenantCtx.user.departments[0];
//   }
//   if (!department) {
//     return NextResponse.json(
//       { success: false, message: 'Department is required but could not be determined. Please provide departmentId.' },
//       { status: 400 }
//     );
//   }

//   // Create new conversation
//   const conversation = await Conversation.create({
//     status: 'active',
//     channel: channelType,
//     channelAccount: channelAccountId,
//     contact: contact._id,
//     department: department,
//     assignedTo: tenantCtx.userId,
//     messageCount: 1,
//     lastMessageAt: new Date(),
//     lastMessageContent: content.text || `[Template: ${content.templateName}]`,
//     tenantId: tenantCtx.tenantId,
//     createdAt: new Date(),
//   });

//   console.log('💾 New conversation created:', {
//     conversationId: conversation._id,
//     channel: channelType,
//     contact: contact._id,
//     identifier: identifierToUse
//   });

//   // Create message
//   const messageContent = content.text || 
//     (content.media ? `[${content.media.type}]` : 
//     (content.template ? `[Template: ${content.templateName}]` : 
//     JSON.stringify(content)));

//   const message = await Message.create({
//     conversation: conversation._id,
//     contact: contact._id,
//     channel: channelType,
//     channelAccount: channelAccountId,
//     sender: tenantCtx.userId,
//     content: messageContent,
//     metadata: {
//       ...metadata,
//       sentBy: tenantCtx.userId,
//       channelName: channelAccount.name,
//       originalContent: content,
//       targetIdentifier: identifierToUse,
//       // Store template-specific metadata
//       ...(content.type === 'template' && {
//         templateName: content.templateName,
//         templateLanguage: content.templateLanguage || content.languageCode,
//         templateParameters: content.parameters || content.bodyParameters
//       })
//     },
//     direction: 'outbound',
//     status: 'pending',
//     createdAt: new Date(),
//   });

//   console.log('💾 New message created:', {
//     messageId: message._id,
//     type: content.type,
//     template: content.templateName,
//     to: identifierToUse,
//     channel: channelType
//   });

//   // Enqueue message - NON-BLOCKING
//   enqueueOutboundMessage({
//     messageId: message._id.toString(),
//     conversationId: conversation._id.toString(),
//     contactId: contact._id.toString(),
//     channelType,
//     channelAccountId: channelAccountId.toString(),
//     content: content,
//     metadata: {
//       ...metadata,
//       sentBy: tenantCtx.userId,
//       targetIdentifier: identifierToUse,
//     },
//     tenantId: tenantCtx.tenantId,
//     userId: tenantCtx.userId,
//   }).then(job => {
//     console.log(`✅ New conversation message queued: ${job?.id}`, {
//       to: identifierToUse,
//       channel: channelType
//     });
//   }).catch(error => {
//     console.error('❌ Failed to queue new conversation message:', error);
//   });

//   // ✅ Emit socket events directly via Socket.IO
//   const messageData = {
//     _id: message._id,
//     conversationId: conversation._id,
//     contactId: contact._id,
//     channelType,
//     content: messageContent,
//     direction: 'outbound',
//     status: 'pending',
//     createdAt: message.createdAt,
//     sender: tenantCtx.userId,
//     metadata: message.metadata,
//   };

//   // Emit new conversation event
//   await SocketEmitter.emit(`tenant:${tenantCtx.tenantId}`, 'conversation:new', {
//     conversation: {
//       _id: conversation._id,
//       status: 'active',
//       channel: channelType,
//       contact: contact._id,
//       department: department,
//       lastMessageAt: conversation.lastMessageAt,
//       lastMessageContent: conversation.lastMessageContent,
//       messageCount: 1,
//       assignedTo: tenantCtx.userId,
//       channelAccount: {
//         _id: channelAccount._id,
//         name: channelAccount.name,
//         type: channelAccount.type
//       }
//     },
//     message: messageData,
//     contact: {
//       _id: contact._id,
//       name: contact.name,
//       identifier: identifierToUse,
//     },
//   });

//   // Emit new message event
//   await SocketEmitter.emit(`conversation:${conversation._id}`, 'message:new', {
//     message: messageData,
//   });

//   // Respond immediately
//   return NextResponse.json({
//     success: true,
//     message: 'Conversation created and message queued for delivery',
//     data: {
//       conversationId: conversation._id,
//       messageId: message._id,
//       contactId: contact._id,
//       contactCreated,
//       status: 'pending',
//       queuedAt: new Date(),
//       channelType: channelType,
//       identifier: identifierToUse,
//       isTemplate: content.type === 'template',
//       templateName: content.templateName,
//     },
//   });
// }

// // Optional: Add GET method for testing
// export async function GET(request) {
//   return NextResponse.json({
//     success: true,
//     message: 'Messages API is working',
//     timestamp: new Date().toISOString(),
//   });
// }








// src/app/api/messages/send/route.js
import { NextResponse } from 'next/server';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import ConversationSchema from '@/models/schemas/Conversation';
import ContactSchema from '@/models/schemas/Contact';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import MessageSchema from '@/models/schemas/Message';
import DepartmentSchema from '@/models/schemas/Department';
// ✅ RabbitMQ is imported dynamically when needed
import SocketEmitter from '@/services/socket/SocketEmitter'; // ✅ Use SocketEmitter instead
import { findOrCreateContact } from '@/services/contact/ContactService';
import { validateWhatsAppSession } from '@/services/channel/whatsapp/WhatsAppValidationService';
import { findMergeableConversation, autoMergeConversation, mergeContacts, canMergeContacts } from '@/services/conversation/MergeService';
import MessageLogService from '@/services/message/MessageLogService';
import mongoose from 'mongoose';

// Cache models per tenant to avoid OverwriteModelError
const modelCache = new Map();

/**
 * Get or create model for tenant database
 */
function getModel(tenantDB, modelName, schema) {
  const cacheKey = `${tenantDB.name}-${modelName}`;
  
  if (modelCache.has(cacheKey)) {
    return modelCache.get(cacheKey);
  }

  // Check if model already exists
  if (tenantDB.models[modelName]) {
    modelCache.set(cacheKey, tenantDB.models[modelName]);
    return tenantDB.models[modelName];
  }

  // Create new model
  const model = tenantDB.model(modelName, schema);
  modelCache.set(cacheKey, model);
  return model;
}

/**
 * Clear model cache for tenant (useful for testing)
 */
export function clearModelCache(tenantId) {
  const keysToDelete = [];
  for (const [key] of modelCache) {
    if (key.startsWith(tenantId)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => modelCache.delete(key));
}

/**
 * Get contact identifier based on channel type
 */
function getContactIdentifier(contact, channelType) {
  // First check channel-specific identifiers
  if (contact.identifiers && contact.identifiers[channelType]) {
    return contact.identifiers[channelType];
  }
  
  // ✅ WebChat: Use webchat identifier or sessionId
  if (channelType === 'webchat') {
    return contact.identifiers?.webchat || contact.sessionId || null;
  }
  
  // Fallback to general phone field for WhatsApp/SMS
  if ((channelType === 'whatsapp' || channelType === 'sms') && contact.phone) {
    return contact.phone;
  }
  
  // Fallback to email for email channel
  if (channelType === 'email' && contact.email) {
    return contact.email;
  }
  
  // Return null if no identifier found
  return null;
}

/**
 * Debug template message structure
 */
function debugTemplateMessage(content) {
  console.log('🔍 Template Message Debug:', {
    contentType: content.type,
    templateName: content.templateName,
    templateLanguage: content.templateLanguage,
    languageCode: content.languageCode,
    parameters: content.parameters,
    bodyParameters: content.bodyParameters,
    headerParameters: content.headerParameters,
    keys: Object.keys(content)
  });
  
  // Check if it meets WhatsApp template requirements
  const isValidTemplate = content.type === 'template' && 
                         content.templateName;
  
  console.log('✅ Template valid?', isValidTemplate);
  return isValidTemplate;
}

/**
 * POST /api/messages/send
 * Send a new message (enqueues to RabbitMQ)
 */
export async function POST(request) {
  let tenantCtx;
  try {
    tenantCtx = await getTenantContext(request);
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // ✅ CRITICAL: Handle empty or malformed request body
    let body;
    try {
      const text = await request.text();
      if (!text || text.trim() === '') {
        return NextResponse.json(
          { success: false, error: 'Request body is required' },
          { status: 400 }
        );
      }
      body = JSON.parse(text);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    const {
      conversationId,
      contactId,
      identifier,
      channelType,
      channelAccountId,
      content,
      metadata = {},
    } = body;

    console.log('📨 Send message request:', {
      conversationId,
      channelType,
      channelAccountId,
      contentType: content?.type,
      templateName: content?.templateName
    });

    // Debug template message structure
    if (content?.type === 'template') {
      debugTemplateMessage(content);
    }

    // Handle new conversation creation
    if (conversationId === 'new') {
      return await handleNewConversationMessage(tenantCtx, body);
    }

    // Validate existing conversation ID
    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid conversation ID' },
        { status: 400 }
      );
    }

    // Validate content
    if (!content || typeof content !== 'object') {
      return NextResponse.json(
        { success: false, message: 'Message content is required' },
        { status: 400 }
      );
    }

    // ✅ Content length validation — enforce per-channel limits
    const contentText = content.text || content.body || content.renderedText || '';
    const MAX_CONTENT_LENGTH = 50000; // 50KB max for any channel
    if (typeof contentText === 'string' && contentText.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { success: false, message: `Message content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters` },
        { status: 400 }
      );
    }

    // ✅ Sanitize content — strip null bytes which can cause DB issues
    if (content.text && typeof content.text === 'string') {
      content.text = content.text.replace(/\0/g, '');
    }
    if (content.body && typeof content.body === 'string') {
      content.body = content.body.replace(/\0/g, '');
    }

    // ✅ Validate attachments array structure
    const rawAttachments = body.attachments || [];
    if (!Array.isArray(rawAttachments)) {
      return NextResponse.json(
        { success: false, message: 'Attachments must be an array' },
        { status: 400 }
      );
    }
    if (rawAttachments.length > 20) {
      return NextResponse.json(
        { success: false, message: 'Maximum 20 attachments allowed per message' },
        { status: 400 }
      );
    }
    for (const att of rawAttachments) {
      if (!att || typeof att !== 'object') {
        return NextResponse.json(
          { success: false, message: 'Each attachment must be an object with url and type' },
          { status: 400 }
        );
      }
      if (!att.url || typeof att.url !== 'string') {
        return NextResponse.json(
          { success: false, message: 'Each attachment must have a valid url' },
          { status: 400 }
        );
      }
    }

    // ✅ Idempotency check — prevent duplicate messages from retried requests
    const idempotencyKey = metadata?.tempId || metadata?.idempotencyKey;

    const tenantDB = await getTenantDB(tenantCtx.tenantId);

    // Load models using cache to prevent OverwriteModelError
    const Conversation = getModel(tenantDB, 'Conversation', ConversationSchema);
    const Contact = getModel(tenantDB, 'Contact', ContactSchema);
    const CompanyAccount = getModel(tenantDB, 'CompanyAccount', CompanyAccountSchema);
    const Message = getModel(tenantDB, 'Message', MessageSchema);

    // ✅ Idempotency dedup — if tempId was already used, return the existing message
    if (idempotencyKey) {
      const existingMessage = await Message.findOne({
        'metadata.tempId': idempotencyKey,
        conversation: conversationId,
      }).select('_id status createdAt').lean();
      if (existingMessage) {
        console.log(`⚠️ Duplicate send detected (tempId: ${idempotencyKey}), returning existing message`);
        return NextResponse.json({
          success: true,
          data: { messageId: existingMessage._id, status: existingMessage.status, deduplicated: true },
        });
      }
    }

    // Verify conversation exists
    // ✅ CRITICAL: For company admins, fetch _allDepartmentConversationIds for unified view validation
    const isAdmin = ['company_admin', 'super_admin'].includes(tenantCtx.user?.role);
    let conversation = await Conversation.findById(conversationId).populate('channelAccount').lean();
    
    if (!conversation) {
      return NextResponse.json(
        { success: false, message: 'Conversation not found' },
        { status: 404 }
      );
    }
    
    // ✅ For company admins, find all department conversations for this contact+channel
    if (isAdmin && conversation.contact) {
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
        // Store all department conversation IDs for validation
        conversation._allDepartmentConversationIds = allDepartmentConversations.map(c => c._id);
        console.log('✅ Added _allDepartmentConversationIds to conversation:', {
          conversationId: conversationId.toString(),
          allDepartmentConversationIds: conversation._allDepartmentConversationIds.map(id => id.toString()),
          count: conversation._allDepartmentConversationIds.length
        });
      }
    }

    // Determine channel and account
    // ✅ CRITICAL: For merged conversations, ALWAYS prioritize channelType from request body
    // Don't fall back to conversation.channel as it might be the primary channel (e.g., email)
    // but we're sending via a different channel (e.g., whatsapp)
    // For merged conversations, the conversation.channel might be the primary merged channel,
    // but we need to use the specific channel from the request (whatsapp, email, etc.)
    const effectiveChannelType = channelType || conversation.channel;
    let effectiveChannelAccountId = channelAccountId || conversation.channelAccount?._id;

    // ✅ CRITICAL: Log channel type determination for debugging merged conversations
    console.log('🔍 Channel type determination:', {
      conversationId,
      requestChannelType: channelType,
      conversationChannel: conversation.channel,
      isMerged: conversation.isMerged,
      effectiveChannelType,
      channelAccountId,
      effectiveChannelAccountId
    });
    
    // ✅ CRITICAL: Validate that channelType is provided for merged conversations
    // Merged conversations can have multiple channels, so we MUST specify which channel to use
    if (!channelType && conversation.isMerged) {
      return NextResponse.json(
        { success: false, message: 'Channel type is required for merged conversations. Please select a channel.' },
        { status: 400 }
      );
    }

    if (!effectiveChannelType) {
      return NextResponse.json(
        { success: false, message: 'Channel type is required' },
        { status: 400 }
      );
    }
    
    if (!effectiveChannelAccountId) {
      return NextResponse.json(
        { success: false, message: 'Company account is required. Please select a company account from the dropdown.' },
        { status: 400 }
      );
    }
    
    // ✅ CRITICAL: Validate that channelType matches the channelAccount type
    // For merged conversations, auto-resolve the correct account instead of rejecting
    if (effectiveChannelAccountId) {
      const account = await CompanyAccount.findById(effectiveChannelAccountId).lean();
      if (account && account.type !== effectiveChannelType) {
        console.warn('⚠️ Channel type mismatch detected:', {
          requestChannelType: channelType,
          conversationChannel: conversation.channel,
          effectiveChannelType,
          accountType: account.type,
          accountId: effectiveChannelAccountId,
          accountName: account.name,
          isMerged: conversation.isMerged
        });

        // ✅ For merged conversations, try to auto-resolve the correct account
        let resolvedAccount = null;
        if (conversation.isMerged && conversation.mergedConversations) {
          const mergedConv = conversation.mergedConversations.find(
            mc => mc.channel === effectiveChannelType
          );
          if (mergedConv?.channelAccount) {
            const mergedAccId = mergedConv.channelAccount?._id || mergedConv.channelAccount;
            resolvedAccount = await CompanyAccount.findById(mergedAccId).lean();
            if (resolvedAccount && resolvedAccount.type === effectiveChannelType) {
              console.log(`✅ Auto-resolved correct ${effectiveChannelType} account from mergedConversations:`, resolvedAccount._id);
            } else {
              resolvedAccount = null;
            }
          }
        }
        // ✅ Also check if primary conversation's channelAccount matches
        if (!resolvedAccount && conversation.isMerged && conversation.channel === effectiveChannelType && conversation.channelAccount) {
          const primaryAccId = conversation.channelAccount?._id || conversation.channelAccount;
          const primaryAcc = await CompanyAccount.findById(primaryAccId).lean();
          if (primaryAcc && primaryAcc.type === effectiveChannelType) {
            resolvedAccount = primaryAcc;
            console.log(`✅ Auto-resolved correct ${effectiveChannelType} account from primary conversation:`, resolvedAccount._id);
          }
        }
        // ✅ Fallback: find any active account of the correct type
        if (!resolvedAccount) {
          resolvedAccount = await CompanyAccount.findOne({
            type: effectiveChannelType,
            companyId: account.companyId,
            $or: [{ isActive: true }, { status: 'active' }]
          }).lean();
          if (resolvedAccount) {
            console.log(`✅ Auto-resolved ${effectiveChannelType} account from active accounts:`, resolvedAccount._id);
          }
        }

        if (resolvedAccount) {
          // ✅ Use the resolved account — reassign effectiveChannelAccountId for the rest of the flow
          console.log(`✅ Using resolved ${effectiveChannelType} account ${resolvedAccount._id} instead of mismatched ${effectiveChannelAccountId}`);
          effectiveChannelAccountId = resolvedAccount._id;
        } else {
          return NextResponse.json(
            {
              success: false,
              message: `Channel type mismatch. Selected account "${account.name}" is for ${account.type}, but message is being sent via ${effectiveChannelType}. Please select the correct account.`
            },
            { status: 400 }
          );
        }
      }
    }

    // Contact resolution with identifier mapping
    let contact;
    let contactCreated = false;
    let identifierToUse = null;

    if (contactId) {
      contact = await Contact.findById(contactId);
      if (!contact) {
        return NextResponse.json(
          { success: false, message: 'Contact not found' },
          { status: 404 }
        );
      }

      // Get identifier based on channel type
      identifierToUse = getContactIdentifier(contact, effectiveChannelType);
      
      if (!identifierToUse) {
        return NextResponse.json(
          { 
            success: false, 
            message: `Contact "${contact.name || contactId}" has no ${effectiveChannelType} identifier. Available identifiers: ${JSON.stringify(contact.identifiers)}`,
            contactId: contactId,
            availableIdentifiers: contact.identifiers,
            requiresContactUpdate: true
          },
          { status: 400 }
        );
      }

      console.log('✅ Contact identifier resolved:', {
        contactId: contact._id,
        name: contact.name,
        channel: effectiveChannelType,
        identifier: identifierToUse,
        source: contact.identifiers?.[effectiveChannelType] ? 'identifiers' : 'phone'
      });
    } else if (identifier) {
      identifierToUse = identifier;
      contact = await findOrCreateContact({
        tenantDB,
        identifier: identifierToUse,
        channelType: effectiveChannelType,
        channelAccountId: effectiveChannelAccountId,
        metadata: metadata.contactMetadata || {},
      });
      contactCreated = true;
      
      console.log('✅ New contact created:', {
        contactId: contact._id,
        identifier: identifierToUse,
        channel: effectiveChannelType
      });
    } else if (conversation.contact) {
      contact = await Contact.findById(conversation.contact);
      if (!contact) {
        return NextResponse.json(
          { success: false, message: 'Contact associated with conversation not found' },
          { status: 404 }
        );
      }
      
      // Get identifier based on channel type
      identifierToUse = getContactIdentifier(contact, effectiveChannelType);
      
      if (!identifierToUse) {
        return NextResponse.json(
          { 
            success: false, 
            message: `Contact "${contact.name || conversation.contact}" has no ${effectiveChannelType} identifier. Available identifiers: ${JSON.stringify(contact.identifiers)}`,
            contactId: conversation.contact,
            availableIdentifiers: contact.identifiers,
            requiresContactUpdate: true
          },
          { status: 400 }
        );
      }

      console.log('✅ Conversation contact identifier resolved:', {
        contactId: contact._id,
        name: contact.name,
        channel: effectiveChannelType,
        identifier: identifierToUse
      });
    } else {
      return NextResponse.json(
        { success: false, message: 'Cannot determine contact' },
        { status: 400 }
      );
    }

    // ✅ channelAccount is already fetched above (before auto mode check)

    // WhatsApp validation - with improved template detection
    if (effectiveChannelType === 'whatsapp') {
      console.log('🔍 WhatsApp validation - checking content:', {
        contentType: content.type,
        templateName: content.templateName,
        hasTemplate: content.type === 'template' && content.templateName,
        channelAccountId: effectiveChannelAccountId
      });

      // Check if this is clearly a template message
      const isTemplateMessage = content.type === 'template' && content.templateName;
      
      if (isTemplateMessage) {
        console.log('✅ Valid WhatsApp template message detected:', content.templateName);
        // Skip session validation for template messages - they're always allowed
      } else {
        // Only validate session for non-template messages
        // ✅ CRITICAL: Pass channelAccountId to check session for the specific account
        // ✅ CRITICAL: For company admins, pass _allDepartmentConversationIds for unified view validation
        const validationResult = await validateWhatsAppSession(
          conversation, 
          content, 
          tenantDB, 
          effectiveChannelAccountId?.toString()
        );
        
        if (!validationResult.valid) {
          return NextResponse.json(
            { 
              success: false, 
              message: validationResult.message,
              requiresTemplate: validationResult.requiresTemplate,
            },
            { status: 400 }
          );
        }
      }
    }

    // ✅ Handle attachments from request body
    const attachments = body.attachments || [];
    
    // ✅ Determine message type - if multiple attachments, use the primary type
    let messageType = 'text';
    if (attachments.length > 0) {
      // If multiple attachments, determine primary type (prioritize image > video > audio > document)
      const types = attachments.map(a => a.type || 'document');
      if (types.includes('image')) messageType = 'image';
      else if (types.includes('video')) messageType = 'video';
      else if (types.includes('audio')) messageType = 'audio';
      else messageType = 'document';
    } else if (content.media?.type) {
      messageType = content.media.type;
    } else if (content.type === 'template') {
      messageType = 'template';
    }

    // ✅ Create message record - For WhatsApp templates, show only template name
    let messageContent;
    if (content.type === 'template' && effectiveChannelType === 'whatsapp') {
      // ✅ WhatsApp templates: Show only template name (not "[Template: name]")
      messageContent = content.templateName || 'Template';
    } else {
      messageContent = content.renderedText || content.text || content.body ||
      (content.media ? `[${content.media.type}]` : 
      (content.template ? `[Template: ${content.templateName}]` : 
        (attachments.length > 0 ? `[${attachments.length} ${attachments.length === 1 ? 'attachment' : 'attachments'}]` : '')));
    }
    
    // Create user-friendly preview for conversation list
    let lastMessagePreview = '';
    if (content.text) {
      lastMessagePreview = `You: ${content.text}`;
    } else if (content.type === 'template' && effectiveChannelType === 'whatsapp') {
      // ✅ WhatsApp templates: Show only template name
      lastMessagePreview = `You: ${content.templateName || 'Template'}`;
    } else if (attachments.length > 0) {
      if (attachments.length === 1) {
        const att = attachments[0];
        switch (att.type) {
          case 'image':
            lastMessagePreview = 'You: 📷 Photo';
            break;
          case 'video':
            lastMessagePreview = 'You: 🎥 Video';
            break;
          case 'audio':
            lastMessagePreview = 'You: 🎤 Voice message';
            break;
          case 'document':
            lastMessagePreview = 'You: 📄 Document';
            break;
          default:
            lastMessagePreview = `You: ${att.type}`;
        }
      } else {
        lastMessagePreview = `You: ${attachments.length} attachments`;
      }
    } else if (content.media) {
      switch (content.media.type) {
        case 'image':
          lastMessagePreview = 'You: 📷 Photo';
          break;
        case 'video':
          lastMessagePreview = 'You: 🎥 Video';
          break;
        case 'audio':
        case 'voice':
          lastMessagePreview = 'You: 🎤 Voice message';
          break;
        case 'document':
          lastMessagePreview = `You: 📄 Document`;
          break;
        default:
          lastMessagePreview = `You: ${content.media.type}`;
      }
    } else if (content.template) {
      lastMessagePreview = `You: 📋 ${content.templateName}`;
    } else {
      lastMessagePreview = 'You: (message)';
    }

    // ✅ Extract emailData from body if present (for email channel) - needed before auto mode check
    const emailData = body.emailData || null;

    // ✅ Get channel account (needed for both auto mode and normal flow)
    const channelAccount = await CompanyAccount.findById(effectiveChannelAccountId);
    if (!channelAccount) {
      return NextResponse.json(
        { success: false, message: 'Channel account not found' },
        { status: 404 }
      );
    }

    // ✅ Get conversation to extract departmentId for message segregation
    const conversationForDept = await Conversation.findById(conversationId).select('department mode').lean();
    const messageDepartmentId = conversationForDept?.department || null;
    const conversationMode = conversationForDept?.mode || 'auto';
    
    // ✅ CRITICAL: Handle manual messages in auto mode conversations
    // If conversation is in auto mode and user is sending a manual message,
    // send bot message first, then user message.
    // Skip the handoff bot message when user is sending a template message (any channel).
    let botMessageId = null;
    const isTemplateMessage = content.type === 'template';
    if (conversationMode === 'auto' && tenantCtx.userId && !isTemplateMessage) {
      // This is a manual (non-template) message in auto mode - send bot message first
      console.log('🔄 Auto mode conversation - manual message detected, sending bot message first');
      
      try {
        // Bot message to send first
        const botMessageText = "I apologize, we need to briefly pause our conversation as a human operator needs to connect with you. Once you complete your conversation, I will get back to you. Thank you.";
        
        // Get contact identifier for the channel
        const contactForBot = await Contact.findById(contact._id).select('identifiers phone email sessionId').lean();
        if (!contactForBot) {
          return NextResponse.json(
            { success: false, error: 'Contact not found' },
            { status: 404 }
          );
        }
        
        // Get identifier based on channel - use the same logic as getContactIdentifier
        let identifierForBot = getContactIdentifier(contactForBot, effectiveChannelType);
        
        if (!identifierForBot) {
          return NextResponse.json(
            { success: false, error: 'No identifier found for channel' },
            { status: 400 }
          );
        }
        
        // Send bot message
        const BotService = (await import('@/services/bot/BotService.js')).default;
        const botMessageResult = await BotService.sendBotResponse({
          tenantId: tenantCtx.tenantId,
          conversationId: conversationId,
          contactId: contact._id.toString(),
          channelType: effectiveChannelType,
          channelAccountId: effectiveChannelAccountId.toString(),
          botResponse: botMessageText,
          tenantDB: tenantDB,
          userId: null, // System user for bot messages
          emailData: effectiveChannelType === 'email' && emailData ? emailData : null
        });
        
        // Handle mode_changed as a non-error condition (conversation switched to manual while bot was processing)
        if (botMessageResult?.reason === 'mode_changed') {
          console.log('ℹ️ Bot response discarded — conversation mode changed during processing');
          return NextResponse.json({
            success: true,
            message: 'Bot response skipped — conversation mode changed',
            reason: 'mode_changed'
          });
        }

        if (!botMessageResult.success || !botMessageResult.messageId) {
          console.error('❌ Failed to send bot message in auto mode:', botMessageResult.error);
          return NextResponse.json(
            {
              success: false,
              error: 'Failed to send bot message',
              botError: botMessageResult.error
            },
            { status: 500 }
          );
        }
        
        botMessageId = botMessageResult.messageId;
        console.log(`✅ Bot message created, waiting for it to be sent: ${botMessageId}`);
        
        // Wait for bot message to be sent (check status)
        // Poll every 500ms for up to 10 seconds (20 attempts)
        let botMessageSent = false;
        let attempts = 0;
        const maxAttempts = 20; // 10 seconds max wait (20 * 500ms)
        const pollInterval = 500; // Check every 500ms
        
        while (!botMessageSent && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          
          try {
            const botMessage = await Message.findById(botMessageId).select('status').lean();
            if (botMessage && ['sent', 'delivered', 'read'].includes(botMessage.status)) {
              botMessageSent = true;
              console.log(`✅ Bot message confirmed as sent: ${botMessageId}, status: ${botMessage.status}`);
              break;
            }
          } catch (checkError) {
            console.error('❌ Error checking bot message status:', checkError);
          }
          attempts++;
        }
        
        if (!botMessageSent) {
          console.warn('⚠️ Bot message not confirmed as sent within timeout, but proceeding with user message');
          // Still proceed - the bot message is queued and will be sent
        }
        
        console.log('✅ Bot message sent, now creating user message');
      } catch (error) {
        console.error('❌ Error handling auto mode manual message:', error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }
      
      // Create user message (attachments variable is already defined above)
      const userMessage = await Message.create({
        conversation: conversationId,
        contact: contact._id,
        channel: effectiveChannelType,
        channelAccount: effectiveChannelAccountId,
        departmentId: messageDepartmentId,
        sender: tenantCtx.userId,
        type: messageType,
        content: messageContent,
        ...(effectiveChannelType === 'email' && emailData && {
          emailData: {
            subject: emailData.subject || 'No Subject',
            from: channelAccount.getDecryptedCredentials()?.fromEmail || channelAccount.identifier,
            to: [identifierToUse],
            ...(emailData.cc && { cc: Array.isArray(emailData.cc) ? emailData.cc : [emailData.cc] }),
            ...(emailData.bcc && { bcc: Array.isArray(emailData.bcc) ? emailData.bcc : [emailData.bcc] }),
          }
        }),
        attachments: attachments.length > 0 ? attachments.map(att => ({
          type: att.type || 'document',
          url: att.url,
          name: att.name,
          size: att.size,
          mimeType: att.mimeType,
          ...(att.duration && { duration: att.duration })
        })) : [],
        metadata: {
          ...metadata,
          sentBy: tenantCtx.userId,
          channelName: channelAccount.name,
          originalContent: content,
          targetIdentifier: identifierToUse,
          sentAfterBotMessage: true,
          botMessageId: botMessageId,
          ...(content.type === 'template' && {
            templateName: content.templateName,
            templateLanguage: content.templateLanguage || content.languageCode,
            templateParameters: content.parameters || content.bodyParameters
          })
        },
        direction: 'outbound',
        status: 'pending',
        replyTo: content.replyToId || metadata.replyToId || null,
        createdAt: new Date(),
      });
      
      // Update conversation lastMessageAt
      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: userMessage._id,
        lastMessageContent: lastMessagePreview,
        lastMessageType: messageType,
        lastMessageDirection: 'outbound',
        lastMessageAt: new Date(),
        $inc: { messageCount: 1 }
      });
      
      // ✅ Enqueue user message to RabbitMQ (messages are sent via RabbitMQ, not queues table)
      const { publishOutboundMessage: publishUserOutbound } = await import('@/lib/queue/rabbitmq');
      const userQueueData = {
        messageId: userMessage._id.toString(),
        conversationId: conversationId.toString(),
        contactId: contact._id.toString(),
        channelType: effectiveChannelType,
        channelAccountId: effectiveChannelAccountId.toString(),
        content: content,
        ...(effectiveChannelType === 'email' && emailData && { emailData }),
        metadata: {
          ...metadata,
          sentBy: tenantCtx.userId,
          targetIdentifier: identifierToUse,
          sentAfterBotMessage: true,
          botMessageId: botMessageId
        },
        tenantId: tenantCtx.tenantId,
        userId: tenantCtx.userId,
      };
      
      await publishUserOutbound(userQueueData);
      console.log(`✅ User message queued to RabbitMQ after bot message`, {
        userMessageId: userMessage._id.toString(),
        botMessageId: botMessageId,
        channelType: effectiveChannelType
      });
      
      // Emit socket event for user message
      const socketMessageData = {
        _id: userMessage._id,
        conversationId,
        contactId: contact._id,
        channelType: effectiveChannelType,
        channel: effectiveChannelType,
        content: messageContent,
        type: messageType,
        attachments: attachments.length > 0 ? attachments.map(att => ({
          type: att.type || 'document',
          url: att.url,
          name: att.name,
          size: att.size,
          mimeType: att.mimeType,
          ...(att.duration && { duration: att.duration })
        })) : [],
        ...(effectiveChannelType === 'email' && {
          emailData: userMessage.emailData || {
            subject: emailData?.subject || 'No Subject',
            from: channelAccount.identifier,
            to: [identifierToUse],
          }
        }),
        direction: 'outbound',
        status: 'pending',
        createdAt: userMessage.createdAt,
        sender: tenantCtx.userId,
        metadata: {
          ...userMessage.metadata,
          sentAfterBotMessage: botMessageId ? true : false,
          botMessageId: botMessageId
        }
      };
      
      // Get all grouped conversations for company admin view
      let allGroupedConversationIds = null;
      if (conversationForDept?.contact && conversationForDept?.channel) {
        const contactId = conversationForDept.contact?.toString() || conversationForDept.contact;
        const channel = conversationForDept.channel;
        
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
      
      const deptId = conversationForDept?.department?.toString() || null;
      await SocketEmitter.emitNewMessage(conversationId, socketMessageData, tenantCtx.tenantId, deptId, allGroupedConversationIds);
      
      // ✅ Note: Conversation will be switched to manual mode when user message is successfully sent
      // This is handled in messageOutboundWorker.js when message status becomes 'sent'
      
      return NextResponse.json({
        success: true,
        message: 'Bot message sent, user message queued',
        data: {
          conversationId: conversationId,
          botMessageId: botMessageId,
          userMessageId: userMessage._id,
          status: 'pending',
          queuedAt: new Date(),
          channelType: effectiveChannelType,
          identifier: identifierToUse,
        },
      });
    }
    
    // ✅ Normal flow: Create message for manual mode or bot messages
    const message = await Message.create({
      conversation: conversationId,
      contact: contact._id,
      channel: effectiveChannelType,
      channelAccount: effectiveChannelAccountId,
      departmentId: messageDepartmentId, // ✅ CRITICAL: Store department ID for message segregation
      sender: tenantCtx.userId,
      type: messageType,
      content: messageContent,
      // ✅ Store email-specific data if channel is email (always include for email channel)
      ...(effectiveChannelType === 'email' && {
        emailData: {
          subject: emailData?.subject || 'No Subject',
          from: channelAccount.getDecryptedCredentials()?.fromEmail || channelAccount.identifier,
          to: [identifierToUse], // Primary recipient
          ...(emailData?.cc && { cc: Array.isArray(emailData.cc) ? emailData.cc : [emailData.cc] }),
          ...(emailData?.bcc && { bcc: Array.isArray(emailData.bcc) ? emailData.bcc : [emailData.bcc] }),
        }
      }),
      // ✅ Store all attachments in a single message
      attachments: attachments.length > 0 ? attachments.map(att => ({
        type: att.type || 'document',
        url: att.url,
        name: att.name,
        size: att.size,
        mimeType: att.mimeType,
        ...(att.duration && { duration: att.duration })
      })) : [],
      metadata: {
        ...metadata,
        sentBy: tenantCtx.userId,
        channelName: channelAccount.name,
        originalContent: content,
        targetIdentifier: identifierToUse,
        // Store template-specific metadata
        ...(content.type === 'template' && {
          templateName: content.templateName,
          templateLanguage: content.templateLanguage || content.languageCode,
          templateParameters: content.parameters || content.bodyParameters
        })
      },
      direction: 'outbound',
      status: 'pending',
      replyTo: content.replyToId || metadata.replyToId || null, // ✅ Save replyTo for UI display
      createdAt: new Date(),
    });

    console.log('💾 Message created:', {
      messageId: message._id,
      type: content.type,
      template: content.templateName,
      to: identifierToUse,
      channel: effectiveChannelType
    });

    // ✅ Removed message creation logging - only log final outcome (sent/failed) in worker
    // This ensures exactly 1 log per message

    // Enqueue message for processing - NON-BLOCKING
    const queueData = {
      messageId: message._id.toString(),
      conversationId: conversationId.toString(),
      contactId: contact._id.toString(),
      channelType: effectiveChannelType,
      channelAccountId: effectiveChannelAccountId.toString(),
      content: content,
      // ✅ Include emailData in queue data for email channel
      ...(effectiveChannelType === 'email' && emailData && { emailData }),
      metadata: {
        ...metadata,
        sentBy: tenantCtx.userId,
        targetIdentifier: identifierToUse,
      },
      tenantId: tenantCtx.tenantId,
      userId: tenantCtx.userId,
    };

    // ✅ Enqueue message to RabbitMQ - MUST await to ensure message is queued
    // ✅ Uses publishOutboundMessage to route webchat to dedicated queue
    const { publishOutboundMessage } = await import('@/lib/queue/rabbitmq');
    try {
      await publishOutboundMessage(queueData);
      console.log(`✅ Message queued to RabbitMQ`, {
        to: identifierToUse,
        channel: effectiveChannelType,
        messageId: message._id
      });
    } catch (queueError) {
      console.error('❌ Failed to queue message:', queueError);
      // Mark message as failed so it doesn't stay pending forever
      await Message.findByIdAndUpdate(message._id, {
        status: 'failed',
        failedAt: new Date(),
        errorMessage: 'Failed to queue message for delivery',
        $set: {
          'metadata.error': 'Failed to queue message for delivery: ' + (queueError.message || 'Unknown error'),
          'metadata.errorCategory': 'queue',
          'metadata.failedAt': new Date(),
        },
      });
      return NextResponse.json(
        { success: false, error: 'Failed to queue message for delivery. Please try again.' },
        { status: 500 }
      );
    }

    // Update conversation with last message info
    try {
    await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: message._id,
        lastMessageContent: lastMessagePreview || content.text || messageContent,
        lastMessageType: content.media?.type || content.template ? 'template' : 'text',
        lastMessageDirection: 'outbound',
      lastMessageAt: new Date(),
      status: 'active',
      contact: contact._id,
    });
      // ✅ Emit conversation update in real-time so lists refresh without reload
      try {
        const SocketEmitter = (await import('@/services/socket/SocketEmitter')).default;
        // ✅ Get conversation to extract departmentId for department-based segregation
        const conversationForSocket = await Conversation.findById(conversationId).select('department contact channel').lean();
        const socketDeptId = conversationForSocket?.department || null;
        
        // ✅ CRITICAL: For company admin unified view, find all grouped conversations
        let allGroupedConversationIds = null;
        if (conversationForSocket?.contact && conversationForSocket?.channel) {
          const contactId = conversationForSocket.contact?.toString() || conversationForSocket.contact;
          const channel = conversationForSocket.channel;
          
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
        
        await SocketEmitter.emitConversationUpdate(
          conversationId,
          {
            lastMessageAt: new Date(),
            lastMessageContent: lastMessagePreview || content.text || messageContent,
            lastMessageType: content.media?.type || (content.template ? 'template' : 'text'),
            lastMessageDirection: 'outbound',
          },
          tenantCtx.tenantId,
          socketDeptId,
          allGroupedConversationIds
        );
      } catch (_) {}
    } catch (convUpdateError) {
      // If there's a cast error due to old string data in lastMessage, clear it first
      if (convUpdateError.name === 'CastError' || convUpdateError.message?.includes('Cast to ObjectId failed')) {
        console.log('⚠️ Fixing conversation with invalid lastMessage type...');
        await Conversation.findByIdAndUpdate(conversationId, {
          $unset: { lastMessage: 1 }, // Remove the invalid field
          lastMessageContent: lastMessagePreview || content.text || messageContent,
          lastMessageType: content.media?.type || content.template ? 'template' : 'text',
          lastMessageDirection: 'outbound',
          lastMessageAt: new Date(),
          status: 'active',
          contact: contact._id,
        });
        // Now set it with the correct value
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: message._id,
        });
      } else {
        throw convUpdateError;
      }
    }

    // ✅ Emit socket events directly via Socket.IO (instead of direct Socket.IO)
    // ⚠️ For template messages, don't emit here - let the worker emit with complete data
    // This prevents placeholder content from replacing optimistic messages
    if (content.type !== 'template') {
    const messageData = {
      _id: message._id,
      conversationId,
      contactId: contact._id,
      channelType: effectiveChannelType,
        channel: effectiveChannelType, // ✅ Include channel for client-side filtering
      content: messageContent,
        type: messageType,
        // ✅ Include attachments in socket event for real-time UI
        attachments: attachments.length > 0 ? attachments.map(att => ({
          type: att.type || 'document',
          url: att.url,
          name: att.name,
          size: att.size,
          mimeType: att.mimeType,
          ...(att.duration && { duration: att.duration })
        })) : [],
        // ✅ Include email data for email messages (always include for email channel)
        ...(effectiveChannelType === 'email' && {
          emailData: message.emailData || {
            subject: emailData?.subject || 'No Subject',
            from: channelAccount.identifier,
            to: [identifierToUse],
          }
        }),
      direction: 'outbound',
      status: 'pending',
      createdAt: message.createdAt,
      sender: tenantCtx.userId,
        // include reply for immediate UI rendering - will be populated below
        replyTo: null,
        // ✅ CRITICAL: Include tempId from optimistic update in metadata (for matching optimistic messages)
        metadata: {
          ...message.metadata,
          ...(metadata?.tempId && { tempId: metadata.tempId }),
        },
      };

      // ✅ Fetch replyTo message content for real-time display
      const replyToId = message.replyTo || content.replyToId || metadata.replyToId;
      if (replyToId) {
        try {
          const replyToMessage = await Message.findById(replyToId).select('content type attachments').lean();
          if (replyToMessage) {
            messageData.replyTo = {
              _id: replyToId,
              content: replyToMessage.content,
              type: replyToMessage.type,
              attachments: replyToMessage.attachments || [],
            };
          }
        } catch (error) {
          console.error('Error fetching replyTo message:', error);
        }
      }

      // ✅ CRITICAL: Populate sender information from masterDB before emission
      if (messageData.sender) {
        try {
          const { getMasterDB } = await import('@/config/database');
          const masterDB = await getMasterDB();
          const UserSchema = (await import('@/models/schemas/User.js')).default;
          const User = masterDB.models.User || masterDB.model('User', UserSchema);
          const sender = await User.findById(messageData.sender).select('firstName lastName avatar role').lean();
          if (sender) {
            messageData.sender = {
              _id: sender._id.toString(),
              firstName: sender.firstName,
              lastName: sender.lastName,
              avatar: sender.avatar,
              role: sender.role
            };
          }
        } catch (error) {
          console.error('❌ Failed to populate sender for real-time emission:', error);
        }
      }

      // ✅ Get conversation department for proper room emission
      const conversationForDept = await Conversation.findById(conversationId).select('department contact channel').lean();
      const deptId = conversationForDept?.department || null;
      
      // ✅ CRITICAL: For company admin unified view, find all grouped conversations
      // This ensures messages are emitted to all grouped conversation rooms
      let allGroupedConversationIds = null;
      if (conversationForDept?.contact && conversationForDept?.channel) {
        const contactId = conversationForDept.contact?.toString() || conversationForDept.contact;
        const channel = conversationForDept.channel;
        
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

      // Emit to conversation room via Socket.IO
      // ✅ CRITICAL: Pass allGroupedConversationIds for company admin unified view
      await SocketEmitter.emitNewMessage(conversationId, messageData, tenantCtx.tenantId, deptId, allGroupedConversationIds);
      
      // Also emit contact info for tenant room
    await SocketEmitter.emit(`tenant:${tenantCtx.tenantId}`, 'message:new', {
      message: messageData,
        conversationId: conversationId.toString(),
      contact: {
        _id: contact._id,
        name: contact.name,
        identifier: identifierToUse,
      },
    });
    } else {
      // ✅ For template messages, log that worker will emit instead
      console.log('📋 Template message - skipping initial socket emit, worker will emit with complete data:', {
        messageId: message._id,
        templateName: content.templateName,
        conversationId,
      });
    }

    // RESPOND IMMEDIATELY - don't wait for queue processing
    // ✅ Schedule conversation mode check if conversation is in manual mode
    // This will check after 2 minutes if there are no new messages and switch to auto mode
    if (conversationMode === 'manual') {
      try {
        const { scheduleConversationModeCheck } = await import('@/services/conversation/ConversationModeScheduler.js');
        await scheduleConversationModeCheck(conversationId, tenantCtx.tenantId);
        console.log(`📅 Scheduled conversation mode check for ${conversationId} (manual mode, message sent)`);
      } catch (error) {
        console.error('❌ Failed to schedule conversation mode check:', error);
        // Don't throw - this is a non-critical operation
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Message queued for delivery',
      data: {
        messageId: message._id,
        contactId: contact._id,
        contactCreated,
        status: 'pending',
        queuedAt: new Date(),
        channelType: effectiveChannelType,
        identifier: identifierToUse,
        immediateResponse: true,
        isTemplate: content.type === 'template',
        templateName: content.templateName,
      },
    });

  } catch (error) {
    console.error('❌ Send message error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to send message',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * Handle message sending for new conversations
 */
async function handleNewConversationMessage(tenantCtx, body) {
  const {
    contactId,
    identifier,
    channelType,
    channelAccountId,
    content,
    metadata = {},
    departmentId,
    attachments = [], // ✅ Handle attachments from request body
  } = body;

  console.log('🆕 Creating new conversation:', {
    channelType,
    channelAccountId,
    contactId,
    identifier,
    contentType: content?.type,
    templateName: content?.templateName
  });

  // Debug template message structure for new conversations
  if (content?.type === 'template') {
    debugTemplateMessage(content);
  }

  // Validate required fields for new conversation
  if (!channelType || !channelAccountId) {
    return NextResponse.json(
      { success: false, message: 'channelType and channelAccountId are required for new conversations' },
      { status: 400 }
    );
  }

  // Validate content
  if (!content || typeof content !== 'object') {
    return NextResponse.json(
      { success: false, message: 'Message content is required' },
      { status: 400 }
    );
  }

  const tenantDB = await getTenantDB(tenantCtx.tenantId);
  
  // Load models using cache
  const Conversation = getModel(tenantDB, 'Conversation', ConversationSchema);
  const Contact = getModel(tenantDB, 'Contact', ContactSchema);
  const CompanyAccount = getModel(tenantDB, 'CompanyAccount', CompanyAccountSchema);
  const Message = getModel(tenantDB, 'Message', MessageSchema);

  // Contact resolution for new conversation
  let contact;
  let contactCreated = false;
  let identifierToUse = null;

  // ✅ Handle contactId (may be null if contact doesn't exist yet - will be created when message is sent)
  if (contactId && contactId !== 'null' && contactId !== null) {
    contact = await Contact.findById(contactId);
    if (!contact) {
      // Contact not found - fall through to create it using identifier
      console.log(`⚠️ Contact ${contactId} not found, will create using identifier`);
      contact = null; // Clear contact so we use identifier path
    } else {
      // Get identifier based on channel type
      identifierToUse = getContactIdentifier(contact, channelType);
      
      if (!identifierToUse) {
        return NextResponse.json(
          { 
            success: false, 
            message: `Contact "${contact.name || contactId}" has no ${channelType} identifier. Available identifiers: ${JSON.stringify(contact.identifiers)}`,
            contactId: contactId,
            availableIdentifiers: contact.identifiers,
            requiresContactUpdate: true
          },
          { status: 400 }
        );
      }

      console.log('✅ Existing contact identifier resolved:', {
        contactId: contact._id,
        name: contact.name,
        channel: channelType,
        identifier: identifierToUse
      });
    }
  }
  
  // ✅ If no contact found or contactId was null, create/find contact using identifier
  if (!contact && identifier) {
    identifierToUse = identifier;
    contact = await findOrCreateContact({
      tenantDB,
      identifier: identifierToUse,
      channelType,
      channelAccountId,
      metadata: {
        ...metadata.contactMetadata,
        tenantId: tenantCtx.tenantId, // ✅ Include tenantId for webchat link generation
      },
    });
    contactCreated = true;
    
    console.log('✅ Contact found/created for new conversation:', {
      contactId: contact._id,
      identifier: identifierToUse,
      channel: channelType,
      wasCreated: contactCreated
    });
  } else if (!contact && !identifier) {
    return NextResponse.json(
      { success: false, message: 'contactId or identifier is required for new conversations' },
      { status: 400 }
    );
  }

  // Verify channel account
  const channelAccount = await CompanyAccount.findById(channelAccountId);
  if (!channelAccount) {
    return NextResponse.json(
      { success: false, message: 'Channel account not found' },
      { status: 404 }
    );
  }

  if (channelAccount.type !== channelType) {
    return NextResponse.json(
      { success: false, message: `Channel account type mismatch. Expected ${channelType}, got ${channelAccount.type}` },
      { status: 400 }
    );
  }

  // WhatsApp template requirement for new conversations
  if (channelType === 'whatsapp') {
    const isTemplateMessage = content.type === 'template' && content.templateName;
    
    if (!isTemplateMessage) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Cannot initiate WhatsApp conversation with free-form message. Use a template message for the first contact.',
          requiresTemplate: true,
        },
        { status: 400 }
      );
    } else {
      console.log('✅ Valid template message for new WhatsApp conversation:', content.templateName);
    }
  }

  // ✅ Determine department - prioritize channel account's department
  let department = departmentId;
  // ✅ First priority: Use department from channel account (since channel already exists in a department)
  if (!department && channelAccount.departmentId) {
    department = channelAccount.departmentId;
    console.log('✅ Using department from channel account:', department);
  } else if (!department && channelAccount.departmentIds && channelAccount.departmentIds.length > 0) {
    // ✅ Use first department from departmentIds array if available
    department = channelAccount.departmentIds[0];
    console.log('✅ Using first department from channel account departmentIds:', department);
  }
  // ✅ Second priority: Use contact's department
  if (!department && contact.department) {
    department = contact.department;
    console.log('✅ Using department from contact:', department);
  }
  // ✅ Third priority: Use user's department
  if (!department && tenantCtx.user?.departments?.[0]) {
    department = tenantCtx.user.departments[0];
    console.log('✅ Using department from user:', department);
  }
  // ✅ Fourth priority: Try to get default department
  if (!department) {
    const Department = getModel(tenantDB, 'Department', DepartmentSchema);
    if (Department) {
      const defaultDept = await Department.findOne({ isDefault: true }).lean();
      if (defaultDept) {
        department = defaultDept._id;
        console.log('✅ Using default department:', department);
      } else {
        // ✅ Try to get first available department
        const firstDept = await Department.findOne().lean();
        if (firstDept) {
          department = firstDept._id;
          console.log('✅ Using first available department:', department);
        }
      }
    }
  }
  // ✅ Only fail if absolutely no department can be determined
  if (!department) {
    return NextResponse.json(
      { success: false, message: 'Department is required but could not be determined. Please assign a department to the channel account or provide departmentId.' },
      { status: 400 }
    );
  }

  // ✅ Create message content and preview BEFORE creating conversation
  // ✅ For WhatsApp templates, show only template name (not "[Template: name]")
  let messageContent;
  if (content.type === 'template' && channelType === 'whatsapp') {
    // ✅ WhatsApp templates: Show only template name (not "[Template: name]")
    messageContent = content.templateName || 'Template';
  } else {
    messageContent = content.renderedText || content.text || content.body ||
      (content.media ? `[${content.media.type}]` : 
      (content.template ? `[Template: ${content.templateName}]` : 
      JSON.stringify(content)));
  }
  
  // Create user-friendly preview for conversation list
  let lastMessagePreview = '';
  if (content.text) {
    lastMessagePreview = `You: ${content.text}`;
  } else if (content.type === 'template' && channelType === 'whatsapp') {
    // ✅ WhatsApp templates: Show only template name
    lastMessagePreview = `You: ${content.templateName || 'Template'}`;
  } else if (content.media) {
    switch (content.media.type) {
      case 'image':
        lastMessagePreview = 'You: 📷 Photo';
        break;
      case 'video':
        lastMessagePreview = 'You: 🎥 Video';
        break;
      case 'audio':
      case 'voice':
        lastMessagePreview = 'You: 🎤 Voice message';
        break;
      case 'document':
        lastMessagePreview = `You: 📄 Document`;
        break;
      default:
        lastMessagePreview = `You: ${content.media.type}`;
    }
  } else if (content.template || content.type === 'template') {
    // ✅ For WhatsApp templates, show only template name
    if (channelType === 'whatsapp') {
      lastMessagePreview = `You: ${content.templateName || 'Template'}`;
    } else {
      lastMessagePreview = `You: 📋 ${content.templateName}`;
    }
  } else if (channelType === 'email' && body.emailData?.subject) {
    // ✅ Email-specific preview with subject
    lastMessagePreview = `📧 ${body.emailData.subject}`;
    if (content.text) {
      const textPreview = content.text.length > 50 
        ? content.text.substring(0, 50) + '...' 
        : content.text;
      lastMessagePreview += `: ${textPreview}`;
    }
  } else {
    lastMessagePreview = 'You: (message)';
  }

  // ✅ Check for existing conversation BEFORE creating new one (prevent duplicates)
  // ✅ CRITICAL: Must match by contact + channel + department for segregation
  let existingConversation = null;
  existingConversation = await Conversation.findOne({
    contact: contact._id,
    channel: channelType,
    department: department, // ✅ CRITICAL: Must match department for segregation
    status: { $in: ['active', 'open', 'pending'] }
  }).sort({ lastMessageAt: -1 }).lean();
  
  // ✅ If found conversation doesn't match channelAccount, try to find one that does
  if (existingConversation && existingConversation.channelAccount?.toString() !== channelAccountId.toString()) {
    const matchingConversation = await Conversation.findOne({
      contact: contact._id,
      channel: channelType,
      department: department, // ✅ CRITICAL: Must match department
      channelAccount: channelAccountId,
      status: { $in: ['active', 'open', 'pending'] }
    }).sort({ lastMessageAt: -1 }).lean();
    
    if (matchingConversation) {
      existingConversation = matchingConversation;
    }
  }

  // ✅ Create new conversation only if it doesn't exist - separate conversation per department
  let conversation;
  if (!existingConversation) {
    // ✅ Determine conversation mode based on department's AI bot enabled status
    const { getConversationModeForDepartment } = await import('@/services/conversation/ConversationModeHelper.js');
    const conversationMode = await getConversationModeForDepartment({
      departmentId: department,
      tenantDB
    });
    
    conversation = await Conversation.create({
    status: 'active',
    channel: channelType,
    channelAccount: channelAccountId,
    contact: contact._id,
      department: department, // Single department per conversation
    assignedTo: tenantCtx.userId,
    mode: conversationMode, // ✅ Set mode based on department AI bot enabled status
    messageCount: 1,
    lastMessageAt: new Date(),
      lastMessageContent: lastMessagePreview || content.text || (content.type === 'template' && channelType === 'whatsapp' ? content.templateName : `[Template: ${content.templateName}]`),
      lastMessageType: content.media?.type || content.template ? 'template' : 'text',
      lastMessageDirection: 'outbound',
    tenantId: tenantCtx.tenantId,
    createdAt: new Date(),
  });
  console.log('💾 New conversation created:', {
    conversationId: conversation._id,
    channel: channelType,
    contact: contact._id,
      department: department,
    identifier: identifierToUse
  });
  } else {
    // ✅ Update existing conversation with new message preview (same department)
    console.log('✅ Found existing conversation, reusing:', {
      conversationId: existingConversation._id,
      channel: channelType,
      contactId: contact._id,
      department: department
    });
    conversation = await Conversation.findByIdAndUpdate(existingConversation._id, {
      lastMessageAt: new Date(),
      lastMessageContent: lastMessagePreview || content.text || (content.type === 'template' && channelType === 'whatsapp' ? content.templateName : `[Template: ${content.templateName}]`),
      lastMessageType: content.media?.type || content.template ? 'template' : 'text',
      lastMessageDirection: 'outbound',
      $inc: { messageCount: 1 },
    }, { new: true });
  }

  console.log(existingConversation ? '✅ Reusing existing conversation' : '💾 New conversation created:', {
    conversationId: conversation._id,
    channel: channelType,
    contact: contact._id,
    identifier: identifierToUse
  });

  // ✅ Auto-merge check: If new conversation, check if we should auto-merge with existing conversation
  if (!existingConversation && !contact.autoMergeDisabled) {
    const mergeableConv = await findMergeableConversation(tenantCtx.tenantId, conversation, contact);
    
    if (mergeableConv) {
      console.log('🔀 Auto-merging conversation:', {
        newConversationId: conversation._id,
        primaryConversationId: mergeableConv._id,
        contact: contact._id
      });

      try {
        // Merge contacts if they're different
        let mergedContact = contact;
        if (mergeableConv.contact.toString() !== contact._id.toString()) {
          const mergeableContact = await Contact.findById(mergeableConv.contact);
          const canMerge = canMergeContacts(contact, mergeableContact);
          
          if (canMerge.canMerge) {
            // Determine which contact to keep (the one from primary conversation)
            if (mergeableConv.createdAt < conversation.createdAt) {
              // Primary is older, merge new contact into primary's contact
              mergedContact = await mergeContacts(tenantCtx.tenantId, mergeableConv.contact, contact._id);
              contact = mergedContact;
            } else {
              // New conversation is older, merge primary's contact into new
              mergedContact = await mergeContacts(tenantCtx.tenantId, contact._id, mergeableConv.contact);
              contact = mergedContact;
            }
          }
        }

        // Perform auto-merge
        const mergeResult = await autoMergeConversation(
          tenantCtx.tenantId,
          conversation._id,
          mergeableConv._id,
          tenantCtx.userId
        );

        // ✅ Check if merge failed due to mode mismatch or other reasons
        if (!mergeResult.success) {
          console.log('⚠️ Auto-merge skipped:', mergeResult.error);
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
        }
        console.log('✅ Auto-merge completed, using primary conversation:', conversation._id);

      } catch (mergeError) {
        console.error('❌ Auto-merge failed, continuing with new conversation:', mergeError);
        // Continue with new conversation if merge fails
      }
    }
  }

  // ✅ Extract emailData from body if present (for email channel)
  const emailData = body.emailData || null;
  
  // ✅ Get conversation to extract departmentId for message segregation
  const conversationForDept = await Conversation.findById(conversation._id).select('department').lean();
  const messageDepartmentId = conversationForDept?.department || department;

  const message = await Message.create({
    conversation: conversation._id,
    contact: contact._id,
    channel: channelType,
    channelAccount: channelAccountId,
    departmentId: messageDepartmentId, // ✅ CRITICAL: Store department ID for message segregation
    sender: tenantCtx.userId,
    type: content.media?.type || (content.type === 'template' ? 'template' : 'text'),
    content: messageContent,
    // ✅ Store email-specific data if channel is email
    ...(channelType === 'email' && emailData && {
      emailData: {
        subject: emailData.subject || 'No Subject',
        from: channelAccount.getDecryptedCredentials()?.fromEmail || channelAccount.identifier,
        to: [identifierToUse], // Primary recipient
        ...(emailData.cc && { cc: Array.isArray(emailData.cc) ? emailData.cc : [emailData.cc] }),
        ...(emailData.bcc && { bcc: Array.isArray(emailData.bcc) ? emailData.bcc : [emailData.bcc] }),
      }
    }),
    metadata: {
      ...metadata,
      sentBy: tenantCtx.userId,
      channelName: channelAccount.name,
      originalContent: content,
      targetIdentifier: identifierToUse,
      // Store template-specific metadata
      ...(content.type === 'template' && {
        templateName: content.templateName,
        templateLanguage: content.templateLanguage || content.languageCode,
        templateParameters: content.parameters || content.bodyParameters
      })
    },
    direction: 'outbound',
    status: 'pending',
    replyTo: content.replyToId || metadata.replyToId || null, // ✅ Save replyTo for UI display
    createdAt: new Date(),
  });

  console.log('💾 New message created:', {
    messageId: message._id,
    type: content.type,
    template: content.templateName,
    to: identifierToUse,
    channel: channelType
  });

  // ✅ Removed message creation logging - only log final outcome (sent/failed) in worker
  // This ensures exactly 1 log per message

  // Enqueue message - NON-BLOCKING
  const queueData = {
    messageId: message._id.toString(),
    conversationId: conversation._id.toString(),
    contactId: contact._id.toString(),
    channelType,
    channelAccountId: channelAccountId.toString(),
    content: content,
    // ✅ Include emailData in queue data for email channel
    ...(channelType === 'email' && emailData && { emailData }),
    metadata: {
      ...metadata,
      sentBy: tenantCtx.userId,
      targetIdentifier: identifierToUse,
    },
    tenantId: tenantCtx.tenantId,
    userId: tenantCtx.userId,
  };

  // ✅ Enqueue message to RabbitMQ - MUST await to ensure message is queued
  // ✅ Uses publishOutboundMessage to route webchat to dedicated queue
  const { publishOutboundMessage } = await import('@/lib/queue/rabbitmq');
  try {
    await publishOutboundMessage(queueData);
    console.log(`✅ New conversation message queued to RabbitMQ`, {
      to: identifierToUse,
      channel: channelType,
      messageId: message._id
    });
  } catch (queueError) {
    console.error('❌ Failed to queue new conversation message:', queueError);
    // Mark message as failed so it doesn't stay pending forever
    await Message.findByIdAndUpdate(message._id, {
      status: 'failed',
      failedAt: new Date(),
      errorMessage: 'Failed to queue message for delivery',
      $set: {
        'metadata.error': 'Failed to queue message for delivery: ' + (queueError.message || 'Unknown error'),
        'metadata.errorCategory': 'queue',
        'metadata.failedAt': new Date(),
      },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to queue message for delivery. Please try again.' },
      { status: 500 }
    );
  }

  // ✅ Emit socket events directly via Socket.IO
  const messageData = {
    _id: message._id,
    conversationId: conversation._id,
    contactId: contact._id,
    channelType,
    content: messageContent,
    direction: 'outbound',
    status: 'pending',
    createdAt: message.createdAt,
    sender: tenantCtx.userId,
    metadata: message.metadata,
    replyTo: message.replyTo || (content.replyToId || metadata.replyToId || null),
    // ✅ Include emailData for email messages
    ...(channelType === 'email' && message.emailData && { emailData: message.emailData }),
  };

  // ✅ Fetch full contact data with all fields for proper display
  const fullContact = await Contact.findById(contact._id)
    .select('name displayName phone email avatar identifiers')
    .lean();

  // ✅ Prepare complete contact data for socket emission
  const contactDataForEmission = {
    _id: fullContact._id,
    name: fullContact.name || fullContact.displayName || null,
    displayName: fullContact.displayName || fullContact.name || null,
    phone: fullContact.phone || null,
    email: fullContact.email || null,
    avatar: fullContact.avatar || null,
    identifiers: fullContact.identifiers || {},
  };

  // ✅ Emit new conversation event using proper method for department-based segregation
  await SocketEmitter.emitNewConversation(
    tenantCtx.tenantId,
    {
      _id: conversation._id,
      status: 'active',
      channel: channelType,
      contact: contact._id,
      department: department,
      lastMessageAt: conversation.lastMessageAt,
      lastMessageContent: conversation.lastMessageContent,
      messageCount: 1,
      assignedTo: tenantCtx.userId,
      channelAccount: {
        _id: channelAccount._id,
        name: channelAccount.name,
        type: channelAccount.type
      },
      // ✅ Include full contact data for proper display in conversation list
      contactData: contactDataForEmission,
      contact: contactDataForEmission,
    },
    messageData,
    contactDataForEmission,
    department
  );

  // Emit new message event
  await SocketEmitter.emit(`conversation:${conversation._id}`, 'message:new', {
    message: messageData,
  });

  // Respond immediately
  return NextResponse.json({
    success: true,
    message: 'Conversation created and message queued for delivery',
    data: {
      conversationId: conversation._id,
      messageId: message._id,
      contactId: contact._id,
      contactCreated,
      status: 'pending',
      queuedAt: new Date(),
      channelType: channelType,
      identifier: identifierToUse,
      isTemplate: content.type === 'template',
      templateName: content.templateName,
    },
  });
}

// Optional: Add GET method for testing
export async function GET(request) {
  return NextResponse.json({
    success: true,
    message: 'Messages API is working',
    timestamp: new Date().toISOString(),
  });
}