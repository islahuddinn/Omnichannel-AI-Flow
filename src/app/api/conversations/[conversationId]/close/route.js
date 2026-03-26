// src/app/api/conversations/[conversationId]/close/route.js
import { NextResponse } from 'next/server';
import { connectToTenantDB } from '@/lib/db/connection';
import Conversation from '@/models/schemas/Conversation';
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
    const { reason } = await request.json();

    const tenantId = getTenantContext();
    const db = await connectToTenantDB(tenantId);

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // ✅ Check department access for agents (not just assignedTo)
    if (auth.user.role === 'agent') {
      const userDepartments = (auth.user.departments || []).map(d => d.toString());
      const isInDepartment = userDepartments.includes(conversation.department?.toString());
      const isAssigned = conversation.assignedTo?.toString() === auth.user.userId;
      if (!isInDepartment && !isAssigned) {
        return NextResponse.json({ success: false, error: 'You do not have access to this conversation' }, { status: 403 });
      }
    }

    conversation.status = 'closed';
    conversation.closedAt = new Date();
    conversation.closedBy = auth.user.userId;
    if (reason) conversation.closeReason = reason;

    await conversation.save();

    // Emit socket event
    const io = getIO();
    io.to(`tenant:${tenantId}`).emit('conversation:closed', {
      conversationId,
      closedBy: auth.user.userId
    });

    return NextResponse.json({
      success: true,
      message: 'Conversation closed successfully',
      data: conversation
    });
  } catch (error) {
    console.error('Close conversation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to close conversation' },
      { status: 500 }
    );
  }
}