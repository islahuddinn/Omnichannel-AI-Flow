// src/app/api/auth/forgot-password/route.js
import { NextResponse } from 'next/server';
import OTPService from '../../../../services/auth/OTPService.js';
import EmailService from '../../../../services/email/EmailService.js';
import { applyRateLimit, AUTH_RATE_LIMITS } from '../../../../middleware/rateLimit.js';

export async function POST(request) {
  // Rate limit: 5 attempts per 15 minutes per IP
  const rateLimitResponse = applyRateLimit(request, AUTH_RATE_LIMITS.forgotPassword);
  if (rateLimitResponse) return rateLimitResponse;

  const GENERIC_RESPONSE = {
    success: true,
    message: 'If an account with that email exists, a verification code has been sent'
  };

  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { success: false, message: 'Email is required' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, message: 'Please provide a valid email address' },
        { status: 400 }
      );
    }

    const emailExists = await OTPService.checkEmailExists(email);

    if (!emailExists) {
      // Don't reveal if email exists or not
      return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
    }

    const otp = await OTPService.createOTP(email, 'password_reset');

    try {
      await EmailService.sendOTPEmail(email, otp);
    } catch (emailError) {
      console.error('[Auth] Failed to send OTP email:', emailError?.message || emailError);
      // Still return success to prevent email enumeration
      return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
    }

    return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
  } catch (error) {
    console.error('[Auth] Forgot password error:', error?.message || error);
    // Always return generic message to prevent email enumeration
    return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
  }
}
