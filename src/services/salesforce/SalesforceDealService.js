// src/services/salesforce/SalesforceDealService.js
/**
 * Syncs deal data with Salesforce Deal__c (B2A flow).
 * Uses exact Salesforce API field names (__c suffix). Token from OAuth password grant only.
 * PATCH: {instance_url}/services/data/v52.0/sobjects/Deal__c/{deal_id}
 *
 * Env: SALESFORCE_OAUTH_TOKEN_URL (full URL) or SALESFORCE_INSTANCE_URL;
 *      SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET, SALESFORCE_USERNAME, SALESFORCE_PASSWORD.
 */

import { SF, getDetail } from './salesforceDealFields.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SALESFORCE_API_VERSION = 'v52.0';
const DEAL_OBJECT = 'Deal__c';

/** In-memory cache: { access_token, expires_at, instance_url? } from OAuth response */
let tokenCache = null;
const TOKEN_BUFFER_SECONDS = 60;
const DEFAULT_EXPIRES_IN_SECONDS = 7200;

/** Cache for credentials read from .env.local file */
let _credentialsCache = null;

/**
 * Read Salesforce credentials directly from .env.local file.
 * Bypasses process.env to avoid PM2/Next.js build caching issues.
 * Falls back to process.env if file reading fails.
 */
function getSalesforceCredentials() {
  if (_credentialsCache) return _credentialsCache;

  let creds = {
    instanceUrl: '',
    clientId: '',
    clientSecret: '',
    username: '',
    password: '',
  };

  // Try reading .env.local file directly (bypasses all caching issues)
  const envPaths = [
    resolve(process.cwd(), '.env.local'),
    '/var/www/omni-mongo/.env.local',
  ];

  for (const envPath of envPaths) {
    try {
      const content = readFileSync(envPath, 'utf8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;

        const key = trimmed.substring(0, eqIdx).trim();
        // Read value — handle quoted values and # comments
        let val = trimmed.substring(eqIdx + 1).trim();
        // Remove surrounding quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        } else {
          // Unquoted: strip inline comments (but not if inside the value like %23)
          // Only strip # that's preceded by whitespace (real comment)
          const commentIdx = val.search(/\s+#/);
          if (commentIdx > 0) val = val.substring(0, commentIdx).trim();
        }

        switch (key) {
          case 'SALESFORCE_INSTANCE_URL': creds.instanceUrl = val; break;
          case 'SALESFORCE_CLIENT_ID': creds.clientId = val; break;
          case 'SALESFORCE_CLIENT_SECRET': creds.clientSecret = val; break;
          case 'SALESFORCE_USERNAME': creds.username = val; break;
          case 'SALESFORCE_PASSWORD': creds.password = val; break;
        }
      }

      if (creds.instanceUrl && creds.password) {
        // Decode URL-encoded password (%23 → #)
        creds.password = decodeURIComponent(creds.password);
        _credentialsCache = creds;
        console.log(`[SF-Auth] Credentials loaded from ${envPath} (password length: ${creds.password.length})`);
        return creds;
      }
    } catch (_) {
      // File not found, try next path
    }
  }

  // Fallback to process.env
  creds = {
    instanceUrl: (process.env.SALESFORCE_INSTANCE_URL || '').replace(/\/$/, ''),
    clientId: process.env.SALESFORCE_CLIENT_ID || '',
    clientSecret: process.env.SALESFORCE_CLIENT_SECRET || '',
    username: process.env.SALESFORCE_USERNAME || '',
    password: decodeURIComponent(process.env.SALESFORCE_PASSWORD || ''),
  };

  if (creds.instanceUrl && creds.password) {
    _credentialsCache = creds;
  }
  return creds;
}

/**
 * Get Salesforce access token via OAuth password grant.
 * Reads credentials directly from .env.local file to bypass caching issues.
 */
async function getAccessToken() {
  const now = Date.now();
  if (tokenCache && tokenCache.expires_at > now + TOKEN_BUFFER_SECONDS * 1000) {
    return tokenCache.access_token;
  }

  const creds = getSalesforceCredentials();

  if (!creds.instanceUrl || !creds.clientId || !creds.clientSecret || !creds.username || !creds.password) {
    console.error('❌ Salesforce OAuth: Missing credentials', {
      hasUrl: !!creds.instanceUrl,
      hasClientId: !!creds.clientId,
      hasSecret: !!creds.clientSecret,
      hasUser: !!creds.username,
      hasPass: !!creds.password,
    });
    return null;
  }

  const baseUrl = creds.instanceUrl.replace(/\/$/, '');
  const tokenUrl = `${baseUrl}/services/oauth2/token`;

  // Build query string with encodeURIComponent (matches original curl)
  const queryString = [
    'grant_type=password',
    `client_id=${encodeURIComponent(creds.clientId)}`,
    `client_secret=${encodeURIComponent(creds.clientSecret)}`,
    `username=${encodeURIComponent(creds.username)}`,
    `password=${encodeURIComponent(creds.password)}`,
  ].join('&');

  try {
    const res = await fetch(`${tokenUrl}?${queryString}`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('❌ Salesforce OAuth error:', res.status, data.error_description || data.error, { passwordLen: creds.password.length });
      // Clear credentials cache to force re-read from file on next attempt
      _credentialsCache = null;
      return null;
    }
    const access_token = data.access_token;
    const expires_in = Number(data.expires_in) || DEFAULT_EXPIRES_IN_SECONDS;
    const instance_url = data.instance_url ? String(data.instance_url).replace(/\/$/, '') : null;
    tokenCache = {
      access_token,
      expires_at: now + expires_in * 1000,
      instance_url: instance_url || undefined,
    };
    return access_token;
  } catch (err) {
    console.error('❌ Salesforce OAuth request error:', err);
    return null;
  }
}

/**
 * Get base URL for Salesforce API. Prefers instance_url from token response, then env, then default.
 */
function getConfig() {
  const fromCache = tokenCache?.instance_url?.replace?.(/\/$/, '');
  const creds = getSalesforceCredentials();
  const baseUrl = fromCache || creds.instanceUrl;
  return { baseUrl, token: null };
}

/**
 * PATCH a Deal__c record in Salesforce using exact __c field names.
 */
export async function patchDeal(dealId, payload) {
  if (!dealId || !payload || Object.keys(payload).length === 0) {
    return { success: false, error: 'dealId and non-empty payload required' };
  }

  const token = await getAccessToken();
  if (!token) {
    return { success: false, error: 'Salesforce access token not available' };
  }

  // After getAccessToken(), tokenCache may have instance_url from OAuth response; use it for API base
  const { baseUrl } = getConfig();
  if (!baseUrl) {
    return { success: false, error: 'Salesforce not configured (set SALESFORCE_INSTANCE_URL or use OAuth to get instance_url)' };
  }

  const url = `${baseUrl}/services/data/${SALESFORCE_API_VERSION}/sobjects/${DEAL_OBJECT}/${dealId}`;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return { success: true, statusCode: res.status };
    }
    const text = await res.text();
    console.error('❌ Salesforce PATCH failed:', res.status, text);
    return { success: false, statusCode: res.status, error: text };
  } catch (err) {
    console.error('❌ Salesforce PATCH error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Convert ISO datetime string or Date to Salesforce Time format (HH:mm:ss.SSSZ).
 * SF Time fields reject full ISO datetime; they expect time-of-day only.
 */
function toSalesforceTime(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : null;
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}Z`;
}

/**
 * Convert degrees to radians.
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Haversine distance between two GPS coordinates in meters.
 */
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Geocode a street address to { lat, lon } using OpenStreetMap Nominatim (free API).
 * Returns null on failure.
 */
async function geocodeAddress(address) {
  if (!address || typeof address !== 'string') return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'omni-mongo-server/1.0 (distance-calculation)',
      },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => []);
    if (!Array.isArray(data) || data.length === 0) return null;
    const first = data[0];
    const lat = parseFloat(first.lat);
    const lon = parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch (e) {
    console.warn('⚠️ Geocoding failed for address:', address, e);
    return null;
  }
}

/**
 * Build flat PATCH payload from deal.details using only Salesforce __c field names.
 * Values are taken via getDetail() so legacy (no __c) keys are still read.
 */
function buildPayload(details, fieldKeys) {
  if (!details || typeof details !== 'object') return {};
  const payload = {};
  for (const key of fieldKeys) {
    const value = getDetail(details, key);
    if (value === undefined || value === null) continue;
    if (typeof value === 'object' && value !== null && !(value instanceof Date)) continue;
    payload[key] = value instanceof Date ? value.toISOString() : value;
  }
  return payload;
}

/**
 * Sync schedule step: Appointment_DateTime__c, Planned_DateTime__c and visit-specific Planned_date_{n}__c / Visit_Number__c.
 * Status is local-only (not sent to SF).
 */
export async function syncSchedule(deal, visitNumber = 1) {
  const sfId = deal.deal_id;
  if (!sfId) return { success: false, error: 'deal_id required' };
  const details = deal.details || {};

  // Base appointment & planned datetime (legacy single-field behaviour)
  const payload = {
    [SF.Appointment_DateTime__c]: getDetail(details, SF.Appointment_DateTime__c) ?? null,
    [SF.Planned_DateTime__c]:
      getDetail(details, SF.Planned_DateTime__c) ??
      getDetail(details, SF.Appointment_DateTime__c) ??
      null,
  };

  // Visit-specific planned date fields: Planned_date_1__c ... Planned_date_5__c and Visit_Number__c
  const safeVisit = Number.isFinite(Number(visitNumber)) ? Math.max(1, Math.min(5, Number(visitNumber))) : 1;
  const plannedPerVisitKey = `Planned_date_${safeVisit}__c`;
  const visitNumberKey = 'Visit_Number__c';

  const plannedPerVisit = details[plannedPerVisitKey] ?? details.Planned_DateTime ?? details.Appointment_DateTime ?? null;

  if (plannedPerVisit != null) {
    payload[plannedPerVisitKey] = plannedPerVisit;
  }
  payload[visitNumberKey] = safeVisit;

  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  return patchDeal(sfId, payload);
}

/**
 * Sync start work: Job_Start_Time_{n}, GPS_Start_Latitude__c, GPS_Start_Longitude__c, GPS_Distance_From_Customer__c.
 * Status is local-only. SF Job_Start_Time_* is Time type; send time-only (HH:mm:ss.SSSZ).
 * Also calculates distance from customer's address (ContactStreetAddress / Customer_Address) using a free geocoding API
 * and always sends it in GPS_Distance_From_Customer__c when available.
 */
export async function syncStartWork(deal, visitNumber = 1) {
  const sfId = deal.deal_id;
  if (!sfId) return { success: false, error: 'deal_id required' };
  const details = deal.details || {};
  const jobStartKey = `Job_Start_Time_${visitNumber}__c`;
  const rawStart = getDetail(details, jobStartKey);

  // Base GPS fields from deal.details
  const startLat = getDetail(details, SF.GPS_Start_Latitude__c);
  const startLon = getDetail(details, SF.GPS_Start_Longitude__c);

  let distanceFromCustomer = null;
  try {
    // Prefer ContactStreetAddress (from Salesforce field ContactStreetAddress__c), fallback to legacy Customer_Address
    const address =
      getDetail(details, 'ContactStreetAddress__c') ||
      details.ContactStreetAddress ||
      details.Customer_Address;

    console.log('ℹ️ syncStartWork distance debug:', {
      dealId: sfId,
      address,
      startLat,
      startLon,
    });

    if (address && startLat != null && startLon != null) {
      const geo = await geocodeAddress(address);
      if (geo) {
        console.log('ℹ️ Geocoded customer address:', geo);
        const dist = haversineDistanceMeters(
          Number(startLat),
          Number(startLon),
          geo.lat,
          geo.lon
        );
        if (Number.isFinite(dist)) {
          distanceFromCustomer = dist;
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ Failed to compute GPS_Distance_From_Customer__c:', e);
  }

  // Fallback: if we couldn't compute distance now, but DB already has one, reuse it
  if (distanceFromCustomer == null) {
    const existing = getDetail(details, SF.GPS_Distance_From_Customer__c);
    if (existing != null && Number.isFinite(Number(existing))) {
      distanceFromCustomer = Number(existing);
      console.log('ℹ️ Using existing GPS_Distance_From_Customer from DB:', existing);
    }
  }

  const payload = {
    [jobStartKey]: toSalesforceTime(rawStart) ?? (rawStart != null ? rawStart : null),
    [SF.GPS_Start_Latitude__c]: startLat ?? null,
    [SF.GPS_Start_Longitude__c]: startLon ?? null,
  };

  if (distanceFromCustomer != null) {
    payload[SF.GPS_Distance_From_Customer__c] = distanceFromCustomer;
  }

  console.log('ℹ️ syncStartWork PATCH payload:', {
    dealId: sfId,
    visitNumber,
    payload: {
      [jobStartKey]: payload[jobStartKey],
      GPS_Start_Latitude__c: payload[SF.GPS_Start_Latitude__c],
      GPS_Start_Longitude__c: payload[SF.GPS_Start_Longitude__c],
      GPS_Distance_From_Customer__c: payload[SF.GPS_Distance_From_Customer__c],
    },
  });

  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  return patchDeal(sfId, payload);
}

/**
 * Sync diagnostic form: materials, X1_* fields, Pocet_km_na_1_navstevu__c, Dovod_dalsej_navstevy__c, repair/protocol fields.
 */
export async function syncDiagnostic(deal, visitNumber = 1) {
  const sfId = deal.deal_id;
  if (!sfId) return { success: false, error: 'deal_id required' };
  const details = deal.details || {};
  const diag = details[`Diagnostic_${visitNumber}`];

  const payload = {
    [SF.Popis_a_cena_materialu_z_HM_APP__c]: getDetail(details, SF.Popis_a_cena_materialu_z_HM_APP__c) ?? '',
    [SF.X1_Cena_za_drobny_material_hm__c]: getDetail(details, SF.X1_Cena_za_drobny_material_hm__c) ?? 0,
    [SF.X1_Cena_za_nahradne_diely_a_material_hm__c]:
      getDetail(details, SF.X1_Cena_za_nahradne_diely_a_material_hm__c) ?? 0,
    // Visits and work time: use helper POMOCNY_* fields, fall back to X1_* if needed
    [SF.POMOCNY_POCET_VYJAZDOV__c]:
      diag?.estimatedVisits ??
      getDetail(details, SF.POMOCNY_POCET_VYJAZDOV__c) ??
      getDetail(details, SF.X1_Pocet_vyjazdov_hm__c) ??
      1,
    [SF.POMOCNY_POCET_HODIN_PRACE__c]:
      diag?.estimatedWorkTime ??
      getDetail(details, SF.POMOCNY_POCET_HODIN_PRACE__c) ??
      getDetail(details, SF.X1_Pocet_hodin_prace_hm__c) ??
      null,
    [SF.X1_Pocet_vyjazdov_hm__c]: getDetail(details, SF.X1_Pocet_vyjazdov_hm__c) ?? null,
    [SF.X1_Pocet_hodin_prace_hm__c]: getDetail(details, SF.X1_Pocet_hodin_prace_hm__c) ?? null,
    [SF.Pocet_km_na_1_navstevu__c]:
      getDetail(details, SF.Pocet_km_na_1_navstevu__c) ??
      getDetail(details, SF.Po_et_km_na_1_vyjazde_spolu_oba_smery__c) ??
      0,
    [SF.Dovod_dalsej_navstevy__c]: getDetail(details, SF.Dovod_dalsej_navstevy__c) ?? null,
    [SF.X1_Pocet_hodin_nakupu_materialu_hm__c]:
      diag?.materialPurchaseHours ??
      getDetail(details, SF.X1_Pocet_hodin_nakupu_materialu_hm__c) ??
      null,
  };
  if (getDetail(details, SF.Repair_Subject__c) != null) payload[SF.Repair_Subject__c] = getDetail(details, SF.Repair_Subject__c);
  if (getDetail(details, SF.Work_description__c) != null) payload[SF.Work_description__c] = getDetail(details, SF.Work_description__c);
  if (getDetail(details, SF.Detailed_repair_description__c) != null)
    payload[SF.Detailed_repair_description__c] = getDetail(details, SF.Detailed_repair_description__c);
  if (getDetail(details, SF.Location__c) != null) payload[SF.Location__c] = getDetail(details, SF.Location__c);
  const dateOnProtocol = getDetail(details, `Date_on_Protocol_${visitNumber}__c`);
  if (dateOnProtocol != null) payload[`Date_on_Protocol_${visitNumber}__c`] = dateOnProtocol;
  const techArrival = getDetail(details, `Technician_arrival_Time_${visitNumber}__c`);
  if (techArrival != null) payload[`Technician_arrival_Time_${visitNumber}__c`] = toSalesforceTime(techArrival) ?? techArrival;
  const techDeparture = getDetail(details, `Technician_departure_Time_${visitNumber}__c`);
  if (techDeparture != null) payload[`Technician_departure_Time_${visitNumber}__c`] = toSalesforceTime(techDeparture) ?? techDeparture;

  // Customer signature (URL/string) to Suhlassospracovanim__c
  if (getDetail(details, SF.Suhlassospracovanim__c) != null) {
    payload[SF.Suhlassospracovanim__c] = getDetail(details, SF.Suhlassospracovanim__c);
  }

  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  return patchDeal(sfId, payload);
}

/**
 * Sync price acknowledged (step 6). Status is local-only (not sent to SF).
 */
export async function syncPriceAcknowledged(deal) {
  const sfId = deal.deal_id;
  if (!sfId) return { success: false, error: 'deal_id required' };
  const details = deal.details || {};
  const payload = {
    [SF.HM_End_Price_Check__c]: getDetail(details, SF.HM_End_Price_Check__c) ?? 'Approved',
  };
  return patchDeal(sfId, payload);
}

/**
 * Sync repair complete (step 7): Job_End_Time_{n}, HM_Job_End_Time__c, GPS_End_*, After_Job_Info__c, Pictures_of_work__c, HM_Files_uploaded__c.
 */
export async function syncRepairComplete(deal, visitNumber = 1) {
  const sfId = deal.deal_id;
  if (!sfId) return { success: false, error: 'deal_id required' };
  const details = deal.details || {};
  const jobEndKey = `Job_End_Time_${visitNumber}__c`;
  let pictures = getDetail(details, SF.Pictures_of_work__c) ?? getDetail(details, 'Pictures_of_work');
  if (Array.isArray(pictures)) pictures = pictures.length ? pictures.join(',') : 'Uploaded';
  if (pictures === undefined || pictures === null) pictures = 'Uploaded';

  const rawEnd = getDetail(details, jobEndKey);
  const rawHmEnd = getDetail(details, SF.HM_Job_End_Time__c) ?? getDetail(details, jobEndKey);
  const payload = {
    [SF.GPS_End_Latitude__c]: getDetail(details, SF.GPS_End_Latitude__c),
    [SF.GPS_End_Longitude__c]: getDetail(details, SF.GPS_End_Longitude__c),
    [SF.After_Job_Info__c]: getDetail(details, SF.After_Job_Info__c) ?? 'Form',
    [SF.Pictures_of_work__c]: pictures,
    [SF.HM_Files_uploaded__c]: getDetail(details, SF.HM_Files_uploaded__c) ?? getDetail(details, 'HM_Files_uploaded') ?? 'Uploaded',
  };

  // Only send end-time fields when we actually have values (avoid overwriting with null)
  if (rawEnd != null) payload[jobEndKey] = toSalesforceTime(rawEnd) ?? rawEnd;
  if (rawHmEnd != null) payload[SF.HM_Job_End_Time__c] = toSalesforceTime(rawHmEnd) ?? rawHmEnd;

  console.log('ℹ️ syncRepairComplete PATCH payload:', {
    dealId: sfId,
    visitNumber,
    payload: {
      [jobEndKey]: payload[jobEndKey],
      HM_Job_End_Time__c: payload[SF.HM_Job_End_Time__c],
      GPS_End_Latitude__c: payload[SF.GPS_End_Latitude__c],
      GPS_End_Longitude__c: payload[SF.GPS_End_Longitude__c],
      After_Job_Info__c: payload[SF.After_Job_Info__c],
      Pictures_of_work__c: payload[SF.Pictures_of_work__c],
      HM_Files_uploaded__c: payload[SF.HM_Files_uploaded__c],
    },
  });

  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  return patchDeal(sfId, payload);
}

/**
 * Sync protocol signed (step 8). Status is local-only (not sent to SF).
 */
export async function syncProtocolSigned(deal, visitNumber = 1) {
  const sfId = deal.deal_id;
  if (!sfId) return { success: false, error: 'deal_id required' };
  const details = deal.details || {};
  const dateOnProtocolKey = `Date_on_Protocol_${visitNumber}__c`;
  const payload = {
    [dateOnProtocolKey]: getDetail(details, dateOnProtocolKey) ?? null,
    [SF.Protocol_Email_To_Handyman__c]: getDetail(details, SF.Protocol_Email_To_Handyman__c) ?? 'Sent',
  };
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  return patchDeal(sfId, payload);
}

/**
 * Sync surcharge / diagnostic-only protocol notes to Salesforce.
 * Maps protocol.data fields (reasonNotRepaired, handymanNotice, customerNotice) to SF text fields.
 */
export async function syncSurchargeDiagnostic(deal, visitNumber = 1) {
  const sfId = deal.deal_id;
  if (!sfId) return { success: false, error: 'deal_id required' };
  const details = deal.details || {};
  const protocol = details[`Protocol_${visitNumber}`];
  const data = protocol?.data || {};

  const payload = {
    [SF.Dovod__c]: data.reasonNotRepaired ?? null,
    [SF.Poznamka_m__c]: data.handymanNotice ?? null,
    [SF.C_Feedback__c]: data.customerNotice ?? null,
    [SF.Suhlassospracovanim__c]: data.customerSignature ?? null,
    [SF.Len_diagnostika__c]: 'Ano',
    [SF.Len_diagnostika_checkbox__c]: true,
  };
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  return patchDeal(sfId, payload);
}

/**
 * Sync work summary agree/dispute (step 10).
 * SF: Schvalenie_FA_majstra__c (approval), Reason_for_Diagreement__c (dispute).
 */
export async function syncWorkSummary(deal, agreed, disputeReason = null) {
  const sfId = deal.deal_id;
  if (!sfId) return { success: false, error: 'deal_id required' };

  const payload = {
    [SF.Schvalenie_FA_majstra__c]: agreed ? 'Schvalena' : 'Zle! Kontrola!',
    [SF.Reason_for_Diagreement__c]: agreed ? null : disputeReason,
  };

  console.log('ℹ️ syncWorkSummary PATCH payload:', {
    dealId: sfId,
    agreed,
    payload,
  });

  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

  return patchDeal(sfId, payload);
}

/**
 * Sync invoice type (step 11): iFA__c, eFA__c; for eFA also Celkova_suma_bez_DPH_efa__c, EFA_DPH__c, Datum_dodania_efa__c, VS_efa__c.
 */
export async function syncInvoiceChoice(deal, invoiceType, invoiceData = {}) {
  const sfId = deal.deal_id;
  if (!sfId) return { success: false, error: 'deal_id required' };
  const details = deal.details || {};
  const payload = {
    [SF.iFA__c]: invoiceType === 'iFA',
    [SF.eFA__c]: invoiceType === 'eFA',
  };
  if (invoiceType === 'eFA') {
    if (getDetail(details, SF.Celkova_suma_bez_DPH_efa__c) != null)
      payload[SF.Celkova_suma_bez_DPH_efa__c] = getDetail(details, SF.Celkova_suma_bez_DPH_efa__c);
    if (getDetail(details, SF.EFA_DPH__c) != null) payload[SF.EFA_DPH__c] = getDetail(details, SF.EFA_DPH__c);
    if (getDetail(details, SF.Datum_dodania_efa__c) != null)
      payload[SF.Datum_dodania_efa__c] = getDetail(details, SF.Datum_dodania_efa__c);
    if (getDetail(details, SF.VS_efa__c) != null) payload[SF.VS_efa__c] = getDetail(details, SF.VS_efa__c);
  }
  console.log('ℹ️ syncInvoiceChoice PATCH payload:', { dealId: sfId, invoiceType, payload });
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  return patchDeal(sfId, payload);
}

/** Legacy: build payload from details using a field map (for callers that still pass non-__c keys). */
export function buildSFPayload(details, visitNumber = 1) {
  const keys = [
    SF.Appointment_DateTime__c,
    SF.Planned_DateTime__c,
    SF.Job_Start_Time_1__c,
    SF.GPS_Start_Latitude__c,
    SF.GPS_Start_Longitude__c,
    SF.GPS_Distance_From_Customer__c,
    SF.Popis_a_cena_materialu_z_HM_APP__c,
    SF.X1_Cena_za_drobny_material_hm__c,
    SF.X1_Cena_za_nahradne_diely_a_material_hm__c,
    SF.X1_Pocet_vyjazdov_hm__c,
    SF.X1_Pocet_hodin_prace_hm__c,
    SF.Pocet_km_na_1_navstevu__c,
    SF.HM_End_Price_Check__c,
    SF.Job_End_Time_1__c,
    SF.HM_Job_End_Time__c,
    SF.After_Job_Info__c,
    SF.Pictures_of_work__c,
    SF.HM_Files_uploaded__c,
    SF.iFA__c,
    SF.eFA__c,
    SF.Celkova_suma_bez_DPH_efa__c,
    SF.EFA_DPH__c,
    SF.Datum_dodania_efa__c,
    SF.VS_efa__c,
  ];
  return buildPayload(details || {}, keys);
}

export default {
  patchDeal,
  getAccessToken,
  buildSFPayload,
  syncSchedule,
  syncStartWork,
  syncDiagnostic,
  syncPriceAcknowledged,
  syncRepairComplete,
  syncProtocolSigned,
  syncWorkSummary,
  syncInvoiceChoice,
  syncSurchargeDiagnostic,
  SF,
  getDetail,
};
