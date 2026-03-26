// src/app/api/automations/[automationId]/executions/route.js
import { NextResponse } from 'next/server';
import { getTenantDB, getMasterDB } from '@/config/database';
import AutomationExecutionSchema from '@/models/schemas/AutomationExecution';
import AutomationSchema from '@/models/schemas/Automation';
import UserSchema from '@/models/schemas/User';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';

/**
 * GET /api/automations/[automationId]/executions
 * List execution history for an automation with pagination
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
    const masterDB = await getMasterDB();

    const AutomationExecution = tenantDB.models.AutomationExecution || tenantDB.model('AutomationExecution', AutomationExecutionSchema);
    const Automation = tenantDB.models.Automation || tenantDB.model('Automation', AutomationSchema);
    const User = masterDB.models.User || masterDB.model('User', UserSchema);

    // Verify automation exists and belongs to tenant
    const automation = await Automation.findById(automationId).select('tenantId name').lean();
    if (!automation) {
      return NextResponse.json({ success: false, error: 'Automation not found' }, { status: 404 });
    }
    if (automation.tenantId !== context.tenantId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const status = searchParams.get('status'); // optional filter

    const query = {
      tenantId: context.tenantId,
      automationId,
    };
    if (status) {
      query.status = status;
    }

    const [executions, total] = await Promise.all([
      AutomationExecution.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AutomationExecution.countDocuments(query),
    ]);

    // Populate triggeredBy from master DB
    const userIds = [...new Set(executions.map(e => e.triggeredBy).filter(Boolean))];
    let usersMap = {};
    if (userIds.length > 0) {
      const users = await User.find({ _id: { $in: userIds } })
        .select('firstName lastName email')
        .lean();
      usersMap = Object.fromEntries(users.map(u => [u._id.toString(), u]));
    }

    const enrichedExecutions = executions.map(exec => ({
      ...exec,
      triggeredBy: exec.triggeredBy ? usersMap[exec.triggeredBy.toString()] || exec.triggeredBy : null,
      duration: exec.startedAt && exec.completedAt
        ? exec.completedAt.getTime() - exec.startedAt.getTime()
        : null,
    }));

    return NextResponse.json({
      success: true,
      data: enrichedExecutions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[AutomationExecutions] GET error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch execution history' },
      { status: 500 }
    );
  }
}
