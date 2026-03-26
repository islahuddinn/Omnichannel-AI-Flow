// src/app/api/webchat/notification-tunes/route.js
/**
 * WebChat Notification Tunes API
 * GET /api/webchat/notification-tunes - Get notification tunes
 * POST /api/webchat/notification-tunes - Upload notification tune
 * PUT /api/webchat/notification-tunes/select - Select notification tune
 * DELETE /api/webchat/notification-tunes/[tuneId] - Delete notification tune
 */

import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import ContactSchema from '@/models/schemas/Contact';
import jwt from 'jsonwebtoken';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getWebChatSecret } from '@/lib/auth/webchatSecret';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME || process.env.AWS_S3_BUCKET || 'omnichannel-attachments';

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

    const settings = contact.webchatSettings || {
      selectedNotificationTune: 'default',
      notificationTunes: []
    };

    return NextResponse.json({
      success: true,
      data: {
        selectedNotificationTune: settings.selectedNotificationTune || 'default',
        notificationTunes: settings.notificationTunes || []
      }
    });

  } catch (error) {
    console.error('❌ WebChat get notification tunes error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to get notification tunes'
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
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

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file');
    const name = formData.get('name') || 'Custom Tune';

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          message: 'File is required'
        },
        { status: 400 }
      );
    }

    // Validate file type (audio files only)
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Only audio files are allowed (MP3, WAV, OGG, WebM)'
        },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          success: false,
          message: 'File size must be less than 5MB'
        },
        { status: 400 }
      );
    }

    // Upload to S3
    const fileBuffer = await file.arrayBuffer();
    const fileName = `webchat/tunes/${contactId}/${Date.now()}_${file.name}`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: Buffer.from(fileBuffer),
      ContentType: file.type,
      ACL: 'public-read',
    }));

    const region = process.env.AWS_REGION || 'us-east-1';
    const fileUrl = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${fileName}`;

    // Get tenant database
    const tenantDB = await getTenantDB(tenantId);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    // Get contact
    const contact = await Contact.findById(contactId);
    if (!contact) {
      return NextResponse.json(
        {
          success: false,
          message: 'Contact not found'
        },
        { status: 404 }
      );
    }

    // Initialize webchatSettings if not exists
    if (!contact.webchatSettings) {
      contact.webchatSettings = {
        selectedNotificationTune: 'default',
        notificationTunes: []
      };
    }

    // Add new tune
    contact.webchatSettings.notificationTunes.push({
      name: name,
      url: fileUrl,
      uploadedAt: new Date()
    });

    await contact.save();

    console.log(`✅ Notification tune uploaded for contact ${contactId}`);

    return NextResponse.json({
      success: true,
      message: 'Notification tune uploaded successfully!',
      data: {
        tune: {
          name: name,
          url: fileUrl,
          uploadedAt: new Date()
        }
      }
    });

  } catch (error) {
    console.error('❌ WebChat upload notification tune error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to upload notification tune'
      },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const { tuneUrl } = await request.json();

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
    const contact = await Contact.findById(contactId);
    if (!contact) {
      return NextResponse.json(
        {
          success: false,
          message: 'Contact not found'
        },
        { status: 404 }
      );
    }

    // Initialize webchatSettings if not exists
    if (!contact.webchatSettings) {
      contact.webchatSettings = {
        selectedNotificationTune: 'default',
        notificationTunes: []
      };
    }

    // Validate tune URL (must be 'default' or in notificationTunes)
    if (tuneUrl !== 'default') {
      const tuneExists = contact.webchatSettings.notificationTunes.some(
        tune => tune.url === tuneUrl
      );
      if (!tuneExists) {
        return NextResponse.json(
          {
            success: false,
            message: 'Invalid notification tune'
          },
          { status: 400 }
        );
      }
    }

    // Update selected tune
    contact.webchatSettings.selectedNotificationTune = tuneUrl;
    await contact.save();

    console.log(`✅ Notification tune selected for contact ${contactId}: ${tuneUrl}`);

    return NextResponse.json({
      success: true,
      message: 'Notification tune selected successfully!',
      data: {
        selectedNotificationTune: tuneUrl
      }
    });

  } catch (error) {
    console.error('❌ WebChat select notification tune error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to select notification tune'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    // Get tuneId from URL search params
    const { searchParams } = new URL(request.url);
    const tuneId = searchParams.get('tuneId');

    if (!tuneId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Tune ID is required'
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
    const contact = await Contact.findById(contactId);
    if (!contact) {
      return NextResponse.json(
        {
          success: false,
          message: 'Contact not found'
        },
        { status: 404 }
      );
    }

    // Initialize webchatSettings if not exists
    if (!contact.webchatSettings) {
      contact.webchatSettings = {
        selectedNotificationTune: 'default',
        notificationTunes: []
      };
    }

    // Find the tune to delete
    const tuneToDelete = contact.webchatSettings.notificationTunes.find(
      (tune) => tune._id && tune._id.toString() === tuneId
    );

    if (!tuneToDelete) {
      return NextResponse.json(
        {
          success: false,
          message: 'Notification tune not found'
        },
        { status: 404 }
      );
    }

    // Delete from S3
    try {
      // Extract S3 key from URL
      // Format: https://bucket.s3.region.amazonaws.com/webchat/tunes/contactId/filename
      const tuneUrl = tuneToDelete.url;
      if (tuneUrl && tuneUrl.includes('s3.') && tuneUrl.includes('amazonaws.com')) {
        try {
          const urlObj = new URL(tuneUrl);
          const pathParts = urlObj.pathname.split('/').filter(p => p);
          if (pathParts.length > 0) {
            const s3Key = pathParts.join('/');
            
            await s3Client.send(new DeleteObjectCommand({
              Bucket: BUCKET_NAME,
              Key: s3Key,
            }));
            
            console.log(`✅ Deleted notification tune from S3: ${s3Key}`);
          }
        } catch (s3Error) {
          console.warn('⚠️ Failed to delete from S3 (non-critical):', s3Error);
          // Continue with database deletion even if S3 deletion fails
        }
      }
    } catch (s3Error) {
      console.warn('⚠️ Error deleting from S3 (non-critical):', s3Error);
      // Continue with database deletion even if S3 deletion fails
    }

    // Remove from database
    contact.webchatSettings.notificationTunes = contact.webchatSettings.notificationTunes.filter(
      (tune) => !(tune._id && tune._id.toString() === tuneId)
    );

    // If the deleted tune was the selected one, reset to default
    if (contact.webchatSettings.selectedNotificationTune === tuneToDelete.url) {
      contact.webchatSettings.selectedNotificationTune = 'default';
    }

    await contact.save();

    console.log(`✅ Notification tune deleted for contact ${contactId}: ${tuneId}`);

    return NextResponse.json({
      success: true,
      message: 'Notification tune deleted successfully!',
      data: {
        selectedNotificationTune: contact.webchatSettings.selectedNotificationTune,
        notificationTunes: contact.webchatSettings.notificationTunes
      }
    });

  } catch (error) {
    console.error('❌ WebChat delete notification tune error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to delete notification tune'
      },
      { status: 500 }
    );
  }
}

