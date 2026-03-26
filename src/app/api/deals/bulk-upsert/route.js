// src/app/api/deals/bulk-upsert/route.js
/**
 * Bulk Deal Upsert API
 * POST /api/deals/bulk-upsert
 *
 * Accepts deal data and saves to PendingLoad collection for async processing.
 * Validation: unique deal Id per request, valid action; no duplicate Ids within the same request.
 * All string inputs are trimmed. Queue failures are tracked; records that could not be
 * queued are marked status 'queued_failed' for retry.
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantDB, getMasterDB } from '@/config/database';
import { publishToQueue, QUEUES } from '@/lib/queue/rabbitmq.js';
import PendingLoadSchema from '@/models/schemas/PendingLoad.js';
import CompanySchema from '@/models/schemas/Company.js';

/** Recursively trim all string values in an object (mutates in place). */
function deepTrimStrings(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj.trim();
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => { obj[i] = deepTrimStrings(item); });
    return obj;
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      obj[key] = deepTrimStrings(obj[key]);
    }
    return obj;
  }
  return obj;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const rawCompanyId = body.companyId;
    const companyId = typeof rawCompanyId === 'string' ? rawCompanyId.trim() : rawCompanyId;
    const dealsData = body.dealsData;

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'companyId is required' },
        { status: 400 }
      );
    }

    // ✅ CRITICAL: Verify company exists in master database before using tenant database
    const masterDB = await getMasterDB();
    const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
    
    // Try to find company by _id (ObjectId or string)
    let company;
    try {
      // Try as ObjectId first
      if (/^[0-9a-fA-F]{24}$/.test(companyId.toString())) {
        company = await Company.findById(companyId).lean();
      }
      
      // If not found, try as string match
      if (!company) {
        company = await Company.findOne({ 
          $or: [
            { _id: companyId },
            { tenantDatabaseName: `tenant_${companyId}` }
          ]
        }).lean();
      }
    } catch (error) {
      console.error('Error finding company:', error);
    }

    if (!company) {
      return NextResponse.json(
        { success: false, error: `Company with ID "${companyId}" not found. Please ensure the company exists before creating deals.` },
        { status: 404 }
      );
    }

    // ✅ Use the company's actual _id and tenantDatabaseName
    const resolvedCompanyId = company._id.toString();
    // Extract tenantId from tenantDatabaseName (format: "tenant_<id>") or use company._id
    const tenantId = company.tenantDatabaseName 
      ? company.tenantDatabaseName.replace('tenant_', '')
      : resolvedCompanyId;
    
    console.log(`✅ Using existing company: ${company.name} (ID: ${resolvedCompanyId}, Tenant: ${tenantId})`);
    
    const auth = await verifyAuth(request).catch(() => ({ success: false }));
    
    // If auth fails, use test mode (for development/testing only)
    let userId;
    
    if (!auth.success) {
      // Test mode - use test user
      userId = body.userId || 'test_user';
      console.warn('⚠️ TESTING MODE: Request processed without authentication');
    } else {
      // Production mode - use authenticated user
      if (!['company_admin', 'super_admin'].includes(auth.user.role)) {
        return NextResponse.json(
          { success: false, error: 'Admin access required' },
          { status: 403 }
        );
      }

      userId = auth.user.userId;
      
      // ✅ Verify user has access to this company
      if (auth.user.companyId && auth.user.companyId.toString() !== resolvedCompanyId && auth.user.role !== 'super_admin') {
        return NextResponse.json(
          { success: false, error: 'Access denied to this company' },
          { status: 403 }
        );
      }
    }

    // Validate request structure and batch size
    if (!dealsData || !Array.isArray(dealsData) || dealsData.length === 0) {
      return NextResponse.json(
        { success: false, error: 'dealsData array is required and must not be empty' },
        { status: 400 }
      );
    }

    const MAX_BATCH_SIZE = parseInt(process.env.PENDING_LOAD_MAX_BATCH_SIZE || '5000', 10);
    if (dealsData.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { success: false, error: `Batch size ${dealsData.length} exceeds maximum of ${MAX_BATCH_SIZE}. Please send smaller batches.` },
        { status: 400 }
      );
    }

    const tenantDB = await getTenantDB(tenantId);
    const PendingLoad = tenantDB.models.PendingLoad || tenantDB.model('PendingLoad', PendingLoadSchema);

    const errors = [];
    const seenDealIds = new Set();
    const validatedItems = []; // { dealItem, dealIdStr, action }

    // ── Phase 1: Validate all deals ──
    for (const dealItem of dealsData) {
      deepTrimStrings(dealItem);
      const dealId = dealItem.Id ?? dealItem.id ?? dealItem.deal_id;
      const dealIdStr = dealId != null ? String(dealId).trim() : '';
      if (dealIdStr && seenDealIds.has(dealIdStr)) {
        errors.push({ dealId: dealIdStr, error: `Duplicate deal Id "${dealIdStr}" within request. Each deal must have a unique Id.` });
        continue;
      }
      if (!dealItem.action) {
        errors.push({ dealId: dealItem.Id ?? dealItem.id ?? 'unknown', error: 'Missing action field (must be "new", "update", or "delete")' });
        continue;
      }
      const validActions = ['new', 'update', 'delete'];
      if (!validActions.includes(dealItem.action)) {
        errors.push({ dealId: dealItem.Id ?? dealItem.id ?? 'unknown', error: `Invalid action "${dealItem.action}". Must be one of: ${validActions.join(', ')}` });
        continue;
      }
      if (!dealIdStr) {
        errors.push({ dealId: 'unknown', error: `Id is required for ${dealItem.action} action` });
        continue;
      }
      seenDealIds.add(dealIdStr);
      validatedItems.push({ dealItem, dealIdStr, action: dealItem.action });
    }

    // If nothing passed validation, return early
    if (validatedItems.length === 0 && errors.length > 0) {
      return NextResponse.json(
        { success: false, error: errors[0].error, message: 'All deals failed validation. None were queued.', data: { queued: 0, errorCount: errors.length, errors, pendingLoadIds: [], failedToQueue: [] } },
        { status: 400 }
      );
    }

    // ── Phase 2: Sort by action priority (new → update → delete) ──
    const actionOrder = { new: 0, update: 1, delete: 2 };
    validatedItems.sort((a, b) => (actionOrder[a.action] ?? 9) - (actionOrder[b.action] ?? 9));

    // ── Phase 3: Batch insert all PendingLoad documents at once ──
    const now = Date.now();
    const actionDelays = { new: 60000, update: 65000, delete: 70000 };

    const pendingLoadDocs = validatedItems.map(({ dealItem, action }) => ({
      type: 'deals',
      action,
      data: { companyId: resolvedCompanyId, tenantId, userId, action, dealData: dealItem, receivedAt: new Date() },
      createdAt: new Date(),
      updatedAt: new Date(),
      scheduledAt: new Date(now + (actionDelays[action] ?? 0)),
      status: 'pending',
      tenantId,
      companyId: resolvedCompanyId,
    }));

    let insertedDocs;
    try {
      insertedDocs = await PendingLoad.insertMany(pendingLoadDocs, { ordered: true });
    } catch (insertError) {
      console.error('❌ Failed to batch insert PendingLoad documents:', insertError);
      return NextResponse.json(
        { success: false, error: 'Failed to save deals for processing', message: insertError.message },
        { status: 500 }
      );
    }

    const pendingLoadIds = insertedDocs.map((doc) => doc._id.toString());

    // ── Phase 4: Initialize worker once ──
    try {
      const { createPendingLoadWorker } = await import('@/workers/pendingLoadWorker.js');
      await createPendingLoadWorker();
    } catch (err) {
      console.warn('⚠️ Failed to start pending load worker (will retry):', err.message);
    }

    // ── Phase 5: Publish to queue in order (new first, then update, then delete) ──
    const failedToQueue = [];
    for (let i = 0; i < insertedDocs.length; i++) {
      const doc = insertedDocs[i];
      const { action } = validatedItems[i];
      try {
        await publishToQueue(QUEUES.PENDING_LOAD, {
          pendingLoadId: doc._id.toString(),
          tenantId,
          companyId: resolvedCompanyId,
          userId,
          type: 'deals',
          action,
        });
      } catch (queueError) {
        const reason = (queueError?.message || String(queueError)).slice(0, 2000);
        failedToQueue.push({ pendingLoadId: doc._id.toString(), error: reason });
        PendingLoad.findByIdAndUpdate(doc._id, { $set: { status: 'queued_failed', failureReason: reason, updatedAt: new Date() } }).catch((markErr) => {
          console.error(`[PendingLoad] Failed to mark ${doc._id} as queued_failed:`, markErr.message);
        });
      }
    }

    // ── Response ──
    const queuedCount = pendingLoadIds.length - failedToQueue.length;
    const message =
      failedToQueue.length > 0 && queuedCount === 0
        ? 'Deals saved but could not be queued for processing. Check queue connectivity and retry failed items.'
        : failedToQueue.length > 0
          ? `Deals queued with ${failedToQueue.length} item(s) failed to queue. Retry failed pendingLoadIds if needed.`
          : errors.length > 0
            ? `Deals queued with ${errors.length} validation error(s).`
            : 'Deals queued for processing.';

    return NextResponse.json({
      success: true,
      message,
      data: {
        queued: queuedCount,
        totalAccepted: pendingLoadIds.length,
        errorCount: errors.length,
        ...(errors.length > 0 && { errors }),
        pendingLoadIds,
        ...(failedToQueue.length > 0 && { failedToQueue }),
      },
    });

  } catch (error) {
    console.error('❌ Deal bulk-upsert error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process request',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

