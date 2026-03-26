// src/app/api/mobile/enable/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth.js';
import { getTenantDB } from '@/config/database.js';
import ContactSchema from '@/models/schemas/Contact.js';
import MobileAuthService from '@/services/mobile/MobileAuthService.js';
import MobileEmailService from '@/services/mobile/MobileEmailService.js';

/**
 * POST /api/mobile/enable
 * Enable mobile app for a handyman contact
 * Requires: Company Admin or Super Admin authentication
 */
export async function POST(request) {
  try {
    // Verify authentication
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if user has admin role
    const userRole = auth.user.role;
    if (userRole !== 'company_admin' && userRole !== 'super_admin') {
      return NextResponse.json(
        { success: false, message: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { sfId, companyId } = body;

    if (!sfId || !companyId) {
      return NextResponse.json(
        { success: false, message: 'SF ID and Company ID are required' },
        { status: 400 }
      );
    }

    // Verify company access (company admin can only enable for their own company)
    if (userRole === 'company_admin' && auth.user.companyId?.toString() !== companyId) {
      return NextResponse.json(
        { success: false, message: 'Access denied to this company' },
        { status: 403 }
      );
    }

    // Get tenant database
    const tenantDB = await getTenantDB(companyId);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    // Find contact by SF_id
    const contact = await Contact.findOne({ SF_id: sfId });
    if (!contact) {
      return NextResponse.json(
        { success: false, message: 'Contact not found' },
        { status: 404 }
      );
    }

    // Verify contact is a Handyman
    if (contact.Contact_Type !== 'Handyman') {
      return NextResponse.json(
        { success: false, message: 'Mobile app can only be enabled for contacts with Contact_Type = "Handyman"' },
        { status: 400 }
      );
    }

    // Check if email exists
    if (!contact.email) {
      return NextResponse.json(
        { success: false, message: 'Contact must have an email address to enable mobile app' },
        { status: 400 }
      );
    }

    // Check if already enabled
    if (contact.mobileAppEnabled) {
      return NextResponse.json(
        { success: false, message: 'Mobile app is already enabled for this contact' },
        { status: 400 }
      );
    }

    // Generate temporary password
    const tempPassword = MobileAuthService.generateTempPassword();
    const hashedPassword = await MobileAuthService.hashPassword(tempPassword);

    // Set password expiration (30 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Update contact
    contact.mobileAppEnabled = true;
    contact.mobilePassword = hashedPassword;
    contact.mobilePasswordChanged = false;
    contact.mobilePasswordExpiresAt = expiresAt;
    await contact.save();

    // Send activation email
    const contactName = contact.name || contact.displayName || contact.firstName || 'Handyman';
    const language = contact.language || 'en';

    try {
      await MobileEmailService.sendActivationEmail(
        contact.email,
        tempPassword,
        contactName,
        language
      );
    } catch (emailError) {
      console.error('❌ Failed to send activation email:', emailError);
      // Don't fail the request if email fails, but log it
    }

    return NextResponse.json({
      success: true,
      message: 'Mobile app enabled successfully. Activation email sent.',
      data: {
        sfId: contact.SF_id,
        email: contact.email,
        mobileAppEnabled: true,
        passwordExpiresAt: expiresAt
      }
    });
  } catch (error) {
    console.error('❌ Enable mobile app error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to enable mobile app' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mobile/disable
 * Disable mobile app for a handyman contact
 * Requires: Company Admin or Super Admin authentication
 */
export async function PUT(request) {
  try {
    // Verify authentication
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if user has admin role
    const userRole = auth.user.role;
    if (userRole !== 'company_admin' && userRole !== 'super_admin') {
      return NextResponse.json(
        { success: false, message: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { sfId, companyId, action } = body;

    if (!sfId || !companyId) {
      return NextResponse.json(
        { success: false, message: 'SF ID and Company ID are required' },
        { status: 400 }
      );
    }

    // Verify company access
    if (userRole === 'company_admin' && auth.user.companyId?.toString() !== companyId) {
      return NextResponse.json(
        { success: false, message: 'Access denied to this company' },
        { status: 403 }
      );
    }

    // Get tenant database
    const tenantDB = await getTenantDB(companyId);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    // Find contact by SF_id
    const contact = await Contact.findOne({ SF_id: sfId });
    if (!contact) {
      return NextResponse.json(
        { success: false, message: 'Contact not found' },
        { status: 404 }
      );
    }

    if (action === 'disable') {
      // Disable mobile app
      contact.mobileAppEnabled = false;
      contact.mobileRefreshToken = undefined;
      await contact.save();

      return NextResponse.json({
        success: true,
        message: 'Mobile app disabled successfully',
        data: {
          sfId: contact.SF_id,
          mobileAppEnabled: false
        }
      });
    } else if (action === 'reset') {
      // Reset password (generate new temp password)
      if (!contact.mobileAppEnabled) {
        return NextResponse.json(
          { success: false, message: 'Mobile app is not enabled for this contact' },
          { status: 400 }
        );
      }

      const tempPassword = MobileAuthService.generateTempPassword();
      const hashedPassword = await MobileAuthService.hashPassword(tempPassword);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      contact.mobilePassword = hashedPassword;
      contact.mobilePasswordChanged = false;
      contact.mobilePasswordExpiresAt = expiresAt;
      contact.mobileRefreshToken = undefined; // Invalidate existing sessions
      await contact.save();

      // Send password reset email
      const contactName = contact.name || contact.displayName || contact.firstName || 'Handyman';
      const language = contact.language || 'en';

      try {
        await MobileEmailService.sendPasswordResetEmail(
          contact.email,
          tempPassword,
          contactName,
          language
        );
      } catch (emailError) {
        console.error('❌ Failed to send password reset email:', emailError);
      }

      return NextResponse.json({
        success: true,
        message: 'Password reset successfully. New password sent via email.',
        data: {
          sfId: contact.SF_id,
          passwordExpiresAt: expiresAt
        }
      });
    } else {
      return NextResponse.json(
        { success: false, message: 'Invalid action. Use "disable" or "reset"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('❌ Mobile app management error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Operation failed' },
      { status: 500 }
    );
  }
}

