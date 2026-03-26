// src/app/api/admin/bot-metrics/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database.js';
import QueueSchema from '@/models/schemas/Queue.js';

/**
 * GET /api/admin/bot-metrics
 * Get bot queue metrics/analytics for the admin dashboard
 * Accessible by Company Admin and Super Admin only
 */
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is admin
    if (auth.user.role !== 'company_admin' && auth.user.role !== 'super_admin') {
      return NextResponse.json(
        { success: false, message: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const tenantCtx = await getTenantContext(request);
    if (!tenantCtx?.tenantId) {
      return NextResponse.json(
        { success: false, message: 'Tenant context required' },
        { status: 400 }
      );
    }
    const tenantDB = await getTenantDB(tenantCtx.tenantId);
    const Queue = tenantDB.models.Queue || tenantDB.model('Queue', QueueSchema);

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Run all queries in parallel for speed
    const [
      statusCounts,
      last24hCompleted,
      last24hFailed,
      recentFailures,
      actionCounts,
      avgProcessingTime
    ] = await Promise.all([
      // Status summary
      Queue.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      // Completed in last 24h
      Queue.countDocuments({ status: 'completed', updatedAt: { $gte: last24h } }),
      // Failed in last 24h
      Queue.countDocuments({ status: 'failed', updatedAt: { $gte: last24h } }),
      // Recent failures (last 10)
      Queue.find({ status: 'failed' })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select('action result created_at updated_at createdAt updatedAt')
        .lean(),
      // Action breakdown
      Queue.aggregate([
        { $group: { _id: '$action', count: { $sum: 1 } } }
      ]),
      // Average processing time for completed items (last 24h)
      Queue.aggregate([
        { $match: { status: 'completed', updatedAt: { $gte: last24h } } },
        {
          $project: {
            processingTime: {
              $subtract: ['$updatedAt', '$createdAt']
            }
          }
        },
        {
          $group: {
            _id: null,
            avgTime: { $avg: '$processingTime' }
          }
        }
      ])
    ]);

    // Build summary
    const statusMap = {};
    statusCounts.forEach(s => { statusMap[s._id] = s.count; });
    const totalItems = Object.values(statusMap).reduce((a, b) => a + b, 0);

    // Build action breakdown
    const actionMap = {};
    actionCounts.forEach(a => { actionMap[a._id] = a.count; });

    // Format recent failures
    const formattedFailures = recentFailures.map(f => {
      let errorMsg = '';
      try {
        const parsed = JSON.parse(f.result || '{}');
        errorMsg = parsed.error || 'Unknown error';
      } catch { errorMsg = f.result || 'Unknown error'; }
      return {
        id: f._id.toString(),
        action: f.action,
        error: errorMsg,
        createdAt: f.createdAt || f.created_at,
        updatedAt: f.updatedAt || f.updated_at,
      };
    });

    // Success rate
    const total24h = last24hCompleted + last24hFailed;
    const successRate = total24h > 0 ? Math.round((last24hCompleted / total24h) * 100) : 100;

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalItems,
          pending: statusMap.pending || 0,
          processing: statusMap.processing || 0,
          completed: statusMap.completed || 0,
          failed: statusMap.failed || 0,
        },
        performance: {
          avgProcessingTimeMs: Math.round(avgProcessingTime[0]?.avgTime || 0),
          completedLast24h: last24hCompleted,
          failedLast24h: last24hFailed,
          successRate,
        },
        recentFailures: formattedFailures,
        actionBreakdown: {
          send_email: actionMap.send_email || 0,
          send_whatsapp: actionMap.send_whatsapp || 0,
          send_sms: actionMap.send_sms || 0,
          send_message: actionMap.send_message || 0,
          move_to_manual: actionMap.move_to_manual || 0,
        },
        timestamp: now.toISOString(),
      }
    });

  } catch (error) {
    console.error('[BotMetrics] GET error:', error?.message || error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch bot metrics',
      },
      { status: 500 }
    );
  }
}
