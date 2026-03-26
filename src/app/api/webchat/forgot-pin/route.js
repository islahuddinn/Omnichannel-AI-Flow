// src/app/api/webchat/forgot-pin/route.js
/**
 * WebChat Forgot PIN API
 * POST /api/webchat/forgot-pin - Request PIN reset OTP
 */

import { NextResponse } from 'next/server';
import { getTenantDB, getMasterDB } from '@/config/database';
import WebChatOTPService from '@/services/webchat/WebChatOTPService';
import EmailService from '@/services/email/EmailService';
import CompanySchema from '@/models/schemas/Company';
import ContactSchema from '@/models/schemas/Contact';

export async function POST(request) {
  try {
    const { email } = await request.json();

    // Validate input - email is required
    if (!email) {
      return NextResponse.json(
        {
          success: false,
          message: 'Email address is required'
        },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Please provide a valid email address'
        },
        { status: 400 }
      );
    }

    const identifier = email.toLowerCase();

    console.log(`🔐 WebChat forgot PIN request for: ${identifier}`);

    // Resolve tenant from identifier (contact)
    // We need to search across tenants to find the contact
    const masterDB = await getMasterDB();
    const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
    const companies = await Company.find({ status: 'active' }).lean();

    let tenantId = null;
    let contact = null;

    // Search across tenants to find contact by email
    for (const company of companies) {
      try {
        const tenantDB = await getTenantDB(company._id.toString());
        const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
        
        // Find contact by email
        contact = await Contact.findOne({ email: identifier }).lean();

        if (contact) {
          tenantId = company._id.toString();
          break;
        }
      } catch (err) {
        console.error(`Error checking tenant ${company._id}:`, err.message);
        continue;
      }
    }

    if (!tenantId || !contact) {
      // Don't reveal if contact exists or not (security best practice)
      return NextResponse.json(
        {
          success: true,
          message: 'If an account with that email exists, a verification code has been sent'
        },
        { status: 200 }
      );
    }

    // Generate and save OTP in tenant database
    const { otp } = await WebChatOTPService.createOTP(tenantId, identifier, 'pin_reset');
    
    // Send OTP via email
    try {
      await EmailService.sendOTPEmail(email, otp, contact.name || 'User');
    } catch (emailError) {
      console.error('❌ Failed to send email:', emailError.message);
      // Still return success to prevent email enumeration
      return NextResponse.json(
        {
          success: true,
          message: 'If an account with that email exists, a verification code has been sent'
        },
        { status: 200 }
      );
    }

    console.log(`✅ WebChat OTP sent to ${identifier} in tenant ${tenantId}`);

    return NextResponse.json(
      {
        success: true,
        message: 'If an account with that email exists, a verification code has been sent',
        data: {
          tenantId // Include tenantId for subsequent requests
        }
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('❌ WebChat forgot PIN error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to process request. Please try again later.'
      },
      { status: 500 }
    );
  }
}

