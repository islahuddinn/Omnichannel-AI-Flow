// src/app/api/mobile/auth/reset-password/route.js
import { NextResponse } from 'next/server';
import MobileAuthService from '../../../../../services/mobile/MobileAuthService.js';
import MobileEmailService from '../../../../../services/mobile/MobileEmailService.js';
import { verifyMobileAuth } from '../../../../../middleware/mobile/mobileAuth.js';

/**
 * POST /api/mobile/auth/reset-password
 * Request password reset (generates new temp password and sends email)
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { companyId } = body;

    if (!companyId) {
      return NextResponse.json(
        { success: false, message: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Verify authentication
    const auth = await verifyMobileAuth(request, companyId);
    const contact = auth.contact;

    // Generate new temporary password
    const { tempPassword, expiresAt } = await MobileAuthService.resetPassword(
      contact._id.toString(),
      companyId
    );

    // Send email with new password
    const contactName = contact.name || contact.displayName || contact.firstName || 'Handyman';
    const language = contact.language || 'en';
    
    await MobileEmailService.sendPasswordResetEmail(
      contact.email,
      tempPassword,
      contactName,
      language
    );

    return NextResponse.json({
      success: true,
      message: 'Password reset email sent successfully'
    });
  } catch (error) {
    console.error('❌ Reset password error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to reset password' },
      { status: 400 }
    );
  }
}

