// src/app/api/deals/import/route.js
/**
 * CSV Deal Import API
 * POST /api/deals/import - Start import job from uploaded file
 * GET /api/deals/import/:jobId - Get import status
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import ImportJobSchema from '@/models/schemas/ImportJob';
import { DealCSVImportService } from '@/services/deal/CSVImportService';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for large file processing

/**
 * POST /api/deals/import
 * Start import job from uploaded file (two-step process: upload first, then import)
 */
export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only company admins and super admins can import
    if (!['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const context = await getTenantContext(request);
    const tenantId = context.tenantId;
    const companyId = context.companyId || auth.user?.companyId || auth.user?.tenantId || tenantId;
    
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant context required' },
        { status: 400 }
      );
    }
    
    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'Company context required' },
        { status: 400 }
      );
    }

    const tenantDB = await getTenantDB(tenantId);
    const ImportJob = tenantDB.models.ImportJob || tenantDB.model('ImportJob', ImportJobSchema);

    // Parse request body - expect fileId from upload step
    const body = await request.json();
    const { fileId, fileName, fileSize, filePath, batchSize: batchSizeParam } = body;
    const batchSize = parseInt(batchSizeParam || '1000');

    // Validate required fields
    if (!fileId || !filePath) {
      return NextResponse.json(
        { success: false, error: 'File ID and path are required. Please upload file first.' },
        { status: 400 }
      );
    }

    // Verify file exists
    const fs = await import('fs/promises');
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
      return NextResponse.json(
          { success: false, error: 'Uploaded file not found' },
          { status: 404 }
      );
    }
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Uploaded file not found. Please upload again.' },
        { status: 404 }
      );
    }

    // Generate job ID
    const jobId = crypto.randomBytes(16).toString('hex');

    // Create import job record
    const importJob = await ImportJob.create({
      jobId,
      tenantId: tenantId,
      companyId: companyId,
      userId: auth.user.userId,
      fileName: fileName || 'import.csv',
      filePath: filePath, // Path to uploaded file
      fileSize: fileSize || 0,
      options: {
        batchSize,
      },
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // ✅ Process import directly in background (no RabbitMQ)
    // Start processing asynchronously without blocking the response
    processImportJobAsync(importJob._id.toString(), {
      tenantId,
      companyId,
      userId: auth.user.userId,
      filePath: filePath,
      fileName: fileName || 'import.csv',
      options: { batchSize },
    }).catch(error => {
      console.error(`❌ Error processing deal import job ${importJob._id}:`, error);
    });

    console.log(`📥 Deal import job ${jobId} started: ${fileName || 'import.csv'} (MongoDB _id: ${importJob._id})`);

    return NextResponse.json({
      success: true,
      data: {
        _id: importJob._id.toString(),
        jobId: importJob.jobId,
        fileName: fileName || 'import.csv',
        fileSize: fileSize || 0,
        status: 'pending',
        totalRecords: 0,
        processedRecords: 0,
        successfulImports: 0,
        failedImports: 0,
        skippedImports: 0,
        progress: 0,
        createdAt: importJob.createdAt,
      },
    });
  } catch (error) {
    console.error('❌ Deal import error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to start import',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/deals/import
 * Get all import jobs for the company
 */
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const tenantId = context.tenantId;
    const companyId = context.companyId || auth.user?.companyId || auth.user?.tenantId || tenantId;
    
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant context required' },
        { status: 400 }
      );
    }

    const tenantDB = await getTenantDB(tenantId);
    const ImportJob = tenantDB.models.ImportJob || tenantDB.model('ImportJob', ImportJobSchema);

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');
    const skip = (page - 1) * limit;

    // If jobId provided, return specific job
    if (jobId) {
      let job = null;
      
      if (/^[0-9a-fA-F]{24}$/.test(jobId)) {
        try {
          job = await ImportJob.findById(jobId).lean();
        } catch (error) {
          // Ignore cast errors
        }
      }
      
      if (!job) {
        job = await ImportJob.findOne({ jobId }).lean();
      }
      
      if (!job) {
        return NextResponse.json(
          { success: false, error: 'Import job not found' },
          { status: 404 }
        );
      }

      // Verify access
      if (companyId && job.companyId && job.companyId.toString() !== companyId.toString()) {
        return NextResponse.json(
          { success: false, error: 'Access denied' },
          { status: 403 }
        );
      }

      const rawProgress = job.progress || 0;
      const jobData = {
        ...job,
        _id: job._id?.toString(),
        totalRecords: job.totalRecords || 0,
        processedRecords: job.processedRecords || 0,
        successfulImports: job.successfulImports || 0,
        failedImports: job.failedImports || 0,
        skippedImports: job.skippedImports || 0,
        progress: job.status === 'completed' ? 100 : Math.min(rawProgress, 99),
        importErrors: job.importErrors || [],
      };

      return NextResponse.json({
        success: true,
        data: jobData,
      });
    }

    // Get all jobs for company
    const jobs = await ImportJob.find({ companyId: companyId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await ImportJob.countDocuments({ companyId: companyId });

    return NextResponse.json({
      success: true,
      data: jobs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('❌ Get deal import jobs error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get import jobs',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * Process import job asynchronously in chunks (no RabbitMQ)
 * This runs in the background without blocking the API response
 * Processes CSV file in professional chunks with real-time progress updates
 */
async function processImportJobAsync(importJobId, jobData) {
  const {
    tenantId,
    companyId,
    userId,
    filePath,
    fileName,
    options = {},
  } = jobData;

  console.log(`📥 Processing deal import job: ${importJobId} (${fileName})`);

  const tenantDB = await getTenantDB(tenantId);
  const ImportJob = tenantDB.models.ImportJob || tenantDB.model('ImportJob', ImportJobSchema);

  let importJobDoc;
  try {
    importJobDoc = await ImportJob.findById(importJobId);
    if (!importJobDoc) {
      importJobDoc = await ImportJob.findOne({ jobId: importJobId });
    }
  } catch (error) {
    console.error(`❌ Error finding import job ${importJobId}:`, error);
    throw new Error(`Import job not found: ${importJobId}`);
  }

  if (!importJobDoc) {
    throw new Error(`Import job not found: ${importJobId}`);
  }

  // Update status to processing
  await ImportJob.findByIdAndUpdate(importJobDoc._id, {
    status: 'processing',
    startedAt: new Date(),
    updatedAt: new Date(),
  });

  try {
    // Initialize CSV import service with chunk processing
    const importService = new DealCSVImportService(tenantId, companyId, userId, options);

    let totalRecords = 0;
    let processedRecords = 0;
    let successfulImports = 0;
    let failedImports = 0;
    let skippedImports = 0;

    // Progress callback to update job status in real-time
    const onProgress = async (progress) => {
      if (progress.type === 'mapping') {
        console.log(`📋 Field mapping detected: ${progress.headers.length} columns`);
        await ImportJob.findByIdAndUpdate(importJobDoc._id, {
          fieldMapping: progress.mapping,
          headers: progress.headers,
          updatedAt: new Date(),
        });
      } else if (progress.type === 'progress') {
        if (progress.total && progress.total > 0) {
          totalRecords = progress.total;
        }

        processedRecords = progress.processed;
        successfulImports = progress.successful;
        failedImports = progress.failed;
        skippedImports = progress.skipped || 0;

        // Cap at 99% during processing (100% only on complete)
        let progressPercentage;
        if (totalRecords > 0) {
          progressPercentage = Math.min(99, Math.round((processedRecords / totalRecords) * 100));
        } else {
          progressPercentage = Math.min(95, Math.round((processedRecords / (processedRecords + 100)) * 100));
        }

        const limitedErrors = (progress.errors || []).slice(-500);

        await ImportJob.findByIdAndUpdate(importJobDoc._id, {
          totalRecords: totalRecords || 0,
          processedRecords,
          successfulImports,
          failedImports,
          skippedImports,
          importErrors: limitedErrors,
          progress: progressPercentage,
          updatedAt: new Date(),
        });

        if (processedRecords % 1000 === 0) {
          console.log(`📊 Import progress: ${processedRecords}/${totalRecords || '?'} (${progressPercentage}%) - Success: ${successfulImports}, Failed: ${failedImports}, Skipped: ${skippedImports}`);
        }
      } else if (progress.type === 'complete') {
        totalRecords = progress.total;
        processedRecords = progress.processed;
        successfulImports = progress.successful;
        failedImports = progress.failed;
        skippedImports = progress.skipped || 0;
        
        await ImportJob.findByIdAndUpdate(importJobDoc._id, {
          status: 'completed',
          totalRecords,
          processedRecords,
          successfulImports,
          failedImports,
          skippedImports,
          importErrors: (progress.errors || []).slice(-500),
          progress: 100,
          completedAt: new Date(),
          updatedAt: new Date(),
        });

        console.log(`✅ Deal import job ${importJobId} completed:`, {
          total: totalRecords,
          successful: successfulImports,
          failed: failedImports,
          skipped: skippedImports,
        });
      }
    };

    // Process CSV file from disk (handled by DealCSVImportService)
    // File is streamed line-by-line from disk - constant memory usage
    await importService.processCSVStream(filePath, onProgress);

  } catch (error) {
    console.error(`❌ Error processing deal import job ${importJobId}:`, error);
    
    // Update job status to failed
    await ImportJob.findByIdAndUpdate(importJobDoc._id, {
      status: 'failed',
      error: error.message || 'Import failed',
      failedAt: new Date(),
      updatedAt: new Date(),
    });

    // Re-throw to be caught by the caller
    throw error;
  }
}

