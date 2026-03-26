// src/middleware/tenant.js
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET;

export const getTenantContext = async (request) => {
  try {
    let token;
    
    // ✅ Check Authorization header first (for Bearer token from Postman/API clients)
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      // ✅ Fallback to cookies (for browser requests)
      const cookieStore = await cookies();
      token = cookieStore.get('token')?.value;
    }

    if (!token) {
      throw new Error('Authentication required');
    }

    // Use jose library for Edge runtime compatibility
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload: decoded } = await jwtVerify(token, secret);

    if (!decoded.companyId && decoded.role !== 'super_admin') {
      throw new Error('Tenant context not available');
    }

    return {
      tenantId: decoded.companyId,
      tenantDatabaseName: decoded.tenantDatabaseName,
      userId: decoded.userId,
      role: decoded.role
    };
  } catch (error) {
    throw new Error('Tenant context not initialized');
  }
};