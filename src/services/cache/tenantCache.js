// src/services/cache/tenantCache.js
/**
 * Tenant Resolution Cache Service
 * ✅ Redis removed - using in-memory cache instead
 * Caches channel identifier → tenant mappings in memory
 */

const CACHE_TTL = 3600 * 1000; // 1 hour in milliseconds
const CACHE_PREFIX = 'channel';

// ✅ In-memory cache (replaces Redis)
const cache = new Map();

// Cleanup expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (value.expiresAt < now) {
      cache.delete(key);
    }
  }
}, 60000); // Cleanup every minute

/**
 * Get tenant data from cache or database
 * @param {string} channelType - Channel type (whatsapp, facebook, etc.)
 * @param {string} identifier - Channel identifier
 * @returns {Promise<Object|null>} - Tenant data
 */
export async function resolveTenant(channelType, identifier) {
  try {
    // Try cache first
    const cached = getFromCache(channelType, identifier);
    if (cached) {
      return cached;
    }

    // Fallback to database
    const tenantData = await lookupInDatabase(channelType, identifier);
    
    if (tenantData) {
      // Cache for future requests
      setInCache(channelType, identifier, tenantData);
    }

    return tenantData;

  } catch (error) {
    console.error('Tenant resolution failed:', error);
    return null;
  }
}

/**
 * Get from in-memory cache
 */
function getFromCache(channelType, identifier) {
  try {
    const key = getCacheKey(channelType, identifier);
    const cached = cache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // Remove expired entry
    if (cached) {
      cache.delete(key);
    }

    return null;

  } catch (error) {
    console.error('Cache read failed:', error);
    return null;
  }
}

/**
 * Set in in-memory cache
 */
function setInCache(channelType, identifier, data) {
  try {
    const key = getCacheKey(channelType, identifier);
    cache.set(key, {
      data,
      expiresAt: Date.now() + CACHE_TTL
    });
  } catch (error) {
    console.error('Cache write failed:', error);
  }
}

/**
 * Invalidate cache for specific identifier
 */
export async function invalidateCache(channelType, identifier) {
  try {
    const key = getCacheKey(channelType, identifier);
    cache.delete(key);
  } catch (error) {
    console.error('Cache invalidation failed:', error);
  }
}

/**
 * Invalidate all cache entries for a tenant
 */
export async function invalidateTenantCache(tenantId) {
  try {
    let invalidatedCount = 0;
    for (const [key, value] of cache.entries()) {
      if (value.data && value.data.tenantId === tenantId) {
        cache.delete(key);
        invalidatedCount++;
      }
    }

    if (invalidatedCount > 0) {
      console.log(`Invalidated ${invalidatedCount} cache entries for tenant ${tenantId}`);
    }

  } catch (error) {
    console.error('Tenant cache invalidation failed:', error);
  }
}

/**
 * Generate cache key
 */
function getCacheKey(channelType, identifier) {
  return `${CACHE_PREFIX}:${channelType}:${identifier}`;
}

/**
 * Lookup tenant in database by channel and identifier
 */
async function lookupInDatabase(channelType, identifier) {
  try {
    const { getMasterDB } = await import('../../config/database.js');
    const masterDB = await getMasterDB();
    const CompanyAccount = masterDB.model('CompanyAccount');

    let query = { type: channelType };

    // Build query based on channel type
    switch (channelType) {
      case 'whatsapp':
        query['credentials.phoneNumberId'] = identifier;
        break;

      case 'facebook':
      case 'instagram':
        query['credentials.pageId'] = identifier;
        break;

      case 'sms':
        // Identifier could be phone number or sender ID
        query.$or = [
          { 'credentials.fromNumber': { $regex: identifier, $options: 'i' } },
          { 'credentials.senderId': identifier },
        ];
        break;

      case 'email':
        query.$or = [
          { 'credentials.fromEmail': identifier.toLowerCase() },
          { 'credentials.supportEmail': identifier.toLowerCase() },
          { 'credentials.inboundEmail': identifier.toLowerCase() },
        ];
        break;

      case 'webchat':
        query['credentials.widgetId'] = identifier;
        break;

      default:
        return null;
    }

    const account = await CompanyAccount.findOne(query).populate('companyId');

    if (!account) {
      return null;
    }

    // Return tenant data with necessary credentials
    return {
      tenantId: account.companyId.tenantId,
      accountId: account._id.toString(),
      companyId: account.companyId._id.toString(),
      // Include relevant credentials for webhook validation
      appSecret: account.credentials.appSecret,
      authToken: account.credentials.authToken,
      apiKey: account.credentials.apiKey,
      secretKey: account.credentials.secretKey,
      webhookVerificationKey: account.credentials.webhookVerificationKey,
    };

  } catch (error) {
    console.error('Database lookup failed:', error);
    return null;
  }
}

/**
 * Warm up cache for a tenant (preload all channels)
 */
export async function warmUpTenantCache(tenantId) {
  try {
    const { getMasterDB } = await import('../../config/database.js');
    const masterDB = await getMasterDB();
    const CompanyAccount = masterDB.model('CompanyAccount');

    // Find all accounts for this tenant
    const accounts = await CompanyAccount.find({
      companyId: tenantId,
    }).populate('companyId');

    for (const account of accounts) {
      const identifier = extractIdentifier(account);
      if (identifier) {
        const tenantData = {
          tenantId: account.companyId.tenantId,
          accountId: account._id.toString(),
          companyId: account.companyId._id.toString(),
          appSecret: account.credentials.appSecret,
          authToken: account.credentials.authToken,
          apiKey: account.credentials.apiKey,
          secretKey: account.credentials.secretKey,
          webhookVerificationKey: account.credentials.webhookVerificationKey,
        };

        setInCache(account.type, identifier, tenantData);
      }
    }

    console.log(`Warmed up cache for tenant ${tenantId}`);

  } catch (error) {
    console.error('Cache warm-up failed:', error);
  }
}

/**
 * Extract identifier from account
 */
function extractIdentifier(account) {
  switch (account.type) {
    case 'whatsapp':
      return account.credentials.phoneNumberId;
    case 'facebook':
    case 'instagram':
      return account.credentials.pageId;
    case 'sms':
      return account.credentials.fromNumber || account.credentials.senderId;
    case 'email':
      return account.credentials.fromEmail;
    case 'webchat':
      return account.credentials.widgetId;
    default:
      return null;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  try {
    const stats = {
      totalKeys: cache.size,
      byChannel: {},
    };

    for (const [key, value] of cache.entries()) {
      if (value.expiresAt > Date.now()) {
        const parts = key.split(':');
        const channelType = parts[1];
        
        if (!stats.byChannel[channelType]) {
          stats.byChannel[channelType] = 0;
        }
        stats.byChannel[channelType]++;
      }
    }

    return stats;

  } catch (error) {
    console.error('Failed to get cache stats:', error);
    return null;
  }
}
