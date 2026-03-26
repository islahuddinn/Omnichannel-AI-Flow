// src/app/api/mobile/upload/route.js
// General-purpose file upload endpoint for mobile app (voice, images, documents).
// Uses verifyMobileAuth middleware for proper mobile token validation.

import { NextResponse } from 'next/server';
import { verifyMobileAuth } from '@/middleware/mobile/mobileAuth.js';
import { uploadToS3 } from '@/lib/storage/s3.js';
import { v4 as uuidv4 } from 'uuid';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'audio/mpeg',
  'audio/mp4',
  'audio/m4a',
  'audio/aac',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/webm;codecs=opus',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export async function POST(request) {
  try {
    // Get companyId from query params
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'companyId query parameter is required' },
        { status: 400 }
      );
    }

    // Verify mobile auth token
    const auth = await verifyMobileAuth(request, companyId);

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 50MB limit' },
        { status: 400 }
      );
    }

    // Validate file type
    const fileType = file.type || formData.get('type') || 'application/octet-stream';
    if (!ALLOWED_TYPES.includes(fileType)) {
      return NextResponse.json(
        { success: false, error: `File type not allowed: ${fileType}` },
        { status: 400 }
      );
    }

    // Generate unique filename
    const fileExtension = file.name?.split('.').pop() || 'bin';
    const filename = `${uuidv4()}.${fileExtension}`;
    const tenantId = auth.companyId || companyId;
    const key = `uploads/${tenantId}/${filename}`;

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to S3
    const { url } = await uploadToS3(buffer, key, fileType);

    return NextResponse.json({
      success: true,
      data: {
        url,
        filename: file.name,
        size: file.size,
        mimeType: fileType,
        key,
      },
    });
  } catch (error) {
    console.error('Mobile upload error:', error);

    // Auth errors from verifyMobileAuth
    if (error.message?.includes('Authentication failed') || error.message?.includes('Authorization token required')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Upload failed', details: error.message },
      { status: 500 }
    );
  }
}
