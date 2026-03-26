// src/app/api/analytics/messages/failed/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import MessageSchema from '@/models/schemas/Message';
import ConversationSchema from '@/models/schemas/Conversation';
import ContactSchema from '@/models/schemas/Contact';

/**
 * GET /api/analytics/messages/failed
 * Returns messages stuck in 'failed' or 'retrying' status for the dashboard.
 *
 * Query params:
 *   - status: 'failed' | 'retrying' | 'all' (default 'all')
 *   - limit: max results (default 50, max 200)
 *   - page: page number (default 1)
 */
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin', 'agent'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);

    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') || 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const page = parseInt(searchParams.get('page') || '1', 10);

    const query = { direction: 'outbound' };
    if (statusFilter === 'failed') {
      query.status = 'failed';
    } else if (statusFilter === 'retrying') {
      query.status = 'retrying';
    } else {
      query.status = { $in: ['failed', 'retrying'] };
    }

    const [messages, total] = await Promise.all([
      Message.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('content channel status errorMessage createdAt failedAt conversation contact metadata')
        .lean(),
      Message.countDocuments(query),
    ]);

    // Enrich with contact and conversation info
    const enriched = await Promise.all(messages.map(async (msg) => {
      let contactName = 'Unknown';
      let conversationChannel = msg.channel;

      try {
        if (msg.contact) {
          const contact = await Contact.findById(msg.contact).select('name displayName phone email').lean();
          if (contact) contactName = contact.name || contact.displayName || contact.phone || contact.email || 'Unknown';
        }
      } catch (_) {}

      const meta = msg.metadata;
      let errorCategory = 'unknown';
      let retryable = false;

      if (meta instanceof Map) {
        errorCategory = meta.get('errorCategory') || 'unknown';
        retryable = meta.get('errorRetryable') || false;
      } else if (meta && typeof meta === 'object') {
        errorCategory = meta.errorCategory || 'unknown';
        retryable = meta.errorRetryable || false;
      }

      return {
        _id: msg._id,
        status: msg.status,
        channel: conversationChannel,
        contactName,
        errorMessage: msg.errorMessage || 'Unknown error',
        errorCategory,
        retryable,
        createdAt: msg.createdAt,
        failedAt: msg.failedAt,
        content: typeof msg.content === 'string' ? msg.content.substring(0, 100) : '[non-text]',
      };
    }));

    // Summary counts
    const [failedCount, retryingCount] = await Promise.all([
      Message.countDocuments({ direction: 'outbound', status: 'failed' }),
      Message.countDocuments({ direction: 'outbound', status: 'retrying' }),
    ]);

    return NextResponse.json({
      success: true,
      data: enriched,
      summary: { failed: failedCount, retrying: retryingCount, total: failedCount + retryingCount },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[FailedMessages] GET error:', error?.message || error);
    return NextResponse.json({ success: false, error: 'Failed to fetch messages' }, { status: 500 });
  }
}
