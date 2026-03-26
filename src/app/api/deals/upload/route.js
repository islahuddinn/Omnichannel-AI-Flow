// src/app/api/deals/upload/route.js
/**
 * Deal CSV Upload API
 * POST /api/deals/upload - Upload CSV file to temporary storage
 * This endpoint handles large file uploads by streaming to disk
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { Readable } from 'stream';
import busboy from 'busboy';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ✅ Route segment config - attempt to handle large bodies
// Note: This may not fully work in App Router, but helps with some configurations
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/deals/upload
 * Upload CSV file to temporary storage (streaming)
 */
export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only company admins and super admins can upload
    if (!['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const context = await getTenantContext(request);
    const tenantId = context.tenantId;
    
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant context required' },
        { status: 400 }
      );
    }

    // ✅ Use busboy to parse multipart stream directly (bypasses Next.js body size limits)
    return new Promise((resolve, reject) => {
      const contentType = request.headers.get('content-type') || '';
      const bb = busboy({ 
        headers: { 'content-type': contentType },
        limits: {
          fileSize: 500 * 1024 * 1024, // 500MB max
        }
      });

      let fileName = null;
      let fileSize = 0;
      let fileId = null;
      let filePath = null;
      let writeStream = null;
      let uploadError = null;
      let fileReceived = false;

      // Create uploads directory first
      const uploadsDir = join(process.cwd(), 'uploads', 'deal-imports', tenantId.toString());
      
      // Create directory asynchronously, then set up busboy handlers
      mkdir(uploadsDir, { recursive: true })
        .then(() => {
          // Directory created successfully, set up busboy handlers
          setupBusboyHandlers();
        })
        .catch((mkdirError) => {
          console.error('❌ Error creating upload directory:', mkdirError);
          resolve(NextResponse.json(
            {
              success: false,
              error: 'Failed to create upload directory',
              message: mkdirError.message,
            },
            { status: 500 }
          ));
        });

      function setupBusboyHandlers() {
        bb.on('file', (name, file, info) => {
          const { filename, encoding, mimeType } = info;
          
          if (name !== 'file') {
            file.resume(); // Discard non-file fields
            return;
          }

          fileReceived = true;

          // Validate file type
          if (!filename.endsWith('.csv') && mimeType !== 'text/csv') {
            file.resume();
            uploadError = new Error('File must be a CSV file');
            resolve(NextResponse.json(
              { success: false, error: 'File must be a CSV file' },
              { status: 400 }
            ));
            return;
          }

          fileName = filename;
          fileSize = 0;
          fileId = crypto.randomBytes(16).toString('hex');
          const sanitizedFileName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
          filePath = join(uploadsDir, `${fileId}_${sanitizedFileName}`);

          // Create write stream to save file
          writeStream = createWriteStream(filePath);

          // Track file size and stream to disk
          file.on('data', (chunk) => {
            fileSize += chunk.length;
            if (writeStream && !writeStream.destroyed) {
              writeStream.write(chunk);
            }
          });

          file.on('end', () => {
            if (writeStream && !writeStream.destroyed) {
              writeStream.end();
            }
          });

          file.on('error', (error) => {
            console.error('❌ File stream error:', error);
            uploadError = error;
            if (writeStream && !writeStream.destroyed) {
              writeStream.destroy();
            }
            resolve(NextResponse.json(
              {
                success: false,
                error: 'File upload error',
                message: error.message,
              },
              { status: 500 }
            ));
          });

          writeStream.on('error', (error) => {
            console.error('❌ File write error:', error);
            uploadError = error;
            resolve(NextResponse.json(
              {
                success: false,
                error: 'Failed to save file',
                message: error.message,
              },
              { status: 500 }
            ));
          });
        });

        bb.on('finish', () => {
          if (uploadError) {
            return; // Error already handled
          }

          if (!fileReceived || !filePath || !fileName) {
            resolve(NextResponse.json(
              { success: false, error: 'CSV file is required' },
              { status: 400 }
            ));
            return;
          }

          // Validate file size (max 500MB)
          const maxSize = 500 * 1024 * 1024; // 500MB
          if (fileSize > maxSize) {
            // Clean up file
            const fs = require('fs');
            fs.unlink(filePath, () => {});
            resolve(NextResponse.json(
              { success: false, error: 'File size exceeds 500MB limit' },
              { status: 400 }
            ));
            return;
          }

          // Wait for write stream to finish before responding
          if (writeStream && !writeStream.destroyed) {
            writeStream.on('close', () => {
              resolve(NextResponse.json({
                success: true,
                data: {
                  fileId,
                  fileName,
                  fileSize,
                  filePath, // Internal path for processing
                },
              }));
            });
            
            // Handle case where stream is already closed
            if (writeStream.writableEnded) {
              resolve(NextResponse.json({
                success: true,
                data: {
                  fileId,
                  fileName,
                  fileSize,
                  filePath,
                },
              }));
            }
          } else {
            resolve(NextResponse.json({
              success: true,
              data: {
                fileId,
                fileName,
                fileSize,
                filePath,
              },
            }));
          }
        });

        bb.on('error', (error) => {
          console.error('❌ Busboy error:', error);
          if (writeStream) {
            writeStream.destroy();
          }
          resolve(NextResponse.json(
            {
              success: false,
              error: 'Failed to parse file upload',
              message: error.message,
            },
            { status: 400 }
          ));
        });

        // Pipe request body to busboy
        // Convert Web ReadableStream to Node stream
        const nodeStream = Readable.fromWeb(request.body);
        nodeStream.pipe(bb);

        nodeStream.on('error', (error) => {
          console.error('❌ Request stream error:', error);
          if (writeStream && !writeStream.destroyed) {
            writeStream.destroy();
          }
          resolve(NextResponse.json(
            {
              success: false,
              error: 'Failed to read request body',
              message: error.message,
            },
            { status: 500 }
          ));
        });
      }
    });
  } catch (error) {
    console.error('❌ Deal upload error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to upload file',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

