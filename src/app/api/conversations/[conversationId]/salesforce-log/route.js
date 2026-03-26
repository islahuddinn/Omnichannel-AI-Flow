// src/app/api/conversations/[conversationId]/salesforce-log/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import OWMOutcomeMatchSchema from '@/models/schemas/OWMOutcomeMatch';
import ConversationSchema from '@/models/schemas/Conversation';

/**
 * GET /api/conversations/[conversationId]/salesforce-log
 * Get Salesforce update activity log for a contact across ALL their conversations.
 * ✅ CRITICAL: Queries by contactId (not just conversationId) so Salesforce updates
 * from one conversation (e.g., email) are visible in other conversations (e.g., WhatsApp)
 * for the same contact.
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
    const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);

    // ✅ CRITICAL FIX: Get the contact from this conversation, then fetch SF updates
    // across ALL conversations for this contact (not just this one conversation)
    const conversation = await Conversation.findById(conversationId).select('contact').lean();
    const contactId = conversation?.contact;

    // Build query: prefer contactId for cross-conversation visibility, fallback to conversationId
    const matchQuery = {
      tenantId: context.tenantId,
      'salesforceUpdates.0': { $exists: true },
    };

    if (contactId) {
      // ✅ Show all SF updates for this contact across all their conversations
      matchQuery.contactId = contactId;
    } else {
      // Fallback: only show updates for this specific conversation
      matchQuery.conversationId = conversationId;
    }

    const matches = await OWMOutcomeMatch.find(matchQuery)
      .sort({ updatedAt: -1 })
      .limit(50)
      .select('outcomeName automationName automationId salesforceUpdates matchedAt stage conversationId')
      .lean();

    // Flatten into activity log
    const log = [];
    for (const match of matches) {
      for (const update of (match.salesforceUpdates || [])) {
        log.push({
          matchId: match._id,
          automationId: match.automationId,
          outcomeName: match.outcomeName,
          automationName: match.automationName,
          stage: match.stage,
          object: update.object,
          recordId: update.recordId,
          status: update.status,
          fieldsUpdated: update.fieldsUpdated || [],
          payload: update.payload || {},
          error: update.error,
          reason: update.reason,
          updatedAt: update.updatedAt,
        });
      }
    }

    // Sort by most recent first
    log.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return NextResponse.json({ success: true, data: log });
  } catch (error) {
    console.error('[SFLog] Error:', error?.message);
    return NextResponse.json({ success: false, error: 'Failed to fetch SF log' }, { status: 500 });
  }
}
