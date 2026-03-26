// src/app/api/tracking/email/[messageId]/read.gif/route.js
import { NextResponse } from 'next/server';
import { getTenantDB, getMasterDB } from '@/config/database';
import MessageSchema from '@/models/schemas/Message';
import CompanySchema from '@/models/schemas/Company';
import SocketEmitter from '@/services/socket/SocketEmitter';

const TRANSPARENT_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const GIF_HEADERS = {
  'Content-Type': 'image/gif',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

function returnGif() {
  return new NextResponse(TRANSPARENT_GIF, { headers: GIF_HEADERS });
}

/**
 * GET /api/tracking/email/[messageId]/read.gif
 * Email read receipt tracking pixel — updates message status to "read" in real-time.
 */
export async function GET(request, { params }) {
  try {
    const { messageId } = await params;
    if (!messageId || !/^[a-f\d]{24}$/i.test(messageId)) {
      return returnGif();
    }

    // Search tenant databases for the message
    let tenantId = null;
    let tenantDB = null;
    let message = null;

    try {
      const masterDB = await getMasterDB();
      const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
      const companies = await Company.find({ status: { $ne: 'inactive' } }).select('_id tenantDatabaseName').lean();

      for (const company of companies) {
        const tid = company.tenantDatabaseName
          ? company.tenantDatabaseName.replace('tenant_', '')
          : company._id.toString();
        if (!tid) continue;

        try {
          const tDB = await getTenantDB(tid);
          const Message = tDB.models.Message || tDB.model('Message', MessageSchema);
          const msg = await Message.findById(messageId).select('status conversation channel').lean();
          if (msg) {
            tenantId = tid;
            tenantDB = tDB;
            message = msg;
            break;
          }
        } catch (_) {
          continue;
        }
      }
    } catch (dbErr) {
      // DB error — return GIF silently
      return returnGif();
    }

    if (!tenantId || !message) {
      return returnGif();
    }

    // Only update if not already read
    if (message.status !== 'read') {
      const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
      const ConversationSchema = (await import('@/models/schemas/Conversation')).default;
      const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);

      await Message.findByIdAndUpdate(messageId, {
        status: 'read',
        readAt: new Date(),
        $set: {
          'metadata.readAt': new Date(),
          'metadata.readTracking': {
            trackedAt: new Date(),
            userAgent: request.headers.get('user-agent')?.substring(0, 200),
          },
        },
      });

      // Emit read receipt in real-time
      try {
        const conv = await Conversation.findById(message.conversation).select('department').lean();
        const deptId = conv?.department?.toString();

        await SocketEmitter.emitMessageStatus(
          message.conversation.toString(), messageId, 'read', tenantId,
          { readAt: new Date() }, deptId
        );
      } catch (socketErr) {
        // Non-critical
      }
    }

    return returnGif();
  } catch (error) {
    return returnGif();
  }
}
