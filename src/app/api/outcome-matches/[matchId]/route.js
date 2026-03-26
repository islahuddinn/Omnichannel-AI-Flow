// src/app/api/outcome-matches/[matchId]/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import OWMOutcomeMatchSchema from '@/models/schemas/OWMOutcomeMatch';

/**
 * GET /api/outcome-matches/[matchId]
 * Get a specific outcome match by ID
 */
export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin', 'agent'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { matchId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);

    const match = await OWMOutcomeMatch.findOne({
      _id: matchId,
      tenantId: context.tenantId
    })
      .populate('conversationId', 'contact channel status lastMessageAt')
      .populate('contactId', 'name email phone')
      .populate('owmOutcomeId', 'outcomeName possibleOutcome actionType')
      .populate('matchedBy', 'name email')
      .populate('actionTakenBy', 'name email')
      .populate('matchedMessageId', 'content type direction createdAt')
      .lean();

    if (!match) {
      return NextResponse.json(
        { success: false, error: 'Outcome match not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: match
    });
  } catch (error) {
    console.error('Get outcome match error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch outcome match' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/outcome-matches/[matchId]
 * Update an outcome match
 */
export async function PUT(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin', 'agent'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { matchId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);

    const match = await OWMOutcomeMatch.findOne({
      _id: matchId,
      tenantId: context.tenantId
    });

    if (!match) {
      return NextResponse.json(
        { success: false, error: 'Outcome match not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      status,
      stage,
      confidenceScore,
      matchSource,
      matchedMessageId,
      actionTakenAt,
      metadata
    } = body;

    // Update fields
    if (status !== undefined) {
      const previousStatus = match.status;
      match.status = status;
      
      // If status is being set to 1 (matched) and wasn't before, update matchedAt
      if (status === 1 && previousStatus !== 1 && !match.matchedAt) {
        match.matchedAt = new Date();
        match.matchedBy = matchSource === 'manual' ? auth.user.userId : match.matchedBy;
      }
    }
    
    if (stage !== undefined) {
      match.stage = stage;
      
      // If stage is being set to 'action_taken', update actionTakenAt
      if (stage === 'action_taken' && !match.actionTakenAt) {
        match.actionTakenAt = new Date();
        match.actionTakenBy = auth.user.userId;
      }
    }
    
    if (confidenceScore !== undefined) match.confidenceScore = confidenceScore;
    if (matchSource !== undefined) match.matchSource = matchSource;
    if (matchedMessageId !== undefined) match.matchedMessageId = matchedMessageId;
    if (actionTakenAt !== undefined) {
      match.actionTakenAt = actionTakenAt;
      match.actionTakenBy = auth.user.userId;
    }
    if (metadata !== undefined) match.metadata = { ...match.metadata, ...metadata };

    await match.save();

    return NextResponse.json({
      success: true,
      data: match.toObject(),
      message: 'Outcome match updated successfully'
    });
  } catch (error) {
    console.error('Update outcome match error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update outcome match' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/outcome-matches/[matchId]
 * Delete an outcome match
 */
export async function DELETE(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { matchId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);

    const match = await OWMOutcomeMatch.findOneAndDelete({
      _id: matchId,
      tenantId: context.tenantId
    });

    if (!match) {
      return NextResponse.json(
        { success: false, error: 'Outcome match not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Outcome match deleted successfully'
    });
  } catch (error) {
    console.error('Delete outcome match error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete outcome match' },
      { status: 500 }
    );
  }
}

