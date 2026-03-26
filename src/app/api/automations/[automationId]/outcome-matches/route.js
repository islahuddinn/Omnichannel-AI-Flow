// src/app/api/automations/[automationId]/outcome-matches/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import OWMOutcomeMatchSchema from '@/models/schemas/OWMOutcomeMatch';

/**
 * GET /api/automations/[automationId]/outcome-matches
 * Get all outcome tracking records for an automation (both matched and unmatched)
 * Query params: conversationId, contactId, status, stage
 * 
 * Note: This returns ALL outcome tracking records, not just matched ones.
 * When an automation message is sent, all outcomes are initialized with status=0 (not matched).
 * When a contact responds and matches an outcome, the record is updated to status=1 (matched).
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
    
    const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    const contactId = searchParams.get('contactId');
    const status = searchParams.get('status');
    const stage = searchParams.get('stage');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);

    // Build query
    const query = {
      tenantId: context.tenantId,
      automationId: automationId
    };

    if (conversationId) {
      query.conversationId = conversationId;
    }
    if (contactId) {
      query.contactId = contactId;
    }
    if (status !== null && status !== undefined && status !== '') {
      query.status = parseInt(status);
    }
    if (stage) {
      query.stage = stage;
    }

    const [matches, total] = await Promise.all([
      OWMOutcomeMatch.find(query)
        .populate('conversationId', 'contact channel status lastMessageAt')
        .populate('contactId', 'name email phone')
        .populate('owmOutcomeId', 'outcomeName possibleOutcome actionType order')
        .populate('matchedBy', 'name email')
        .populate('actionTakenBy', 'name email')
        .sort({ status: -1, matchedAt: -1, createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      OWMOutcomeMatch.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: matches,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Get outcome matches error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch outcome matches' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/automations/[automationId]/outcome-matches
 * Create a new outcome match
 */
export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin', 'agent'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { automationId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);

    const body = await request.json();
    const {
      conversationId,
      contactId,
      owmOutcomeId,
      status = 0,
      stage = 'pending',
      confidenceScore,
      matchSource,
      matchedMessageId,
      metadata
    } = body;

    // Validation
    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: 'Conversation ID is required' },
        { status: 400 }
      );
    }
    if (!contactId) {
      return NextResponse.json(
        { success: false, error: 'Contact ID is required' },
        { status: 400 }
      );
    }
    if (!owmOutcomeId) {
      return NextResponse.json(
        { success: false, error: 'OWM Outcome ID is required' },
        { status: 400 }
      );
    }

    // Check if match already exists for this conversation and outcome
    const existingMatch = await OWMOutcomeMatch.findOne({
      tenantId: context.tenantId,
      conversationId,
      owmOutcomeId,
      automationId
    });

    if (existingMatch) {
      // Update existing match
      if (status !== undefined) existingMatch.status = status;
      if (stage !== undefined) existingMatch.stage = stage;
      if (confidenceScore !== undefined) existingMatch.confidenceScore = confidenceScore;
      if (matchSource !== undefined) existingMatch.matchSource = matchSource;
      if (matchedMessageId !== undefined) existingMatch.matchedMessageId = matchedMessageId;
      if (metadata !== undefined) existingMatch.metadata = metadata;
      
      // If status is being set to 1 (matched), update matchedAt and matchedBy
      if (status === 1 && existingMatch.status !== 1) {
        existingMatch.matchedAt = new Date();
        existingMatch.matchedBy = matchSource === 'manual' ? auth.user.userId : null;
      }
      
      await existingMatch.save();

      return NextResponse.json({
        success: true,
        data: existingMatch.toObject(),
        message: 'Outcome match updated successfully'
      });
    }

    // Create new match
    const matchData = {
      conversationId,
      contactId,
      automationId,
      owmOutcomeId,
      status,
      stage,
      tenantId: context.tenantId,
      metadata: metadata || {}
    };

    if (confidenceScore !== undefined) matchData.confidenceScore = confidenceScore;
    if (matchSource) matchData.matchSource = matchSource;
    if (matchedMessageId) matchData.matchedMessageId = matchedMessageId;
    
    // If status is 1 (matched), set matchedAt and matchedBy
    if (status === 1) {
      matchData.matchedAt = new Date();
      matchData.matchedBy = matchSource === 'manual' ? auth.user.userId : null;
    }

    const match = await OWMOutcomeMatch.create(matchData);

    return NextResponse.json({
      success: true,
      data: match.toObject(),
      message: 'Outcome match created successfully'
    }, { status: 201 });
  } catch (error) {
    console.error('Create outcome match error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create outcome match' },
      { status: 500 }
    );
  }
}

