// src/services/bot/SalesforceActionService.js
/**
 * AI-Driven Salesforce Update Service (Deal + Contact)
 *
 * Triggered after OWM outcome follow-up is sent. Extracts field update
 * instructions from the follow-up prompt, determines whether to update
 * a Deal or Contact in Salesforce, resolves field names via cached
 * Describe metadata + AI, and PATCHes the record.
 *
 * Supports: Deal__c and Contact objects.
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __sfDirname = dirname(fileURLToPath(import.meta.url));

// ─── Reuse existing Salesforce auth ─────────────────────────────────────────

const SALESFORCE_API_VERSION = process.env.SALESFORCE_API_VERSION || 'v52.0';

let _sfService = null;
async function getSFService() {
  if (!_sfService) {
    const mod = await import('../salesforce/SalesforceDealService.js');
    _sfService = mod.default || mod;
  }
  return _sfService;
}

async function getAccessToken(forceRefresh = false) {
  const sf = await getSFService();
  // If forceRefresh, clear the cached token in SalesforceDealService
  if (forceRefresh && sf._credentialsCache) {
    sf._credentialsCache = null;
  }
  const token = await sf.getAccessToken();
  if (!token) return null;
  // Read instance URL from SalesforceDealService's config (reads from .env.local file)
  const config = sf.getConfig ? sf.getConfig() : {};
  const instanceUrl = (config.baseUrl || process.env.SALESFORCE_INSTANCE_URL || '').replace(/\/$/, '');
  if (!instanceUrl) {
    console.error('[SF-Action] No Salesforce instance URL configured');
    return null;
  }
  return { token, instanceUrl };
}

// ─── Field Metadata Cache (Deal + Contact) ──────────────────────────────────

const _fieldCaches = { deal: null, contact: null }; // { fields, ts }
const FIELD_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Get field metadata for a Salesforce object.
 * Strategy: 1) In-memory cache, 2) Local JSON file, 3) Live Describe API.
 */
async function getObjectFields(objectType) {
  const cacheKey = objectType === 'Contact' ? 'contact' : 'deal';

  // 1. In-memory cache
  if (_fieldCaches[cacheKey] && Date.now() - _fieldCaches[cacheKey].ts < FIELD_CACHE_TTL) {
    return _fieldCaches[cacheKey].fields;
  }

  // 2. Local JSON file
  const fileName = cacheKey === 'contact' ? 'salesforce-contact-fields.json' : 'salesforce-deal-fields.json';
  try {
    const filePath = resolve(__sfDirname, fileName);
    const content = readFileSync(filePath, 'utf8');
    const fields = JSON.parse(content);
    if (fields?.length > 0) {
      _fieldCaches[cacheKey] = { fields, ts: Date.now() };
      console.log(`[SF-Action] Loaded ${fields.length} ${cacheKey} fields from local cache`);
      return fields;
    }
  } catch (_) {}

  // 3. Salesforce Describe API
  const auth = await getAccessToken();
  if (!auth) return null;

  const url = `${auth.instanceUrl}/services/data/${SALESFORCE_API_VERSION}/sobjects/${objectType}/describe`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${auth.token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const fields = (data.fields || []).map(f => ({
      name: f.name, label: f.label, type: f.type, updateable: f.updateable,
      picklistValues: f.picklistValues?.filter(p => p.active).map(p => p.value),
    }));
    _fieldCaches[cacheKey] = { fields, ts: Date.now() };
    return fields;
  } catch (err) {
    console.error(`[SF-Action] Describe API error for ${objectType}:`, err.message);
    return null;
  }
}

// ─── Salesforce PATCH (generic — works for any object) ──────────────────────

async function patchSalesforceRecord(objectType, recordId, payload) {
  if (!recordId || !payload || Object.keys(payload).length === 0) {
    return { success: false, error: 'recordId and non-empty payload required' };
  }

  const auth = await getAccessToken();
  if (!auth) return { success: false, error: 'Salesforce auth failed' };

  const url = `${auth.instanceUrl}/services/data/${SALESFORCE_API_VERSION}/sobjects/${objectType}/${recordId}`;

  try {
    let res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 401) {
      // Force refresh token on 401 — cached token expired
      const auth2 = await getAccessToken(true);
      if (!auth2) return { success: false, error: 'Re-auth failed' };
      res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth2.token}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
    }

    if (res.status === 204 || res.ok) {
      console.log(`[SF-Action] ✅ ${objectType} ${recordId} updated:`, Object.keys(payload).join(', '));
      return { success: true, statusCode: res.status };
    }

    const errorBody = await res.text().catch(() => '');
    // Parse SF error for specific field-level details
    let errorMessage = errorBody;
    try {
      const parsed = JSON.parse(errorBody);
      if (Array.isArray(parsed) && parsed[0]?.message) {
        errorMessage = parsed.map(e => `${e.message}${e.fields?.length ? ` (fields: ${e.fields.join(', ')})` : ''}`).join('; ');
      } else if (parsed?.message) {
        errorMessage = parsed.message;
      }
    } catch (_) {}
    console.error(`[SF-Action] PATCH ${objectType} failed ${res.status}:`, errorMessage);
    return { success: false, statusCode: res.status, error: errorMessage };
  } catch (err) {
    // Fix #9: Retry once on network/timeout errors
    if (err.name === 'AbortError' || err.name === 'TimeoutError' || err.message?.includes('fetch failed')) {
      console.warn(`[SF-Action] PATCH ${objectType} network error, retrying once...`);
      try {
        const retryAuth = await getAccessToken();
        if (retryAuth) {
          const retryRes = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${retryAuth.token}` },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(20000),
          });
          if (retryRes.status === 204 || retryRes.ok) {
            console.log(`[SF-Action] ✅ ${objectType} ${recordId} updated on retry`);
            return { success: true, statusCode: retryRes.status };
          }
        }
      } catch (retryErr) {
        console.error(`[SF-Action] PATCH ${objectType} retry also failed:`, retryErr.message);
      }
    }
    console.error(`[SF-Action] PATCH ${objectType} error:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── AI: Extract Field Updates + Target Object ──────────────────────────────

const fieldUpdateSchema = z.object({
  requiresUpdate: z.boolean().describe('True if the instruction mentions updating/setting/changing any Salesforce fields.'),
  targetObject: z.enum(['deal', 'contact', 'both']).describe('"deal" if updating deal fields, "contact" if updating contact fields, "both" if updating fields on both objects.'),
  updates: z.array(z.object({
    fieldDescription: z.string().describe('Human-readable field name, e.g., "status", "appointment date", "email", "first name"'),
    value: z.string().nullable().describe('The value to set. Null if it should be extracted from conversation.'),
    valueSource: z.enum(['explicit', 'from_conversation']).describe('"explicit" if value is in the prompt, "from_conversation" if from customer messages.'),
    object: z.enum(['deal', 'contact']).describe('Which Salesforce object this field belongs to.'),
  })).describe('List of fields to update.'),
});

async function extractFieldUpdates(followUpPrompt, conversationHistory, matchedOutcomeName, model) {
  try {
    const { object: result } = await generateObject({
      model,
      schema: fieldUpdateSchema,
      prompt: `Analyze this follow-up instruction and determine if it requires updating any Salesforce fields.

FOLLOW-UP INSTRUCTION:
${followUpPrompt}

MATCHED OUTCOME: "${matchedOutcomeName}"

RECENT CONVERSATION:
${conversationHistory.slice(-6).map(m => `${m.role === 'user' ? 'Customer' : 'Agent'}: ${m.content.substring(0, 200)}`).join('\n')}

Rules:
- Return requiresUpdate=true only if the instruction explicitly mentions updating, setting, or changing a Salesforce field
- Determine the target object: "deal" for deal/order fields (status, appointment, country, stage), "contact" for person fields (email, phone, name, address)
- If the instruction says "update contact" → targetObject="contact", "update deal" → targetObject="deal"
- If ambiguous, common fields: Status, Stage, Appointment, Country → deal; FirstName, LastName, Email, Phone → contact
- IMPORTANT: fieldDescription MUST be in English. If the instruction is in another language, translate the field name to English (e.g. "Krajina" → "Country", "Jméno" → "First Name"). Also include the original term in parentheses, e.g. "Country (Krajina)"
- Extract values from conversation if the instruction says to use what the customer mentioned
- For dates/times, format as ISO 8601
- If no update needed, return requiresUpdate=false`,
      temperature: 0.1,
      maxTokens: 500,
      abortSignal: AbortSignal.timeout(10000),
    });
    return result;
  } catch (err) {
    console.error('[SF-Action] Field extraction failed:', err.message);
    return { requiresUpdate: false, targetObject: 'deal', updates: [] };
  }
}

// ─── AI: Resolve Field Names ────────────────────────────────────────────────

const fieldResolutionSchema = z.object({
  mappings: z.array(z.object({
    humanName: z.string(),
    sfFieldName: z.string().describe('Exact Salesforce API field name'),
    confidence: z.number().min(0).max(1),
  })),
});

async function resolveFieldNames(humanFieldNames, sfFields, model) {
  if (!humanFieldNames.length || !sfFields?.length) return [];

  const fieldList = sfFields
    .filter(f => f.updateable)
    .map(f => {
      let line = `${f.label} (${f.name}, ${f.type})`;
      if (f.picklistValues?.length > 0 && f.picklistValues.length <= 20) {
        line += ` [values: ${f.picklistValues.join(', ')}]`;
      }
      return line;
    })
    .join('\n');

  try {
    const { object: result } = await generateObject({
      model,
      schema: fieldResolutionSchema,
      prompt: `Match each field name to the correct Salesforce API field name.

FIELD NAMES TO MATCH:
${humanFieldNames.map((n, i) => `${i + 1}. "${n}"`).join('\n')}

AVAILABLE SALESFORCE FIELDS:
${fieldList}

Rules:
- Match by meaning, not exact text. Field names may be in any language (e.g. "Krajina" = "Country" in Czech/Slovak)
- Also match if the human name appears as part of a Salesforce field label or API name (e.g. "Krajina" should match "Krajina (Krajina__c, string)")
- Use the API name (with __c suffix if custom), NOT the label
- Set confidence to 0 if no good match exists`,
      temperature: 0,
      maxTokens: 500,
      abortSignal: AbortSignal.timeout(10000),
    });
    return result.mappings.filter(m => m.confidence >= 0.7);
  } catch (err) {
    console.error('[SF-Action] Field resolution failed:', err.message);
    return [];
  }
}

// ─── Contact → Deal Matching ────────────────────────────────────────────────

function getContactSfId(contact) {
  return contact?.SF_id || contact?.sf_id || contact?.sfId ||
    contact?.details?.SF_id || contact?.details?.sf_id || contact?.details?.sfId || null;
}

function getContactType(contact) {
  return (contact?.Contact_Type || contact?.contact_type || contact?.contactType ||
    contact?.details?.Contact_Type || contact?.details?.contact_type || '').toLowerCase().trim();
}

async function findDealForContact(tenantDB, contact) {
  if (!contact) return null;
  const sfId = getContactSfId(contact);
  const contactType = getContactType(contact);
  if (!sfId) {
    console.warn('[SF-Action] Contact has no SF_id — cannot match deal');
    return null;
  }

  const DealSchema = (await import('../../models/schemas/Deal.js')).default;
  const Deal = tenantDB.models.Deal || tenantDB.model('Deal', DealSchema);

  const query = contactType === 'handyman'
    ? { $or: [{ 'details.Handyman': sfId }, { 'details.Handyman__c': sfId }] }
    : contactType === 'customer'
      ? { $or: [{ 'details.Customer': sfId }, { 'details.Customer__c': sfId }] }
      : { $or: [{ 'details.Handyman': sfId }, { 'details.Handyman__c': sfId }, { 'details.Customer': sfId }, { 'details.Customer__c': sfId }] };

  // Fix #5: Sort by most recently updated to pick the active/latest deal
  const deal = await Deal.findOne(query).sort({ updatedAt: -1, createdAt: -1 }).lean();
  if (!deal) console.warn(`[SF-Action] No deal found for SF_id=${sfId} (type=${contactType})`);
  else console.log(`[SF-Action] Deal found: ${deal.deal_id || deal._id} for ${contactType} SF_id=${sfId}`);
  return deal;
}

// ─── Format Value ───────────────────────────────────────────────────────────

function formatValueForSF(value, fieldType) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  switch (fieldType) {
    case 'datetime': case 'date': { const d = new Date(str); return !isNaN(d.getTime()) ? d.toISOString() : str; }
    case 'double': case 'currency': case 'percent': { const n = parseFloat(str); return isNaN(n) ? str : n; }
    case 'int': { const i = parseInt(str, 10); return isNaN(i) ? str : i; }
    case 'boolean': return str.toLowerCase() === 'true' || str === '1';
    case 'time': {
      const t = new Date(str);
      if (!isNaN(t.getTime())) {
        const pad = (n, len = 2) => String(n).padStart(len, '0');
        return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}.${pad(t.getUTCMilliseconds(), 3)}Z`;
      }
      return str;
    }
    default: return str;
  }
}

// ─── Build + Execute PATCH for a single object ──────────────────────────────

async function buildAndPatch({ objectType, sfObjectName, recordId, updates, model, tenantDB, localCollection, localIdField }) {
  // Get field metadata
  const sfFields = await getObjectFields(sfObjectName);
  if (!sfFields?.length) {
    console.error(`[SF-Action] No field metadata for ${sfObjectName}`);
    return { updated: false, reason: 'describe_failed' };
  }

  const updateableFields = sfFields.filter(f => f.updateable);
  console.log(`[SF-Action] Got ${updateableFields.length} updateable ${objectType} fields`);

  // Resolve field names — send all updateable fields so no field is missed
  const humanNames = updates.map(u => u.fieldDescription);
  console.log(`[SF-Action] Resolving ${objectType} fields: ${humanNames.join(', ')}`);
  const mappings = await resolveFieldNames(humanNames, updateableFields, model);
  console.log(`[SF-Action] Resolved: ${mappings.map(m => `"${m.humanName}" → ${m.sfFieldName} (${m.confidence})`).join(', ') || 'none'}`);

  if (!mappings.length) return { updated: false, reason: 'field_resolution_failed' };

  // Build payload with picklist validation
  const payload = {};
  const sfFieldMap = new Map(sfFields.map(f => [f.name, f]));

  for (const mapping of mappings) {
    const update = updates.find(u => u.fieldDescription.toLowerCase() === mapping.humanName.toLowerCase());
    if (!update) continue;
    const sfField = sfFieldMap.get(mapping.sfFieldName);
    if (!sfField || !sfField.updateable) {
      console.warn(`[SF-Action] Field ${mapping.sfFieldName} is not updateable — skipping`);
      continue;
    }

    let value = update.value;

    // Fix #4: Skip fields with null value (from_conversation that AI couldn't extract)
    if (value === null || value === undefined || value === '') {
      console.warn(`[SF-Action] Field ${mapping.sfFieldName}: no value provided — skipping`);
      continue;
    }

    // Fix #3: Picklist value validation
    if (sfField.type === 'picklist' && sfField.picklistValues?.length > 0) {
      const exactMatch = sfField.picklistValues.find(pv => pv.toLowerCase() === String(value).toLowerCase());
      if (exactMatch) {
        value = exactMatch; // Use exact casing from SF
      } else {
        // Try partial/fuzzy match
        const partialMatch = sfField.picklistValues.find(pv =>
          pv.toLowerCase().includes(String(value).toLowerCase()) ||
          String(value).toLowerCase().includes(pv.toLowerCase())
        );
        if (partialMatch) {
          console.log(`[SF-Action] Picklist fuzzy match: "${value}" → "${partialMatch}" for ${mapping.sfFieldName}`);
          value = partialMatch;
        } else {
          console.warn(`[SF-Action] Picklist value "${value}" not valid for ${mapping.sfFieldName}. Valid: ${sfField.picklistValues.join(', ')}. Skipping.`);
          continue; // Skip invalid picklist value — don't send to SF
        }
      }
    }

    // Fix #3: Multi-picklist validation
    if (sfField.type === 'multipicklist' && sfField.picklistValues?.length > 0) {
      const parts = String(value).split(';').map(v => v.trim()).filter(Boolean);
      const validParts = [];
      for (const part of parts) {
        const match = sfField.picklistValues.find(pv => pv.toLowerCase() === part.toLowerCase());
        if (match) validParts.push(match);
      }
      if (validParts.length === 0) {
        console.warn(`[SF-Action] No valid multi-picklist values for ${mapping.sfFieldName}. Skipping.`);
        continue;
      }
      value = validParts.join(';');
    }

    const formatted = formatValueForSF(value, sfField.type);
    if (formatted !== null && formatted !== undefined) {
      payload[mapping.sfFieldName] = formatted;
    }
  }

  if (!Object.keys(payload).length) return { updated: false, reason: 'no_valid_fields' };

  console.log(`[SF-Action] PATCH ${sfObjectName} ${recordId}:`, JSON.stringify(payload));

  // PATCH Salesforce
  const result = await patchSalesforceRecord(sfObjectName, recordId, payload);
  if (!result.success) return { updated: false, reason: 'patch_failed', error: result.error };

  // Update local MongoDB
  if (localCollection && localIdField) {
    try {
      const localUpdate = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(payload)) {
        localUpdate[`details.${k}`] = v;
        const noSuffix = k.replace(/__c$/, '');
        if (noSuffix !== k) localUpdate[`details.${noSuffix}`] = v;
        // Fix #11: For Contact, update all common top-level fields
        if (sfObjectName === 'Contact') {
          if (k === 'FirstName') localUpdate.firstName = v;
          if (k === 'LastName') localUpdate.lastName = v;
          if (k === 'Email') localUpdate.email = v;
          if (k === 'Phone') localUpdate.phone = v;
          // Update combined name when first/last name changes
          if (k === 'FirstName' || k === 'LastName') {
            const first = k === 'FirstName' ? v : (payload.FirstName || '');
            const last = k === 'LastName' ? v : (payload.LastName || '');
            const combined = `${first} ${last}`.trim();
            if (combined) {
              localUpdate.name = combined;
              localUpdate.displayName = combined;
            }
          }
        }
      }
      await localCollection.findByIdAndUpdate(localIdField, { $set: localUpdate });
      console.log(`[SF-Action] Local ${objectType} also updated`);
    } catch (e) {
      console.warn(`[SF-Action] Local ${objectType} update failed:`, e.message);
    }
  }

  return { updated: true, objectType, recordId, fieldsUpdated: Object.keys(payload), payload };
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * @param {Object} params
 * @param {Object} params.tenantDB
 * @param {string} params.tenantId
 * @param {string} params.conversationId
 * @param {Object|string} params.contact - Contact doc or ID
 * @param {string} params.followUpPrompt - The OWM follow-up instruction
 * @param {string} params.matchedOutcomeName
 * @param {Array}  params.conversationHistory
 * @param {Object} params.model - Vercel AI SDK model
 * @param {string} [params.matchRecordId] - OWMOutcomeMatch _id for saving results
 * @param {string} [params.automationId] - Automation ID for context
 */
export async function processFollowUpActions({
  tenantDB, tenantId, conversationId, contact,
  followUpPrompt, matchedOutcomeName, conversationHistory = [], model,
  matchRecordId = null, automationId = null,
}) {
  const sfUpdateRecords = []; // Track all SF update results for saving

  try {
    console.log(`[SF-Action] ═══ START ═══ conv=${conversationId} outcome="${matchedOutcomeName}"`);
    console.log(`[SF-Action] Prompt: "${followUpPrompt.substring(0, 200)}"`);

    // Step 1: Extract updates + determine target object
    const extraction = await extractFieldUpdates(followUpPrompt, conversationHistory, matchedOutcomeName, model);
    console.log(`[SF-Action] Extraction: requiresUpdate=${extraction.requiresUpdate}, target=${extraction.targetObject}, updates=${JSON.stringify(extraction.updates)}`);

    if (!extraction.requiresUpdate || !extraction.updates?.length) {
      console.log('[SF-Action] ═══ END: No updates needed ═══');
      return { updated: false, reason: 'no_updates_needed' };
    }

    // Step 2: Get contact document
    const ContactSchema = (await import('../../models/schemas/Contact.js')).default;
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    let contactDoc = contact;
    if (typeof contact === 'string' || (contact && !contact.SF_id && !contact.Contact_Type)) {
      const cid = typeof contact === 'string' ? contact : (contact._id || contact.toString?.() || contact);
      contactDoc = await Contact.findById(cid).lean();
    }
    if (!contactDoc) {
      console.warn('[SF-Action] ═══ END: Contact not found ═══');
      return { updated: false, reason: 'contact_not_found' };
    }

    const sfId = getContactSfId(contactDoc);
    console.log(`[SF-Action] Contact: name=${contactDoc.name}, SF_id=${sfId || 'NONE'}, type=${getContactType(contactDoc) || 'NONE'}`);

    // Fix #12: Deduplication — check if same update was done recently (last 30s)
    if (matchRecordId) {
      try {
        const OWMOutcomeMatchSchema = (await import('../../models/schemas/OWMOutcomeMatch.js')).default;
        const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);
        const recentMatch = await OWMOutcomeMatch.findById(matchRecordId).select('salesforceUpdates').lean();
        const recentSuccess = recentMatch?.salesforceUpdates?.find(
          u => u.status === 'success' && u.updatedAt && (Date.now() - new Date(u.updatedAt).getTime()) < 30000
        );
        if (recentSuccess) {
          console.log(`[SF-Action] ═══ END: Duplicate — SF was updated ${Math.round((Date.now() - new Date(recentSuccess.updatedAt).getTime()) / 1000)}s ago ═══`);
          return { updated: false, reason: 'duplicate_recent_update' };
        }
      } catch (_) {}
    }

    const results = [];

    // Step 3: Handle DEAL updates
    const dealUpdates = extraction.updates.filter(u => u.object === 'deal');
    if (dealUpdates.length > 0 && (extraction.targetObject === 'deal' || extraction.targetObject === 'both')) {
      console.log(`[SF-Action] Processing ${dealUpdates.length} deal update(s)...`);
      const deal = await findDealForContact(tenantDB, contactDoc);
      if (deal?.deal_id) {
        const DealSchema = (await import('../../models/schemas/Deal.js')).default;
        const Deal = tenantDB.models.Deal || tenantDB.model('Deal', DealSchema);
        const r = await buildAndPatch({
          objectType: 'deal', sfObjectName: 'Deal__c', recordId: deal.deal_id,
          updates: dealUpdates, model, tenantDB,
          localCollection: Deal, localIdField: deal._id,
        });
        results.push(r);
        sfUpdateRecords.push({
          object: 'Deal__c', recordId: deal.deal_id,
          status: r.updated ? 'success' : 'failed',
          fieldsUpdated: r.fieldsUpdated || [],
          payload: r.payload || {},
          error: r.error || null,
          reason: r.reason || null,
          updatedAt: new Date(),
        });
      } else {
        results.push({ updated: false, objectType: 'deal', reason: 'deal_not_found' });
        sfUpdateRecords.push({
          object: 'Deal__c', recordId: null, status: 'skipped',
          fieldsUpdated: [], payload: {}, error: null, reason: 'deal_not_found', updatedAt: new Date(),
        });
      }
    }

    // Step 4: Handle CONTACT updates
    const contactUpdates = extraction.updates.filter(u => u.object === 'contact');
    if (contactUpdates.length > 0 && (extraction.targetObject === 'contact' || extraction.targetObject === 'both')) {
      console.log(`[SF-Action] Processing ${contactUpdates.length} contact update(s)...`);
      if (sfId) {
        const r = await buildAndPatch({
          objectType: 'contact', sfObjectName: 'Contact', recordId: sfId,
          updates: contactUpdates, model, tenantDB,
          localCollection: Contact, localIdField: contactDoc._id,
        });
        results.push(r);
        sfUpdateRecords.push({
          object: 'Contact', recordId: sfId,
          status: r.updated ? 'success' : 'failed',
          fieldsUpdated: r.fieldsUpdated || [],
          payload: r.payload || {},
          error: r.error || null,
          reason: r.reason || null,
          updatedAt: new Date(),
        });
      } else {
        results.push({ updated: false, objectType: 'contact', reason: 'no_sf_id' });
        sfUpdateRecords.push({
          object: 'Contact', recordId: null, status: 'skipped',
          fieldsUpdated: [], payload: {}, error: null, reason: 'no_sf_id', updatedAt: new Date(),
        });
      }
    }

    const anyUpdated = results.some(r => r.updated);
    const allFields = results.filter(r => r.updated).flatMap(r => r.fieldsUpdated || []);

    // Step 5: Save SF update results on the OWMOutcomeMatch record
    if (matchRecordId && sfUpdateRecords.length > 0) {
      try {
        const OWMOutcomeMatchSchema = (await import('../../models/schemas/OWMOutcomeMatch.js')).default;
        const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);
        await OWMOutcomeMatch.findByIdAndUpdate(matchRecordId, {
          $push: { salesforceUpdates: { $each: sfUpdateRecords } },
          $set: { updatedAt: new Date() },
        });
        console.log(`[SF-Action] Saved ${sfUpdateRecords.length} SF result(s) on match record ${matchRecordId}`);
      } catch (saveErr) {
        console.warn('[SF-Action] Failed to save SF results on match record:', saveErr.message);
      }
    }

    // Step 6: Emit real-time socket event for toast notifications
    try {
      const SocketEmitter = (await import('../socket/SocketEmitter.js')).default;
      const eventData = {
        conversationId,
        automationId,
        outcomeName: matchedOutcomeName,
        updates: sfUpdateRecords.map(r => ({
          object: r.object,
          recordId: r.recordId,
          status: r.status,
          fields: r.fieldsUpdated,
          error: r.error,
        })),
        anyUpdated,
        timestamp: new Date().toISOString(),
      };

      // Emit to conversation room + tenant room
      await SocketEmitter.emit(`conversation:${conversationId}`, 'salesforce:update', eventData);
      if (tenantId) {
        await SocketEmitter.emit(`tenant:${tenantId}`, 'salesforce:update', eventData);
      }
      console.log(`[SF-Action] Socket event emitted: salesforce:update`);
    } catch (socketErr) {
      // Non-critical
      console.warn('[SF-Action] Socket emit failed:', socketErr.message);
    }

    console.log(`[SF-Action] ═══ END: ${anyUpdated ? '✅ Updated' : '⚠️ Not updated'} — ${allFields.join(', ') || 'no fields'} ═══`);

    return {
      updated: anyUpdated,
      results,
      fieldsUpdated: allFields,
      sfUpdateRecords,
    };
  } catch (error) {
    console.error('[SF-Action] ❌ Error:', error.message, error.stack?.substring(0, 300));

    // Save error on match record
    if (matchRecordId) {
      try {
        const OWMOutcomeMatchSchema = (await import('../../models/schemas/OWMOutcomeMatch.js')).default;
        const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);
        await OWMOutcomeMatch.findByIdAndUpdate(matchRecordId, {
          $push: { salesforceUpdates: { object: 'unknown', status: 'failed', error: error.message, reason: 'exception', updatedAt: new Date() } },
        });
      } catch (_) {}
    }

    return { updated: false, reason: 'error', error: error.message };
  }
}

/**
 * Retry a failed Salesforce update for a specific match record.
 * Called from the UI "Retry" button.
 */
export async function retrySalesforceUpdate({
  tenantDB, tenantId, matchRecordId, model,
}) {
  try {
    const OWMOutcomeMatchSchema = (await import('../../models/schemas/OWMOutcomeMatch.js')).default;
    const OWMOutcomeMatch = tenantDB.models.OWMOutcomeMatch || tenantDB.model('OWMOutcomeMatch', OWMOutcomeMatchSchema);
    const AIPromptSchema = (await import('../../models/schemas/AIPrompt.js')).default;
    const AIPrompt = tenantDB.models.AIPrompt || tenantDB.model('AIPrompt', AIPromptSchema);
    const MessageSchema = (await import('../../models/schemas/Message.js')).default;
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    const match = await OWMOutcomeMatch.findById(matchRecordId).lean();
    if (!match) return { success: false, error: 'Match record not found' };

    // Get follow-up prompt
    const prompt = await AIPrompt.findOne({
      moduleId: match.owmOutcomeId,
      moduleIdDescription: 'OWM_OUTCOME',
      isActive: true,
      tenantId,
    }).lean();

    if (!prompt?.prompt) return { success: false, error: 'Follow-up prompt not found' };

    // Get conversation history
    const msgs = await Message.find({
      conversation: match.conversationId,
      direction: { $in: ['inbound', 'outbound'] },
    }).sort({ createdAt: -1 }).limit(10).select('content direction').lean();
    msgs.reverse();
    const history = msgs.map(m => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: typeof m.content === 'string' ? m.content : (m.content?.text || '[media]'),
    }));

    // Remove old failed/skipped entries before retrying so we don't create duplicates
    await OWMOutcomeMatch.findByIdAndUpdate(matchRecordId, {
      $pull: { salesforceUpdates: { status: { $in: ['failed', 'skipped'] } } },
    });

    const result = await processFollowUpActions({
      tenantDB, tenantId,
      conversationId: match.conversationId.toString(),
      contact: match.contactId,
      followUpPrompt: prompt.prompt,
      matchedOutcomeName: match.outcomeName || 'Unknown',
      conversationHistory: history,
      model,
      matchRecordId,
      automationId: match.automationId?.toString(),
    });

    return { success: result.updated, result };
  } catch (error) {
    console.error('[SF-Action] Retry error:', error.message);
    return { success: false, error: error.message };
  }
}

export default { processFollowUpActions, retrySalesforceUpdate };
