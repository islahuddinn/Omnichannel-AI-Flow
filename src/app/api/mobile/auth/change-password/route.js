// src/app/api/mobile/auth/change-password/route.js
import { NextResponse } from 'next/server';
import MobileAuthService from '../../../../../services/mobile/MobileAuthService.js';
import { verifyMobileAuth } from '../../../../../middleware/mobile/mobileAuth.js';

/**
 * POST /api/mobile/auth/change-password
 * Change password (first time or reset)
 * oldPassword is optional for first-time change from temporary password
 * CompanyId is optional - will be extracted from token if not provided
 */
export async function POST(request) {
  try {
    const body = await request.json();
    let { oldPassword, newPassword, companyId } = body;

    if (!newPassword) {
      return NextResponse.json(
        { success: false, message: 'New password is required' },
        { status: 400 }
      );
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

    // oldPassword can be undefined/null for first-time change from temporary password
    // The service will handle this case
    const result = await MobileAuthService.changePassword(
      sfId,
      oldPassword || undefined, // Convert null to undefined
      newPassword,
      companyId
    );

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Change password error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to change password' },
      { status: 400 }
    );
  }
}

