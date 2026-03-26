// src/app/api/contact/create-auto/route.js
/**
 * Auto Contact Creation/Update/Delete API
 * POST /api/contact/create-auto
 *
 * Accepts contact data and saves to PendingLoad collection for async processing.
 * Validation: unique contactKey per request, valid action, SF_id, email format; no duplicates.
 * All string inputs are trimmed. UTF-8 / Unicode preserved (Content-Type: application/json; charset=utf-8).
 * Queue failures are tracked; records that could not be queued are marked 'queued_failed' for retry.
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantDB, getMasterDB } from '@/config/database';
import { publishToQueue, QUEUES } from '@/lib/queue/rabbitmq.js';
import PendingLoadSchema from '@/models/schemas/PendingLoad.js';
import CompanySchema from '@/models/schemas/Company.js';

/** Recursively trim string values in place; preserves Unicode (UTF-8). */
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

/**
 * Validate email format. Rejects disallowed special characters (!, #, $, etc.)
 * and enforces: local@domain.tld with allowed chars only.
 * Allowed in local: letters, digits, . _ % + -
 * Allowed in domain: letters, digits, . -
 */
function isValidEmail(email) {
  if (email === undefined || email === null) return true; // optional field
  const s = String(email).trim();
  if (s === '') return true;
  if (s.length > 254) return false;
  // Disallow characters that are invalid in email (e.g. ! # $ % ^ & * ( ) = + [ ] { } \ | ; : ' " , < > ? / space)
  const allowedLocal = /^[a-zA-Z0-9._%+-]+$/;
  const allowedDomain = /^[a-zA-Z0-9.-]+$/;
  const parts = s.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64) return false;
  if (!domain || domain.length < 4) return false;
  if (!allowedLocal.test(local)) return false;
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return false;
  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2) return false;
  if (!allowedDomain.test(domain)) return false;
  return true;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const rawCompanyId = body.company_id;
    const company_id = typeof rawCompanyId === 'string' ? rawCompanyId.trim() : rawCompanyId;
    const contacts = body.contacts;

    if (!company_id) {
      return NextResponse.json(
        { success: false, error: 'company_id is required' },
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
      if (/^[0-9a-fA-F]{24}$/.test(company_id.toString())) {
        company = await Company.findById(company_id).lean();
      }
      
      // If not found, try as string match
      if (!company) {
        company = await Company.findOne({ 
          $or: [
            { _id: company_id },
            { tenantDatabaseName: `tenant_${company_id}` }
          ]
        }).lean();
      }
    } catch (error) {
      console.error('Error finding company:', error);
    }

    if (!company) {
      return NextResponse.json(
        { success: false, error: `Company with ID "${company_id}" not found. Please ensure the company exists before creating contacts.` },
        { status: 404 }
      );
    }

    // ✅ Use the company's actual _id and tenantDatabaseName
    const companyId = company._id.toString();
    // Extract tenantId from tenantDatabaseName (format: "tenant_<id>") or use company._id
    const tenantId = company.tenantDatabaseName 
      ? company.tenantDatabaseName.replace('tenant_', '')
      : companyId;
    
    console.log(`✅ Using existing company: ${company.name} (ID: ${companyId}, Tenant: ${tenantId})`);
    
    const auth = await verifyAuth(request).catch(() => ({ success: false }));
    
    // If auth fails, use test mode (for development/testing only)
    let userId;
    
    if (!auth.success) {
      // Test mode - use test user
      userId = body.userId || 'test_user';
      
      // Note: This is a workaround for testing - in production, auth should be required
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
      if (auth.user.companyId && auth.user.companyId.toString() !== companyId && auth.user.role !== 'super_admin') {
        return NextResponse.json(
          { success: false, error: 'Access denied to this company' },
          { status: 403 }
        );
      }
    }

    // Validate request structure and batch size
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'contacts array is required and must not be empty' },
        { status: 400 }
      );
    }

    const MAX_BATCH_SIZE = parseInt(process.env.PENDING_LOAD_MAX_BATCH_SIZE || '5000', 10);
    if (contacts.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { success: false, error: `Batch size ${contacts.length} exceeds maximum of ${MAX_BATCH_SIZE}. Please send smaller batches.` },
        { status: 400 }
      );
    }

    // company_id is already used as tenantId and companyId above, no need to validate again

    const tenantDB = await getTenantDB(tenantId);
    const PendingLoad = tenantDB.models.PendingLoad || tenantDB.model('PendingLoad', PendingLoadSchema);

    const errors = [];
    const seenContactKeys = new Set();
    const validatedItems = []; // { contactKey, contactData, action }

    // ── Phase 1: Validate all contacts ──
    for (const contactItem of contacts) {
      const contactKey = (Object.keys(contactItem)[0] || '').trim() || 'unknown';
      if (seenContactKeys.has(contactKey)) {
        errors.push({ contactKey, error: `Duplicate contactKey "${contactKey}" within request. Each contact must have a unique key.` });
        continue;
      }
      const contactData = contactItem[contactKey];
      if (!contactData || typeof contactData !== 'object') {
        errors.push({ contactKey, error: 'Contact data object is required' });
        continue;
      }
      seenContactKeys.add(contactKey);
      deepTrimStrings(contactData);
      if (contactData['Contact Information'] && typeof contactData['Contact Information'] === 'object') {
        deepTrimStrings(contactData['Contact Information']);
      }
      if (contactData['Updated Information'] && typeof contactData['Updated Information'] === 'object') {
        deepTrimStrings(contactData['Updated Information']);
      }

      if (!contactData.action) {
        errors.push({ contactKey, error: 'Missing action field (must be "new", "update", or "delete")' });
        continue;
      }
      const validActions = ['new', 'update', 'delete'];
      if (!validActions.includes(contactData.action)) {
        errors.push({ contactKey, error: `Invalid action "${contactData.action}". Must be one of: ${validActions.join(', ')}` });
        continue;
      }

      const sfIdRaw = contactData['Contact Information']?.SF_id ?? contactData.SF_id ?? contactData.sf_id;
      const sfId = sfIdRaw != null ? String(sfIdRaw).trim() : '';
      if (contactData.action === 'delete') {
        if (!sfId) { errors.push({ contactKey, error: 'SF_id is required for delete action' }); continue; }
      }
      if (contactData.action === 'new' || contactData.action === 'update') {
        if (!sfId) { errors.push({ contactKey, error: 'SF_id is required for new and update actions' }); continue; }
        const emailRaw = contactData['Contact Information']?.Email ?? contactData.Email ?? contactData.email;
        if (emailRaw != null && String(emailRaw).trim() !== '') {
          if (!isValidEmail(emailRaw)) {
            errors.push({ contactKey, error: 'Invalid email: only letters, digits, and . _ % + - are allowed (no ! # $ or other special characters)' });
            continue;
          }
        }
      }

      validatedItems.push({ contactKey, contactData, action: contactData.action });
    }

    // If nothing passed validation, return early
    if (validatedItems.length === 0) {
      const firstError = errors[0];
      const summary = errors.length === 1 ? firstError.error : `${errors.length} validation error(s). First: ${firstError.error}`;
      return NextResponse.json(
        { success: false, error: summary, message: 'All contacts failed validation. None were queued.', data: { queued: 0, errorCount: errors.length, errors, pendingLoadIds: [], failedToQueue: [] } },
        { status: 400 }
      );
    }

    // ── Phase 2: Sort by action priority (new → update → delete) ──
    const actionOrder = { new: 0, update: 1, delete: 2 };
    validatedItems.sort((a, b) => (actionOrder[a.action] ?? 9) - (actionOrder[b.action] ?? 9));

    // ── Phase 3: Batch insert all PendingLoad documents at once ──
    const now = Date.now();
    const actionDelays = { new: 60000, update: 65000, delete: 70000 };
    const normalizedTenantId = tenantId.startsWith('tenant_') ? tenantId.replace('tenant_', '') : tenantId;

    const pendingLoadDocs = validatedItems.map(({ contactKey, contactData, action }) => ({
      type: 'contacts',
      action,
      data: { companyId, tenantId, userId, contactKey, action, contactData, receivedAt: new Date() },
      createdAt: new Date(),
      updatedAt: new Date(),
      scheduledAt: new Date(now + (actionDelays[action] ?? 0)),
      status: 'pending',
      tenantId,
      companyId,
    }));

    let insertedDocs;
    try {
      insertedDocs = await PendingLoad.insertMany(pendingLoadDocs, { ordered: true });
    } catch (insertError) {
      console.error('❌ Failed to batch insert PendingLoad documents:', insertError);
      return NextResponse.json(
        { success: false, error: 'Failed to save contacts for processing', message: insertError.message },
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
      const { contactData, action } = validatedItems[i];
      try {
        await publishToQueue(QUEUES.PENDING_LOAD, {
          pendingLoadId: doc._id.toString(),
          tenantId: normalizedTenantId,
          companyId,
          userId,
          type: 'contacts',
          action,
          contactData,
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
        ? 'Contacts saved but could not be queued for processing. Check queue connectivity and retry failed items.'
        : failedToQueue.length > 0
          ? `Contacts queued with ${failedToQueue.length} item(s) failed to queue. Retry failed pendingLoadIds if needed.`
          : errors.length > 0
            ? `Contacts queued with ${errors.length} validation error(s).`
            : 'Contacts queued for processing.';

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
    console.error('❌ Contact create-auto error:', error);
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

