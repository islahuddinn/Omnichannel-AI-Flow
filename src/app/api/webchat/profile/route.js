// src/app/api/webchat/profile/route.js
/**
 * WebChat Profile API
 * GET /api/webchat/profile - Get profile
 * PUT /api/webchat/profile - Update profile (name only, PIN via separate endpoint)
 */

import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import ContactSchema from '@/models/schemas/Contact';
import jwt from 'jsonwebtoken';
import { getWebChatSecret } from '@/lib/auth/webchatSecret';

export async function GET(request) {
  try {
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

    const { tenantId, contactId } = decoded;

    if (!tenantId || !contactId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid token payload'
        },
        { status: 400 }
      );
    }

    // Get tenant database
    const tenantDB = await getTenantDB(tenantId);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    // Get contact
    const contact = await Contact.findById(contactId).lean();
    if (!contact) {
      return NextResponse.json(
        {
          success: false,
          message: 'Contact not found'
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        webchatSettings: contact.webchatSettings || {
          selectedNotificationTune: 'default',
          notificationTunes: []
        }
      }
    });

  } catch (error) {
    console.error('❌ WebChat get profile error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to get profile'
      },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
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

    const { tenantId, contactId } = decoded;

    if (!tenantId || !contactId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid token payload'
        },
        { status: 400 }
      );
    }

    // ✅ Name cannot be changed - return error
    return NextResponse.json(
      {
        success: false,
        message: 'Name cannot be changed. Only PIN and notification settings can be updated.'
      },
      { status: 403 }
    );

  } catch (error) {
    console.error('❌ WebChat update profile error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to update profile'
      },
      { status: 500 }
    );
  }
}

