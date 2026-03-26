// src/app/api/webchat/change-pin/route.js
/**
 * WebChat Change PIN API
 * POST /api/webchat/change-pin - Change PIN for authenticated user
 */

import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import WebChatSessionSchema from '@/models/schemas/WebChatSession';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getWebChatSecret } from '@/lib/auth/webchatSecret';

export async function POST(request) {
  try {
    const { currentPin, newPin } = await request.json();

    // Validate input
    if (!currentPin || !newPin) {
      return NextResponse.json(
        {
          success: false,
          message: 'Current PIN and new PIN are required'
        },
        { status: 400 }
      );
    }

    // Validate PIN format (4 digits)
    if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) {
      return NextResponse.json(
        {
          success: false,
          message: 'PIN must be exactly 4 digits'
        },
        { status: 400 }
      );
    }

    // Get token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        {
          success: false,
          message: 'Authentication required'
        },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, getWebChatSecret());
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid or expired token'
        },
        { status: 401 }
      );
    }

    const { tenantId, sessionId, contactId } = decoded;

    if (!tenantId || !sessionId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid token payload'
        },
        { status: 400 }
      );
    }

    console.log(`🔐 Changing WebChat PIN for session: ${sessionId}`);

    // Get tenant database
    const tenantDB = await getTenantDB(tenantId);
    const WebChatSession = tenantDB.models.WebChatSession || tenantDB.model('WebChatSession', WebChatSessionSchema);

    // Find session
    const session = await WebChatSession.findOne({ sessionId });
    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: 'Session not found'
        },
        { status: 404 }
      );
    }

    // Verify current PIN (bcrypt compare)
    const currentPinMatch = await bcrypt.compare(currentPin, session.pinHash);
    if (!currentPinMatch) {
      return NextResponse.json(
        {
          success: false,
          message: 'Current PIN is incorrect'
        },
        { status: 401 }
      );
    }

    // Hash new PIN (bcrypt with salt)
    const newPinHash = await bcrypt.hash(newPin, 10);

    // Update session PIN
    session.pinHash = newPinHash;
    await session.save();

    // If contactId exists, update all sessions for this contact
    if (contactId) {
      const allSessions = await WebChatSession.find({ contactId });
      for (const sess of allSessions) {
        sess.pinHash = newPinHash;
        await sess.save();
      }
    }

    console.log(`✅ WebChat PIN changed successfully for session ${sessionId}`);

    return NextResponse.json(
      {
        success: true,
        message: 'PIN changed successfully!'
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('❌ WebChat change PIN error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to change PIN. Please try again later.'
      },
      { status: 500 }
    );
  }
}

