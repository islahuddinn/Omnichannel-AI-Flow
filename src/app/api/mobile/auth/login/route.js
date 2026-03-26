// src/app/api/mobile/auth/login/route.js
import { NextResponse } from 'next/server';
import MobileAuthService from '../../../../../services/mobile/MobileAuthService.js';

/**
 * POST /api/mobile/auth/login
 * Login with email and temporary password
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password, companyId } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: 'Email and password are required' },
        { status: 400 }
      );
    }

    // companyId is now optional - will be automatically found from email if not provided
    const result = await MobileAuthService.login(email, password, companyId || null);

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Mobile login error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Login failed' },
      { status: 401 }
    );
  }
}

