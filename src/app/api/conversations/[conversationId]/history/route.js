// src/app/api/conversations/[conversationId]/history/route.js
import { NextResponse } from 'next/server';
import { connectToTenantDB } from '@/lib/db/connection';
import Conversation from '@/models/schemas/Conversation';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';

export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId } = await params;
    const tenantId = getTenantContext();
    const db = await connectToTenantDB(tenantId);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));

    const conversation = await Conversation.findById(conversationId)
      .select('mergeHistory transferHistory')
      .populate('mergeHistory.mergedBy', 'firstName lastName')
      .populate('mergeHistory.unmergedBy', 'firstName lastName')
      .populate('transferHistory.transferredBy', 'firstName lastName')
      .lean();

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Limit history entries to prevent large payloads
    const mergeHistory = (conversation.mergeHistory || []).slice(-limit);
    const transferHistory = (conversation.transferHistory || []).slice(-limit);

    return NextResponse.json({
      success: true,
      data: {
        mergeHistory,
        transferHistory
      }
    });
  } catch (error) {
    console.error('Get conversation history error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}