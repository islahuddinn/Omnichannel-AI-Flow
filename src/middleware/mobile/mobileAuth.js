// src/middleware/mobile/mobileAuth.js
import MobileAuthService from '../../services/mobile/MobileAuthService.js';

/**
 * Middleware to verify mobile app authentication token
 */
export async function verifyMobileAuth(request, companyId) {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Authorization token required');
    }

    const token = authHeader.substring(7);
    const authResult = await MobileAuthService.verifyTokenAndGetContact(token, companyId);

    return {
      sfId: authResult.sfId,
      email: authResult.email,
      companyId: authResult.companyId,
      contact: authResult.contact
    };
  } catch (error) {
    throw new Error(`Authentication failed: ${error.message}`);
  }
}

/**
 * Middleware wrapper for Next.js API routes
 */
export function requireMobileAuth(handler) {
  return async (request, context) => {
    try {
      // Get companyId from request (should be set by tenant middleware or query param)
      const { searchParams } = new URL(request.url);
      const companyId = searchParams.get('companyId') || request.headers.get('x-company-id');

      if (!companyId) {
        return Response.json(
          { success: false, message: 'Company ID required' },
          { status: 400 }
        );
      }

      const auth = await verifyMobileAuth(request, companyId);
      
      // Attach auth info to request
      request.mobileAuth = auth;

      return handler(request, context);
    } catch (error) {
      return Response.json(
        { success: false, message: error.message || 'Authentication failed' },
        { status: 401 }
      );
    }
  };
}

