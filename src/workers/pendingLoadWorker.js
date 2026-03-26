// src/workers/pendingLoadWorker.js
/**
 * Pending Load Worker
 * Processes pending loads (contacts/deals) asynchronously from RabbitMQ queue.
 * Handles new, update, and delete actions with proper ordering guarantees.
 *
 * Key design decisions:
 * - Uses atomic findOneAndUpdate to transition status to 'processing' (prevents sweep duplicates)
 * - Update/delete actions that can't find their entity are re-scheduled (not failed) to wait
 *   for a pending 'new' action to finish first
 * - Coalescing merges redundant actions so only the latest state is applied
 * - Sweep only re-queues records that are truly stuck (not currently being processed)
 * - Transient vs permanent error distinction: transient errors are retried by RabbitMQ,
 *   only permanent errors (missing SF_id, bad data) are marked failed
 */

import { consumeFromQueue, publishToQueue, QUEUES } from '../lib/queue/rabbitmq.js';
import { getTenantDB, getMasterDB } from '../config/database.js';
import PendingLoadSchema from '../models/schemas/PendingLoad.js';
import ContactSchema from '../models/schemas/Contact.js';
import DealSchema from '../models/schemas/Deal.js';
import CompanyAccountSchema from '../models/schemas/CompanyAccount.js';
import DepartmentSchema from '../models/schemas/Department.js';
import WebChatSessionSchema from '../models/schemas/WebChatSession.js';
import CompanySchema from '../models/schemas/Company.js';
import { CHANNEL_TYPES } from '../config/constants.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import SocketEmitter from '../services/socket/SocketEmitter.js';
import MobileJobService from '../services/mobile/MobileJobService.js';

const QUEUE_NAME = QUEUES.PENDING_LOAD;

// Singleton guard
let pendingLoadWorker = null;
let isPendingLoadWorkerInitialized = false;
let sweepInterval = null;

// Configurable via env, with sensible defaults
// How long to wait for a 'new' action to complete before retrying an update/delete (ms)
const DEPENDENT_ACTION_REQUEUE_DELAY = parseInt(process.env.PENDING_LOAD_DEPENDENCY_DELAY_MS || '10000', 10);
// Maximum times sweep can re-queue a single record before marking it failed
const MAX_SWEEP_REQUEUE = parseInt(process.env.PENDING_LOAD_MAX_SWEEP_RETRIES || '25', 10);
// How long a record can stay in 'processing' before sweep considers it stuck (ms)
const PROCESSING_STALE_THRESHOLD = parseInt(process.env.PENDING_LOAD_STALE_THRESHOLD_MS || '300000', 10);
// Max items per sweep cycle
const SWEEP_BATCH_LIMIT = parseInt(process.env.PENDING_LOAD_SWEEP_BATCH_LIMIT || '500', 10);
// Worker processing timeout (ms) — prevents hung queries from starving the worker
const WORKER_PROCESSING_TIMEOUT = parseInt(process.env.PENDING_LOAD_PROCESSING_TIMEOUT_MS || '120000', 10);

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────

function normalizePhone(phone) {
  if (!phone) return null;
  const str = phone.toString().trim();
  if (!str) return null;
  const cleaned = str.replace(/[^\d+]/g, '');
  const normalized = cleaned.startsWith('+') ? cleaned : `+${cleaned.replace(/^\+/, '')}`;
  return normalized || null;
}

function isValidEmail(email) {
  if (email === undefined || email === null) return true;
  const s = String(email).trim();
  if (s === '') return true;
  if (s.length > 254) return false;
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

function normalizeEmail(email) {
  if (!email) return null;
  const str = email.toString().trim();
  if (!str) return null;
  if (!isValidEmail(str)) return null;
  return str.toLowerCase();
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Database lookup helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find contact by SF_id. Prioritizes match WITH companyId, falls back to bare SF_id.
 * Uses two-step approach to avoid returning wrong contact from overly broad $or.
 */
async function findContactBySFId(Contact, normalizedSfId, normalizedCompanyId) {
  // Step 1: Try with companyId (most specific match)
  const queryWithCompany = [
    { companyId: normalizedCompanyId, SF_id: normalizedSfId },
  ];
  if (mongoose.Types.ObjectId.isValid(normalizedCompanyId)) {
    queryWithCompany.push({
      companyId: new mongoose.Types.ObjectId(normalizedCompanyId),
      SF_id: normalizedSfId,
    });
  }

  let existing = await Contact.findOne({ $or: queryWithCompany }).lean();
  if (existing) return existing;

  // Step 2: Fallback to bare SF_id (contacts that don't have companyId set)
  existing = await Contact.findOne({
    SF_id: normalizedSfId,
    $or: [
      { companyId: { $exists: false } },
      { companyId: null },
      { companyId: '' },
    ],
  }).lean();

  return existing;
}

/**
 * Find deal by deal_id. Prioritizes match WITH companyId, falls back to bare deal_id.
 */
async function findDealById(Deal, normalizedDealId, normalizedCompanyId) {
  const queryWithCompany = [
    { companyId: normalizedCompanyId, deal_id: normalizedDealId },
  ];
  if (mongoose.Types.ObjectId.isValid(normalizedCompanyId)) {
    queryWithCompany.push({
      companyId: new mongoose.Types.ObjectId(normalizedCompanyId),
      deal_id: normalizedDealId,
    });
  }

  let existing = await Deal.findOne({ $or: queryWithCompany }).lean();
  if (existing) return existing;

  existing = await Deal.findOne({
    deal_id: normalizedDealId,
    $or: [
      { companyId: { $exists: false } },
      { companyId: null },
      { companyId: '' },
    ],
  }).lean();

  return existing;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data transformation
// ─────────────────────────────────────────────────────────────────────────────

function transformDealData(dealData, companyId) {
  const dealId = dealData.Id || dealData.id || dealData.deal_id;
  if (!dealId) {
    throw new Error('Id is required');
  }

  const deal = {
    companyId: companyId,
    deal_id: dealId.toString().trim(),
    details: {},
    metadata: {
      source: 'api_auto',
      importedAt: new Date(),
    },
  };

  if (dealData.Name || dealData.name) {
    deal.name = (dealData.Name || dealData.name).toString().trim();
  }
  if (dealData.Stage || dealData.stage) {
    deal.stage = (dealData.Stage || dealData.stage).toString().trim();
  }
  if (dealData.Status || dealData.status) {
    deal.status = (dealData.Status || dealData.status).toString().trim();
  }

  const excludedFields = ['Id', 'id', 'deal_id', 'Name', 'name', 'Stage', 'stage', 'Status', 'status', 'action'];
  const detailKeyForDb = (k) => (typeof k === 'string' && k.endsWith('__c') ? k.slice(0, -3) : k);
  Object.keys(dealData).forEach(key => {
    if (!excludedFields.includes(key)) {
      const value = dealData[key];
      if (value !== undefined && value !== null && value !== '') {
        const dbKey = detailKeyForDb(key);
        deal.details[dbKey] = value;
      }
    }
  });

  return deal;
}

function isDealUpdateNoOp(existingDeal, transformedDeal) {
  if (!existingDeal || !transformedDeal) return false;
  if (transformedDeal.name != null && String(transformedDeal.name) !== String(existingDeal.name || '')) return false;
  if (transformedDeal.stage != null && String(transformedDeal.stage) !== String(existingDeal.stage || '')) return false;
  if (transformedDeal.status != null && String(transformedDeal.status) !== String(existingDeal.status || '')) return false;
  const existingDetails = existingDeal.details || {};
  const incomingDetails = transformedDeal.details || {};
  for (const key of Object.keys(incomingDetails)) {
    const incomingVal = incomingDetails[key];
    const existingVal = existingDetails[key];
    if (incomingVal === existingVal) continue;
    if (incomingVal == null && existingVal == null) continue;
    if (typeof incomingVal === 'object' && typeof existingVal === 'object' && incomingVal !== null && existingVal !== null) {
      try {
        if (JSON.stringify(incomingVal) !== JSON.stringify(existingVal)) return false;
      } catch {
        return false;
      }
    } else {
      const a = incomingVal instanceof Date ? incomingVal.getTime() : incomingVal;
      const b = existingVal instanceof Date ? existingVal.getTime() : existingVal;
      if (a !== b) return false;
    }
  }
  return true;
}

async function notifyMobileAppIfB2ADeal(deal, normalizedCompanyId, tenantDB) {
  try {
    const dealType = deal?.details?.Deal_Type || deal?.details?.DEAL_TYPE;
    if (dealType !== 'B2A') return;

    const handymanSFId = deal?.details?.Handyman;
    if (!handymanSFId) return;

    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const handyman = await Contact.findOne({ SF_id: handymanSFId }).lean();
    const customerSFId = deal.details?.Customer;
    let customer = null;
    if (customerSFId) {
      customer = await Contact.findOne({ SF_id: customerSFId }).lean();
    }

    const jobData = MobileJobService.formatJobForMobile(
      deal,
      handyman || {},
      customer
    );

    await SocketEmitter.emit(
      `mobile:handyman:${handymanSFId}`,
      'job:deal_updated',
      { job: jobData, source: 'salesforce_sync', timestamp: new Date() }
    );

    await SocketEmitter.emit(
      `company:${normalizedCompanyId}`,
      'mobile:job:deal_updated',
      {
        dealId: deal._id?.toString?.() || deal._id,
        deal_id: deal.deal_id,
        handymanSFId,
        source: 'salesforce_sync',
        timestamp: new Date(),
      }
    );
  } catch (err) {
    console.warn('⚠️ B2A mobile notification failed (non-fatal):', err?.message || err);
  }
}

async function generateWebChatLink(contactId, tenantDB, companyId, departmentId = null) {
  try {
    const WebChatSession = tenantDB.models.WebChatSession || tenantDB.model('WebChatSession', WebChatSessionSchema);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    const channelAccount = await CompanyAccount.findOne({
      type: CHANNEL_TYPES.WEBCHAT || 'webchat',
      isActive: true,
      companyId: companyId,
    }).lean();

    if (!channelAccount) return null;

    const deptId = departmentId || channelAccount.departmentId || (channelAccount.departmentIds && channelAccount.departmentIds[0]);
    if (!deptId) return null;

    const department = await Department.findById(deptId).lean();
    if (!department) return null;

    const existingContact = await Contact.findById(contactId).select('webchatLink identifiers').lean();
    if (!existingContact) return null;

    if (existingContact.webchatLink && existingContact.identifiers?.webchat) {
      return { linkId: existingContact.identifiers.webchat, contactLink: existingContact.webchatLink };
    }

    const linkId = crypto.randomBytes(16).toString('hex');
    const { getAppUrl } = await import('../lib/utils.js');
    const contactLink = `${getAppUrl()}/webchat/${linkId}`;

    await WebChatSession.create({
      sessionId: linkId,
      visitorId: `visitor_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
      widgetId: channelAccount.identifier || channelAccount._id.toString(),
      channelAccountId: channelAccount._id,
      departmentId: department._id,
      contactId: contactId,
      contactLink,
      pinHash: null,
      status: 'pending_auth',
      isAuthenticated: false,
      isFirstTime: true,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      metadata: {
        tenantId: tenantDB.name.replace('tenant_', ''),
        companyId: companyId,
      },
    });

    await Contact.findByIdAndUpdate(contactId, {
      $set: {
        webchatLink: contactLink,
        'identifiers.webchat': linkId,
        updatedAt: new Date(),
      },
    });

    return { linkId, contactLink };
  } catch (error) {
    console.error('❌ Error generating WebChat link:', error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Contact data transformation helpers
// ─────────────────────────────────────────────────────────────────────────────

const FIRST_NAME_KEYS = ['FirstName', 'First_Name', 'firstname', 'first_name', 'First Name'];
const LAST_NAME_KEYS = ['LastName', 'Last_Name', 'lastname', 'last_name', 'Last Name'];
const FULL_NAME_KEYS = ['Name', 'name', 'Contact Full Name', 'Full Name', 'FullName', 'fullname', 'Contact_Full_Name', 'contact_full_name'];
const CONTACT_TYPE_KEYS = ['Contact_Type', 'Contact Type', 'ContactType', 'contact_type', 'contactType'];

function safeUnicodeString(val) {
  if (val === undefined || val === null) return '';
  const s = String(val).trim();
  return s === '' ? '' : s.normalize('NFC');
}

function getValueByKeyVariations(obj, keyVariations) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keyVariations) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') {
      return safeUnicodeString(obj[k]);
    }
  }
  const keysLower = keyVariations.map((x) => x.toLowerCase());
  for (const key of Object.keys(obj)) {
    if (keysLower.includes(key.toLowerCase())) {
      const v = obj[key];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        return safeUnicodeString(v);
      }
    }
  }
  return null;
}

function isReservedContactField(key) {
  const k = key.toLowerCase().replace(/\s+/g, '_');
  const nameLike = ['firstname', 'first_name', 'lastname', 'last_name', 'name', 'contact_full_name', 'full_name', 'fullname'];
  const contactTypeLike = ['contact_type', 'contacttype'];
  return nameLike.includes(k) || contactTypeLike.includes(k);
}

function transformContactData(contactData, companyId) {
  const contactInfo = contactData['Contact Information'] || {};
  const updatedInfo = contactData['Updated Information'] || {};
  const detailsObj = contactData.details || {};

  const sfId = contactInfo.SF_id || contactData.SF_id || contactData.sf_id;
  if (!sfId) {
    throw new Error('SF_id is required');
  }

  const contact = {
    companyId: companyId,
    SF_id: sfId.toString().trim(),
    details: {},
    identifiers: {},
    metadata: {
      source: 'api_auto',
      importedAt: new Date(),
    },
  };

  const allNameSources = [contactInfo, updatedInfo, detailsObj, contactData];
  let firstName = null, lastName = null, fullName = null;

  for (const src of allNameSources) {
    if (!firstName) firstName = getValueByKeyVariations(src, FIRST_NAME_KEYS);
    if (!lastName) lastName = getValueByKeyVariations(src, LAST_NAME_KEYS);
    if (!fullName) fullName = getValueByKeyVariations(src, FULL_NAME_KEYS);
  }

  if (firstName) contact.firstName = firstName;
  if (lastName) contact.lastName = lastName;
  if (fullName) {
    contact.name = fullName;
    const nameParts = fullName.split(/\s+/);
    if (!contact.firstName) contact.firstName = nameParts[0] || fullName;
    if (!contact.lastName && nameParts.length >= 2) contact.lastName = nameParts.slice(1).join(' ');
  } else if (firstName || lastName) {
    contact.name = [firstName, lastName].filter(Boolean).join(' ').trim();
  }
  const displayNameVal = contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  if (displayNameVal) contact.displayName = displayNameVal;

  // Contact_Type
  for (const src of [contactInfo, updatedInfo, detailsObj, contactData]) {
    const v = getValueByKeyVariations(src, CONTACT_TYPE_KEYS);
    if (v) contact.Contact_Type = v;
  }
  const nestedContactType = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    return getValueByKeyVariations(obj, CONTACT_TYPE_KEYS);
  };
  for (const src of [contactInfo, updatedInfo, detailsObj, contactData]) {
    if (!src || typeof src !== 'object') continue;
    for (const val of Object.values(src)) {
      const v = nestedContactType(val);
      if (v) contact.Contact_Type = v;
    }
  }

  if (contactInfo.Phone) {
    contact.phone = normalizePhone(contactInfo.Phone);
    if (contact.phone) {
      contact.identifiers.sms = contact.phone;
      contact.identifiers.whatsapp = contact.phone;
    }
  }

  if (contactInfo.Email) {
    contact.email = normalizeEmail(contactInfo.Email);
    if (contact.email) {
      contact.identifiers.email = contact.email;
    }
  }

  if (contactInfo.Notes) {
    contact.details.Notes = typeof contactInfo.Notes === 'string' ? safeUnicodeString(contactInfo.Notes) : contactInfo.Notes;
  }

  if (updatedInfo['Last Updated']) {
    contact.details['Last Updated'] = updatedInfo['Last Updated'];
  }

  if (updatedInfo.Status) {
    contact.Is_Active = updatedInfo.Status.toLowerCase() === 'active';
  }

  if (updatedInfo.Priority) {
    contact.details.Priority = updatedInfo.Priority;
  }

  const reservedKeys = new Set([
    'SF_id', 'sf_id', 'Phone', 'Email', 'Notes', 'Contact Full Name',
    ...FIRST_NAME_KEYS, ...LAST_NAME_KEYS, ...FULL_NAME_KEYS,
    ...CONTACT_TYPE_KEYS,
    'Last Updated', 'Status', 'Priority', 'action', 'Contact Information', 'Updated Information', 'details',
  ]);

  function addToDetails(obj) {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach((key) => {
      if (reservedKeys.has(key)) return;
      if (isReservedContactField(key)) return;
      const value = obj[key];
      if (value !== undefined && value !== null && value !== '') {
        contact.details[key] = value;
      }
    });
  }

  addToDetails(contactInfo);
  addToDetails(updatedInfo);
  addToDetails(detailsObj);

  Object.keys(contactData).forEach((key) => {
    if (['Contact Information', 'Updated Information', 'action', 'SF_id', 'sf_id', 'details'].includes(key)) return;
    if (reservedKeys.has(key) || isReservedContactField(key)) return;
    if (CONTACT_TYPE_KEYS.includes(key) || key === 'Contact Type' || key === 'contact_type' || key === 'contactType') {
      if (contactData[key]) contact.Contact_Type = safeUnicodeString(contactData[key]);
      return;
    }
    const val = contactData[key];
    contact.details[key] = val;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const v = nestedContactType(val);
      if (v) contact.Contact_Type = v;
    }
  });

  return contact;
}

// ─────────────────────────────────────────────────────────────────────────────
// SF_id extraction helpers (used for coalescing lookups)
// ─────────────────────────────────────────────────────────────────────────────

function buildSfIdCoalesceQuery(normalizedSfId) {
  return {
    $or: [
      { 'data.contactData.Contact Information.SF_id': normalizedSfId },
      { 'data.contactData.SF_id': normalizedSfId },
      { 'data.contactData.sf_id': normalizedSfId },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Deep merge helper — merges contactData without overwriting already-merged keys
// ─────────────────────────────────────────────────────────────────────────────

function deepMergeContactData(baseData, updateData) {
  const merged = { ...baseData };

  // Deep merge 'Contact Information' (preserve base, overlay update)
  if (updateData['Contact Information']) {
    merged['Contact Information'] = {
      ...(merged['Contact Information'] || {}),
      ...updateData['Contact Information'],
    };
  }

  // Deep merge 'Updated Information'
  if (updateData['Updated Information']) {
    merged['Updated Information'] = {
      ...(merged['Updated Information'] || {}),
      ...updateData['Updated Information'],
    };
  }

  // Deep merge 'details'
  if (updateData.details && typeof updateData.details === 'object') {
    merged.details = {
      ...(merged.details || {}),
      ...updateData.details,
    };
  }

  // Overlay remaining top-level keys (excluding nested ones already handled)
  const handledKeys = new Set(['Contact Information', 'Updated Information', 'details']);
  for (const key of Object.keys(updateData)) {
    if (!handledKeys.has(key)) {
      merged[key] = updateData[key];
    }
  }

  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// Atomic status transition — prevents sweep from re-queuing active records
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Atomically claim a PendingLoad record for processing.
 * Returns the document if successfully claimed, null if already processing/completed/failed.
 */
async function claimForProcessing(PendingLoad, pendingLoadId) {
  return PendingLoad.findOneAndUpdate(
    {
      _id: pendingLoadId,
      status: { $in: ['pending', 'queued_failed'] },
    },
    {
      $set: {
        status: 'processing',
        processingStartedAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { new: true }
  );
}

/**
 * Mark a PendingLoad record as completed.
 * Archives instead of deleting for audit trail.
 * Old completed records are cleaned up by sweep (after 24 hours).
 */
async function markCompleted(PendingLoad, pendingLoadId) {
  await PendingLoad.findByIdAndUpdate(pendingLoadId, {
    $set: {
      status: 'completed',
      completedAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

/**
 * Mark a PendingLoad record as permanently failed.
 */
async function markFailed(PendingLoad, pendingLoadId, reason) {
  try {
    await PendingLoad.findByIdAndUpdate(pendingLoadId, {
      $set: {
        status: 'failed',
        failureReason: String(reason).slice(0, 2000),
        failedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    console.error(`[PendingLoad] Failed to mark ${pendingLoadId} as failed:`, err.message);
  }
}

/**
 * Re-schedule a PendingLoad record back to 'pending' with a future scheduledAt.
 * Used when update/delete can't find entity yet (waiting for 'new' to complete).
 */
async function rescheduleForLater(PendingLoad, pendingLoadId, delayMs) {
  await PendingLoad.findByIdAndUpdate(pendingLoadId, {
    $set: {
      status: 'pending',
      scheduledAt: new Date(Date.now() + delayMs),
      processingStartedAt: null,
      updatedAt: new Date(),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main processing function
// ─────────────────────────────────────────────────────────────────────────────

async function processPendingLoad(jobData) {
  const {
    pendingLoadId,
    tenantId,
    companyId,
    userId,
    type,
    action,
  } = jobData;

  let normalizedTenantId = tenantId;
  if (normalizedTenantId && normalizedTenantId.startsWith('tenant_')) {
    normalizedTenantId = normalizedTenantId.replace('tenant_', '');
  }

  const tenantDB = await getTenantDB(normalizedTenantId);
  const PendingLoad = tenantDB.models.PendingLoad || tenantDB.model('PendingLoad', PendingLoadSchema);
  const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
  const Deal = tenantDB.models.Deal || tenantDB.model('Deal', DealSchema);

  const normalizedCompanyId = companyId ? companyId.toString() : companyId;

  // ── Atomically claim the record for processing ──
  const pendingLoadDoc = await claimForProcessing(PendingLoad, pendingLoadId);

  if (!pendingLoadDoc) {
    // Record doesn't exist, already processing, completed, or failed — skip silently
    // Check if entity already exists (may have been processed by a duplicate message)
    if (type === 'contacts' && jobData.contactData) {
      const sfId = jobData.contactData['Contact Information']?.SF_id ||
                   jobData.contactData.SF_id ||
                   jobData.contactData.sf_id;
      if (sfId) {
        const existing = await findContactBySFId(Contact, sfId.toString().trim(), normalizedCompanyId);
        if (existing) return; // Already processed
      }
    } else if (type === 'deals' && jobData.dealData) {
      const dealId = jobData.dealData.Id || jobData.dealData.id || jobData.dealData.deal_id;
      if (dealId) {
        const existing = await findDealById(Deal, dealId.toString().trim(), normalizedCompanyId);
        if (existing) return;
      }
    }
    return;
  }

  // Check if scheduled time has passed
  const now = new Date();
  const scheduledAt = pendingLoadDoc.scheduledAt || new Date(pendingLoadDoc.createdAt.getTime() + 60000);

  if (scheduledAt && scheduledAt > now) {
    // Not ready yet — restore to pending with the original scheduledAt preserved
    await PendingLoad.findByIdAndUpdate(pendingLoadId, {
      $set: { status: 'pending', processingStartedAt: null, scheduledAt: scheduledAt, updatedAt: new Date() },
    });

    const delayMs = scheduledAt.getTime() - now.getTime();
    const requeueDelay = Math.min(Math.max(delayMs, 1000), 600000);
    const error = new Error(`SCHEDULED_NOT_READY:${requeueDelay}`);
    error.retryable = true;
    error.scheduledNotReady = true;
    error.delayMs = requeueDelay;
    throw error;
  }

  // Get data from the claimed document
  const data = pendingLoadDoc.data || {};
  const contactData = data.contactData;
  const dealData = data.dealData;
  if (contactData && typeof contactData === 'object') deepTrimStrings(contactData);
  if (dealData && typeof dealData === 'object') deepTrimStrings(dealData);

  // Resolve action from the document's top-level field or from data
  const resolvedAction = pendingLoadDoc.action || data.action || action;

  try {
    if (type === 'contacts') {
      await processContact(resolvedAction, contactData, pendingLoadId, normalizedCompanyId, PendingLoad, Contact, tenantDB);
    } else if (type === 'deals') {
      await processDeal(resolvedAction, dealData, pendingLoadId, normalizedCompanyId, PendingLoad, Deal, tenantDB);
    } else {
      throw new PermanentError(`Unsupported type: ${type}`);
    }
  } catch (error) {
    if (error instanceof DependencyNotReadyError) {
      // Entity not found yet — reschedule and requeue so it tries again after delay
      await rescheduleForLater(PendingLoad, pendingLoadId, error.delayMs);

      const requeueError = new Error(`SCHEDULED_NOT_READY:${error.delayMs}`);
      requeueError.retryable = true;
      requeueError.scheduledNotReady = true;
      throw requeueError;
    }

    if (error instanceof PermanentError) {
      await markFailed(PendingLoad, pendingLoadId, error.message);
      // Set retryable=false so RabbitMQ acks (doesn't retry)
      error.retryable = false;
      throw error;
    }

    // Transient error (DB timeout, network glitch) — put back to pending so retry works
    await PendingLoad.findByIdAndUpdate(pendingLoadId, {
      $set: { status: 'pending', processingStartedAt: null, updatedAt: new Date() },
    });
    // DON'T set retryable=false — let RabbitMQ retry
    throw error;
  }
}

// Custom error classes for flow control
class PermanentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermanentError';
    this.retryable = false;
  }
}

class DependencyNotReadyError extends Error {
  constructor(message, delayMs = DEPENDENT_ACTION_REQUEUE_DELAY) {
    super(message);
    this.name = 'DependencyNotReadyError';
    this.delayMs = delayMs;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Contact processing
// ─────────────────────────────────────────────────────────────────────────────

async function processContact(action, contactData, pendingLoadId, normalizedCompanyId, PendingLoad, Contact, tenantDB) {
  const sfId = contactData['Contact Information']?.SF_id ||
               contactData.SF_id ||
               contactData.sf_id;

  if (!sfId) {
    throw new PermanentError('SF_id is required');
  }

  const normalizedSfId = sfId.toString().trim();

  if (action === 'delete') {
    await processContactDelete(normalizedSfId, pendingLoadId, normalizedCompanyId, PendingLoad, Contact);
  } else if (action === 'new') {
    await processContactNew(normalizedSfId, contactData, pendingLoadId, normalizedCompanyId, PendingLoad, Contact, tenantDB);
  } else if (action === 'update') {
    await processContactUpdate(normalizedSfId, contactData, pendingLoadId, normalizedCompanyId, PendingLoad, Contact, tenantDB);
  } else {
    throw new PermanentError(`Unsupported contact action: ${action}`);
  }
}

async function processContactDelete(normalizedSfId, pendingLoadId, normalizedCompanyId, PendingLoad, Contact) {
  const deletedContact = await Contact.findOneAndDelete({
    $or: [
      { companyId: normalizedCompanyId, SF_id: normalizedSfId },
      ...(mongoose.Types.ObjectId.isValid(normalizedCompanyId)
        ? [{ companyId: new mongoose.Types.ObjectId(normalizedCompanyId), SF_id: normalizedSfId }]
        : []),
    ],
  });

  // If not found by companyId, try bare SF_id (contacts without companyId)
  if (!deletedContact) {
    const bareDelete = await Contact.findOneAndDelete({
      SF_id: normalizedSfId,
      $or: [{ companyId: { $exists: false } }, { companyId: null }, { companyId: '' }],
    });

    if (!bareDelete) {
      // Contact doesn't exist — check if there's a pending 'new' action to coalesce with
      const pendingNew = await PendingLoad.findOne({
        status: { $in: ['pending', 'processing'] },
        type: 'contacts',
        action: 'new',
        ...buildSfIdCoalesceQuery(normalizedSfId),
      });

      if (pendingNew) {
        await PendingLoad.deleteMany({ _id: { $in: [pendingLoadId, pendingNew._id] } });
        console.log(`🧹 Coalesced: cancelled pending new+delete for SF_id: ${normalizedSfId}`);
        return;
      }
    }
  }

  await markCompleted(PendingLoad, pendingLoadId);
  if (deletedContact) {
    console.log(`✅ Deleted contact: ${deletedContact._id} (SF_id: ${normalizedSfId})`);
  }
}

async function processContactNew(normalizedSfId, contactData, pendingLoadId, normalizedCompanyId, PendingLoad, Contact, tenantDB) {
  // Coalesce: remove redundant pending update/delete actions for same SF_id
  await PendingLoad.deleteMany({
    _id: { $ne: pendingLoadId },
    status: 'pending',
    type: 'contacts',
    action: { $in: ['update', 'delete'] },
    ...buildSfIdCoalesceQuery(normalizedSfId),
  });

  const transformedContact = transformContactData(contactData, normalizedCompanyId);

  // Check for duplicates by SF_id
  let existingContact = await findContactBySFId(Contact, normalizedSfId, normalizedCompanyId);

  // If not found by SF_id, check by phone or email (but only with companyId scope)
  if (!existingContact && (transformedContact.phone || transformedContact.email)) {
    const orConditions = [];
    if (transformedContact.phone) {
      const ph = transformedContact.phone;
      const phWithout = ph.replace(/^\+/, '');
      orConditions.push(
        { phone: { $in: [ph, phWithout] }, companyId: normalizedCompanyId },
        { 'identifiers.whatsapp': { $in: [ph, phWithout] }, companyId: normalizedCompanyId },
      );
    }
    if (transformedContact.email) {
      const emailLower = transformedContact.email.toLowerCase().trim();
      orConditions.push(
        { email: emailLower, companyId: normalizedCompanyId },
        { 'identifiers.email': emailLower, companyId: normalizedCompanyId },
      );
    }
    if (orConditions.length > 0) {
      existingContact = await Contact.findOne({ $or: orConditions }).lean();
    }
  }

  if (existingContact) {
    // Merge missing fields into existing contact
    const $set = {};
    if (!existingContact.name && transformedContact.name) $set.name = transformedContact.name;
    if (!existingContact.firstName && transformedContact.firstName) $set.firstName = transformedContact.firstName;
    if (!existingContact.lastName && transformedContact.lastName) $set.lastName = transformedContact.lastName;
    if (!existingContact.displayName && transformedContact.displayName) $set.displayName = transformedContact.displayName;
    if (!existingContact.email && transformedContact.email) {
      $set.email = transformedContact.email;
      $set['identifiers.email'] = transformedContact.email;
    }
    if (!existingContact.phone && transformedContact.phone) {
      $set.phone = transformedContact.phone;
      $set['identifiers.whatsapp'] = transformedContact.phone;
      $set['identifiers.sms'] = transformedContact.phone;
    }
    if (!existingContact.SF_id && transformedContact.SF_id) $set.SF_id = transformedContact.SF_id;
    if (!existingContact.Contact_Type && transformedContact.Contact_Type) $set.Contact_Type = transformedContact.Contact_Type;
    if (existingContact.Is_Active === undefined && transformedContact.Is_Active !== undefined) $set.Is_Active = transformedContact.Is_Active;

    if (transformedContact.identifiers) {
      for (const [key, val] of Object.entries(transformedContact.identifiers)) {
        if (val && !existingContact.identifiers?.[key]) {
          $set[`identifiers.${key}`] = val;
        }
      }
    }

    if (transformedContact.details && typeof transformedContact.details === 'object') {
      const existingDetails = existingContact.details && typeof existingContact.details === 'object' ? existingContact.details : {};
      for (const [key, val] of Object.entries(transformedContact.details)) {
        if (val !== undefined && val !== null && val !== '' && !(key in existingDetails)) {
          $set[`details.${key}`] = val;
        }
      }
    }

    if (Object.keys($set).length > 0) {
      $set.updatedAt = new Date();
      await Contact.findByIdAndUpdate(existingContact._id, { $set });
      console.log(`✅ Merged ${Object.keys($set).length} fields into existing contact (SF_id: ${normalizedSfId})`);
    }

    await markCompleted(PendingLoad, pendingLoadId);
    return;
  }

  // Create new contact
  const newContact = await Contact.create(transformedContact);
  await markCompleted(PendingLoad, pendingLoadId);

  // Generate WebChat link (async, non-blocking)
  generateWebChatLink(newContact._id, tenantDB, normalizedCompanyId).catch(() => {});
}

async function processContactUpdate(normalizedSfId, contactData, pendingLoadId, normalizedCompanyId, PendingLoad, Contact, tenantDB) {
  // Coalesce: check if there's a pending 'new' action for this SF_id
  const pendingNew = await PendingLoad.findOne({
    status: { $in: ['pending', 'processing'] },
    type: 'contacts',
    action: 'new',
    ...buildSfIdCoalesceQuery(normalizedSfId),
  });

  if (pendingNew && pendingNew.status === 'pending') {
    // Merge update data into the pending 'new' action using deep merge
    const mergedContactData = deepMergeContactData(pendingNew.data.contactData, contactData);
    pendingNew.data.contactData = mergedContactData;
    pendingNew.markModified('data');
    await pendingNew.save();
    console.log(`🔄 Merged update into pending 'new' for SF_id: ${normalizedSfId}`);
    await markCompleted(PendingLoad, pendingLoadId);
    return;
  }

  if (pendingNew && pendingNew.status === 'processing') {
    // The 'new' action is currently being processed — wait for it to finish
    throw new DependencyNotReadyError(
      `Waiting for 'new' action to complete for SF_id: ${normalizedSfId}`,
      DEPENDENT_ACTION_REQUEUE_DELAY
    );
  }

  // Look up the contact
  let existingContact = await findContactBySFId(Contact, normalizedSfId, normalizedCompanyId);

  if (!existingContact) {
    // Check if there's a 'new' action that was just created while we searched
    const newActionExists = await PendingLoad.exists({
      _id: { $ne: pendingLoadId },
      status: { $in: ['pending', 'processing'] },
      type: 'contacts',
      action: 'new',
      ...buildSfIdCoalesceQuery(normalizedSfId),
    });

    if (newActionExists) {
      throw new DependencyNotReadyError(
        `Waiting for 'new' action to complete for SF_id: ${normalizedSfId}`,
        DEPENDENT_ACTION_REQUEUE_DELAY
      );
    }

    // No pending 'new' and contact doesn't exist — permanent failure
    throw new PermanentError(`Contact with SF_id "${normalizedSfId}" not found for update`);
  }

  // Transform contact data for update
  const transformedContact = transformContactData(contactData, normalizedCompanyId);

  const updateFields = {};

  if (!existingContact.companyId) {
    updateFields.companyId = normalizedCompanyId;
  }

  const _ci = contactData['Contact Information'] || {};
  const _ui = contactData['Updated Information'] || {};
  const _dt = contactData.details || {};
  const _allSrc = [_ci, _ui, _dt, contactData];

  const hasExplicitFirstName = _allSrc.some(src => getValueByKeyVariations(src, FIRST_NAME_KEYS));
  const hasExplicitLastName = _allSrc.some(src => getValueByKeyVariations(src, LAST_NAME_KEYS));
  const hasExplicitFullName = _allSrc.some(src => getValueByKeyVariations(src, FULL_NAME_KEYS));

  if (hasExplicitFirstName && transformedContact.firstName) updateFields.firstName = transformedContact.firstName;
  if (hasExplicitLastName && transformedContact.lastName) updateFields.lastName = transformedContact.lastName;

  if (hasExplicitFullName && transformedContact.name) {
    updateFields.name = transformedContact.name;
  } else if (hasExplicitFirstName || hasExplicitLastName) {
    const finalFirstName = hasExplicitFirstName ? (transformedContact.firstName || '') : (existingContact.firstName || '');
    const finalLastName = hasExplicitLastName ? (transformedContact.lastName || '') : (existingContact.lastName || '');
    const mergedName = [finalFirstName, finalLastName].filter(Boolean).join(' ').trim();
    if (mergedName) updateFields.name = mergedName;
  }

  if (updateFields.name) {
    updateFields.displayName = updateFields.name;
  }

  if (transformedContact.phone) updateFields.phone = transformedContact.phone;
  if (transformedContact.email) updateFields.email = transformedContact.email;
  if (transformedContact.Is_Active !== undefined) updateFields.Is_Active = transformedContact.Is_Active;
  if (transformedContact.Contact_Type !== undefined) updateFields.Contact_Type = transformedContact.Contact_Type;

  if (transformedContact.identifiers && Object.keys(transformedContact.identifiers).length > 0) {
    updateFields.identifiers = {
      ...(existingContact.identifiers || {}),
      ...transformedContact.identifiers,
    };
  }

  if (transformedContact.details && Object.keys(transformedContact.details).length > 0) {
    updateFields.details = {
      ...(existingContact.details || {}),
      ...transformedContact.details,
    };
  }

  updateFields.updatedAt = new Date();

  const updatedContact = await Contact.findByIdAndUpdate(
    existingContact._id,
    { $set: updateFields },
    { new: true, runValidators: true }
  );

  await markCompleted(PendingLoad, pendingLoadId);

  if (!updatedContact.webchatLink) {
    generateWebChatLink(updatedContact._id, tenantDB, normalizedCompanyId).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deal processing
// ─────────────────────────────────────────────────────────────────────────────

async function processDeal(action, dealData, pendingLoadId, normalizedCompanyId, PendingLoad, Deal, tenantDB) {
  const dealId = dealData?.Id || dealData?.id || dealData?.deal_id;
  if (!dealId) {
    throw new PermanentError('Id is required');
  }

  const normalizedDealId = dealId.toString().trim();

  if (action === 'delete') {
    await processDealDelete(normalizedDealId, pendingLoadId, normalizedCompanyId, PendingLoad, Deal);
  } else if (action === 'new') {
    await processDealNew(normalizedDealId, dealData, pendingLoadId, normalizedCompanyId, PendingLoad, Deal, tenantDB);
  } else if (action === 'update') {
    await processDealUpdate(normalizedDealId, dealData, pendingLoadId, normalizedCompanyId, PendingLoad, Deal, tenantDB);
  } else {
    throw new PermanentError(`Unsupported deal action: ${action}`);
  }
}

async function processDealDelete(normalizedDealId, pendingLoadId, normalizedCompanyId, PendingLoad, Deal) {
  const deletedDeal = await Deal.findOneAndDelete({
    $or: [
      { companyId: normalizedCompanyId, deal_id: normalizedDealId },
      ...(mongoose.Types.ObjectId.isValid(normalizedCompanyId)
        ? [{ companyId: new mongoose.Types.ObjectId(normalizedCompanyId), deal_id: normalizedDealId }]
        : []),
    ],
  });

  if (!deletedDeal) {
    // Try bare deal_id
    const bareDelete = await Deal.findOneAndDelete({
      deal_id: normalizedDealId,
      $or: [{ companyId: { $exists: false } }, { companyId: null }, { companyId: '' }],
    });

    if (!bareDelete) {
      const pendingNew = await PendingLoad.findOne({
        status: { $in: ['pending', 'processing'] },
        type: 'deals',
        action: 'new',
        'data.dealData.Id': normalizedDealId,
      });

      if (pendingNew) {
        await PendingLoad.deleteMany({ _id: { $in: [pendingLoadId, pendingNew._id] } });
        console.log(`🧹 Coalesced: cancelled pending new+delete for deal_id: ${normalizedDealId}`);
        return;
      }
    }
  }

  await markCompleted(PendingLoad, pendingLoadId);
  if (deletedDeal) {
    console.log(`✅ Deleted deal: ${deletedDeal._id} (deal_id: ${normalizedDealId})`);
  }
}

async function processDealNew(normalizedDealId, dealData, pendingLoadId, normalizedCompanyId, PendingLoad, Deal, tenantDB) {
  // Coalesce: remove redundant pending update/delete for same deal_id
  await PendingLoad.deleteMany({
    _id: { $ne: pendingLoadId },
    status: 'pending',
    type: 'deals',
    action: { $in: ['update', 'delete'] },
    'data.dealData.Id': normalizedDealId,
  });

  const existingDeal = await findDealById(Deal, normalizedDealId, normalizedCompanyId);

  if (existingDeal) {
    // Deal already exists — merge missing fields (instead of silently skipping)
    const transformedDeal = transformDealData(dealData, normalizedCompanyId);
    if (!isDealUpdateNoOp(existingDeal, transformedDeal)) {
      const updateFields = {};
      if (!existingDeal.companyId) updateFields.companyId = normalizedCompanyId;
      if (transformedDeal.name && !existingDeal.name) updateFields.name = transformedDeal.name;
      if (transformedDeal.stage && !existingDeal.stage) updateFields.stage = transformedDeal.stage;
      if (transformedDeal.status && !existingDeal.status) updateFields.status = transformedDeal.status;

      if (transformedDeal.details) {
        const existingDetails = existingDeal.details || {};
        const mergedDetails = { ...existingDetails };
        for (const [key, val] of Object.entries(transformedDeal.details)) {
          if (val !== undefined && val !== null && val !== '' && !(key in existingDetails)) {
            mergedDetails[key] = val;
          }
        }
        if (Object.keys(mergedDetails).length > Object.keys(existingDetails).length) {
          updateFields.details = mergedDetails;
        }
      }

      if (Object.keys(updateFields).length > 0) {
        updateFields.updatedAt = new Date();
        await Deal.findByIdAndUpdate(existingDeal._id, { $set: updateFields });
        console.log(`✅ Merged missing fields into existing deal (deal_id: ${normalizedDealId})`);
      }
    }

    await markCompleted(PendingLoad, pendingLoadId);
    return;
  }

  const transformedDeal = transformDealData(dealData, normalizedCompanyId);
  const newDeal = await Deal.create(transformedDeal);
  await markCompleted(PendingLoad, pendingLoadId);

  const newDealObj = newDeal.toObject ? newDeal.toObject() : newDeal;
  await notifyMobileAppIfB2ADeal(newDealObj, normalizedCompanyId, tenantDB);
}

async function processDealUpdate(normalizedDealId, dealData, pendingLoadId, normalizedCompanyId, PendingLoad, Deal, tenantDB) {
  // Coalesce: check for pending 'new' action
  const pendingNew = await PendingLoad.findOne({
    status: { $in: ['pending', 'processing'] },
    type: 'deals',
    action: 'new',
    'data.dealData.Id': normalizedDealId,
  });

  if (pendingNew && pendingNew.status === 'pending') {
    const mergedDealData = { ...pendingNew.data.dealData, ...dealData };
    pendingNew.data.dealData = mergedDealData;
    pendingNew.markModified('data');
    await pendingNew.save();
    console.log(`🔄 Merged update into pending 'new' for deal_id: ${normalizedDealId}`);
    await markCompleted(PendingLoad, pendingLoadId);
    return;
  }

  if (pendingNew && pendingNew.status === 'processing') {
    throw new DependencyNotReadyError(
      `Waiting for 'new' action to complete for deal_id: ${normalizedDealId}`,
      DEPENDENT_ACTION_REQUEUE_DELAY
    );
  }

  let existingDeal = await findDealById(Deal, normalizedDealId, normalizedCompanyId);

  if (!existingDeal) {
    const newActionExists = await PendingLoad.exists({
      _id: { $ne: pendingLoadId },
      status: { $in: ['pending', 'processing'] },
      type: 'deals',
      action: 'new',
      'data.dealData.Id': normalizedDealId,
    });

    if (newActionExists) {
      throw new DependencyNotReadyError(
        `Waiting for 'new' action to complete for deal_id: ${normalizedDealId}`,
        DEPENDENT_ACTION_REQUEUE_DELAY
      );
    }

    throw new PermanentError(`Deal with Id "${normalizedDealId}" not found for update`);
  }

  const transformedDeal = transformDealData(dealData, normalizedCompanyId);

  if (isDealUpdateNoOp(existingDeal, transformedDeal)) {
    await markCompleted(PendingLoad, pendingLoadId);
    return;
  }

  const updateFields = {};
  if (!existingDeal.companyId) updateFields.companyId = normalizedCompanyId;
  if (transformedDeal.name) updateFields.name = transformedDeal.name;
  if (transformedDeal.stage) updateFields.stage = transformedDeal.stage;
  if (transformedDeal.status) updateFields.status = transformedDeal.status;

  if (transformedDeal.details) {
    updateFields.details = {
      ...(existingDeal.details || {}),
      ...transformedDeal.details,
    };
  }

  updateFields.updatedAt = new Date();

  await Deal.findByIdAndUpdate(
    existingDeal._id,
    { $set: updateFields },
    { new: true, runValidators: true }
  );

  await markCompleted(PendingLoad, pendingLoadId);

  const updatedDeal = await Deal.findById(existingDeal._id).lean();
  if (updatedDeal) {
    await notifyMobileAppIfB2ADeal(updatedDeal, normalizedCompanyId, tenantDB);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sweep — recovers truly stuck records
// ─────────────────────────────────────────────────────────────────────────────

async function sweepStuckPendingLoads() {
  try {
    const masterDB = await getMasterDB();
    const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
    const companies = await Company.find({ isActive: { $ne: false } }).select('_id tenantDatabaseName').lean();

    let totalRequeued = 0;

    for (const company of companies) {
      try {
        const companyId = company._id.toString();
        const tenantId = company.tenantDatabaseName
          ? company.tenantDatabaseName.replace('tenant_', '')
          : companyId;

        const tenantDB = await getTenantDB(tenantId);
        const PendingLoad = tenantDB.models.PendingLoad || tenantDB.model('PendingLoad', PendingLoadSchema);

        const now = new Date();
        const staleThreshold = new Date(now.getTime() - PROCESSING_STALE_THRESHOLD);

        // Find records that are:
        // 1. 'pending' and past scheduledAt (missed by worker)
        // 2. 'processing' but started too long ago (worker crashed)
        // Exclude records that have been re-queued too many times
        const stuckLoads = await PendingLoad.find({
          $or: [
            { status: 'pending', scheduledAt: { $lte: now } },
            { status: 'processing', processingStartedAt: { $lte: staleThreshold } },
            { status: 'queued_failed' }, // Also recover items that failed to queue
          ],
          sweepCount: { $lt: MAX_SWEEP_REQUEUE },
        }).limit(SWEEP_BATCH_LIMIT).lean();

        // Cleanup old completed records (older than 24 hours) to prevent DB bloat
        try {
          const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const cleaned = await PendingLoad.deleteMany({
            status: 'completed',
            completedAt: { $lte: oneDayAgo },
          });
          if (cleaned.deletedCount > 0) {
            console.log(`🧹 Cleaned ${cleaned.deletedCount} completed pending loads (>24h old)`);
          }
        } catch (cleanErr) {
          // Non-critical
        }

        for (const load of stuckLoads) {
          try {
            const resolvedAction = load.action || load.data?.action || 'unknown';
            const resolvedType = load.type || (load.data?.dealData ? 'deals' : load.data?.contactData ? 'contacts' : 'unknown');

            if (resolvedAction === 'unknown' || resolvedType === 'unknown') {
              // Can't recover — mark as failed
              await PendingLoad.findByIdAndUpdate(load._id, {
                $set: {
                  status: 'failed',
                  failureReason: 'Sweep: unable to determine action or type',
                  updatedAt: new Date(),
                },
              });
              continue;
            }

            // Atomically increment sweepCount and set back to pending
            await PendingLoad.findByIdAndUpdate(load._id, {
              $set: {
                status: 'pending',
                processingStartedAt: null,
                scheduledAt: new Date(now.getTime() + 5000), // Re-schedule 5s from now
                updatedAt: new Date(),
              },
              $inc: { sweepCount: 1 },
            });

            await publishToQueue(QUEUES.PENDING_LOAD, {
              pendingLoadId: load._id.toString(),
              tenantId: tenantId,
              companyId: load.companyId || companyId,
              userId: load.data?.userId || 'sweep_recovery',
              type: resolvedType,
              action: resolvedAction,
            });

            totalRequeued++;
          } catch (qErr) {
            console.warn(`⚠️ Sweep: Failed to re-queue pending load ${load._id}:`, qErr?.message);
          }
        }

        // Mark records that exceeded max sweep count as failed
        await PendingLoad.updateMany(
          {
            status: { $in: ['pending', 'processing'] },
            sweepCount: { $gte: MAX_SWEEP_REQUEUE },
          },
          {
            $set: {
              status: 'failed',
              failureReason: `Exceeded maximum sweep retries (${MAX_SWEEP_REQUEUE})`,
              updatedAt: new Date(),
            },
          }
        );
      } catch (tenantErr) {
        // Skip tenant if DB connection fails
      }
    }

    if (totalRequeued > 0) {
      console.log(`🔄 Sweep: Re-queued ${totalRequeued} stuck pending load(s)`);
    }
  } catch (error) {
    console.error('❌ Sweep error:', error?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export async function createPendingLoadWorker() {
  if (isPendingLoadWorkerInitialized && pendingLoadWorker) {
    return pendingLoadWorker;
  }

  try {
    pendingLoadWorker = await consumeFromQueue(
      QUEUE_NAME,
      async (jobData, msg) => {
        try {
          // Add timeout to prevent hung queries from starving the worker
          await Promise.race([
            processPendingLoad(jobData),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`Processing timeout after ${WORKER_PROCESSING_TIMEOUT / 1000}s`)), WORKER_PROCESSING_TIMEOUT)
            ),
          ]);
        } catch (error) {
          const isScheduledNotReady = error?.message?.startsWith?.('SCHEDULED_NOT_READY:');
          if (!isScheduledNotReady) {
            console.error(`❌ Error processing pending load ${jobData.pendingLoadId}:`, error.message);

            // Only mark as failed for permanent errors
            if (error.retryable === false && jobData?.pendingLoadId && jobData?.tenantId) {
              try {
                const normalizedTenantId = String(jobData.tenantId).replace(/^tenant_/, '');
                const tenantDB = await getTenantDB(normalizedTenantId);
                const PendingLoad = tenantDB.models.PendingLoad || tenantDB.model('PendingLoad', PendingLoadSchema);
                const reason = (error?.message || String(error)).slice(0, 2000);
                await PendingLoad.findByIdAndUpdate(jobData.pendingLoadId, {
                  $set: {
                    status: 'failed',
                    failureReason: reason,
                    updatedAt: new Date(),
                  },
                });
              } catch (markErr) {
                console.warn(`⚠️ Could not update PendingLoad ${jobData.pendingLoadId} to failed:`, markErr?.message);
              }
            }
            // For transient errors, DON'T mark as failed — let RabbitMQ retry
          }
          throw error;
        }
      },
      {
        maxRetries: 5,
        requeue: true,
        prefetch: 1,
      }
    );

    isPendingLoadWorkerInitialized = true;
    console.log(`✅ Pending load worker started for queue: ${QUEUE_NAME}`);

    // Start sweep interval
    if (!sweepInterval) {
      setTimeout(() => sweepStuckPendingLoads(), 10000);
      sweepInterval = setInterval(() => sweepStuckPendingLoads(), 120000);
      console.log('🔄 Pending load sweep started (every 2 minutes)');
    }

    return pendingLoadWorker;
  } catch (error) {
    console.error(`❌ Failed to create pending load worker:`, error);
    isPendingLoadWorkerInitialized = false;
    pendingLoadWorker = null;
    throw error;
  }
}

export async function stopPendingLoadWorker() {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }
  if (pendingLoadWorker) {
    await pendingLoadWorker.cancel();
    pendingLoadWorker = null;
    isPendingLoadWorkerInitialized = false;
    console.log('🛑 Pending load worker stopped');
  }
}
