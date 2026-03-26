// // src/app/api/webhooks/whatsapp/route.js
// import { NextResponse } from 'next/server';
// import { getMasterDB, getTenantDB } from '@/config/database';
// import CompanySchema from '@/models/schemas/Company';
// import UserSchema from '@/models/schemas/User';
// import CompanyAccountSchema from '@/models/schemas/CompanyAccount';

// export async function GET(request) {
//   try {
//     const { searchParams } = new URL(request.url);
//     const hubMode = searchParams.get('hub.mode');
//     const hubToken = searchParams.get('hub.verify_token');
//     const hubChallenge = searchParams.get('hub.challenge');

//     console.log('🔐 Webhook Verification Request:', {
//       hubMode,
//       hubToken: hubToken ? `${hubToken.substring(0, 10)}...` : 'missing',
//       hubChallenge
//     });

//     // Basic validation
//     if (!hubMode || !hubToken || !hubChallenge) {
//       console.log('❌ Missing required verification parameters');
//       return new Response('Missing parameters', { status: 400 });
//     }

//     if (hubMode !== 'subscribe') {
//       console.log('❌ Invalid hub mode:', hubMode);
//       return new Response('Invalid mode', { status: 400 });
//     }

//     // Get master database connection
//     const masterDB = await getMasterDB();
    
//     // Get models from master DB
//     const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
//     const User = masterDB.models.User || masterDB.model('User', UserSchema);

//     console.log('🔍 Searching for tenant with matching WhatsApp token...');

//     // Get all active companies
//     const companies = await Company.find({ 
//       status: 'active' 
//     }).select('_id tenantDatabaseName name').lean();

//     console.log(`📊 Found ${companies.length} active companies to search`);

//     let matchedTenant = null;
//     let matchedAccount = null;

//     // Search through each tenant database for the token
//     for (const company of companies) {
//       try {
//         console.log(`🔍 Searching tenant: ${company.tenantDatabaseName} (${company.name})`);
        
//         // Get tenant database
//         const tenantDB = await getTenantDB(company._id.toString());
        
//         // Get CompanyAccount model from tenant DB
//         const CompanyAccount = tenantDB.models.CompanyAccount || 
//                               tenantDB.model('CompanyAccount', CompanyAccountSchema);
        
//         // Search for account with matching token
//         const account = await CompanyAccount.findOne({
//           'credentials.token': hubToken,
//           type: 'whatsapp',
//           status: 'active'
//         }).lean();

//         if (account) {
//           matchedTenant = company;
//           matchedAccount = account;
//           console.log('✅ Found matching account in tenant:', company.tenantDatabaseName);
//           break;
//         }
//       } catch (error) {
//         console.log(`⚠️ Could not search tenant ${company.tenantDatabaseName}:`, error.message);
//         continue;
//       }
//     }

//     if (matchedAccount && matchedTenant) {
//       console.log('✅ Webhook verified successfully:', {
//         company: matchedTenant.name,
//         tenantDatabase: matchedTenant.tenantDatabaseName,
//         account: matchedAccount.name,
//         identifier: matchedAccount.credentials.identifier
//       });
      
//       return new Response(hubChallenge, {
//         status: 200,
//         headers: { 'Content-Type': 'text/plain' },
//       });
//     } else {
//       console.log('❌ No tenant found with matching WhatsApp token');
//       console.log('🔍 Token searched:', `${hubToken.substring(0, 30)}...`);
//       console.log('🔍 Companies searched:', companies.length);
      
//       return new Response('Verification failed', { status: 403 });
//     }

//   } catch (error) {
//     console.error('❌ Webhook verification error:', error);
//     return new Response('Server error', { status: 500 });
//   }
// }

// export async function POST(request) {
//   try {
//     const payload = await request.json();
    
//     console.log('📨 Incoming Webhook Payload:', {
//       object: payload.object,
//       entryCount: payload.entry?.length || 0
//     });

//     // For POST webhooks, we need to determine which tenant this belongs to
//     const entry = payload.entry?.[0];
//     const changes = entry?.changes?.[0];
//     const value = changes?.value;

//     if (value?.messages || value?.statuses) {
//       // We need to find which tenant this webhook belongs to
//       // This can be done by matching phone number ID or other identifiers
      
//       let targetTenantId = null;
      
//       // Method 1: Try to find by phone number ID in metadata
//       if (value.metadata?.phone_number_id) {
//         targetTenantId = await findTenantByPhoneNumberId(value.metadata.phone_number_id);
//       }
      
//       // Method 2: If we have messages, try to find by sender phone number
//       if (!targetTenantId && value.messages?.[0]?.from) {
//         targetTenantId = await findTenantByPhoneNumber(value.messages[0].from);
//       }

//       if (targetTenantId) {
//         console.log('🔍 Processing webhook for tenant:', targetTenantId);
//         // Process the webhook with the specific tenant
//         // await processWebhookForTenant(targetTenantId, payload);
//       } else {
//         console.log('⚠️ Could not determine tenant for webhook');
//       }
//     }

//     // Always return 200 OK to acknowledge receipt
//     return new Response('EVENT_RECEIVED', {
//       status: 200,
//       headers: {
//         'Content-Type': 'text/plain',
//       },
//     });
//   } catch (error) {
//     console.error('❌ Webhook processing error:', error);
//     return new Response('EVENT_RECEIVED', { status: 200 });
//   }
// }

// // Helper function to find tenant by phone number ID
// async function findTenantByPhoneNumberId(phoneNumberId) {
//   try {
//     const masterDB = await getMasterDB();
//     const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
    
//     const companies = await Company.find({ status: 'active' }).select('_id tenantDatabaseName').lean();
    
//     for (const company of companies) {
//       try {
//         const tenantDB = await getTenantDB(company._id.toString());
//         const CompanyAccount = tenantDB.models.CompanyAccount || 
//                               tenantDB.model('CompanyAccount', CompanyAccountSchema);
        
//         const account = await CompanyAccount.findOne({
//           'credentials.phoneNumberId': phoneNumberId,
//           type: 'whatsapp',
//           status: 'active'
//         }).select('_id').lean();
        
//         if (account) {
//           return company._id.toString();
//         }
//       } catch (error) {
//         continue;
//       }
//     }
//     return null;
//   } catch (error) {
//     console.error('Error finding tenant by phone number ID:', error);
//     return null;
//   }
// }

// // Helper function to find tenant by phone number
// async function findTenantByPhoneNumber(phoneNumber) {
//   try {
//     const masterDB = await getMasterDB();
//     const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
    
//     const companies = await Company.find({ status: 'active' }).select('_id tenantDatabaseName').lean();
    
//     for (const company of companies) {
//       try {
//         const tenantDB = await getTenantDB(company._id.toString());
//         const CompanyAccount = tenantDB.models.CompanyAccount || 
//                               tenantDB.model('CompanyAccount', CompanyAccountSchema);
        
//         const account = await CompanyAccount.findOne({
//           'credentials.identifier': phoneNumber,
//           type: 'whatsapp',
//           status: 'active'
//         }).select('_id').lean();
        
//         if (account) {
//           return company._id.toString();
//         }
//       } catch (error) {
//         continue;
//       }
//     }
//     return null;
//   } catch (error) {
//     console.error('Error finding tenant by phone number:', error);
//     return null;
//   }
// }


















// // src/app/api/webhooks/whatsapp/route.js
// import { NextResponse } from 'next/server';
// import { getMasterDB, getTenantDB } from '@/config/database';
// import { getRedisClient } from '@/config/redis';
// import CompanySchema from '@/models/schemas/Company';
// import UserSchema from '@/models/schemas/User';
// import CompanyAccountSchema from '@/models/schemas/CompanyAccount';

// // Cache TTL in seconds (1 hour)
// const CACHE_TTL = 3600;

// /**
//  * Find tenant by token with caching
//  */
// async function findTenantByTokenWithCache(hubToken) {
//   const redis = await getRedisClient();
//   const cacheKey = `webhook:token:${Buffer.from(hubToken).toString('base64')}`;
  
//   // Try cache first
//   if (redis && redis.isOpen) {
//     try {
//       const cachedTenantId = await redis.get(cacheKey);
//       if (cachedTenantId) {
//         console.log('✅ Found tenant in cache:', cachedTenantId);
//         return {
//           tenantId: cachedTenantId,
//           fromCache: true
//         };
//       }
//     } catch (cacheError) {
//       console.warn('⚠️ Cache read failed, proceeding with DB search:', cacheError.message);
//     }
//   }
  
//   // Search databases
//   const masterDB = await getMasterDB();
//   const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
  
//   const companies = await Company.find({ 
//     status: 'active' 
//   }).select('_id tenantDatabaseName name').lean();
  
//   console.log(`🔍 Searching ${companies.length} active companies for token match`);
  
//   for (const company of companies) {
//     try {
//       const tenantDB = await getTenantDB(company._id.toString());
//       const CompanyAccount = tenantDB.models.CompanyAccount || 
//                             tenantDB.model('CompanyAccount', CompanyAccountSchema);
      
//       const account = await CompanyAccount.findOne({
//         'credentials.token': hubToken,
//         type: 'whatsapp',
//         status: 'active'
//       }).select('name credentials.identifier').lean();
      
//       if (account) {
//         console.log('✅ Found matching account in tenant:', {
//           tenantId: company._id.toString(),
//           tenantName: company.name,
//           accountName: account.name,
//           identifier: account.credentials.identifier
//         });
        
//         // Cache the result
//         if (redis && redis.isOpen) {
//           try {
//             await redis.setEx(cacheKey, CACHE_TTL, company._id.toString());
//             console.log('💾 Cached token-to-tenant mapping');
//           } catch (cacheError) {
//             console.warn('⚠️ Cache write failed:', cacheError.message);
//           }
//         }
        
//         return {
//           tenantId: company._id.toString(),
//           tenantName: company.name,
//           accountName: account.name,
//           identifier: account.credentials.identifier,
//           fromCache: false
//         };
//       }
//     } catch (error) {
//       console.log(`⚠️ Could not search tenant ${company.tenantDatabaseName}:`, error.message);
//       continue;
//     }
//   }
  
//   return null;
// }

// /**
//  * Find tenant by phone number ID with caching
//  */
// async function findTenantByPhoneNumberIdWithCache(phoneNumberId) {
//   const redis = await getRedisClient();
//   const cacheKey = `webhook:phone:${phoneNumberId}`;
  
//   // Try cache first
//   if (redis && redis.isOpen) {
//     try {
//       const cachedTenantId = await redis.get(cacheKey);
//       if (cachedTenantId) {
//         console.log('✅ Found tenant by phone in cache:', cachedTenantId);
//         return cachedTenantId;
//       }
//     } catch (cacheError) {
//       console.warn('⚠️ Cache read failed for phone:', cacheError.message);
//     }
//   }
  
//   // Search databases
//   const masterDB = await getMasterDB();
//   const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
  
//   const companies = await Company.find({ status: 'active' }).select('_id tenantDatabaseName').lean();
  
//   for (const company of companies) {
//     try {
//       const tenantDB = await getTenantDB(company._id.toString());
//       const CompanyAccount = tenantDB.models.CompanyAccount || 
//                             tenantDB.model('CompanyAccount', CompanyAccountSchema);
      
//       const account = await CompanyAccount.findOne({
//         'credentials.phoneNumberId': phoneNumberId,
//         type: 'whatsapp',
//         status: 'active'
//       }).select('_id').lean();
      
//       if (account) {
//         // Cache the result
//         if (redis && redis.isOpen) {
//           try {
//             await redis.setEx(cacheKey, CACHE_TTL, company._id.toString());
//           } catch (cacheError) {
//             console.warn('⚠️ Cache write failed for phone:', cacheError.message);
//           }
//         }
//         return company._id.toString();
//       }
//     } catch (error) {
//       continue;
//     }
//   }
  
//   return null;
// }

// /**
//  * Invalidate cache for a token (when credentials change)
//  */
// async function invalidateTokenCache(token) {
//   const redis = await getRedisClient();
//   if (!redis || !redis.isOpen) return;
  
//   try {
//     const cacheKey = `webhook:token:${Buffer.from(token).toString('base64')}`;
//     await redis.del(cacheKey);
//     console.log('🗑️ Invalidated token cache');
//   } catch (error) {
//     console.warn('⚠️ Cache invalidation failed:', error.message);
//   }
// }

// /**
//  * Invalidate cache for a phone number ID
//  */
// async function invalidatePhoneCache(phoneNumberId) {
//   const redis = await getRedisClient();
//   if (!redis || !redis.isOpen) return;
  
//   try {
//     const cacheKey = `webhook:phone:${phoneNumberId}`;
//     await redis.del(cacheKey);
//     console.log('🗑️ Invalidated phone cache');
//   } catch (error) {
//     console.warn('⚠️ Phone cache invalidation failed:', error.message);
//   }
// }

// export async function GET(request) {
//   try {
//     const { searchParams } = new URL(request.url);
//     const hubMode = searchParams.get('hub.mode');
//     const hubToken = searchParams.get('hub.verify_token');
//     const hubChallenge = searchParams.get('hub.challenge');

//     console.log('🔐 Webhook Verification Request:', {
//       hubMode,
//       hubToken: hubToken ? `${hubToken.substring(0, 10)}...` : 'missing',
//       hubChallenge
//     });

//     // Basic validation
//     if (!hubMode || !hubToken || !hubChallenge) {
//       console.log('❌ Missing required verification parameters');
//       return new Response('Missing parameters', { status: 400 });
//     }

//     if (hubMode !== 'subscribe') {
//       console.log('❌ Invalid hub mode:', hubMode);
//       return new Response('Invalid mode', { status: 400 });
//     }

//     // Find tenant using cached approach
//     const tenantResult = await findTenantByTokenWithCache(hubToken);

//     if (tenantResult) {
//       console.log('✅ Webhook verified successfully:', {
//         tenantId: tenantResult.tenantId,
//         tenantName: tenantResult.tenantName,
//         accountName: tenantResult.accountName,
//         identifier: tenantResult.identifier,
//         fromCache: tenantResult.fromCache ? 'CACHE' : 'DATABASE'
//       });
      
//       return new Response(hubChallenge, {
//         status: 200,
//         headers: { 'Content-Type': 'text/plain' },
//       });
//     } else {
//       console.log('❌ No tenant found with matching WhatsApp token');
//       console.log('🔍 Token searched:', `${hubToken.substring(0, 30)}...`);
      
//       return new Response('Verification failed', { status: 403 });
//     }

//   } catch (error) {
//     console.error('❌ Webhook verification error:', error);
//     return new Response('Server error', { status: 500 });
//   }
// }

// export async function POST(request) {
//   try {
//     const payload = await request.json();
    
//     console.log('📨 Incoming Webhook Payload:', {
//       object: payload.object,
//       entryCount: payload.entry?.length || 0
//     });

//     // For POST webhooks, determine which tenant this belongs to
//     const entry = payload.entry?.[0];
//     const changes = entry?.changes?.[0];
//     const value = changes?.value;

//     let targetTenantId = null;

//     if (value?.messages || value?.statuses) {
//       // Method 1: Try to find by phone number ID in metadata
//       if (value.metadata?.phone_number_id) {
//         targetTenantId = await findTenantByPhoneNumberIdWithCache(value.metadata.phone_number_id);
//       }
      
//       // Method 2: If we have messages, try to find by sender phone number
//       if (!targetTenantId && value.messages?.[0]?.from) {
//         // You can implement similar caching for phone numbers if needed
//         targetTenantId = await findTenantByPhoneNumberIdWithCache(value.messages[0].from);
//       }

//       if (targetTenantId) {
//         console.log('🔍 Processing webhook for tenant:', targetTenantId);
        
//         // Get tenant database and process the webhook
//         const tenantDB = await getTenantDB(targetTenantId);
//         const CompanyAccount = tenantDB.models.CompanyAccount || 
//                               tenantDB.model('CompanyAccount', CompanyAccountSchema);
        
//         // Process different webhook types
//         if (value.messages) {
//           await processIncomingMessage(targetTenantId, value.messages[0], CompanyAccount);
//         } else if (value.statuses) {
//           await processStatusUpdate(targetTenantId, value.statuses[0], CompanyAccount);
//         }
        
//       } else {
//         console.log('⚠️ Could not determine tenant for webhook');
//         // Log for debugging
//         console.log('🔍 Webhook data for debugging:', {
//           metadata: value?.metadata,
//           messageFrom: value?.messages?.[0]?.from,
//           statusRecipient: value?.statuses?.[0]?.recipient_id
//         });
//       }
//     }

//     // Always return 200 OK to acknowledge receipt
//     return new Response('EVENT_RECEIVED', {
//       status: 200,
//       headers: {
//         'Content-Type': 'text/plain',
//       },
//     });
//   } catch (error) {
//     console.error('❌ Webhook processing error:', error);
//     return new Response('EVENT_RECEIVED', { status: 200 });
//   }
// }

// /**
//  * Process incoming message webhook
//  */
// async function processIncomingMessage(tenantId, message, CompanyAccountModel) {
//   try {
//     console.log('💬 Processing incoming message:', {
//       tenantId,
//       messageId: message.id,
//       from: message.from,
//       type: message.type,
//       timestamp: message.timestamp
//     });

//     // Here you would:
//     // 1. Find or create contact
//     // 2. Find or create conversation
//     // 3. Save message
//     // 4. Trigger any automation/rules
    
//     // Example implementation:
//     /*
//     const contact = await findOrCreateContact(tenantId, message.from);
//     const conversation = await findOrCreateConversation(tenantId, contact._id, message.from);
//     await saveMessage(tenantId, conversation._id, message);
//     await triggerAutomation(tenantId, conversation._id, message);
//     */

//   } catch (error) {
//     console.error('❌ Error processing incoming message:', error);
//   }
// }

// /**
//  * Process status update webhook
//  */
// async function processStatusUpdate(tenantId, status, CompanyAccountModel) {
//   try {
//     console.log('📊 Processing status update:', {
//       tenantId,
//       messageId: status.id,
//       status: status.status,
//       recipient: status.recipient_id,
//       timestamp: status.timestamp
//     });

//     // Here you would:
//     // 1. Update message status in database
//     // 2. Update conversation status if needed
//     // 3. Trigger notifications
    
//     // Example implementation:
//     /*
//     await updateMessageStatus(tenantId, status.id, status.status);
//     if (status.status === 'read' || status.status === 'delivered') {
//       await updateConversationStatus(tenantId, status.id, status.status);
//     }
//     */

//   } catch (error) {
//     console.error('❌ Error processing status update:', error);
//   }
// }

// /**
//  * Utility function to clear all webhook caches (for maintenance)
//  */
// export async function clearAllWebhookCaches() {
//   const redis = await getRedisClient();
//   if (!redis || !redis.isOpen) return;
  
//   try {
//     const keys = await redis.keys('webhook:*');
//     if (keys.length > 0) {
//       await redis.del(keys);
//       console.log(`🗑️ Cleared ${keys.length} webhook cache entries`);
//     }
//   } catch (error) {
//     console.error('❌ Error clearing webhook caches:', error);
//   }
// }







// src/app/api/webhooks/whatsapp/route.js
import { NextResponse } from 'next/server';
import { getMasterDB } from '@/config/database';
import { publishToQueue, QUEUES } from '@/lib/queue/rabbitmq';
import CompanySchema from '@/models/schemas/Company';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import crypto from 'crypto';

const CACHE_TTL = 3600; // 1 hour (in seconds)
const CACHE_TTL_MS = CACHE_TTL * 1000; // Convert to milliseconds
const CACHE_MAX_SIZE = 10000; // Max entries in webhook cache to prevent memory leak
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 300; // Max requests per window per IP

// Size-limited in-memory cache for webhook tenant lookups
const webhookCache = new Map();

// Rate limiting tracker: IP -> { count, resetAt }
const rateLimitMap = new Map();

/**
 * Evict oldest entries when cache exceeds max size
 */
function cacheSet(key, value) {
  // Evict oldest entries if cache is at capacity
  if (webhookCache.size >= CACHE_MAX_SIZE) {
    // Delete the first (oldest) 10% of entries
    const entriesToDelete = Math.max(1, Math.floor(CACHE_MAX_SIZE * 0.1));
    const iterator = webhookCache.keys();
    for (let i = 0; i < entriesToDelete; i++) {
      const oldestKey = iterator.next().value;
      if (oldestKey) webhookCache.delete(oldestKey);
    }
  }
  webhookCache.set(key, value);
}

// Cleanup expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of webhookCache.entries()) {
    if (value.expiresAt < now) {
      webhookCache.delete(key);
    }
  }
  // Also cleanup expired rate limit entries
  for (const [key, value] of rateLimitMap.entries()) {
    if (value.resetAt < now) {
      rateLimitMap.delete(key);
    }
  }
}, 60000); // Cleanup every minute

/**
 * Simple in-memory rate limiter per IP
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  return true;
}

/**
 * Validate webhook signature from Meta (X-Hub-Signature-256)
 * Returns true if valid or if validation is not configured
 */
function validateWebhookSignature(request, rawBody) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    // Signature validation not configured - skip but warn once
    if (!validateWebhookSignature._warned) {
      console.warn('WHATSAPP_APP_SECRET not configured - webhook signature validation disabled');
      validateWebhookSignature._warned = true;
    }
    return true;
  }

  const signature = request.headers.get('x-hub-signature-256');
  if (!signature) {
    console.error('Missing x-hub-signature-256 header');
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  const providedSignature = signature.replace('sha256=', '');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Find tenant by token with caching
 */
async function findTenantByTokenWithCache(hubToken) {
  const cacheKey = `webhook:token:${Buffer.from(hubToken).toString('base64')}`;
  
  // Try in-memory cache first
  const cached = webhookCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    console.log('✅ Found tenant in cache:', cached.tenantId);
    return { tenantId: cached.tenantId, fromCache: true };
  }
  
  // Search in master database
  const masterDB = await getMasterDB();
  const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
  
  const companies = await Company.find({ status: 'active' }).select('_id name').lean();
  console.log(`🔍 Searching ${companies.length} active companies for token match`);
  
  for (const company of companies) {
    try {
      const { getTenantDB } = await import('@/config/database');
      const tenantDB = await getTenantDB(company._id.toString());
      const CompanyAccount = tenantDB.models.CompanyAccount || 
                            tenantDB.model('CompanyAccount', CompanyAccountSchema);
      
      const account = await CompanyAccount.findOne({
        'credentials.token': hubToken,
        type: 'whatsapp',
        status: 'active'
      }).select('name credentials.phoneNumberId').lean();
      
      if (account) {
        console.log('✅ Found matching WhatsApp account:', {
          tenantId: company._id.toString(),
          tenantName: company.name,
          accountName: account.name,
          phoneNumberId: account.credentials.phoneNumberId
        });
        
        // Cache in memory (size-limited)
        cacheSet(cacheKey, {
          tenantId: company._id.toString(),
          expiresAt: Date.now() + CACHE_TTL_MS
        });
        
        return {
          tenantId: company._id.toString(),
          tenantName: company.name,
          accountId: account._id.toString(),
          phoneNumberId: account.credentials.phoneNumberId,
          fromCache: false
        };
      }
    } catch (error) {
      console.log(`⚠️ Could not search tenant ${company._id}:`, error.message);
      continue;
    }
  }
  
  return null;
}

/**
 * GET - WhatsApp webhook verification
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const hubMode = searchParams.get('hub.mode');
    const hubToken = searchParams.get('hub.verify_token');
    const hubChallenge = searchParams.get('hub.challenge');

    console.log('🔐 WhatsApp Webhook Verification:', {
      hubMode,
      hasToken: !!hubToken,
      hasChallenge: !!hubChallenge
    });

    // Validate parameters
    if (!hubMode || !hubToken || !hubChallenge) {
      return new Response('Missing parameters', { status: 400 });
    }

    if (hubMode !== 'subscribe') {
      return new Response('Invalid mode', { status: 400 });
    }

    // Find tenant by token
    const tenantResult = await findTenantByTokenWithCache(hubToken);

    if (tenantResult) {
      console.log('✅ Webhook verified for tenant:', tenantResult.tenantId);
      return new Response(hubChallenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    console.log('❌ No tenant found with matching token');
    return new Response('Verification failed', { status: 403 });

  } catch (error) {
    console.error('❌ Webhook verification error:', error);
    return new Response('Server error', { status: 500 });
  }
}

/**
 * POST - WhatsApp webhook events (enqueue for processing)
 */
export async function POST(request) {
  try {
    // Rate limiting
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(clientIp)) {
      console.warn('Rate limit exceeded for IP:', clientIp);
      return new Response('Too Many Requests', { status: 429 });
    }

    // Read raw body for signature validation before parsing JSON
    const rawBody = await request.text();

    // Validate webhook signature (HMAC-SHA256)
    if (!validateWebhookSignature(request, rawBody)) {
      console.error('Invalid webhook signature - rejecting request');
      return new Response('Unauthorized', { status: 403 });
    }

    const payload = JSON.parse(rawBody);

    console.log('📨 WhatsApp Webhook:', {
      object: payload.object,
      entryCount: payload.entry?.length || 0
    });

    // Extract phone number ID from webhook
    const entry = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const phoneNumberId = value?.metadata?.phone_number_id;

    if (!phoneNumberId) {
      console.log('⚠️ No phone number ID in webhook');
      return new Response('EVENT_RECEIVED', { status: 200 });
    }

    // Find tenant by phone number ID (using in-memory cache)
    const cacheKey = `webhook:phone:${phoneNumberId}`;
    
    let tenantId = null;
    let channelAccountId = null;

    // Try in-memory cache first
    const cached = webhookCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      tenantId = cached.tenantId;
      channelAccountId = cached.accountId;
      console.log('✅ Found tenant in cache by phone:', tenantId);
    }

    // Search in database if not cached
    if (!tenantId) {
      const masterDB = await getMasterDB();
      const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
      const companies = await Company.find({ status: 'active' }).select('_id').lean();

      for (const company of companies) {
        try {
          const { getTenantDB } = await import('@/config/database');
          const tenantDB = await getTenantDB(company._id.toString());
          const CompanyAccount = tenantDB.models.CompanyAccount || 
                                tenantDB.model('CompanyAccount', CompanyAccountSchema);
          
          const account = await CompanyAccount.findOne({
            'credentials.phoneNumberId': phoneNumberId,
            type: 'whatsapp',
            status: 'active'
          }).select('_id').lean();
          
          if (account) {
            tenantId = company._id.toString();
            channelAccountId = account._id.toString();
            
            // Cache in memory (size-limited)
            cacheSet(cacheKey, {
              tenantId,
              accountId: channelAccountId,
              expiresAt: Date.now() + CACHE_TTL_MS
            });
            break;
          }
        } catch (error) {
          continue;
        }
      }
    }

    if (!tenantId || !channelAccountId) {
      console.log('⚠️ No tenant or channel account found for phone number:', phoneNumberId, {
        tenantId,
        channelAccountId
      });
      return new Response('EVENT_RECEIVED', { status: 200 });
    }

    // Enqueue webhook to RabbitMQ
    const jobData = {
      channelType: 'whatsapp',
      channelAccountId: channelAccountId,
      tenantId: tenantId,
      identifier: phoneNumberId,
      rawPayload: payload,
      receivedAt: new Date().toISOString()
    };

    await publishToQueue(QUEUES.WEBHOOK_PROCESS, jobData);

    console.log('✅ WhatsApp webhook queued:', {
      tenantId,
      phoneNumberId,
      hasMessages: !!(value?.messages?.length),
      hasStatuses: !!(value?.statuses?.length)
    });

    return new Response('EVENT_RECEIVED', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });

  } catch (error) {
    console.error('WhatsApp webhook error:', error.message);

    // Return 500 for infrastructure failures (RabbitMQ, DB) so Meta retries
    // This prevents silent message loss when the queue is down
    if (error.message?.includes('Queue') || error.message?.includes('RabbitMQ') ||
        error.message?.includes('ECONNREFUSED') || error.message?.includes('Channel closed') ||
        error.message?.includes('Connection closed') || error.code === 'ECONNREFUSED') {
      console.error('Infrastructure failure - returning 500 for Meta retry:', error.message);
      return new Response('SERVER_ERROR', { status: 500 });
    }

    // For non-infrastructure errors (parsing, tenant not found), return 200
    // to prevent infinite retries for permanently invalid payloads
    return new Response('EVENT_RECEIVED', { status: 200 });
  }
}

