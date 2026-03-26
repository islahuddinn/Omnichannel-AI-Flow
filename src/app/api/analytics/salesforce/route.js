// src/app/api/analytics/salesforce/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import OWMOutcomeMatchSchema from '@/models/schemas/OWMOutcomeMatch';

/**
 * GET /api/analytics/salesforce
 * Salesforce sync analytics — update success/fail rates, field frequency, timeline.
 * Query: days (default 30, max 90)
 */
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);

    const { searchParams } = new URL(request.url);
    const days = Math.min(parseInt(searchParams.get('days') || '30', 10), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get all matches with SF updates
    const matches = await OWMOutcomeMatch.find({
      tenantId: context.tenantId,
      'salesforceUpdates.0': { $exists: true },
      updatedAt: { $gte: since },
    }).select('salesforceUpdates outcomeName automationName updatedAt').lean();

    // Flatten all SF updates
    const allUpdates = [];
    for (const m of matches) {
      for (const u of (m.salesforceUpdates || [])) {
        allUpdates.push({
          ...u,
          outcomeName: m.outcomeName,
          automationName: m.automationName,
          matchDate: m.updatedAt,
        });
      }
    }

    // Summary counts
    const totalUpdates = allUpdates.length;
    const successCount = allUpdates.filter(u => u.status === 'success').length;
    const failedCount = allUpdates.filter(u => u.status === 'failed').length;
    const skippedCount = allUpdates.filter(u => u.status === 'skipped').length;
    const successRate = totalUpdates > 0 ? parseFloat(((successCount / totalUpdates) * 100).toFixed(1)) : 0;

    // By object type
    const dealUpdates = allUpdates.filter(u => u.object === 'Deal__c');
    const contactUpdates = allUpdates.filter(u => u.object === 'Contact');

    // Most updated fields
    const fieldCounts = {};
    for (const u of allUpdates) {
      for (const f of (u.fieldsUpdated || [])) {
        fieldCounts[f] = (fieldCounts[f] || 0) + 1;
      }
    }
    const topFields = Object.entries(fieldCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([field, count]) => ({ field, count }));

    // By outcome
    const outcomeCounts = {};
    for (const u of allUpdates) {
      const name = u.outcomeName || 'Unknown';
      if (!outcomeCounts[name]) outcomeCounts[name] = { success: 0, failed: 0, total: 0 };
      outcomeCounts[name].total++;
      if (u.status === 'success') outcomeCounts[name].success++;
      else if (u.status === 'failed') outcomeCounts[name].failed++;
    }
    const byOutcome = Object.entries(outcomeCounts)
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.total - a.total);

    // Failure reasons
    const failReasons = {};
    for (const u of allUpdates.filter(u => u.status === 'failed')) {
      const reason = u.reason || u.error?.substring(0, 80) || 'Unknown';
      failReasons[reason] = (failReasons[reason] || 0) + 1;
    }
    const topFailReasons = Object.entries(failReasons)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count }));

    // Daily timeline
    const dailyMap = {};
    for (const u of allUpdates) {
      const date = new Date(u.updatedAt || u.matchDate).toISOString().split('T')[0];
      if (!dailyMap[date]) dailyMap[date] = { date, success: 0, failed: 0, skipped: 0 };
      if (u.status === 'success') dailyMap[date].success++;
      else if (u.status === 'failed') dailyMap[date].failed++;
      else dailyMap[date].skipped++;
    }
    const dailyTimeline = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Recent updates (last 20)
    const recentUpdates = allUpdates
      .sort((a, b) => new Date(b.updatedAt || b.matchDate) - new Date(a.updatedAt || a.matchDate))
      .slice(0, 20)
      .map(u => ({
        object: u.object,
        status: u.status,
        fields: u.fieldsUpdated || [],
        outcomeName: u.outcomeName,
        error: u.error,
        reason: u.reason,
        date: u.updatedAt || u.matchDate,
      }));

    return NextResponse.json({
      success: true,
      data: {
        period: { days, since: since.toISOString() },
        summary: {
          totalUpdates,
          successCount,
          failedCount,
          skippedCount,
          successRate,
          dealUpdates: dealUpdates.length,
          contactUpdates: contactUpdates.length,
        },
        topFields,
        byOutcome,
        topFailReasons,
        dailyTimeline,
        recentUpdates,
      },
    });
  } catch (error) {
    console.error('[SFAnalytics] Error:', error?.message);
    return NextResponse.json({ success: false, error: 'Failed to fetch SF analytics' }, { status: 500 });
  }
}
