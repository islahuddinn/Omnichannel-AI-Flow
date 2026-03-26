// src/app/api/auth/logout/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import AuthService from '../../../../services/auth/AuthService.js';
import AuditService from '../../../../services/audit/AuditService.js';
import jwt from 'jsonwebtoken';

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    let userId = null;
    let companyId = null;

    if (token) {
      // Verify token signature — reject forged tokens
      let decoded = null;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (verifyError) {
        // Token expired or invalid — still clear cookies but don't modify user state
        // Token expired or invalid — still clear cookies
        decoded = null;
      }

      if (decoded?.userId) {
        userId = decoded.userId;
        companyId = decoded.companyId;
        await AuthService.logout(decoded.userId, decoded.companyId);

        // Log logout
        await AuditService.log({
          action: 'user.logout',
          actor: userId,
          companyId: companyId,
          resourceType: 'user',
          resourceId: userId,
          metadata: {
            endpoint: '/api/auth/logout',
            method: 'POST',
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
            userAgent: request.headers.get('user-agent') || 'unknown'
          },
          status: 'success'
        });
      }
    }

    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully'
    });

    // Clear cookies
    response.cookies.delete('token');
    response.cookies.delete('refreshToken');

    return response;
  } catch (error) {
    // Still clear cookies even on error
    const response = NextResponse.json(
      { success: false, message: 'Logout failed' },
      { status: 500 }
    );
    response.cookies.delete('token');
    response.cookies.delete('refreshToken');
    return response;
  }
}
