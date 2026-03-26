// src/app/api/media/[...path]/route.js
/**
 * Media Proxy Route
 * Proxies S3 media files with proper CORS headers to avoid CORS issues
 */

import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME || process.env.AWS_S3_BUCKET;

export async function GET(request, { params }) {
  try {
    // ✅ Next.js 15: await params before using
    const resolvedParams = await params;
    // Reconstruct the S3 key from the path segments
    const key = resolvedParams.path.join('/');
    
    // ✅ Allow 'uploads/', 'webchat/', and 'media/' paths
    if (!key || (!key.startsWith('uploads/') && !key.startsWith('webchat/') && !key.startsWith('media/'))) {
      return NextResponse.json(
        { error: 'Invalid path' },
        { status: 400 }
      );
    }

    // Get range header for audio/video streaming
    const range = request.headers.get('range');
    
    // Prepare S3 get command
    const getObjectParams = {
      Bucket: BUCKET_NAME,
      Key: key,
    };

    // Add range if present
    if (range) {
      getObjectParams.Range = range;
    }

    const command = new GetObjectCommand(getObjectParams);
    const response = await s3Client.send(command);

    // Get content type from S3 metadata or infer from file extension
    const contentType = response.ContentType || getContentType(key);
    
    // Prepare response headers with CORS
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Range');
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    
    // Convert stream to buffer
    // AWS SDK v3 returns a Readable stream
    const stream = response.Body;
    const chunks = [];
    
    // Convert Readable stream to buffer
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    
    const buffer = Buffer.concat(chunks);
    
    // Handle range requests
    if (range && response.ContentRange) {
      headers.set('Content-Range', response.ContentRange);
      headers.set('Accept-Ranges', 'bytes');
      const statusCode = response.$metadata?.httpStatusCode || 206;
      
      return new NextResponse(buffer, {
        status: statusCode,
        headers,
      });
    }
    
    if (response.ContentLength) {
      headers.set('Content-Length', response.ContentLength.toString());
    }
    headers.set('Accept-Ranges', 'bytes');

    return new NextResponse(buffer, {
      status: 200,
      headers,
    });

  } catch (error) {
    console.error('❌ Media proxy error:', error);
    
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch media', details: error.message },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function getContentType(key) {
  const ext = key.split('.').pop()?.toLowerCase();
  const contentTypes = {
    'webm': 'audio/webm',
    'ogg': 'audio/ogg',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'mp4': 'video/mp4',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'pdf': 'application/pdf',
  };
  return contentTypes[ext || ''] || 'application/octet-stream';
}

