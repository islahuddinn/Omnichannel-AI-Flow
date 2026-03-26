// src/app/api/pending-loads/retry/route.js
/**
 * Retry queued_failed pending loads by re-publishing to the queue.
 * POST /api/pending-loads/retry
 * Body: { tenantId or company_id, pendingLoadIds: string[] }
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantDB, getMasterDB } from '@/config/database';
import { publishToQueue, QUEUES } from '@/lib/queue/rabbitmq.js';
import PendingLoadSchema from '@/models/schemas/PendingLoad.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const tenantId = body.tenantId ?? (body.company_id != null ? String(body.company_id).trim() : null);
    const pendingLoadIds = Array.isArray(body.pendingLoadIds) ? body.pendingLoadIds.map(id => String(id).trim()).filter(Boolean) : [];

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'tenantId or company_id is required' },
        { status: 400 }
      );
    }
    if (pendingLoadIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'pendingLoadIds array is required and must not be empty' },
        { status: 400 }
      );
    }

    const auth = await verifyAuth(request).catch(() => ({ success: false }));
    if (!auth.success && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const normalizedTenantId = String(tenantId).replace(/^tenant_/, '');

    const tenantDB = await getTenantDB(normalizedTenantId);
    const PendingLoad = tenantDB.models.PendingLoad || tenantDB.model('PendingLoad', PendingLoadSchema);

    const { createPendingLoadWorker } = await import('@/workers/pendingLoadWorker.js');
    await createPendingLoadWorker();

    const retried = [];
    const notFound = [];
    const notRetryable = [];
    const queueFailed = [];

    for (const id of pendingLoadIds) {
      const doc = await PendingLoad.findById(id).lean();
      if (!doc) {
        notFound.push(id);
        continue;
      }
      if (doc.status !== 'queued_failed' && doc.status !== 'failed') {
        notRetryable.push({ pendingLoadId: id, reason: `status is "${doc.status}", only queued_failed or failed can be retried` });
        continue;
      }
      const data = doc.data || {};
      const type = doc.type || (data.contactData ? 'contacts' : 'deals');
      const action = doc.action || data.contactData?.action || data.dealData?.action || data.action;
      const companyId = doc.companyId ?? data.companyId;
      const userId = data.userId ?? 'system';

      try {
        await publishToQueue(QUEUES.PENDING_LOAD, {
          pendingLoadId: id,
          tenantId: normalizedTenantId,
          companyId: companyId,
          userId,
          type,
          action,
          ...(data.contactData && { contactData: data.contactData }),
        });
        await PendingLoad.findByIdAndUpdate(id, {
          $set: {
            status: 'pending',
            failureReason: null,
            processingStartedAt: null,
            sweepCount: 0,
            updatedAt: new Date(),
          },
        });
        retried.push(id);
      } catch (err) {
        queueFailed.push({ pendingLoadId: id, error: (err?.message || String(err)).slice(0, 500) });
      }
    }

    return NextResponse.json({
      success: true,
      message: retried.length
        ? `Re-queued ${retried.length} pending load(s).`
        : 'No items could be re-queued.',
      data: {
        retried: retried.length,
        retriedIds: retried,
        notFound,
        notRetryable,
        queueFailed: queueFailed.length ? queueFailed : undefined,
      },
    });
  } catch (error) {
    console.error('❌ Pending loads retry error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retry pending loads', message: error.message },
      { status: 500 }
    );
  }
}
