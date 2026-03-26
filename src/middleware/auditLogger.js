// src/middleware/auditLogger.js
import AuditService from '../services/audit/AuditService.js';

/**
 * Middleware to log API access
 * This should be added to routes that need to be audited
 */
export async function auditApiAccess(request, response, options = {}) {
  try {
    const startTime = Date.now();
    const url = new URL(request.url);
    
    // Get request metadata
    const metadata = {
      endpoint: url.pathname,
      method: request.method,
      ipAddress: request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      queryParams: Object.fromEntries(url.searchParams)
    };

    // Calculate response time
    const responseTime = Date.now() - startTime;
    metadata.responseTime = responseTime;

    // Get status code from response if available
    if (response && response.status) {
      metadata.statusCode = response.status;
    }

    // Get actor from request if available (set by auth middleware)
    const actor = options.actor || null;
    const companyId = options.companyId || null;

    // Determine status based on status code
    let status = 'success';
    if (metadata.statusCode >= 400) {
      status = 'failure';
    }

    // Log the API access
    await AuditService.log({
      action: 'api.access',
      actor,
      companyId,
      resourceType: 'api',
      metadata,
      status
    });
  } catch (error) {
    // Don't throw - audit logging should not break the main flow
    console.error('Error in audit logger middleware:', error);
  }
}

/**
 * Helper function to log specific actions
 */
export async function logAction({
  action,
  actor,
  companyId,
  resourceType,
  resourceId,
  changes,
  metadata = {},
  status = 'success',
  errorMessage = null
}) {
  try {
    await AuditService.log({
      action,
      actor,
      companyId,
      resourceType,
      resourceId,
      changes,
      metadata,
      status,
      errorMessage
    });
  } catch (error) {
    console.error('Error logging action:', error);
  }
}

