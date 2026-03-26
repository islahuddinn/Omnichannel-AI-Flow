// src/app/api/call-status-tabs/[statusId]/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import * as callStatusTabService from '@/services/call-status-tabs/callStatusTabService';

/**
 * GET /api/call-status-tabs/[statusId]
 * Get call status record by ID
 */
export async function GET(request, { params }) {
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

    const { statusId } = await params;

    const callStatus = await callStatusTabService.getCallStatusById(statusId, companyId);

    // RBAC: agents can only read their own status records.
    if (auth.user.role === 'agent' && callStatus.userId?.toString() !== auth.user.userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized to access this record' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: callStatus
    });
  } catch (error) {
    console.error('Error fetching call status record:', error);

    if (error.message === 'Call status record not found') {
      return NextResponse.json(
        { success: false, message: 'Call status record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch call status record',
        error: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/call-status-tabs/[statusId]
 * Update call status record
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

    const { statusId } = await params;
    const body = await request.json();
    const updateData = body;

    // Get existing record to check permissions
    const existingRecord = await callStatusTabService.getCallStatusById(statusId, companyId);

    // RBAC: agents can only update their own status records.
    if (auth.user.role === 'agent' && existingRecord.userId?.toString() !== auth.user.userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized to update this record' },
        { status: 403 }
      );
    }

    const updatedCallStatus = await callStatusTabService.updateCallStatus(
      statusId,
      updateData,
      companyId
    );

    return NextResponse.json({
      success: true,
      message: 'Call status record updated successfully',
      data: updatedCallStatus
    });
  } catch (error) {
    console.error('Error updating call status record:', error);

    if (error.message === 'Call status record not found') {
      return NextResponse.json(
        { success: false, message: 'Call status record not found' },
        { status: 404 }
      );
    }

    // Handle unique constraint violation
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, message: 'Call status record with this data already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to update call status record',
        error: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/call-status-tabs/[statusId]
 * Delete call status record
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

    const { statusId } = await params;

    // Get existing record to check permissions
    const existingRecord = await callStatusTabService.getCallStatusById(statusId, companyId);

    // RBAC: agents can only delete their own status records.
    if (auth.user.role === 'agent' && existingRecord.userId?.toString() !== auth.user.userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized to delete this record' },
        { status: 403 }
      );
    }

    const result = await callStatusTabService.deleteCallStatus(statusId, companyId);

    return NextResponse.json({
      success: true,
      message: 'Call status record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting call status record:', error);

    if (error.message === 'Call status record not found') {
      return NextResponse.json(
        { success: false, message: 'Call status record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to delete call status record',
        error: error.message
      },
      { status: 500 }
    );
  }
}
