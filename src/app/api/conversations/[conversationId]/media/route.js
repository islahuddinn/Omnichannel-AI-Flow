// src/app/api/conversations/[conversationId]/media/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import MessageSchema from '@/models/schemas/Message';

/**
 * GET /api/conversations/[conversationId]/media
 * Returns all media, documents, and links from a conversation.
 * Query params: type=media|documents|links (default: all)
 */
export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    const { searchParams } = new URL(request.url);
    const filterType = searchParams.get('type') || 'all';

    const baseQuery = {
      conversation: conversationId,
      deleted: { $ne: true },
    };

    const results = {};

    // Media (images + videos)
    if (filterType === 'all' || filterType === 'media') {
      const mediaMessages = await Message.find({
        ...baseQuery,
        $or: [
          { type: { $in: ['image', 'video', 'sticker'] } },
          { 'attachments.type': { $in: ['image', 'video'] } },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .select('type attachments content createdAt direction metadata caption')
        .lean();

      results.media = mediaMessages.map(msg => {
        const att = msg.attachments?.[0];
        return {
          messageId: msg._id,
          type: att?.type || msg.type,
          url: att?.url,
          name: att?.name,
          size: att?.size,
          mimeType: att?.mimeType,
          thumbnail: att?.thumbnail,
          width: att?.width,
          height: att?.height,
          duration: att?.duration,
          caption: att?.caption || msg.caption || null,
          direction: msg.direction,
          createdAt: msg.createdAt,
        };
      }).filter(m => m.url);
    }

    // Documents
    if (filterType === 'all' || filterType === 'documents') {
      const docMessages = await Message.find({
        ...baseQuery,
        $or: [
          { type: 'document' },
          { 'attachments.type': 'document' },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .select('type attachments content createdAt direction')
        .lean();

      results.documents = docMessages.map(msg => {
        const att = msg.attachments?.[0];
        return {
          messageId: msg._id,
          type: 'document',
          url: att?.url,
          name: att?.name || 'Document',
          size: att?.size,
          mimeType: att?.mimeType,
          direction: msg.direction,
          createdAt: msg.createdAt,
        };
      }).filter(d => d.url);
    }

    // Links (extract URLs from text messages)
    if (filterType === 'all' || filterType === 'links') {
      const textMessages = await Message.find({
        ...baseQuery,
        type: 'text',
        content: { $regex: 'https?://', $options: 'i' },
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .select('content createdAt direction')
        .lean();

      const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
      results.links = textMessages.flatMap(msg => {
        const text = typeof msg.content === 'string' ? msg.content : msg.content?.text || '';
        const urls = text.match(urlRegex) || [];
        return urls.map(url => ({
          messageId: msg._id,
          url,
          text: text.substring(0, 100),
          direction: msg.direction,
          createdAt: msg.createdAt,
        }));
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        media: results.media || [],
        documents: results.documents || [],
        links: results.links || [],
        counts: {
          media: (results.media || []).length,
          documents: (results.documents || []).length,
          links: (results.links || []).length,
        },
      },
    });
  } catch (error) {
    console.error('[MediaGallery] GET error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch media' },
      { status: 500 }
    );
  }
}
