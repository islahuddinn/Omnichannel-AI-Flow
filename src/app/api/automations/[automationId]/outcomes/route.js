// src/app/api/automations/[automationId]/outcomes/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import OWMOutcomeSchema from '@/models/schemas/OWMOutcome';

/**
 * GET /api/automations/[automationId]/outcomes
 * Get all outcomes for an automation
 */
export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { automationId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const OWMOutcome = tenantDB.models.OWMOutcome || tenantDB.model('OWMOutcome', OWMOutcomeSchema);

    const outcomes = await OWMOutcome.find({
      tenantId: context.tenantId,
      automationId: automationId
    })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: outcomes
    });
  } catch (error) {
    console.error('Get outcomes error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch outcomes' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/automations/[automationId]/outcomes
 * Create a new outcome for an automation
 */
export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { automationId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const OWMOutcome = tenantDB.models.OWMOutcome || tenantDB.model('OWMOutcome', OWMOutcomeSchema);

    const body = await request.json();
    const {
      outcomeName,
      possibleOutcome,
      followUpAction, // AI prompt text
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

    // Check for duplicate outcome name within this automation (case-insensitive)
    const normalizedOutcomeName = outcomeName.trim().replace(/\s+/g, ' ').toLowerCase();
    const existingOutcome = await OWMOutcome.findOne({
      tenantId: context.tenantId,
      automationId: automationId,
      outcomeName: { $regex: new RegExp(`^${normalizedOutcomeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    if (existingOutcome) {
      return NextResponse.json(
        { success: false, error: `An outcome named "${outcomeName.trim()}" already exists in this automation. Please use a different name.` },
        { status: 400 }
      );
    }

    // Get the highest order number for this automation
    const maxOrder = await OWMOutcome.findOne({
      tenantId: context.tenantId,
      automationId: automationId
    })
      .sort({ order: -1 })
      .select('order')
      .lean();

    const newOrder = order !== undefined ? order : ((maxOrder?.order || -1) + 1);

    // Create the outcome
    const outcome = await OWMOutcome.create({
      outcomeName: outcomeName.trim(),
      possibleOutcome: possibleOutcome.trim(),
      automationId: automationId,
      order: newOrder,
      tenantId: context.tenantId,
      createdBy: auth.user.userId,
      updatedBy: auth.user.userId
    });

    // ✅ Save follow-up action (AI prompt) - Required field
    const AIPromptSchema = (await import('@/models/schemas/AIPrompt')).default;
    const AIPrompt = tenantDB.models.AIPrompt || tenantDB.model('AIPrompt', AIPromptSchema);

    // Check if prompt already exists for this outcome
    const existingPrompt = await AIPrompt.findOne({
      tenantId: context.tenantId,
      moduleId: outcome._id,
      moduleIdDescription: 'OWM_OUTCOME',
      isActive: true
    });

    if (existingPrompt) {
      // Update existing prompt
      existingPrompt.prompt = followUpAction.trim();
      existingPrompt.updatedBy = auth.user.userId;
      existingPrompt.version = (existingPrompt.version || 1) + 1;
      await existingPrompt.save();
    } else {
      // Create new prompt
      await AIPrompt.create({
        moduleId: outcome._id,
        moduleIdDescription: 'OWM_OUTCOME',
        prompt: followUpAction.trim(),
        name: `${outcomeName} - Follow-up Action`,
        description: `Follow-up action for outcome: ${outcomeName}`,
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
      message: 'Outcome created successfully'
    }, { status: 201 });
  } catch (error) {
    console.error('Create outcome error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create outcome' },
      { status: 500 }
    );
  }
}

