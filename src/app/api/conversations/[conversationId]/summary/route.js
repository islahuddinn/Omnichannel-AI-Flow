// src/app/api/conversations/[conversationId]/summary/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';

/**
 * POST /api/conversations/[conversationId]/summary
 * Generate AI conversation summary using our own ConversationIntelligenceService
 * (not third-party API)
 */
export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId } = await params;
    const context = await getTenantContext(request);

    if (!conversationId || !context.tenantId) {
      return NextResponse.json(
        { success: false, error: 'Conversation ID and tenant ID are required' },
        { status: 400 }
      );
    }

    const tenantDB = await getTenantDB(context.tenantId);

    // Use our own AI-powered ConversationIntelligenceService
    const { analyzeConversation } = await import('@/services/bot/ConversationIntelligenceService.js');

    const result = await analyzeConversation({
      tenantDB,
      tenantId: context.tenantId,
      conversationId,
      handoffReason: 'manual_summary',
    });

    if (!result || !result.summary) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate summary. Ensure AI Bot is configured in Settings.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        admin_summary: result.summary,
        customer_sentiment: result.sentiment || null,
        priority: result.priority || null,
        topics: result.topics || [],
      }
    });
  } catch (error) {
    console.error('Error generating conversation summary:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate conversation summary' },
      { status: 500 }
    );
  }
}
