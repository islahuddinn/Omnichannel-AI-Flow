// src/app/api/automations/[automationId]/copy/route.js
import { NextResponse } from 'next/server';
import { getTenantDB, getMasterDB } from '@/config/database';
import AutomationSchema from '@/models/schemas/Automation';
import TemplateSchema from '@/models/schemas/Template';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import DepartmentSchema from '@/models/schemas/Department';
import UserSchema from '@/models/schemas/User';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import AIPromptSchema from '@/models/schemas/AIPrompt';

export async function POST(request, { params }) {
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

    const originalAutomation = await Automation.findById(automationId).lean();

    if (!originalAutomation) {
      return NextResponse.json(
        { success: false, error: 'Automation not found' },
        { status: 404 }
      );
    }

    if (originalAutomation.tenantId !== context.tenantId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Create a copy (unpublished by default)
    // Note: aiPrompt is now stored separately, will be copied after automation is created
    const copiedAutomation = await Automation.create({
      name: `${originalAutomation.name} (Copy)`,
      type: originalAutomation.type,
      isPublished: false, // Always unpublished when copied
      departments: originalAutomation.departments || [],
      channels: originalAutomation.channels || [],
      triggerConditions: originalAutomation.triggerConditions || {
        contactType: 'both',
        conditions: []
      },
      timing: originalAutomation.timing || {
        type: 'immediate'
      },
      createdBy: auth.user.userId,
      tenantId: context.tenantId,
      statistics: {
        totalSent: 0,
        totalFailed: 0
      }
    });

    // Copy AI Prompt if it exists
    try {
      const AIPrompt = tenantDB.models.AIPrompt || tenantDB.model('AIPrompt', AIPromptSchema);
      const originalPrompt = await AIPrompt.findOne({
        tenantId: context.tenantId,
        moduleId: automationId,
        moduleIdDescription: 'OWM',
        isActive: true
      }).lean();

      if (originalPrompt && originalPrompt.prompt) {
        await AIPrompt.create({
          moduleId: copiedAutomation._id,
          moduleIdDescription: 'OWM',
          prompt: originalPrompt.prompt,
          name: originalPrompt.name || '',
          description: originalPrompt.description || '',
          isActive: true,
          tenantId: context.tenantId,
          createdBy: auth.user.userId,
          updatedBy: auth.user.userId
        });
      }
    } catch (promptError) {
      // Log error but don't fail the copy operation
      console.error('Error copying AI prompt:', promptError);
    }

    await copiedAutomation.populate('departments', 'name');
    await copiedAutomation.populate('channels.channelAccountId', 'name type identifier');
    await copiedAutomation.populate('channels.templateId', 'name channel body subject');
    
    // Manually populate createdBy from master DB
    const copiedAutomationObj = copiedAutomation.toObject();
    if (copiedAutomationObj.createdBy) {
      const user = await User.findById(copiedAutomationObj.createdBy)
        .select('firstName lastName email')
        .lean();
      copiedAutomationObj.createdBy = user;
    }

    return NextResponse.json({
      success: true,
      data: copiedAutomationObj,
      message: 'Automation copied successfully'
    }, { status: 201 });
  } catch (error) {
    console.error('[Automation] Copy error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to copy automation' },
      { status: 500 }
    );
  }
}

