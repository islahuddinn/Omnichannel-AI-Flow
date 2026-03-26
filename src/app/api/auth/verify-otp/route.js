// src/app/api/auth/verify-otp/route.js
import { NextResponse } from 'next/server';
import OTPService from '../../../../services/auth/OTPService.js';
import { applyRateLimit, AUTH_RATE_LIMITS } from '../../../../middleware/rateLimit.js';

export async function POST(request) {
  // Rate limit: 10 attempts per 15 minutes per IP
  const rateLimitResponse = applyRateLimit(request, AUTH_RATE_LIMITS.verifyOtp);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { email, otp } = await request.json();

    if (!email || !otp) {
      return NextResponse.json(
        { success: false, message: 'Email and OTP are required' },
        { status: 400 }
      );
    }

    // Validate OTP format (6 digits only)
    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { success: false, message: 'Invalid OTP format' },
        { status: 400 }
      );
    }

    const result = await OTPService.verifyOTP(email, otp, 'password_reset');

    return NextResponse.json(
      {
        success: true,
        message: 'OTP verified successfully! You can now reset your password.',
        data: {
          email: result.email,
          verified: true
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Auth] OTP verification failed:', error?.message || error);

    if (error.message.includes('expired')) {
      return NextResponse.json(
        { success: false, message: 'This verification code has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    if (error.message.includes('Too many failed attempts')) {
      return NextResponse.json(
        { success: false, message: 'Too many failed attempts. Please request a new verification code.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { success: false, message: 'Invalid or expired verification code' },
      { status: 400 }
    );
  }
}
