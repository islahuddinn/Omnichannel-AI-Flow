// src/app/api/mobile/auth/refresh/route.js
import { NextResponse } from 'next/server';
import MobileAuthService from '../../../../../services/mobile/MobileAuthService.js';

/**
 * POST /api/mobile/auth/refresh
 * Refresh access token using refresh token
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { refreshToken, companyId } = body;

    if (!refreshToken) {
      return NextResponse.json(
        { success: false, message: 'Refresh token is required' },
        { status: 400 }
      );
    }

    if (!companyId) {
      return NextResponse.json(
        { success: false, message: 'Company ID is required' },
        { status: 400 }
      );
    }

    const result = await MobileAuthService.refreshToken(refreshToken, companyId);

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Refresh token error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to refresh token' },
      { status: 401 }
    );
  }
}

