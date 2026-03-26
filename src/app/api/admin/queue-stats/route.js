// src/app/api/admin/queue-stats/route.js
import { NextResponse } from 'next/server';
import { getTenantContext } from '@/middleware/tenant';
import { getChannel, QUEUES } from '@/lib/queue/rabbitmq.js';

/**
 * GET /api/admin/queue-stats
 * Get queue statistics for monitoring (RabbitMQ)
 * Accessible by Company Admin and Super Admin only
 */
export async function GET(request) {
  const tenantCtx = getTenantContext();
  
  if (!tenantCtx) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Check if user is admin
  if (tenantCtx.role !== 'company_admin' && tenantCtx.role !== 'super_admin') {
    return NextResponse.json(
      { success: false, message: 'Forbidden - Admin access required' },
      { status: 403 }
    );
  }

  try {
    const channel = await getChannel();
    
    // Get stats for all queues
    const [messageStats, statusStats, webhookStats] = await Promise.all([
      getQueueStats(channel, QUEUES.MESSAGE_OUTBOUND, 'Message Outbound'),
      getQueueStats(channel, QUEUES.MESSAGE_STATUS, 'Status Updates'),
      getQueueStats(channel, QUEUES.WEBHOOK_PROCESS, 'Webhook Processing'),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        queues: {
          messageOutbound: messageStats,
          statusUpdates: statusStats,
          webhookProcessing: webhookStats,
        },
        summary: {
          totalActive: 
            messageStats.active + statusStats.active + webhookStats.active,
          totalWaiting: 
            messageStats.waiting + statusStats.waiting + webhookStats.waiting,
        },
        timestamp: new Date().toISOString(),
        note: 'RabbitMQ queue statistics (failed jobs tracking not available)',
      },
    });

  } catch (error) {
    console.error('Queue stats error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to fetch queue statistics',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/queue-stats/retry
 * Retry a failed job (not available with RabbitMQ - jobs are automatically requeued)
 */
export async function POST(request) {
  const tenantCtx = getTenantContext();
  
  if (!tenantCtx || tenantCtx.role !== 'company_admin') {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  return NextResponse.json(
    { 
      success: false, 
      message: 'Manual job retry not available with RabbitMQ. Failed jobs are automatically requeued based on retry configuration.',
    },
    { status: 501 }
  );
}

/**
 * DELETE /api/admin/queue-stats/clean
 * Clean old completed/failed jobs (not available with RabbitMQ - messages have TTL)
 */
export async function DELETE(request) {
  const tenantCtx = getTenantContext();
  
  if (!tenantCtx || tenantCtx.role !== 'company_admin') {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  return NextResponse.json(
    { 
      success: false, 
      message: 'Manual queue cleaning not available with RabbitMQ. Messages are automatically expired based on TTL configuration.',
    },
    { status: 501 }
  );
}

/**
 * Helper: Get queue statistics from RabbitMQ
 */
async function getQueueStats(channel, queueName, name) {
  try {
    const queueInfo = await channel.checkQueue(queueName);
    
    return {
      name,
      waiting: queueInfo.messageCount || 0,
      active: 0, // Active messages are being processed, not available in RabbitMQ
      completed: 0, // Not tracked in RabbitMQ
      failed: 0, // Not tracked in RabbitMQ
      delayed: 0, // Not tracked separately
      paused: false, // Not available in RabbitMQ
      total: queueInfo.messageCount || 0,
      consumers: queueInfo.consumerCount || 0,
    };
  } catch (error) {
    console.error(`Failed to get stats for queue ${queueName}:`, error);
    return {
      name,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: false,
      total: 0,
      consumers: 0,
    };
  }
}

