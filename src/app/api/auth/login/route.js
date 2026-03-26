// src/app/api/auth/login/route.js
import { NextResponse } from 'next/server';
import AuthService from '../../../../services/auth/AuthService.js';
import AuditService from '../../../../services/audit/AuditService.js';
import { applyRateLimit, AUTH_RATE_LIMITS } from '../../../../middleware/rateLimit.js';

export async function POST(request) {
  // Rate limit: 10 attempts per 15 minutes per IP
  const rateLimitResponse = applyRateLimit(request, AUTH_RATE_LIMITS.login);
  if (rateLimitResponse) return rateLimitResponse;

  let userEmail = null;
  let userId = null;
  let companyId = null;

  try {
    const { email, password } = await request.json();
    userEmail = email;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email and password required' },
        { status: 400 }
      );
    }

    const result = await AuthService.login(email, password);
    userId = result.user.id;
    companyId = result.user.companyId;

    // Log successful login
    await AuditService.log({
      action: 'user.login',
      actor: userId,
      companyId: companyId,
      resourceType: 'user',
      resourceId: userId,
      metadata: {
        endpoint: '/api/auth/login',
        method: 'POST',
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown'
      },
      status: 'success'
    });

    // Return user + accessToken (needed for Socket.IO auth)
    // refreshToken stays in httpOnly cookie only — never exposed to JS
    const response = NextResponse.json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken
      }
    });

    // Set secure HTTP-only cookies
    response.cookies.set('token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    });

    response.cookies.set('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 // 30 days
    });

    return response;
  } catch (error) {
    console.error('[Auth] Login failed:', error?.message || error);

    // Log failed login attempt
    try {
      await AuditService.log({
        action: 'user.login_failed',
        actor: null,
        companyId: null,
        resourceType: 'user',
        metadata: {
          endpoint: '/api/auth/login',
          method: 'POST',
          ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown'
        },
        status: 'failure'
      });
    } catch (auditError) {
      console.error('[Auth] Audit log failed:', auditError?.message || auditError);
    }

    // Generic error message — never leak internal error details
    return NextResponse.json(
      { success: false, message: 'Invalid email or password' },
      { status: 401 }
    );
  }
}
