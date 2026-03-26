// src/lib/upload/rawContactUploadHandler.js
/**
 * Raw contact upload handler for large file uploads
 * Processes the raw Node.js request stream before Next.js buffers it
 */

import { verifyAuth } from '../../middleware/auth.js';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import busboy from 'busboy';
import crypto from 'crypto';
import { getTenantDB } from '../../config/database.js';
import { publishToQueue, QUEUES } from '../../lib/queue/rabbitmq.js';
import ImportJobSchema from '../../models/schemas/ImportJob.js';

/**
 * Handle raw Node.js request for large contact file uploads
 * This bypasses Next.js body size limits by processing the raw stream
 */
export async function handleRawContactUpload(req, res) {
  try {
    // Parse cookies from request headers
    const cookieHeader = req.headers.cookie || '';
    const cookies = {};
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        cookies[name] = value;
      }
    });

    // Create a request-like object compatible with Next.js middleware
    const authRequest = {
      headers: {
        get: (name) => {
          const lowerName = name.toLowerCase();
          if (lowerName === 'authorization') {
            return req.headers.authorization;
          }
          if (lowerName === 'cookie') {
            return req.headers.cookie;
          }
          return req.headers[lowerName] || req.headers[name];
        },
      },
      cookies: {
        get: (name) => {
          const value = cookies[name];
          return value ? { value } : undefined;
        },
      },
    };

    // Verify auth
    const auth = await verifyAuth(authRequest);
    if (!auth.success) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
      return;
    }

    // Only company admins and super admins can upload
    if (!['company_admin', 'super_admin'].includes(auth.user.role)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Admin access required' }));
      return;
    }

    // Get tenant context from auth.user (already decoded in verifyAuth)
    const tenantId = auth.user?.companyId || auth.user?.tenantId;
    const companyId = auth.user?.companyId || auth.user?.tenantId || tenantId;
    
    if (!tenantId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Tenant context required' }));
      return;
    }

    // Create uploads directory
    const uploadsDir = join(process.cwd(), 'uploads', 'csv-imports', tenantId.toString());
    await mkdir(uploadsDir, { recursive: true });

    // Use busboy to parse multipart stream directly from raw Node.js request
    return new Promise((resolve) => {
      const contentType = req.headers['content-type'] || '';
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
      let departmentId = null;
      let channelAccountId = null;
      let batchSize = 1000;

      // Handle form fields
      bb.on('field', (name, value) => {
        if (name === 'departmentId') {
          departmentId = value || null;
        } else if (name === 'channelAccountId') {
          channelAccountId = value || null;
        } else if (name === 'batchSize') {
          batchSize = parseInt(value) || 1000;
        }
      });

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
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'File must be a CSV file' }));
          resolve();
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
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'File upload error',
            message: error.message,
          }));
          resolve();
        });

        writeStream.on('error', (error) => {
          console.error('❌ File write error:', error);
          uploadError = error;
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Failed to save file',
            message: error.message,
          }));
          resolve();
        });
      });

      bb.on('finish', async () => {
        if (uploadError) {
          return; // Error already handled
        }

        if (!fileReceived || !filePath || !fileName) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'CSV file is required' }));
          resolve();
          return;
        }

        // Validate file size (max 500MB)
        const maxSize = 500 * 1024 * 1024; // 500MB
        if (fileSize > maxSize) {
          // Clean up file
          const fs = require('fs');
          fs.unlink(filePath, () => {});
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'File size exceeds 500MB limit' }));
          resolve();
          return;
        }

        // Process import job creation
        const processImportJob = async () => {
          try {
            // Create import job
            const tenantDB = await getTenantDB(tenantId);
            const ImportJob = tenantDB.models.ImportJob || tenantDB.model('ImportJob', ImportJobSchema);

            // Generate job ID
            const jobId = crypto.randomBytes(16).toString('hex');

            // Create import job record
            const importJob = await ImportJob.create({
              jobId,
              tenantId: tenantId,
              companyId: companyId,
              userId: auth.user.userId,
              fileName: fileName,
              filePath,
              fileSize: fileSize,
              options: {
                batchSize,
                departmentId: departmentId || null,
                channelAccountId: channelAccountId || null,
              },
              status: 'pending',
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            // ✅ Lazy-load worker when job is queued
            try {
              const { createContactImportWorker } = await import('../../workers/contactImportWorker.js');
              await createContactImportWorker();
            } catch (error) {
              console.warn('⚠️ Failed to start contact import worker (will retry):', error.message);
            }

            // ✅ Enqueue import job to RabbitMQ
            const queueData = {
              jobId: importJob._id.toString(), // MongoDB _id (ObjectId)
              tenantId: tenantId,
              companyId: companyId,
              userId: auth.user.userId,
              filePath,
              fileName: fileName,
              options: {
                batchSize,
                departmentId: departmentId || null,
                channelAccountId: channelAccountId || null,
              },
            };

            await publishToQueue(QUEUES.CONTACT_IMPORT, queueData);
            console.log(`📥 Contact import job ${jobId} queued: ${fileName} (MongoDB _id: ${importJob._id})`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              data: {
                _id: importJob._id.toString(),
                jobId: importJob.jobId,
                fileName: fileName,
                fileSize: fileSize,
                status: 'pending',
                totalRecords: 0,
                processedRecords: 0,
                successfulImports: 0,
                failedImports: 0,
                skippedImports: 0,
                progress: 0,
                createdAt: importJob.createdAt,
              },
            }));
            resolve();
          } catch (error) {
            console.error('❌ Error creating contact import job:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'Failed to start import',
              message: error.message,
            }));
            resolve();
          }
        };

        // Wait for write stream to finish before creating import job
        if (writeStream && !writeStream.destroyed) {
          writeStream.on('close', processImportJob);
        } else {
          // File already written, process immediately
          processImportJob();
        }
      });

      bb.on('error', (error) => {
        console.error('❌ Busboy error:', error);
        if (writeStream) {
          writeStream.destroy();
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Failed to parse file upload',
          message: error.message,
        }));
        resolve();
      });

      // Pipe raw Node.js request directly to busboy (bypasses Next.js buffering)
      req.pipe(bb);
    });
  } catch (error) {
    console.error('❌ Raw contact upload handler error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Failed to upload file',
      message: error.message,
    }));
  }
}

