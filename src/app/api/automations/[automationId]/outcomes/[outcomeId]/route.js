// src/app/api/automations/[automationId]/outcomes/[outcomeId]/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import OWMOutcomeSchema from '@/models/schemas/OWMOutcome';

/**
 * GET /api/automations/[automationId]/outcomes/[outcomeId]
 * Get a specific outcome
 */
export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { automationId, outcomeId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const OWMOutcome = tenantDB.models.OWMOutcome || tenantDB.model('OWMOutcome', OWMOutcomeSchema);

    const outcome = await OWMOutcome.findOne({
      _id: outcomeId,
      tenantId: context.tenantId,
      automationId: automationId
    }).lean();

    if (!outcome) {
      return NextResponse.json(
        { success: false, error: 'Outcome not found' },
        { status: 404 }
      );
    }

    // Fetch associated AI prompt if exists
    const AIPromptSchema = (await import('@/models/schemas/AIPrompt')).default;
    const AIPrompt = tenantDB.models.AIPrompt || tenantDB.model('AIPrompt', AIPromptSchema);
    
    const aiPrompt = await AIPrompt.findOne({
      tenantId: context.tenantId,
      moduleId: outcomeId,
      moduleIdDescription: 'OWM_OUTCOME',
      isActive: true
    }).lean();

    return NextResponse.json({
      success: true,
      data: {
        ...outcome,
        followUpAction: aiPrompt?.prompt || ''
      }
    });
  } catch (error) {
    console.error('Get outcome error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch outcome' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/automations/[automationId]/outcomes/[outcomeId]
 * Update an outcome
 */
export async function PUT(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { automationId, outcomeId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const OWMOutcome = tenantDB.models.OWMOutcome || tenantDB.model('OWMOutcome', OWMOutcomeSchema);

    const outcome = await OWMOutcome.findOne({
      _id: outcomeId,
      tenantId: context.tenantId,
      automationId: automationId
    });

    if (!outcome) {
      return NextResponse.json(
        { success: false, error: 'Outcome not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      outcomeName,
      possibleOutcome,
      followUpAction,
      order
    } = body;

    if (!outcomeName || !outcomeName.trim()) {
      return NextResponse.json(
        { success: false, error: 'Outcome name is required' },
        { status: 400 }
      );
    }

    if (!possibleOutcome || !possibleOutcome.trim()) {
      return NextResponse.json(
        { success: false, error: 'Possible outcome is required' },
        { status: 400 }
      );
    }

    if (!followUpAction || !followUpAction.trim()) {
      return NextResponse.json(
        { success: false, error: 'Follow-up Action (AI Prompt) is required' },
        { status: 400 }
      );
    }

    // Check for duplicate outcome name within this automation (case-insensitive, excluding current)
    const normalizedOutcomeName = outcomeName.trim().replace(/\s+/g, ' ').toLowerCase();
    const duplicateOutcome = await OWMOutcome.findOne({
      tenantId: context.tenantId,
      automationId: automationId,
      _id: { $ne: outcomeId },
      outcomeName: { $regex: new RegExp(`^${normalizedOutcomeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    if (duplicateOutcome) {
      return NextResponse.json(
        { success: false, error: `An outcome named "${outcomeName.trim()}" already exists in this automation. Please use a different name.` },
        { status: 400 }
      );
    }

    // Update outcome fields - All fields are required
    outcome.outcomeName = outcomeName.trim();
    outcome.possibleOutcome = possibleOutcome.trim();
    if (order !== undefined) outcome.order = order;
    outcome.updatedBy = auth.user.userId;

    await outcome.save();

    // ✅ Update or create AI prompt - Required field
    const AIPromptSchema = (await import('@/models/schemas/AIPrompt')).default;
    const AIPrompt = tenantDB.models.AIPrompt || tenantDB.model('AIPrompt', AIPromptSchema);

    const existingPrompt = await AIPrompt.findOne({
      tenantId: context.tenantId,
      moduleId: outcomeId,
      moduleIdDescription: 'OWM_OUTCOME',
      isActive: true
    });

    if (existingPrompt) {
      // Update existing prompt
      existingPrompt.prompt = followUpAction.trim();
      existingPrompt.name = `${outcome.outcomeName} - Follow-up Action`;
      existingPrompt.description = `Follow-up action for outcome: ${outcome.outcomeName}`;
      existingPrompt.updatedBy = auth.user.userId;
      existingPrompt.version = (existingPrompt.version || 1) + 1;
      await existingPrompt.save();
    } else {
      // Create new prompt
      await AIPrompt.create({
        moduleId: outcomeId,
        moduleIdDescription: 'OWM_OUTCOME',
        prompt: followUpAction.trim(),
        name: `${outcome.outcomeName} - Follow-up Action`,
        description: `Follow-up action for outcome: ${outcome.outcomeName}`,
        isActive: true,
        tenantId: context.tenantId,
        createdBy: auth.user.userId,
        updatedBy: auth.user.userId
      });
    }

    // ✅ Invalidate automation cache so next OWM match uses fresh data
    try {
      const { invalidateAutomationCache } = await import('@/services/automation/OutcomeMatchingService.js');
      invalidateAutomationCache(context.tenantId, automationId);
    } catch (_) {}

    return NextResponse.json({
      success: true,
      data: outcome.toObject(),
      message: 'Outcome updated successfully'
    });
  } catch (error) {
    console.error('Update outcome error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update outcome' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/automations/[automationId]/outcomes/[outcomeId]
 * Delete an outcome
 */
export async function DELETE(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { automationId, outcomeId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const OWMOutcome = tenantDB.models.OWMOutcome || tenantDB.model('OWMOutcome', OWMOutcomeSchema);

    const outcome = await OWMOutcome.findOne({
      _id: outcomeId,
      tenantId: context.tenantId,
      automationId: automationId
    });

    if (!outcome) {
      return NextResponse.json(
        { success: false, error: 'Outcome not found' },
        { status: 404 }
      );
    }

    // Deactivate associated AI prompt
    const AIPromptSchema = (await import('@/models/schemas/AIPrompt')).default;
    const AIPrompt = tenantDB.models.AIPrompt || tenantDB.model('AIPrompt', AIPromptSchema);
    
    await AIPrompt.updateMany(
      {
        tenantId: context.tenantId,
        moduleId: outcomeId,
        moduleIdDescription: 'OWM_OUTCOME'
      },
      {
        isActive: false,
        updatedBy: auth.user.userId
      }
    );

    // Delete the outcome
    await OWMOutcome.findByIdAndDelete(outcomeId);

    // ✅ Invalidate automation cache
    try {
      const { invalidateAutomationCache } = await import('@/services/automation/OutcomeMatchingService.js');
      invalidateAutomationCache(context.tenantId, automationId);
    } catch (_) {}

    return NextResponse.json({
      success: true,
      message: 'Outcome deleted successfully'
    });
  } catch (error) {
    console.error('Delete outcome error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete outcome' },
      { status: 500 }
    );
  }
}

