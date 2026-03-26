// src/app/api/contacts/[contactId]/conversations/route.js
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

    const { contactId } = await params;
    const tenantId = getTenantContext();
    const db = await connectToTenantDB(tenantId);

    const conversations = await Conversation.find({ contact: contactId })
      .populate('assignedTo', 'firstName lastName')
      .populate('department', 'name')
      .sort('-lastMessageAt')
      .lean();

    return NextResponse.json({
      success: true,
      data: conversations
    });
  } catch (error) {
    console.error('Get contact conversations error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}