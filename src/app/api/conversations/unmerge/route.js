// src/app/api/conversations/unmerge/route.js
/**
 * Conversation Unmerge API
 * POST: Deprecated — use DELETE /api/conversations/{conversationId}/merge instead
 * PUT: Re-enable auto-merge for a contact
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import ContactSchema from '@/models/schemas/Contact';
import ConversationSchema from '@/models/schemas/Conversation';

/**
 * POST /api/conversations/unmerge
 * Deprecated — use DELETE /api/conversations/{conversationId}/merge instead
 */
export async function POST(request) {
  return NextResponse.json({
    success: false,
    error: 'Deprecated. Use DELETE /api/conversations/{conversationId}/merge instead.'
  }, { status: 410 });
}

/**
 * PUT /api/conversations/unmerge
 * Re-enable auto-merge for a contact
 */
export async function PUT(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);

    const { contactId } = await request.json();
    if (!contactId) {
      return NextResponse.json({ success: false, error: 'contactId required' }, { status: 400 });
    }

    // Re-enable auto-merge for the contact
    await Contact.findByIdAndUpdate(contactId, { autoMergeDisabled: false });

    // Remove autoMergeDisabled flag from all conversations for this contact
    await Conversation.updateMany(
      { contact: contactId },
      { $unset: { autoMergeDisabled: 1 } }
    );

    return NextResponse.json({
      success: true,
      message: 'Auto-merge re-enabled for contact'
    });
  } catch (error) {
    console.error('Enable auto-merge error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to enable auto-merge' },
      { status: 500 }
    );
  }
}
