// src/app/api/webchat/reset-pin/route.js
/**
 * WebChat Reset PIN API
 * POST /api/webchat/reset-pin - Reset PIN after OTP verification
 */

import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import WebChatOTPService from '@/services/webchat/WebChatOTPService';
import WebChatSessionSchema from '@/models/schemas/WebChatSession';
import WebChatOTPSchema from '@/models/schemas/WebChatOTP';
import ContactSchema from '@/models/schemas/Contact';
import bcrypt from 'bcryptjs';

export async function POST(request) {
  try {
    const { tenantId, identifier, otp, newPin } = await request.json();

    // Validate input
    if (!tenantId || !identifier || !otp || !newPin) {
      return NextResponse.json(
        {
          success: false,
          message: 'Tenant ID, identifier, OTP, and new PIN are required'
        },
        { status: 400 }
      );
    }

    // Validate PIN format (4 digits)
    if (!/^\d{4}$/.test(newPin)) {
      return NextResponse.json(
        {
          success: false,
          message: 'PIN must be exactly 4 digits'
        },
        { status: 400 }
      );
    }

    console.log(`🔐 Resetting WebChat PIN for: ${identifier}`);

    // Get tenant database
    const tenantDB = await getTenantDB(tenantId);
    const WebChatOTP = tenantDB.models.WebChatOTP || tenantDB.model('WebChatOTP', WebChatOTPSchema);
    const WebChatSession = tenantDB.models.WebChatSession || tenantDB.model('WebChatSession', WebChatSessionSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    // Check OTP exists and is valid
    const otpDoc = await WebChatOTP.findOne({
      identifier: identifier.toLowerCase(),
      otp,
      type: 'pin_reset'
    });

    if (!otpDoc) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid or expired verification code. Please start the process again.'
        },
        { status: 400 }
      );
    }

    // Check if OTP has expired
    if (new Date() > otpDoc.expiresAt) {
      await WebChatOTP.updateOne(
        { _id: otpDoc._id },
        { $set: { isUsed: true } }
      );
      return NextResponse.json(
        {
          success: false,
          message: 'Verification code has expired. Please start the process again.'
        },
        { status: 400 }
      );
    }

    // Check if already used
    if (otpDoc.isUsed) {
      return NextResponse.json(
        {
          success: false,
          message: 'This verification code has already been used. Please request a new one.'
        },
        { status: 400 }
      );
    }

    // Get contact
    const contact = await WebChatOTPService.getContactByIdentifier(tenantId, identifier);
    if (!contact) {
      return NextResponse.json(
        {
          success: false,
          message: 'Contact not found'
        },
        { status: 404 }
      );
    }

    // Hash new PIN (bcrypt with salt)
    const pinHash = await bcrypt.hash(newPin, 10);

    // Update all WebChat sessions for this contact with new PIN
    const sessions = await WebChatSession.find({ contactId: contact._id });
    for (const session of sessions) {
      session.pinHash = pinHash;
      await session.save();
    }

    // Mark OTP as used
    await WebChatOTP.updateOne(
      { _id: otpDoc._id },
      { $set: { isUsed: true } }
    );

    console.log(`✅ WebChat PIN reset successfully for contact ${contact._id}`);

    return NextResponse.json(
      {
        success: true,
        message: 'PIN reset successfully! You can now use your new PIN to access your chat.'
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('❌ WebChat reset PIN error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to reset PIN. Please try again later.'
      },
      { status: 500 }
    );
  }
}

