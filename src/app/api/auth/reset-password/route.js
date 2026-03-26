// src/app/api/auth/reset-password/route.js
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import OTPService from '../../../../services/auth/OTPService.js';
import EmailService from '../../../../services/email/EmailService.js';
import { applyRateLimit, AUTH_RATE_LIMITS } from '../../../../middleware/rateLimit.js';

const COMMON_PASSWORDS = [
  'password', '12345678', '123456789', '1234567890', 'qwerty123',
  'password1', 'iloveyou', 'sunshine1', 'princess1', 'football1',
  'charlie1', 'shadow12', 'master12', 'dragon12', 'monkey123',
  'letmein1', 'abc12345', 'mustang1', 'michael1', 'password123',
];

export async function POST(request) {
  // Rate limit: 5 attempts per 15 minutes per IP
  const rateLimitResponse = applyRateLimit(request, AUTH_RATE_LIMITS.resetPassword);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { email, otp, newPassword } = await request.json();

    if (!email || !otp || !newPassword) {
      return NextResponse.json(
        { success: false, message: 'Email, OTP, and new password are required' },
        { status: 400 }
      );
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, message: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    if (!/[a-z]/.test(newPassword)) {
      return NextResponse.json(
        { success: false, message: 'Password must contain at least one lowercase letter' },
        { status: 400 }
      );
    }

    if (!/[A-Z]/.test(newPassword)) {
      return NextResponse.json(
        { success: false, message: 'Password must contain at least one uppercase letter' },
        { status: 400 }
      );
    }

    if (!/\d/.test(newPassword)) {
      return NextResponse.json(
        { success: false, message: 'Password must contain at least one number' },
        { status: 400 }
      );
    }

    if (!/[^a-zA-Z0-9]/.test(newPassword)) {
      return NextResponse.json(
        { success: false, message: 'Password must contain at least one special character' },
        { status: 400 }
      );
    }

    if (COMMON_PASSWORDS.includes(newPassword.toLowerCase())) {
      return NextResponse.json(
        { success: false, message: 'This password is too common. Please choose a stronger password.' },
        { status: 400 }
      );
    }

    // Verify OTP (includes brute force protection with attempt limiting)
    await OTPService.verifyOTP(email, otp, 'password_reset');

    const user = await OTPService.getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password directly (bypassing pre-save hook since already hashed)
    await OTPService.User.updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword } }
    );

    // Mark OTP as used
    await OTPService.initModels();
    await OTPService.OTP.updateOne(
      { email: email.toLowerCase(), otp, type: 'password_reset', isUsed: false },
      { $set: { isUsed: true } }
    );

    // Send success email
    try {
      await EmailService.sendPasswordResetSuccessEmail(
        email,
        `${user.firstName} ${user.lastName}`
      );
    } catch (emailError) {
      console.error('[Auth] Failed to send reset success email:', emailError?.message || emailError);
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Password reset successfully. You can now login with your new password.'
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Auth] Reset password error:', error?.message || error);

    if (error.message.includes('expired')) {
      return NextResponse.json(
        { success: false, message: 'Verification code has expired. Please start the process again.' },
        { status: 400 }
      );
    }

    if (error.message.includes('Too many failed attempts')) {
      return NextResponse.json(
        { success: false, message: 'Too many failed attempts. Please request a new verification code.' },
        { status: 429 }
      );
    }

    if (error.message.includes('Invalid or expired OTP')) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired verification code.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: 'An error occurred while resetting password. Please try again.' },
      { status: 500 }
    );
  }
}
