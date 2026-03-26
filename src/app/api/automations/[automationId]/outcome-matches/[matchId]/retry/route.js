// src/app/api/automations/[automationId]/outcome-matches/[matchId]/retry/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import { getMasterDB } from '@/config/database';
import CompanySchema from '@/models/schemas/Company';

/**
 * POST /api/automations/[automationId]/outcome-matches/[matchId]/retry
 * Retry a failed Salesforce update for a specific match record.
 */
export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { matchId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);

    // Get AI model
    const masterDB = await getMasterDB();
    const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
    let company = await Company.findOne({ tenantDatabaseName: context.tenantId }).lean();
    if (!company) try { company = await Company.findById(context.tenantId).lean(); } catch (_) {}

    const aiBot = company?.features?.aiBot || {};
    if (!aiBot.enabled || !aiBot.provider || !aiBot.model || !aiBot.apiKey) {
      return NextResponse.json({ success: false, error: 'AI Bot not configured' }, { status: 400 });
    }

    const { createModelInstance } = await import('@/services/bot/AIProviderRegistry.js');
    const model = createModelInstance(aiBot.provider, aiBot.model, aiBot.apiKey);

    const { retrySalesforceUpdate } = await import('@/services/bot/SalesforceActionService.js');
    const result = await retrySalesforceUpdate({
      tenantDB,
      tenantId: context.tenantId,
      matchRecordId: matchId,
      model,
    });

    return NextResponse.json({
      success: result.success,
      data: result.result || null,
      error: result.error || null,
    });
  } catch (error) {
    console.error('[RetrySF] Error:', error?.message);
    return NextResponse.json({ success: false, error: 'Retry failed' }, { status: 500 });
  }
}
