// src/app/api/contacts/import/route.js
/**
 * CSV Contact Import API
 * POST /api/contacts/import - Upload CSV and start import
 * GET /api/contacts/import/:jobId - Get import status
 */

import { NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import { publishToQueue, QUEUES } from '@/lib/queue/rabbitmq.js';
import ImportJobSchema from '@/models/schemas/ImportJob';
import crypto from 'crypto';

/**
 * POST /api/contacts/import
 * Upload CSV file and start import job
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
    // ✅ Get companyId from context or auth user
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

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file');
    const departmentId = formData.get('departmentId');
    const channelAccountId = formData.get('channelAccountId');
    const batchSize = parseInt(formData.get('batchSize') || '1000');

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'CSV file is required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      return NextResponse.json(
        { success: false, error: 'File must be a CSV file' },
        { status: 400 }
      );
    }

    // Validate file size (max 500MB)
    const maxSize = 500 * 1024 * 1024; // 500MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 500MB limit' },
        { status: 400 }
      );
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'uploads', 'csv-imports', context.tenantId.toString());
    await mkdir(uploadsDir, { recursive: true });

    // Generate unique file name
    const fileId = crypto.randomBytes(16).toString('hex');
    const fileName = `${fileId}_${file.name}`;
    const filePath = join(uploadsDir, fileName);

    // Save file to disk
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Generate job ID
    const jobId = crypto.randomBytes(16).toString('hex');

    // Create import job record
    const importJob = await ImportJob.create({
      jobId,
      tenantId: tenantId,
      companyId: companyId,
      userId: auth.user.userId,
      fileName: file.name,
      filePath,
      fileSize: file.size,
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
      const { createContactImportWorker } = await import('@/workers/contactImportWorker.js');
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
      fileName: file.name,
      options: {
        batchSize,
        departmentId: departmentId || null,
        channelAccountId: channelAccountId || null,
      },
    };

    await publishToQueue(QUEUES.CONTACT_IMPORT, queueData);
    console.log(`📥 Contact import job ${jobId} queued: ${file.name} (MongoDB _id: ${importJob._id})`);

    return NextResponse.json({
      success: true,
      data: {
        _id: importJob._id.toString(), // ✅ Return _id for consistency
        jobId: importJob.jobId, // ✅ Also return jobId (hex string)
        fileName: file.name,
        fileSize: file.size,
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
    console.error('❌ Contact import error:', error);
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
 * GET /api/contacts/import
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
    // ✅ CRITICAL: jobId can be either MongoDB _id (ObjectId) or jobId field (hex string)
    if (jobId) {
      let job = null;
      
      // ✅ Try to find by _id first (ObjectId) - most common case
      if (/^[0-9a-fA-F]{24}$/.test(jobId)) {
        try {
          job = await ImportJob.findById(jobId).lean();
        } catch (error) {
          // Ignore cast errors, try other methods
        }
      }
      
      // ✅ If not found, try by jobId field (hex string)
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
    console.error('❌ Get import jobs error:', error);
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

