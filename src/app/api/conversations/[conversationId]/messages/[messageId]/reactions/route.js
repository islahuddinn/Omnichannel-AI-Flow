// src/app/api/conversations/[conversationId]/messages/[messageId]/reactions/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import MessageSchema from '@/models/schemas/Message';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import SocketEmitter from '@/services/socket/SocketEmitter';

// POST - Add reaction
export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { messageId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    
    const body = await request.json();
    const { emoji } = body;

    if (!emoji) {
      return NextResponse.json(
        { success: false, error: 'Emoji is required' },
        { status: 400 }
      );
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    // Initialize reactions array if it doesn't exist
    if (!message.reactions) {
      message.reactions = [];
    }

    // ✅ Check if user already reacted with this emoji (support both user and contact)
    const existingReaction = message.reactions.find(
      r => (r.user?.toString() === auth.user.userId || r.contact?.toString() === auth.user.userId) && r.emoji === emoji
    );

    if (existingReaction) {
      return NextResponse.json(
        { success: false, error: 'You already reacted with this emoji' },
        { status: 400 }
      );
    }

    // ✅ Add new reaction (use user field for agents/admins, contact field for webchat visitors)
    // For now, we'll use user field for authenticated users (agents/admins)
    // Webchat visitors will use the socket handler which uses contact field
    message.reactions.push({
      user: auth.user.userId,
      emoji,
      createdAt: new Date()
    });

    await message.save();

    // Emit socket event
    await SocketEmitter.emitReactionAdded(
      message.conversation,
      messageId,
      {
        user: {
          _id: auth.user.userId,
          firstName: auth.user.firstName,
          lastName: auth.user.lastName
        },
        emoji,
        createdAt: new Date()
      },
      context.tenantId
    );

    return NextResponse.json({
      success: true,
      data: message.reactions
    });

  } catch (error) {
    console.error('Add reaction error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Remove reaction
export async function DELETE(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { messageId } = await params;
    const { searchParams } = new URL(request.url);
    const emoji = searchParams.get('emoji');

    if (!emoji) {
      return NextResponse.json(
        { success: false, error: 'Emoji parameter is required' },
        { status: 400 }
      );
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    const message = await Message.findById(messageId);
    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    // ✅ Remove reaction (support both user and contact)
    message.reactions = message.reactions.filter(
      r => !((r.user?.toString() === auth.user.userId || r.contact?.toString() === auth.user.userId) && r.emoji === emoji)
    );

    await message.save();

    // Emit socket event
    await SocketEmitter.emitReactionRemoved(
      message.conversation,
      messageId,
      auth.user.userId,
      emoji,
      context.tenantId
    );

    return NextResponse.json({
      success: true,
      data: message.reactions
    });

  } catch (error) {
    console.error('Remove reaction error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// GET - Get all reactions for a message
export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { messageId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    const message = await Message.findById(messageId)
      .populate('reactions.user', 'firstName lastName avatar')
      .lean();

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: message.reactions || []
    });

  } catch (error) {
    console.error('Get reactions error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}