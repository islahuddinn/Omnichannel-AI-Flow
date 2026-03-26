// src/app/api/messages/[conversationId]/resend/route.js

import { NextResponse } from 'next/server';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import MessageSchema from '@/models/schemas/Message';
import ConversationSchema from '@/models/schemas/Conversation';
import { publishToQueue, publishOutboundMessage, QUEUES } from '@/lib/queue/rabbitmq.js';
import SocketEmitter from '@/services/socket/SocketEmitter.js';
import MessageLogService from '@/services/message/MessageLogService.js';

/**
 * POST /api/messages/[conversationId]/resend
 * Resend a failed message
 * Body: { messageId: string }
 */
export async function POST(request, { params }) {
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
    const { conversationId } = await params;
    const body = await request.json();
    const { messageId } = body;
    
    if (!messageId) {
      return NextResponse.json(
        { success: false, message: 'Message ID is required in request body' },
        { status: 400 }
      );
    }
    
    const tenantDB = await getTenantDB(tenantCtx.tenantId);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);

    // Find message
    const message = await Message.findById(messageId);
    if (!message) {
      return NextResponse.json(
        { success: false, message: 'Message not found' },
        { status: 404 }
      );
    }

    // Verify message belongs to this conversation
    if (message.conversation?.toString() !== conversationId && message.conversationId?.toString() !== conversationId) {
      return NextResponse.json(
        { success: false, message: 'Message does not belong to this conversation' },
        { status: 400 }
      );
    }

    // Allow resend for failed messages and stuck pending messages (older than 2 minutes)
    const isPending = message.status === 'pending';
    const isFailed = message.status === 'failed';
    const isSending = message.status === 'sending';
    const isStuckPending = isPending && message.createdAt && (Date.now() - new Date(message.createdAt).getTime() > 2 * 60 * 1000);
    const isStuckSending = isSending && message.createdAt && (Date.now() - new Date(message.createdAt).getTime() > 5 * 60 * 1000);

    if (!isFailed && !isStuckPending && !isStuckSending) {
      return NextResponse.json(
        { success: false, message: 'Only failed or stuck messages can be resent' },
        { status: 400 }
      );
    }

    // Find conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return NextResponse.json(
        { success: false, message: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Verify user has access to this conversation (instead of checking sender match)
    // Allow resend if user has access to the conversation
    const hasAccess = conversation.assignedTo?.toString() === tenantCtx.userId?.toString() ||
                      conversation.createdBy?.toString() === tenantCtx.userId?.toString() ||
                      message.sender?.toString() === tenantCtx.userId?.toString();
    
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized to resend this message' },
        { status: 403 }
      );
    }

    // ✅ Log message resend
    await MessageLogService.logMessageResend(tenantCtx.tenantId, message, {
      attempt: (message.metadata?.resendAttempts || 0) + 1,
      originalFailedAt: message.failedAt,
      userId: tenantCtx.userId
    });

    // ✅ Convert metadata to plain object if it's a Mongoose Map
    const metadataPlain = message.metadata instanceof Map 
      ? Object.fromEntries(message.metadata)
      : (message.metadata?.toObject ? message.metadata.toObject() : (message.metadata || {}));
    
    // Update message status to pending
    await Message.findByIdAndUpdate(messageId, {
      status: 'pending',
      $unset: { 
        failedAt: 1,
        errorMessage: 1 
      },
      $set: {
        'metadata.resendAttempts': (metadataPlain?.resendAttempts || 0) + 1,
        'metadata.lastResendAt': new Date().toISOString()
      }
    });

    // Emit status update via socket
    await SocketEmitter.emit(`conversation:${conversationId}`, 'message:status', {
      messageId: messageId.toString(),
      conversationId: conversationId.toString(),
      status: 'pending',
      timestamp: new Date().toISOString()
    });

    // ✅ Convert metadata to plain object if it's a Mongoose Map (reuse from above)
    // Queue message for resending via RabbitMQ
    const channelType = message.channel || conversation.channel;
    const queueData = {
      messageId: messageId.toString(),
      conversationId: conversationId.toString(),
      contactId: message.contact?.toString() || conversation.contact?.toString(),
      channelType,
      channelAccountId: (message.channelAccount || conversation.channelAccount)?.toString(),
      content: metadataPlain?.originalContent || {
        text: message.content,
        type: message.type,
        ...(message.attachments?.length > 0 && { attachments: message.attachments })
      },
      // ✅ Include emailData for email channel resends (required for subject, to, cc, bcc)
      ...(channelType === 'email' && message.emailData && {
        emailData: message.emailData.toObject ? message.emailData.toObject() : message.emailData
      }),
      metadata: {
        ...metadataPlain,
        isResend: true,
        resendAttempts: (metadataPlain?.resendAttempts || 0) + 1
      },
      tenantId: tenantCtx.tenantId,
      userId: tenantCtx.userId,
    };

    // ✅ Enqueue to RabbitMQ (routes webchat to dedicated queue)
    await publishOutboundMessage(queueData);

    console.log(`✅ Message queued for resend: ${messageId}`);

    return NextResponse.json({
      success: true,
      message: 'Message queued for resend',
      data: {
        messageId: messageId.toString(),
        status: 'pending',
        resendAttempts: (metadataPlain?.resendAttempts || 0) + 1
      }
    });
  } catch (error) {
    console.error('❌ Error resending message:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to resend message' },
      { status: 500 }
    );
  }
}