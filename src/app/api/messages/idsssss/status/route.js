// src/app/api/messages/[messageId]/status/route.js
import { NextResponse } from 'next/server';
import { connectToTenantDB } from '@/lib/db/connection';
import Message from '@/models/schemas/Message';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getIO } from '@/lib/socket/server';

export async function PUT(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { messageId } = await params;
    const { status } = await request.json();

    const validStatuses = ['pending', 'sent', 'delivered', 'read', 'failed'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status' },
        { status: 400 }
      );
    }

    const tenantId = getTenantContext();
    const db = await connectToTenantDB(tenantId);

    const message = await Message.findById(messageId);
    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    message.status = status;
    
    switch(status) {
      case 'sent':
        message.sentAt = new Date();
        break;
      case 'delivered':
        message.deliveredAt = new Date();
        break;
      case 'read':
        message.readAt = new Date();
        break;
      case 'failed':
        message.failedAt = new Date();
        break;
    }

    await message.save();

    // Emit socket event
    const io = getIO();
    io.to(`tenant:${tenantId}`).emit('message:status', {
      messageId,
      status,
      timestamp: new Date()
    });

    return NextResponse.json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('Update message status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update message status' },
      { status: 500 }
    );
  }
}