// src/app/api/admin/logs/[messageId]/route.js
import { NextResponse } from 'next/server';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import MessageLogSchema from '@/models/schemas/MessageLog';
import { verifyAuth } from '@/middleware/auth';

/**
 * GET /api/admin/logs/[messageId]
 * Get all logs for a specific message (admin only)
 */
export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 403 });
    }

    const tenantCtx = await getTenantContext(request);

    const { messageId } = await params;

    const tenantDB = await getTenantDB(tenantCtx.tenantId);
    const MessageLog = tenantDB.models.MessageLog || tenantDB.model('MessageLog', MessageLogSchema);

    const tenantId = tenantCtx.tenantId?.toString ? tenantCtx.tenantId.toString() : String(tenantCtx.tenantId);

    const logs = await MessageLog.find({
      tenantId: tenantId,
      messageId: messageId
    })
      .sort({ createdAt: 1 }) // Chronological order
      .populate('messageId', 'content type direction status channel')
      .populate('conversationId', 'channel contact')
      .populate('contactId', 'name email phone')
      .populate('userId', 'firstName lastName email')
      .lean();

    return NextResponse.json({
      success: true,
      data: { logs }
    });
  } catch (error) {
    console.error('❌ Error fetching message logs:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}

