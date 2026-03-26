// src/app/api/messages/[conversationId]/[messageId]/rate/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import MessageSchema from '@/models/schemas/Message';

/**
 * POST /api/messages/[conversationId]/[messageId]/rate
 * Rate a bot response with thumbs up or thumbs down.
 *
 * Body: { rating: 'up' | 'down', feedback?: string }
 */
export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId, messageId } = await params;
    if (!messageId) {
      return NextResponse.json({ success: false, error: 'Message ID required' }, { status: 400 });
    }

    const body = await request.json();
    const { rating, feedback } = body;

    if (!rating || !['up', 'down'].includes(rating)) {
      return NextResponse.json({ success: false, error: 'Rating must be "up" or "down"' }, { status: 400 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    // Find the message and verify it's a bot response
    const message = await Message.findOne({
      _id: messageId,
      conversation: conversationId,
    }).select('metadata botSatisfaction').lean();

    if (!message) {
      return NextResponse.json({ success: false, error: 'Message not found' }, { status: 404 });
    }

    const isBotResponse = message.metadata?.get?.('isBotResponse') || message.metadata?.isBotResponse;
    if (!isBotResponse) {
      return NextResponse.json({ success: false, error: 'Only bot responses can be rated' }, { status: 400 });
    }

    // Update the satisfaction rating
    await Message.findByIdAndUpdate(messageId, {
      $set: {
        'botSatisfaction.rating': rating,
        'botSatisfaction.ratedBy': auth.user._id || auth.user.id,
        'botSatisfaction.ratedAt': new Date(),
        ...(feedback && { 'botSatisfaction.feedback': feedback }),
      },
    });

    return NextResponse.json({
      success: true,
      data: { messageId, rating, feedback: feedback || null },
    });
  } catch (error) {
    console.error('[BotRate] POST error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to rate message' },
      { status: 500 }
    );
  }
}
