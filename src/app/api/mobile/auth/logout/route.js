// src/app/api/mobile/auth/logout/route.js
import { NextResponse } from 'next/server';
import MobileAuthService from '../../../../../services/mobile/MobileAuthService.js';
import { verifyMobileAuth } from '../../../../../middleware/mobile/mobileAuth.js';

/**
 * POST /api/mobile/auth/logout
 * Logout and invalidate refresh token
 * CompanyId is optional - will be extracted from token if not provided
 */
export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    let companyId = searchParams.get('companyId');
    
    // Try to get from body if not in query params
    if (!companyId) {
      try {
        const body = await request.json();
        companyId = body.companyId;
      } catch (e) {
        // Body might be empty, that's okay
      }
    }

    // If companyId not provided, try to extract from token
    if (!companyId) {
      try {
        const authHeader = request.headers.get('authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const jwt = await import('jsonwebtoken');
          const decoded = jwt.default.decode(token);
          companyId = decoded?.companyId;
        }
      } catch (error) {
        console.warn('⚠️ Could not extract companyId from token:', error);
      }
    }

    if (!companyId) {
      return NextResponse.json(
        { success: false, message: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Verify authentication
    const auth = await verifyMobileAuth(request, companyId);
    const sfId = auth.sfId;

    await MobileAuthService.logout(sfId, companyId);

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('❌ Logout error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Logout failed' },
      { status: 400 }
    );
  }
}

