// src/app/api/upload/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { getWebChatSecret } from '@/lib/auth/webchatSecret';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME || process.env.AWS_S3_BUCKET;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'audio/mpeg',
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

/**
 * Verify token - supports regular auth tokens, mobile auth tokens, and webchat tokens
 */
async function verifyToken(request) {
  let token;
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    const cookie = request.cookies.get('token');
    token = cookie ? cookie.value : null;
  }

  if (!token) {
    return { success: false, message: 'Authentication required' };
  }

  // Try regular auth token first
  try {
    const authResult = await verifyAuth(request);
    if (authResult.success) {
      return authResult;
    }
  } catch (error) {
    // Continue to try other token types
  }

  // Try mobile auth token (signed with same JWT_SECRET but has type: 'mobile_access')
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type === 'mobile_access' && decoded.companyId) {
      return {
        success: true,
        user: {
          userId: decoded.sfId,
          companyId: decoded.companyId,
          tenantId: decoded.companyId,
          email: decoded.email,
          isMobile: true,
        }
      };
    }
  } catch (error) {
    // Continue to try webchat token
  }

  // Try webchat token
  try {
    const decoded = jwt.verify(token, getWebChatSecret());
    // Webchat tokens have different structure - extract tenantId from decoded payload
    // The token includes: sessionId, tenantId, contactId, conversationId, etc.
    if (!decoded.tenantId) {
      console.error('Webchat token missing tenantId:', decoded);
      return { success: false, message: 'Invalid webchat token: missing tenantId' };
    }
    return {
      success: true,
      user: {
        userId: decoded.sessionId || decoded.contactId || decoded._id,
        tenantId: decoded.tenantId,
        companyId: decoded.tenantId, // Use tenantId as companyId for backward compatibility
        sessionId: decoded.sessionId,
        contactId: decoded.contactId,
        // Mark as webchat user
        isWebchat: true,
      }
    };
  } catch (error) {
    console.error('Webchat token verification error:', error);
    return { success: false, message: 'Invalid or expired token' };
  }
}

export async function POST(request) {
  try {
    // Verify authentication (supports both regular and webchat tokens)
    const authResult = await verifyToken(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.message || 'Unauthorized' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 50MB limit' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'File type not allowed' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const fileExtension = file.name.split('.').pop();
    const filename = `${uuidv4()}.${fileExtension}`;
    // Handle both tenantId and companyId (for backward compatibility)
    const tenantId = authResult.user.tenantId || authResult.user.companyId || 'default';
    const key = `uploads/${tenantId}/${filename}`;

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to S3
    const uploadCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      ACL: 'public-read',
    });

    await s3Client.send(uploadCommand);

    // Generate public URL (use AWS_REGION from env)
    const region = process.env.AWS_REGION || 'us-east-1';
    const url = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;

    // Generate blur placeholder for images (tiny base64 thumbnail for LQIP)
    let blurDataUrl = null;
    let width = null;
    let height = null;
    if (file.type.startsWith('image/') && !file.type.includes('svg')) {
      try {
        const sharp = (await import('sharp')).default;
        const metadata = await sharp(buffer).metadata();
        width = metadata.width;
        height = metadata.height;

        // Generate a tiny 16px wide blurred thumbnail as base64
        const blurBuffer = await sharp(buffer)
          .resize(16, null, { withoutEnlargement: true })
          .blur(2)
          .jpeg({ quality: 40 })
          .toBuffer();
        blurDataUrl = `data:image/jpeg;base64,${blurBuffer.toString('base64')}`;
      } catch (blurErr) {
        // Non-critical — skip blur generation
        console.warn('⚠️ Blur placeholder generation failed:', blurErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        url,
        filename: file.name,
        size: file.size,
        mimeType: file.type,
        key,
        ...(blurDataUrl && { blurDataUrl }),
        ...(width && { width }),
        ...(height && { height }),
      }
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed', details: error.message },
      { status: 500 }
    );
  }
}