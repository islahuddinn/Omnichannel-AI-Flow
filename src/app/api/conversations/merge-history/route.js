// src/app/api/conversations/merge-history/route.js
/**
 * Merge History API
 * Get merge/unmerge history for conversations or contacts
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import ConversationSchema from '@/models/schemas/Conversation';

/**
 * GET /api/conversations/merge-history?conversationId=xxx
 * or
 * GET /api/conversations/merge-history?contactId=xxx
 *
 * Get merge history for a conversation or contact
 */
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    const contactId = searchParams.get('contactId');

    if (!conversationId && !contactId) {
      return NextResponse.json(
        { success: false, error: 'Either conversationId or contactId required' },
        { status: 400 }
      );
    }

    let query = {};
    if (conversationId) {
      query = {
        $or: [
          { _id: conversationId },
          { 'mergeHistory.conversations': conversationId }
        ]
      };
    } else if (contactId) {
      query = { contact: contactId };
    }

    const conversations = await Conversation.find(query)
      .select('mergeHistory channel')
      .lean();

    // Flatten mergeHistory entries from all matching conversations
    const history = conversations
      .flatMap(c => (c.mergeHistory || []).map(h => ({
        ...h,
        conversationId: c._id,
        channel: c.channel
      })))
      .sort((a, b) => new Date(b.performedAt || 0) - new Date(a.performedAt || 0));

    return NextResponse.json({
      success: true,
      data: {
        history,
        total: history.length
      }
    });
  } catch (error) {
    console.error('Merge history API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve merge history' },
      { status: 500 }
    );
  }
}
