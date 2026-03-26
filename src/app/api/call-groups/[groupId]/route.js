// src/app/api/call-groups/[groupId]/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import * as callGroupService from '@/services/call-groups/callGroupsService';

/**
 * GET /api/call-groups/[groupId]
 * Returns one call group for the authenticated tenant.
 */
export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    const context = await getTenantContext(request);
    const companyId = context.tenantId;

    const callGroup = await callGroupService.getCallGroupById(groupId, companyId);

    return NextResponse.json({
      success: true,
      message: 'Call Group retrieved successfully',
      data: callGroup
    });

  } catch (error) {
    console.error('Error retrieving call group by ID:', error);
    
    if (error.message === 'Call Group not found') {
      return NextResponse.json({
        success: false,
        message: 'Call Group not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: false,
      message: 'Failed to retrieve call group',
      error: error.message
    }, { status: 500 });
  }
}

/**
 * PUT /api/call-groups/[groupId]
 * Updates an existing call group definition.
 */
export async function PUT(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    const context = await getTenantContext(request);
    const companyId = context.tenantId;
    const body = await request.json();

    const updatedCallGroup = await callGroupService.updateCallGroup(groupId, body, companyId);

    return NextResponse.json({
      success: true,
      message: 'Call Group updated successfully',
      data: updatedCallGroup
    });

  } catch (error) {
    console.error('Error updating call group:', error);
    
    if (error.message === 'Call Group not found') {
      return NextResponse.json({
        success: false,
        message: 'Call Group not found'
      }, { status: 404 });
    }

    if (error.message.includes('do not exist or are not Agents')) {
      return NextResponse.json({
        success: false,
        message: error.message
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      message: 'Failed to update call group',
      error: error.message
    }, { status: 500 });
  }
}

/**
 * DELETE /api/call-groups/[groupId]
 * Deletes a call group and propagates PBX cleanup via service.
 */
export async function DELETE(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { groupId } = await params;
    const context = await getTenantContext(request);
    const companyId = context.tenantId;

    const result = await callGroupService.deleteCallGroup(groupId, companyId);

    return NextResponse.json({
      success: true,
      message: 'Call Group deleted successfully',
      pbxResponse: result.pbxResponse
    });

  } catch (error) {
    console.error('Error deleting call group:', error);
    
    if (error.message === 'Call Group not found') {
      return NextResponse.json({
        success: false,
        message: 'Call Group not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: false,
      message: 'Failed to delete call group',
      error: error.message
    }, { status: 500 });
  }
}
