// src/app/api/conversations/[conversationId]/tags/route.js
import { NextResponse } from 'next/server';
import { connectToTenantDB } from '@/lib/db/connection';
import Conversation from '@/models/schemas/Conversation';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';

export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId } = await params;
    const { tags } = await request.json();

    if (!Array.isArray(tags)) {
      return NextResponse.json(
        { success: false, error: 'Tags must be an array' },
        { status: 400 }
      );
    }

    const tenantId = getTenantContext();
    const db = await connectToTenantDB(tenantId);

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // ✅ Check department access for agents
    if (auth.user.role === 'agent') {
      const userDepartments = (auth.user.departments || []).map(d => d.toString());
      if (!userDepartments.includes(conversation.department?.toString())) {
        return NextResponse.json(
          { success: false, error: 'You do not have access to this conversation' },
          { status: 403 }
        );
      }
    }

    // ✅ Sanitize tags: limit count and length
    const sanitizedTags = tags
      .filter(t => typeof t === 'string')
      .map(t => t.trim().substring(0, 50))
      .filter(t => t.length > 0);

    if (sanitizedTags.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid tags provided' },
        { status: 400 }
      );
    }

    const mergedTags = [...new Set([...conversation.tags, ...sanitizedTags])];
    if (mergedTags.length > 20) {
      return NextResponse.json(
        { success: false, error: 'Maximum 20 tags allowed per conversation' },
        { status: 400 }
      );
    }

    conversation.tags = mergedTags;
    await conversation.save();

    return NextResponse.json({
      success: true,
      data: conversation
    });
  } catch (error) {
    console.error('Add tags error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add tags' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId } = await params;
    const { searchParams } = new URL(request.url);
    const tag = searchParams.get('tag');

    if (!tag) {
      return NextResponse.json(
        { success: false, error: 'Tag parameter is required' },
        { status: 400 }
      );
    }

    const tenantId = getTenantContext();
    const db = await connectToTenantDB(tenantId);

    const conversation = await Conversation.findByIdAndUpdate(
      conversationId,
      { $pull: { tags: tag } },
      { new: true }
    );

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: conversation
    });
  } catch (error) {
    console.error('Remove tag error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove tag' },
      { status: 500 }
    );
  }
}