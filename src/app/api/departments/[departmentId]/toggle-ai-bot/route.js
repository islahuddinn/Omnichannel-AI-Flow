// src/app/api/departments/[departmentId]/toggle-ai-bot/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '../../../../../config/database.js';
import DepartmentSchema from '../../../../../models/schemas/Department.js';
import { verifyAuth } from '../../../../../middleware/auth.js';
import { getTenantContext } from '../../../../../middleware/tenant.js';

/**
 * PATCH /api/departments/[departmentId]/toggle-ai-bot
 * Toggle AI bot enabled/disabled for a specific department
 */
export async function PATCH(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { departmentId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    
    const body = await request.json();
    const { enabled } = body;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'enabled field must be a boolean' },
        { status: 400 }
      );
    }

    const department = await Department.findById(departmentId);
    if (!department) {
      return NextResponse.json(
        { success: false, error: 'Department not found' },
        { status: 404 }
      );
    }

    // Update AI bot enabled status
    department.aiBotEnabled = enabled;
    await department.save();

    console.log(`✅ AI Bot ${enabled ? 'enabled' : 'disabled'} for department: ${department.name} (${departmentId})`);

    // Invalidate department bot cache
    try {
      const { invalidateDeptBotCache } = await import('@/services/bot/BotService.js');
      invalidateDeptBotCache(departmentId);
    } catch (e) { /* non-critical */ }

    // ✅ Update all existing conversations for this department to match the new AI bot status
    try {
      const { updateConversationsModeForDepartment } = await import('../../../../../services/conversation/ConversationModeHelper.js');
      const updateResult = await updateConversationsModeForDepartment({
        departmentId: department._id,
        aiBotEnabled: enabled,
        tenantDB
      });

      console.log(`✅ Updated ${updateResult.updatedCount} conversations to ${updateResult.targetMode} mode for department: ${department.name}`);

    return NextResponse.json({
      success: true,
      message: `AI Bot ${enabled ? 'enabled' : 'disabled'} for department`,
        data: {
          departmentId: department._id,
          departmentName: department.name,
          aiBotEnabled: department.aiBotEnabled,
          conversationsUpdated: updateResult.updatedCount,
          totalConversations: updateResult.totalConversations,
          targetMode: updateResult.targetMode
        }
      });
    } catch (updateError) {
      console.error('❌ Error updating conversations mode:', updateError);
      // Still return success for department update, but log the error
      return NextResponse.json({
        success: true,
        message: `AI Bot ${enabled ? 'enabled' : 'disabled'} for department (conversations update failed)`,
        warning: 'Failed to update existing conversations mode',
      data: {
        departmentId: department._id,
        departmentName: department.name,
        aiBotEnabled: department.aiBotEnabled
      }
    });
    }
  } catch (error) {
    console.error('Toggle AI bot error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

