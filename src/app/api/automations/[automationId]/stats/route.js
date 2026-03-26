// src/app/api/automations/[automationId]/stats/route.js
import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import OWMOutcomeSchema from '@/models/schemas/OWMOutcome';
import OWMOutcomeMatchSchema from '@/models/schemas/OWMOutcomeMatch';
import MessageSchema from '@/models/schemas/Message';

/**
 * Safely convert any ID (ObjectId, string, populated object) to a string
 * Handles all MongoDB ID formats consistently
 */
function toIdString(id) {
  if (!id) return null;
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && id._id) return id._id.toString();
  if (typeof id === 'object' && id.toString) return id.toString();
  return String(id);
}

/**
 * GET /api/automations/[automationId]/stats
 * Get statistics for an automation including outcome matches
 */
export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin', 'agent'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { automationId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    const automationIdStr = automationId.toString();

    const AutomationSchema = (await import('@/models/schemas/Automation')).default;
    const Automation = tenantDB.models.Automation || tenantDB.model('Automation', AutomationSchema);
    const OWMOutcome = tenantDB.models.OWMOutcome || tenantDB.model('OWMOutcome', OWMOutcomeSchema);
    const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    // Verify automation belongs to this tenant
    const automation = await Automation.findOne({ _id: automationId, tenantId: context.tenantId }).select('_id').lean();
    if (!automation) {
      return NextResponse.json({ success: false, error: 'Automation not found' }, { status: 404 });
    }

    // Get all outcomes for this automation
    const outcomes = await OWMOutcome.find({
      tenantId: context.tenantId,
      automationId
    }).lean();

    // Get all matches for this automation
    const matches = await OWMOutcomeMatch.find({
      tenantId: context.tenantId,
      automationId
    }).lean();

    // Get messages sent from this specific automation
    // automationId is always stored as string in metadata (see AutomationService.js:674)
    const messages = await Message.find({
      direction: 'outbound',
      sendingModule: 'owm',
      'metadata.automationId': automationIdStr,
    }).select('conversation status channel').lean();

    // Get unique conversation IDs from both messages and matches
    const messageConversationIds = new Set(
      messages.map(m => toIdString(m.conversation)).filter(Boolean)
    );
    const matchConversationIds = new Set(
      matches.map(m => toIdString(m.conversationId)).filter(Boolean)
    );
    const allConversationIds = new Set([...messageConversationIds, ...matchConversationIds]);

    // Calculate statistics
    const totalOutcomes = outcomes.length;
    const totalMessages = messages.length;
    const totalConversations = allConversationIds.size;

    // Per-outcome statistics
    const outcomeStats = outcomes.map(outcome => {
      const outcomeIdStr = outcome._id.toString();

      // Find matched records for this outcome
      const outcomeMatches = matches.filter(m =>
        toIdString(m.owmOutcomeId) === outcomeIdStr && m.status === 1
      );

      // Get unique conversations that matched
      const matchedConvIds = new Set(
        outcomeMatches.map(m => toIdString(m.conversationId)).filter(Boolean)
      );
      const matchedCount = matchedConvIds.size;
      const unmatchedCount = Math.max(0, totalConversations - matchedCount);

      return {
        outcomeId: outcome._id,
        outcomeName: outcome.outcomeName,
        possibleOutcome: outcome.possibleOutcome,
        matched: matchedCount,
        unmatched: unmatchedCount,
        total: totalConversations,
        matchRate: totalConversations > 0 ? parseFloat(((matchedCount / totalConversations) * 100).toFixed(1)) : 0,
        matches: outcomeMatches.map(m => ({
          conversationId: m.conversationId,
          matchedAt: m.matchedAt,
          confidenceScore: m.confidenceScore,
          matchSource: m.matchSource
        }))
      };
    });

    // Overall match statistics
    const allMatchedConvIds = new Set(
      matches
        .filter(m => m.status === 1)
        .map(m => toIdString(m.conversationId))
        .filter(Boolean)
    );
    const totalMatched = allMatchedConvIds.size;
    const totalUnmatched = Math.max(0, totalConversations - totalMatched);
    const overallMatchRate = totalConversations > 0
      ? parseFloat(((totalMatched / totalConversations) * 100).toFixed(1))
      : 0;

    // Enhanced message status breakdown
    const messageStatusBreakdown = {
      sent: messages.filter(m => m.status === 'sent').length,
      delivered: messages.filter(m => m.status === 'delivered').length,
      read: messages.filter(m => m.status === 'read').length,
      failed: messages.filter(m => m.status === 'failed').length,
      pending: messages.filter(m => m.status === 'pending' || m.status === 'sending').length,
      retrying: messages.filter(m => m.status === 'retrying').length,
    };

    // Channel breakdown
    const channelBreakdown = {};
    messages.forEach(m => {
      const ch = m.channel || 'unknown';
      channelBreakdown[ch] = (channelBreakdown[ch] || 0) + 1;
    });

    // Recent outcome matches with contact info (last 20)
    const ContactSchema = (await import('@/models/schemas/Contact')).default;
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    const recentMatches = await OWMOutcomeMatch.find({
      tenantId: context.tenantId,
      automationId,
      status: 1,
    })
      .sort({ matchedAt: -1 })
      .limit(20)
      .lean();

    // Enrich with contact names
    const contactIds = [...new Set(recentMatches.map(m => toIdString(m.contactId)).filter(Boolean))];
    const contacts = contactIds.length > 0
      ? await Contact.find({ _id: { $in: contactIds } }).select('name displayName phone email').lean()
      : [];
    const contactMap = new Map(contacts.map(c => [c._id.toString(), c]));

    const recentMatchesEnriched = recentMatches.map(m => {
      const contact = contactMap.get(toIdString(m.contactId));
      return {
        _id: m._id,
        conversationId: m.conversationId,
        contactId: m.contactId,
        contactName: contact?.name || contact?.displayName || contact?.phone || 'Unknown',
        contactPhone: contact?.phone,
        contactEmail: contact?.email,
        outcomeName: m.outcomeName,
        automationName: m.automationName,
        confidenceScore: m.confidenceScore,
        matchSource: m.matchSource,
        matchedAt: m.matchedAt,
        stage: m.stage,
        followUpSent: m.followUpSent,
        customerMessage: m.customerMessage,
        aiReasoning: m.aiReasoning,
        matchDurationMs: m.matchDurationMs,
        salesforceUpdates: m.salesforceUpdates || [],
        channelType: m.channelType,
      };
    });

    // Execution history
    const AutomationExecutionSchema = (await import('@/models/schemas/AutomationExecution')).default;
    let executions = [];
    try {
      const AutomationExecution = tenantDB.models.AutomationExecution || tenantDB.model('AutomationExecution', AutomationExecutionSchema);
      executions = await AutomationExecution.find({
        automationId,
        tenantId: context.tenantId,
      })
        .sort({ startedAt: -1 })
        .limit(20)
        .lean();
    } catch (execErr) {
      // AutomationExecution model might not exist yet
      console.warn('[AutomationStats] Execution history not available:', execErr.message);
    }

    return NextResponse.json({
      success: true,
      data: {
        automationId,
        totalOutcomes,
        totalMessages,
        totalConversations,
        totalMatched,
        totalUnmatched,
        overallMatchRate: parseFloat(overallMatchRate),
        messageStatusBreakdown,
        channelBreakdown,
        outcomeStats,
        recentMatches: recentMatchesEnriched,
        executions: executions.map(e => ({
          _id: e._id,
          status: e.status,
          startedAt: e.startedAt,
          completedAt: e.completedAt,
          duration: e.completedAt && e.startedAt ? new Date(e.completedAt) - new Date(e.startedAt) : null,
          contactsTargeted: e.contactsTargeted || e.totalContacts || 0,
          contactsSucceeded: e.contactsSucceeded || e.successCount || 0,
          contactsFailed: e.contactsFailed || e.failCount || 0,
          triggeredBy: e.triggeredBy,
          error: e.error,
        })),
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    console.error('[AutomationStats] GET error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch automation stats' },
      { status: 500 }
    );
  }
}

