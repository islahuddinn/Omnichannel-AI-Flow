// src/app/api/conversations/[conversationId]/transfer/route.js
import { NextResponse } from 'next/server';
import { connectToTenantDB } from '@/lib/db/connection';
import Conversation from '@/models/schemas/Conversation';
import Department from '@/models/schemas/Department';
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
    const { departmentId, agentId, reason } = await request.json();

    if (!departmentId) {
      return NextResponse.json(
        { success: false, error: 'Department ID is required' },
        { status: 400 }
      );
    }

    const tenantId = getTenantContext();
    const db = await connectToTenantDB(tenantId);

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Verify department exists
    const department = await Department.findById(departmentId);
    if (!department) {
      return NextResponse.json(
        { success: false, error: 'Department not found' },
        { status: 404 }
      );
    }

    // Validate agent belongs to target department (if agentId provided)
    if (agentId) {
      const UserSchema = (await import('@/models/schemas/User')).default;
      const User = db.models?.User || db.model('User', UserSchema);
      const targetAgent = await User.findById(agentId).lean();
      if (!targetAgent) {
        return NextResponse.json(
          { success: false, error: 'Agent not found' },
          { status: 404 }
        );
      }
      const agentDepartments = (targetAgent.departments || []).map(d => d.toString());
      if (!agentDepartments.includes(departmentId.toString())) {
        return NextResponse.json(
          { success: false, error: 'Agent does not belong to the target department' },
          { status: 400 }
        );
      }
    }

    const previousDepartment = conversation.department;
    const previousAgent = conversation.assignedTo;

    conversation.department = departmentId;
    conversation.assignedTo = agentId || null;
    conversation.transferHistory = conversation.transferHistory || [];
    conversation.transferHistory.push({
      from: { department: previousDepartment, agent: previousAgent },
      to: { department: departmentId, agent: agentId },
      reason,
      transferredBy: auth.user.userId,
      transferredAt: new Date()
    });

    await conversation.save();

    // Emit socket event
    const io = getIO();
    io.to(`tenant:${tenantId}`).emit('conversation:transferred', {
      conversationId,
      departmentId,
      agentId
    });

    return NextResponse.json({
      success: true,
      message: 'Conversation transferred successfully',
      data: conversation
    });
  } catch (error) {
    console.error('Transfer conversation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to transfer conversation' },
      { status: 500 }
    );
  }
}