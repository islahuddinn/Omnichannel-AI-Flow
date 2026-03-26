// src/app/api/contacts/import/[jobId]/route.js
/**
 * Import Job Status API
 * GET /api/contacts/import/:jobId - Get import job status
 * GET /api/contacts/import/:jobId/errors - Get import errors
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import ImportJobSchema from '@/models/schemas/ImportJob';

export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const { jobId } = resolvedParams;
    const { searchParams } = new URL(request.url);
    const errorsOnly = searchParams.get('errors') === 'true';

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

    // Note: jobId from URL params could be either the jobId field (hex string) or _id (ObjectId)
    // Try to find by jobId field first (hex string)
    let job = await ImportJob.findOne({ jobId }).lean();
    
    // If not found, try by _id (ObjectId) in case it's an ObjectId string
    if (!job && /^[0-9a-fA-F]{24}$/.test(jobId)) {
      try {
        job = await ImportJob.findById(jobId).lean();
      } catch (error) {
        // Ignore cast errors
      }
    }

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Import job not found' },
        { status: 404 }
      );
    }

    // Verify access
    if (companyId && job.companyId.toString() !== companyId.toString()) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // If only errors requested, return errors array
    if (errorsOnly) {
      return NextResponse.json({
        success: true,
        data: {
          errors: job.importErrors || [],
          totalErrors: job.failedImports || 0,
        },
      });
    }

    // Return full job status
    return NextResponse.json({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error('❌ Get import job status error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get import job status',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

