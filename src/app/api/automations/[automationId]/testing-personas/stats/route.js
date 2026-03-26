// src/app/api/automations/[automationId]/testing-personas/stats/route.js
import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import TestingPersonaSchema from '@/models/schemas/TestingPersona';
import OWMOutcomeSchema from '@/models/schemas/OWMOutcome';
import OWMOutcomeMatchSchema from '@/models/schemas/OWMOutcomeMatch';
import MessageSchema from '@/models/schemas/Message';

/**
 * Safely convert any ID (ObjectId, string, populated object) to a string
 */
function toIdString(id) {
  if (!id) return null;
  if (typeof id === 'string') return id;
  if (typeof id === 'object' && id._id) return id._id.toString();
  if (typeof id === 'object' && id.toString) return id.toString();
  return String(id);
}

export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { automationId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    const automationIdStr = automationId.toString();

    // Register models
    const TestingPersona = tenantDB.models.TestingPersona || tenantDB.model('TestingPersona', TestingPersonaSchema);
    const OWMOutcome = tenantDB.models.OWMOutcome || tenantDB.model('OWMOutcome', OWMOutcomeSchema);
    const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const ContactSchema = (await import('@/models/schemas/Contact.js')).default;
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    // Get all testing personas for this automation
    const personas = await TestingPersona.find({
      tenantId: context.tenantId,
      automationId
    })
    .populate('statistics.outcomesMatched.outcomeId', 'outcomeName possibleOutcome')
    .lean();

    // Get all outcomes for this automation
    const outcomes = await OWMOutcome.find({
      tenantId: context.tenantId,
      automationId
    }).lean();

    // Collect all testing persona contact IDs (from direct ref and email/phone lookup)
    const directContactIdStrings = personas
      .map(p => toIdString(p.contactId))
      .filter(Boolean);

    const personaEmails = personas.map(p => p.email).filter(Boolean).map(e => e.toLowerCase());
    const personaPhones = personas.map(p => p.phone).filter(Boolean);

    const contactQuery = [];
    if (personaEmails.length > 0) contactQuery.push({ email: { $in: personaEmails } });
    if (personaPhones.length > 0) contactQuery.push({ phone: { $in: personaPhones } });

    const contactsByEmailPhone = contactQuery.length > 0
      ? await Contact.find({ $or: contactQuery }).select('_id').lean()
      : [];

    const additionalContactIdStrings = contactsByEmailPhone.map(c => c._id.toString());

    // Deduplicate all contact ID strings
    const uniqueContactIdStrings = [...new Set([...directContactIdStrings, ...additionalContactIdStrings])];

    // Get messages sent to testing personas using DB-level filter
    // Query both string and ObjectId formats since metadata is a Map<Mixed> field
    let messages = await Message.find({
      direction: 'outbound',
      sendingModule: 'owm',
      'metadata.isTestingPersona': true,
      'metadata.automationId': {
        $in: [automationIdStr, new mongoose.Types.ObjectId(automationIdStr)]
      }
    }).lean();

    // Fallback: try $or if $in doesn't match
    if (messages.length === 0) {
      messages = await Message.find({
        direction: 'outbound',
        sendingModule: 'owm',
        'metadata.isTestingPersona': true,
        $or: [
          { 'metadata.automationId': automationIdStr },
          { 'metadata.automationId': new mongoose.Types.ObjectId(automationIdStr) },
        ]
      }).lean();
    }

    // Calculate overall statistics
    const totalPersonas = personas.length;
    const totalMessagesSent = Math.max(
      messages.length,
      personas.reduce((sum, p) => sum + (p.statistics?.messagesSent || 0), 0)
    );
    const totalMessagesDelivered = messages.filter(m => m.status === 'delivered' || m.status === 'read').length;
    const totalMessagesRead = messages.filter(m => m.status === 'read').length;
    const totalMessagesFailed = Math.max(
      messages.filter(m => m.status === 'failed').length,
      personas.reduce((sum, p) => sum + (p.statistics?.messagesFailed || 0), 0)
    );
    const totalMessagesPending = messages.filter(m => m.status === 'pending' || m.status === 'sending').length;
    const totalMessagesSentSuccess = messages.filter(m => m.status === 'sent' || m.status === 'delivered' || m.status === 'read').length;

    // Get all outcome matches for this automation, filtered to testing persona contacts
    const allAutomationMatches = await OWMOutcomeMatch.find({
      tenantId: context.tenantId,
      automationId
    }).lean();

    const outcomeMatches = allAutomationMatches.filter(match => {
      const matchContactIdStr = toIdString(match.contactId);
      return matchContactIdStr && uniqueContactIdStrings.includes(matchContactIdStr);
    });

    // Calculate per-outcome statistics
    const outcomeStats = outcomes.map(outcome => {
      const outcomeIdStr = outcome._id.toString();

      const matchedForOutcome = outcomeMatches.filter(m =>
        toIdString(m.owmOutcomeId) === outcomeIdStr && m.status === 1
      );

      const matchedContactIds = new Set(
        matchedForOutcome.map(m => toIdString(m.contactId)).filter(Boolean)
      );

      const matchCount = matchedContactIds.size;
      const matchRate = totalPersonas > 0 ? (matchCount / totalPersonas) * 100 : 0;

      return {
        outcomeId: outcome._id,
        outcomeName: outcome.outcomeName,
        possibleOutcome: outcome.possibleOutcome,
        matched: matchCount,
        unmatched: totalPersonas - matchCount,
        total: totalPersonas,
        matchRate: parseFloat(matchRate.toFixed(1))
      };
    });

    // Overall match rate: unique personas with at least one matched outcome
    const allMatchedContactIds = new Set(
      outcomeMatches
        .filter(m => m.status === 1)
        .map(m => toIdString(m.contactId))
        .filter(Boolean)
    );

    const totalMatched = allMatchedContactIds.size;
    const overallMatchRate = totalPersonas > 0 ? (totalMatched / totalPersonas) * 100 : 0;

    // ✅ Compute per-persona outcome matches for the "Outcomes Matched" column
    const personaOutcomeMatches = {};
    for (const persona of personas) {
      const thisPersonaContactIds = new Set();
      const directId = toIdString(persona.contactId);
      if (directId) thisPersonaContactIds.add(directId);

      // Find contacts by this specific persona's email/phone
      if (persona.email) {
        const matchingContacts = await Contact.find({ email: persona.email.toLowerCase() }).select('_id').lean();
        for (const c of matchingContacts) thisPersonaContactIds.add(c._id.toString());
      }
      if (persona.phone) {
        const matchingContacts = await Contact.find({ phone: persona.phone }).select('_id').lean();
        for (const c of matchingContacts) thisPersonaContactIds.add(c._id.toString());
      }

      const thisPersonaContactIdArray = [...thisPersonaContactIds];
      const matchedOutcomes = outcomeMatches.filter(m =>
        m.status === 1 && thisPersonaContactIdArray.includes(toIdString(m.contactId))
      );

      personaOutcomeMatches[persona._id.toString()] = matchedOutcomes.map(m => {
        const outcome = outcomes.find(o => o._id.toString() === toIdString(m.owmOutcomeId));
        return {
          outcomeId: m.owmOutcomeId,
          outcomeName: outcome?.outcomeName || 'Unknown',
          matchedAt: m.matchedAt,
          confidenceScore: m.confidenceScore,
        };
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        totalPersonas,
        totalMessagesSent,
        totalMessagesSentSuccess,
        totalMessagesDelivered,
        totalMessagesRead,
        totalMessagesFailed,
        totalMessagesPending,
        messageStatusBreakdown: {
          sent: totalMessagesSentSuccess,
          failed: totalMessagesFailed,
          pending: totalMessagesPending,
        },
        totalMatched,
        totalUnmatched: totalPersonas - totalMatched,
        overallMatchRate: parseFloat(overallMatchRate.toFixed(1)),
        outcomeStats,
        personaOutcomeMatches,
        personas: personas.map(p => ({
          _id: p._id,
          name: p.name,
          email: p.email,
          phone: p.phone,
          statistics: p.statistics
        }))
      }
    });
  } catch (error) {
    console.error('[TestingPersonas] Stats error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch testing persona statistics' },
      { status: 500 }
    );
  }
}

