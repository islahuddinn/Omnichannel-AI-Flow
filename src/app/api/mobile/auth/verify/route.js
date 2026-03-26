// src/app/api/mobile/auth/verify/route.js
import { NextResponse } from 'next/server';
import { verifyMobileAuth } from '../../../../../middleware/mobile/mobileAuth.js';

/**
 * GET /api/mobile/auth/verify
 * Verify token validity
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { success: false, message: 'Company ID is required' },
        { status: 400 }
      );
    }

    const auth = await verifyMobileAuth(request, companyId);

    return NextResponse.json({
      success: true,
      data: {
        sfId: auth.sfId,
        email: auth.email,
        companyId: auth.companyId
      }
    });
  } catch (error) {
    console.error('❌ Verify token error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Token verification failed' },
      { status: 401 }
    );
  }
}

