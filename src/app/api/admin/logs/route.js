// src/app/api/admin/logs/route.js
import { NextResponse } from 'next/server';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import MessageLogSchema from '@/models/schemas/MessageLog';
import { verifyAuth } from '@/middleware/auth';

/**
 * GET /api/admin/logs
 * Get message logs with filters (admin only)
 * Query params:
 * - messageId: Filter by message ID
 * - conversationId: Filter by conversation ID
 * - channel: Filter by channel (whatsapp, sms, email, etc.)
 * - eventType: Filter by event type
 * - status: Filter by status
 * - startDate: ISO date string
 * - endDate: ISO date string
 * - page: Page number (default: 1)
 * - limit: Results per page (default: 50)
 */
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 403 });
    }

    const tenantCtx = await getTenantContext(request);

    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get('messageId');
    const conversationId = searchParams.get('conversationId');
    const channel = searchParams.get('channel');
    const eventType = searchParams.get('eventType');
    const status = searchParams.get('status');
    const logType = searchParams.get('logType'); // 'message', 'automation', or 'all'
    const automationId = searchParams.get('automationId');
    const contactName = searchParams.get('contactName');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));
    const skip = (page - 1) * limit;

    const tenantDB = await getTenantDB(tenantCtx.tenantId);
    const MessageLog = tenantDB.models.MessageLog || tenantDB.model('MessageLog', MessageLogSchema);

    // ✅ CRITICAL: MessageLog schema uses 'tenantId' as String, not 'tenant' as ObjectId
    // Convert tenantId to string for query
    const tenantId = tenantCtx.tenantId?.toString ? tenantCtx.tenantId.toString() : String(tenantCtx.tenantId);
    
    const query = { tenantId: tenantId }; // ✅ Use tenantId (String) for query
    
    if (messageId) {
      query.messageId = messageId;
    }

    if (conversationId) {
      query.conversationId = conversationId;
    }
    
    if (channel) {
      query.channel = channel;
    }
    
    if (eventType) {
      query.eventType = eventType;
    }
    
    if (status) {
      query.status = status;
    }
    
    // Filter by logType — only show message logs (exclude OWM/automation logs)
    if (logType && logType !== 'all') {
      query.logType = logType;
    } else {
      // Default: exclude automation/OWM logs from the logs page
      query.logType = { $ne: 'automation' };
    }
    
    // Filter by automationId
    if (automationId) {
      query.automationId = automationId;
    }

    // Filter by contact name (search across contacts)
    if (contactName && contactName.trim()) {
      try {
        const ContactSchema = (await import('@/models/schemas/Contact')).default;
        const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
        const matchingContacts = await Contact.find({
          $or: [
            { name: { $regex: contactName.trim(), $options: 'i' } },
            { displayName: { $regex: contactName.trim(), $options: 'i' } },
            { phone: { $regex: contactName.trim(), $options: 'i' } },
            { email: { $regex: contactName.trim(), $options: 'i' } },
          ],
        }).select('_id').limit(50).lean();
        if (matchingContacts.length > 0) {
          query.contactId = { $in: matchingContacts.map(c => c._id) };
        } else {
          // No matching contacts — return empty result
          query.contactId = { $in: [] };
        }
      } catch (contactErr) {
        console.warn('[Logs] Contact name search failed:', contactErr.message);
      }
    }
    
    // Date filtering - use createdAt field
    // ✅ Always apply date filter if provided, don't fallback
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        // ✅ Parse ISO string date - handle both ISO string and YYYY-MM-DD format
        let start;
        if (startDate.includes('T')) {
          // Already an ISO string
          start = new Date(startDate);
        } else {
          // YYYY-MM-DD format - parse as UTC date
          const [year, month, day] = startDate.split('-').map(Number);
          start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        }
        
        if (!isNaN(start.getTime())) {
          start.setUTCHours(0, 0, 0, 0);
          query.createdAt.$gte = start;
        }
      }
      if (endDate) {
        // ✅ Parse ISO string date - handle both ISO string and YYYY-MM-DD format
        let end;
        if (endDate.includes('T')) {
          // Already an ISO string
          end = new Date(endDate);
        } else {
          // YYYY-MM-DD format - parse as UTC date
          const [year, month, day] = endDate.split('-').map(Number);
          end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
        }
        
        if (!isNaN(end.getTime())) {
          end.setUTCHours(23, 59, 59, 999);
          query.createdAt.$lte = end;
        }
      }
    }
    
    // Get logs with pagination
    const logs = await MessageLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('messageId', 'content type direction status channel')
      .populate('conversationId', 'channel contact')
      .populate('contactId', 'name email phone')
      .populate('automationId', 'name')
      .populate('userId', 'firstName lastName email')
      .lean();

    // Get total count
    const total = await MessageLog.countDocuments(query);

    return NextResponse.json({
      success: true,
      data: {
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('[MessageLogs] GET error:', error?.message || error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}

