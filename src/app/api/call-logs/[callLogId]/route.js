// src/app/api/call-logs/[callLogId]/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import * as callLogService from '@/services/call-logs/callLogService';

/**
 * PUT /api/call-logs/[callLogId]
 * Mark a call log as resolved
 */
export async function PUT(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const companyId = context.tenantId;

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'Tenant context required' },
        { status: 400 }
      );
    }

    const { callLogId } = await params;

    // Resolution rules (for example missed incoming-only) are enforced in service.
    const result = await callLogService.markCallLogAsResolved(callLogId, companyId);

    return NextResponse.json({
      success: true,
      message: result.message,
      resolvedCount: result.resolvedCount
    });
  } catch (error) {
    console.error('Error marking call log as resolved:', error);

    if (error.message === 'Call Log not found') {
      return NextResponse.json(
        { success: false, message: 'Call Log not found' },
        { status: 404 }
      );
    }

    if (error.message === 'Only incoming missed calls can be marked as resolved') {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to mark call log as resolved',
        error: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/call-logs/[callLogId]
 * Delete a call log
 */
export async function DELETE(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const companyId = context.tenantId;

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'Tenant context required' },
        { status: 400 }
      );
    }

    const { callLogId } = await params;

    // Hard delete is tenant-scoped through companyId.
    await callLogService.deleteCallLog(callLogId, companyId);

    return NextResponse.json({
      success: true,
      message: 'Call Log deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting call log:', error);

    if (error.message === 'Call Log not found') {
      return NextResponse.json(
        { success: false, message: 'Call Log not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to delete call log',
        error: error.message
      },
      { status: 500 }
    );
  }
}
