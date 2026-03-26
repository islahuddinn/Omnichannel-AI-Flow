// src/app/api/messages/[messageId]/reactions/route.js
import { NextResponse } from 'next/server';
import { connectToTenantDB } from '@/lib/db/connection';
import Message from '@/models/schemas/Message';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getIO } from '@/lib/socket/server';

export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const { messageId } = resolvedParams;
    const { reaction } = await request.json();

    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
    }
    const tenantId = context.tenantId;
    const db = await connectToTenantDB(tenantId);

    const MessageModel = db.models.Message || db.model('Message', Message);
    const message = await MessageModel.findById(messageId);
    
    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    message.reactions = message.reactions || [];
    
    // Check if user already reacted with this emoji
    const existingReactionIndex = message.reactions.findIndex(
      r => r.reaction === reaction && r.userId.toString() === auth.user.userId
    );

    let finalReaction = reaction;
    if (existingReactionIndex >= 0) {
      // Remove reaction (toggle off)
      message.reactions.splice(existingReactionIndex, 1);
      finalReaction = null; // Indicate removal in socket event
    } else {
      // Remove any other reaction from this user first
      message.reactions = message.reactions.filter(
        r => r.userId.toString() !== auth.user.userId
      );
      
      // Add new reaction
      message.reactions.push({
        reaction,
        userId: auth.user.userId,
        createdAt: new Date()
      });
    }

    await message.save();

    // Emit socket event
    const io = getIO();
    io.to(`tenant:${tenantId}`).emit('message:reaction', {
      messageId,
      conversationId: message.conversation,
      reaction: finalReaction, // null if removed
      userId: auth.user.userId
    });

    return NextResponse.json({
      success: true,
      data: message.reactions
    });
  } catch (error) {
    console.error('Toggle reaction error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to toggle reaction' },
      { status: 500 }
    );
  }
}