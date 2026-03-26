// src/app/api/automations/[automationId]/route.js
import { NextResponse } from 'next/server';
import { getTenantDB, getMasterDB } from '@/config/database';
import AutomationSchema from '@/models/schemas/Automation';
import TemplateSchema from '@/models/schemas/Template';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import DepartmentSchema from '@/models/schemas/Department';
import UserSchema from '@/models/schemas/User';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import mongoose from 'mongoose';

// ✅ Helper function to normalize names: trim, collapse multiple spaces, lowercase
function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { automationId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    const masterDB = await getMasterDB();
    
    // Register schemas in tenant DB
    const Automation = tenantDB.models.Automation || tenantDB.model('Automation', AutomationSchema);
    const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    const User = masterDB.models.User || masterDB.model('User', UserSchema);

    const automation = await Automation.findById(automationId)
      .populate('departments', 'name')
      .populate('channels.channelAccountId', 'name type identifier')
      .populate('channels.templateId', 'name channel body subject templateLanguage')
      .lean();

    if (!automation) {
      return NextResponse.json(
        { success: false, error: 'Automation not found' },
        { status: 404 }
      );
    }

    if (automation.tenantId !== context.tenantId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Manually populate createdBy from master DB
    if (automation.createdBy) {
      const user = await User.findById(automation.createdBy)
        .select('firstName lastName email')
        .lean();
      automation.createdBy = user;
    }

    return NextResponse.json({
      success: true,
      data: automation
    });
  } catch (error) {
    console.error('[Automation] GET error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch automation' },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { automationId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    const masterDB = await getMasterDB();
    
    // Register schemas in tenant DB
    const Automation = tenantDB.models.Automation || tenantDB.model('Automation', AutomationSchema);
    const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    
    const body = await request.json();
    const {
      name,
      departments,
      channels,
      triggerConditions,
      timing
    } = body;

    const automation = await Automation.findById(automationId);

    if (!automation) {
      return NextResponse.json(
        { success: false, error: 'Automation not found' },
        { status: 404 }
      );
    }

    if (automation.tenantId !== context.tenantId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // ✅ CRITICAL: Automation names must be globally unique across all automations
    // Check if automation name already exists (excluding current automation)
    if (name !== undefined && name.trim()) {
      const normalizedName = normalizeName(name);
      const existingAutomation = await Automation.findOne({
        _id: { $ne: automationId },
        tenantId: context.tenantId,
        name: { $regex: new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });

      if (existingAutomation) {
        return NextResponse.json(
          { success: false, error: `Automation name "${name}" already exists. Automation names must be unique. Please use a different name.` },
          { status: 400 }
        );
      }
    }

    // Update fields (aiPrompt removed - now handled separately via /api/ai-prompts)
    if (name !== undefined) automation.name = name.trim().replace(/\s+/g, ' '); // Normalize spaces but keep original case
    if (departments !== undefined) automation.departments = departments;
    if (channels !== undefined) automation.channels = channels;
    if (triggerConditions !== undefined) {
      automation.triggerConditions = triggerConditions;
    }
    if (timing !== undefined) {
      automation.timing = timing;
    }

    await automation.save();

    await automation.populate('departments', 'name');
    await automation.populate('channels.channelAccountId', 'name type identifier');
    await automation.populate('channels.templateId', 'name channel body subject templateLanguage');
    
    // Manually populate createdBy from master DB
    const automationObj = automation.toObject();
    if (automationObj.createdBy) {
      const user = await User.findById(automationObj.createdBy)
        .select('firstName lastName email')
        .lean();
      automationObj.createdBy = user;
    }

    // ✅ Invalidate automation cache so OWM matching uses fresh data
    try {
      const { invalidateAutomationCache } = await import('@/services/automation/OutcomeMatchingService.js');
      invalidateAutomationCache(context.tenantId, automationId);
    } catch (_) {}

    return NextResponse.json({
      success: true,
      data: automationObj
    });
  } catch (error) {
    console.error('[Automation] PUT error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to update automation' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { automationId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const Automation = tenantDB.models.Automation || tenantDB.model('Automation', AutomationSchema);

    const automation = await Automation.findById(automationId);

    if (!automation) {
      return NextResponse.json(
        { success: false, error: 'Automation not found' },
        { status: 404 }
      );
    }

    if (automation.tenantId !== context.tenantId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // ✅ CASCADING DELETION: Delete automation first to prevent new data from being created,
    // then clean up all orphaned related data

    // 1. Delete the automation FIRST to prevent new outcomes/matches from being created
    await Automation.findByIdAndDelete(automationId);
    console.log(`[Delete Automation] Deleted automation ${automationId}`);

    // 2. Register schemas for cleanup
    const OWMOutcomeSchema = (await import('@/models/schemas/OWMOutcome')).default;
    const OWMOutcome = tenantDB.models.OWMOutcome || tenantDB.model('OWMOutcome', OWMOutcomeSchema);
    const OWMOutcomeMatchSchema = (await import('@/models/schemas/OWMOutcomeMatch')).default;
    const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);
    const AIPromptSchema = (await import('@/models/schemas/AIPrompt')).default;
    const AIPrompt = tenantDB.models.AIPrompt || tenantDB.model('AIPrompt', AIPromptSchema);
    const TestingPersonaSchema = (await import('@/models/schemas/TestingPersona')).default;
    const TestingPersona = tenantDB.models.TestingPersona || tenantDB.model('TestingPersona', TestingPersonaSchema);
    const AutomationExecutionSchema = (await import('@/models/schemas/AutomationExecution')).default;
    const AutomationExecution = tenantDB.models.AutomationExecution || tenantDB.model('AutomationExecution', AutomationExecutionSchema);

    // 3. Get all outcome IDs for AI prompt cleanup
    const outcomes = await OWMOutcome.find({
      automationId: automationId,
      tenantId: context.tenantId
    }).select('_id').lean();
    const outcomeIds = outcomes.map(outcome => outcome._id);

    // 4. Delete all related data in parallel (order doesn't matter since automation is already deleted)
    const [outcomePromptsResult, automationPromptsResult, outcomeMatchesResult, outcomesResult, testingPersonasResult, executionsResult] = await Promise.all([
      // Delete AI Prompts for outcomes
      outcomeIds.length > 0
        ? AIPrompt.deleteMany({
            tenantId: context.tenantId,
            moduleId: { $in: outcomeIds },
            moduleIdDescription: 'OWM_OUTCOME'
          })
        : Promise.resolve({ deletedCount: 0 }),
      // Delete AI Prompts for automation
      AIPrompt.deleteMany({
        tenantId: context.tenantId,
        moduleId: automationId,
        moduleIdDescription: 'OWM'
      }),
      // Delete OWM Outcome Matches
      OWMOutcomeMatch.deleteMany({
        automationId: automationId,
        tenantId: context.tenantId
      }),
      // Delete OWM Outcomes
      OWMOutcome.deleteMany({
        automationId: automationId,
        tenantId: context.tenantId
      }),
      // Delete Testing Personas
      TestingPersona.deleteMany({
        automationId: automationId,
        tenantId: context.tenantId
      }),
      // Delete Execution History
      AutomationExecution.deleteMany({
        automationId: automationId,
        tenantId: context.tenantId
      })
    ]);

    console.log(`[Delete Automation] Cleanup complete for ${automationId}: ${outcomesResult.deletedCount} outcomes, ${outcomeMatchesResult.deletedCount} matches, ${(outcomePromptsResult.deletedCount + automationPromptsResult.deletedCount)} prompts, ${testingPersonasResult.deletedCount} personas, ${executionsResult.deletedCount} executions`);

    // ✅ Invalidate automation cache
    try {
      const { invalidateAutomationCache } = await import('@/services/automation/OutcomeMatchingService.js');
      invalidateAutomationCache(context.tenantId, automationId);
    } catch (_) {}

    return NextResponse.json({
      success: true,
      message: 'Automation deleted successfully',
      data: {
        automationDeleted: true,
        outcomesDeleted: outcomesResult.deletedCount,
        outcomeMatchesDeleted: outcomeMatchesResult.deletedCount,
        aiPromptsDeleted: automationPromptsResult.deletedCount + outcomePromptsResult.deletedCount,
        testingPersonasDeleted: testingPersonasResult.deletedCount,
        executionsDeleted: executionsResult.deletedCount
      }
    });
  } catch (error) {
    console.error('[Automation] DELETE error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete automation' },
      { status: 500 }
    );
  }
}

