// src/app/api/call-groups/route.js
// Call center API: list and create call groups (PBX hunt groups) for the tenant.

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import * as callGroupService from '@/services/call-groups/callGroupsService';

/**
 * GET /api/call-groups
 * Returns call groups for the tenant with optional department and text filters.
 */
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const companyId = context.tenantId;

    const { searchParams } = new URL(request.url);
    const departmentIdsParam = searchParams.get('departmentIds');
    const searchParam = searchParams.get('search');
    
    // Parse departmentIds if provided
    let departmentIds = null;
    if (departmentIdsParam) {
      departmentIds = departmentIdsParam.split(',').filter(id => id.trim());
    }

    // Get search query (trim whitespace, empty string if not provided)
    const search = searchParam ? searchParam.trim() : '';

    const callGroups = await callGroupService.getAllCallGroups(companyId, departmentIds, search);

    return NextResponse.json({
      success: true,
      message: 'Call Groups retrieved successfully',
      data: callGroups
    });

  } catch (error) {
    console.error('Error retrieving call groups:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to retrieve call groups',
      error: error.message
    }, { status: 500 });
  }
}

/**
 * POST /api/call-groups
 * Creates a new call group in the current tenant context.
 */
export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const companyId = context.tenantId;
    const body = await request.json();

    const result = await callGroupService.createCallGroup(body, companyId);

    return NextResponse.json({
      success: true,
      message: 'Call Group created successfully',
      data: result.callGroup
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating call group:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to create call group',
      error: error.message
    }, { status: 500 });
  }
}
