// src/app/api/webchat/verify-pin-otp/route.js
/**
 * WebChat Verify PIN Reset OTP API
 * POST /api/webchat/verify-pin-otp - Verify OTP for PIN reset
 */

import { NextResponse } from 'next/server';
import WebChatOTPService from '@/services/webchat/WebChatOTPService';

export async function POST(request) {
  try {
    const { tenantId, identifier, otp } = await request.json();

    // Validate input
    if (!tenantId || !identifier || !otp) {
      return NextResponse.json(
        {
          success: false,
          message: 'Tenant ID, identifier (email/phone), and OTP are required'
        },
        { status: 400 }
      );
    }

    console.log(`🔍 Verifying WebChat PIN reset OTP for: ${identifier}`);

    // Verify OTP
    const result = await WebChatOTPService.verifyOTP(tenantId, identifier, otp, 'pin_reset');

    console.log(`✅ WebChat OTP verified for: ${identifier}`);
    
    // Return success response
    return NextResponse.json(
      {
        success: true,
        message: 'OTP verified successfully! You can now reset your PIN.',
        data: {
          identifier: result.identifier,
          contactId: result.contact._id.toString(),
          verified: true
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ Verify WebChat PIN OTP error:', error.message);
    
    // Return appropriate error messages
    if (error.message.includes('expired')) {
      return NextResponse.json(
        {
          success: false,
          message: 'This verification code has expired. Please request a new one.'
        },
        { status: 400 }
      );
    }

    if (error.message.includes('Too many failed attempts')) {
      return NextResponse.json(
        {
          success: false,
          message: 'Too many failed attempts. Please request a new verification code.'
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Invalid or expired verification code'
      },
      { status: 400 }
    );
  }
}

