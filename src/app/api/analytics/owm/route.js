// src/app/api/analytics/owm/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import OWMOutcomeMatchSchema from '@/models/schemas/OWMOutcomeMatch';
import AutomationSchema from '@/models/schemas/Automation';
import MessageSchema from '@/models/schemas/Message';

/**
 * GET /api/analytics/owm
 * OWM Automation analytics — response rates, outcome distribution, performance.
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
    const Automation = tenantDB.models.Automation || tenantDB.model('Automation', AutomationSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    const { searchParams } = new URL(request.url);
    const days = Math.min(parseInt(searchParams.get('days') || '30', 10), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      totalAutomations,
      publishedAutomations,
      totalOWMSent,
      allMatches,
      automationList,
    ] = await Promise.all([
      // Total automations
      Automation.countDocuments({ tenantId: context.tenantId }),

      // Published automations
      Automation.countDocuments({ tenantId: context.tenantId, isPublished: true }),

      // Total OWM messages sent in period
      Message.countDocuments({
        sendingModule: 'owm',
        direction: 'outbound',
        createdAt: { $gte: since },
      }),

      // All outcome matches in period
      OWMOutcomeMatch.find({
        tenantId: context.tenantId,
        createdAt: { $gte: since },
      }).select('status stage outcomeName automationName confidenceScore followUpSent matchDurationMs createdAt matchedAt').lean(),

      // Automation list with stats
      Automation.find({ tenantId: context.tenantId })
        .select('name isPublished statistics createdAt')
        .sort({ 'statistics.lastExecutedAt': -1 })
        .limit(20)
        .lean(),
    ]);

    // Match stats
    const totalMatches = allMatches.length;
    const matchedCount = allMatches.filter(m => m.status === 1).length;
    const pendingCount = allMatches.filter(m => m.stage === 'pending').length;
    const actionTakenCount = allMatches.filter(m => m.stage === 'action_taken').length;
    const followUpSentCount = allMatches.filter(m => m.followUpSent).length;
    const matchRate = totalMatches > 0 ? parseFloat(((matchedCount / totalMatches) * 100).toFixed(1)) : 0;

    // Average confidence
    const confidences = allMatches.filter(m => m.confidenceScore > 0).map(m => m.confidenceScore);
    const avgConfidence = confidences.length > 0 ? parseFloat((confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(2)) : 0;

    // Average match duration
    const durations = allMatches.filter(m => m.matchDurationMs > 0).map(m => m.matchDurationMs);
    const avgMatchDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

    // Outcome distribution
    const outcomeDist = {};
    for (const m of allMatches.filter(m => m.status === 1)) {
      const name = m.outcomeName || 'Unknown';
      outcomeDist[name] = (outcomeDist[name] || 0) + 1;
    }
    const outcomeDistribution = Object.entries(outcomeDist)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Stage breakdown
    const stageBreakdown = {
      pending: pendingCount,
      matched: matchedCount - actionTakenCount,
      action_taken: actionTakenCount,
    };

    // By automation
    const byAutomation = {};
    for (const m of allMatches) {
      const name = m.automationName || 'Unknown';
      if (!byAutomation[name]) byAutomation[name] = { sent: 0, matched: 0, actionTaken: 0 };
      byAutomation[name].sent++;
      if (m.status === 1) byAutomation[name].matched++;
      if (m.stage === 'action_taken') byAutomation[name].actionTaken++;
    }
    const automationPerformance = Object.entries(byAutomation)
      .map(([name, stats]) => ({
        name,
        ...stats,
        matchRate: stats.sent > 0 ? parseFloat(((stats.matched / stats.sent) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.matched - a.matched);

    // Daily matches
    const dailyMap = {};
    for (const m of allMatches) {
      const date = new Date(m.createdAt).toISOString().split('T')[0];
      if (!dailyMap[date]) dailyMap[date] = { date, total: 0, matched: 0, pending: 0 };
      dailyMap[date].total++;
      if (m.status === 1) dailyMap[date].matched++;
      else dailyMap[date].pending++;
    }
    const dailyMatches = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Confidence distribution (histogram buckets: 0-0.5, 0.5-0.7, 0.7-0.8, 0.8-0.9, 0.9-1.0)
    const confBuckets = [
      { range: '< 0.5', min: 0, max: 0.5, count: 0 },
      { range: '0.5-0.7', min: 0.5, max: 0.7, count: 0 },
      { range: '0.7-0.8', min: 0.7, max: 0.8, count: 0 },
      { range: '0.8-0.9', min: 0.8, max: 0.9, count: 0 },
      { range: '0.9-1.0', min: 0.9, max: 1.01, count: 0 },
    ];
    for (const c of confidences) {
      for (const b of confBuckets) {
        if (c >= b.min && c < b.max) { b.count++; break; }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        period: { days, since: since.toISOString() },
        summary: {
          totalAutomations,
          publishedAutomations,
          totalOWMSent,
          totalMatches,
          matchedCount,
          pendingCount,
          actionTakenCount,
          followUpSentCount,
          matchRate,
          avgConfidence,
          avgMatchDurationMs: avgMatchDuration,
        },
        outcomeDistribution,
        stageBreakdown,
        automationPerformance,
        dailyMatches,
        confidenceDistribution: confBuckets,
        automationList: automationList.map(a => ({
          name: a.name,
          isPublished: a.isPublished,
          totalSent: a.statistics?.totalSent || 0,
          totalFailed: a.statistics?.totalFailed || 0,
          lastExecuted: a.statistics?.lastExecutedAt,
        })),
      },
    });
  } catch (error) {
    console.error('[OWMAnalytics] Error:', error?.message);
    return NextResponse.json({ success: false, error: 'Failed to fetch OWM analytics' }, { status: 500 });
  }
}
