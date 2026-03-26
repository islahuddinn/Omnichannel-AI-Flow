// src/app/api/conversations/[conversationId]/assign/route.js
import { NextResponse } from 'next/server';
import { connectToTenantDB, connectToMasterDB } from '@/lib/db/connection';
import Conversation from '@/models/schemas/Conversation';
import User from '@/models/schemas/User';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getIO } from '@/lib/socket/server';

export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId } = await params;
    const { agentId } = await request.json();

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'Agent ID is required' },
        { status: 400 }
      );
    }

    const tenantId = getTenantContext();
    const tenantDb = await connectToTenantDB(tenantId);
    const masterDb = await connectToMasterDB();

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Verify agent exists
    const agent = await User.findById(agentId);
    if (!agent || agent.role !== 'agent') {
      return NextResponse.json(
        { success: false, error: 'Invalid agent' },
        { status: 400 }
      );
    }

    const previousAgent = conversation.assignedTo;
    conversation.assignedTo = agentId;
    conversation.status = 'open';
    await conversation.save();

    // Emit socket event
    const io = getIO();
    io.to(`tenant:${tenantId}`).emit('conversation:assigned', {
      conversationId,
      agentId,
      previousAgent
    });

    return NextResponse.json({
      success: true,
      message: 'Conversation assigned successfully',
      data: conversation
    });
  } catch (error) {
    console.error('Assign conversation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to assign conversation' },
      { status: 500 }
    );
  }
}