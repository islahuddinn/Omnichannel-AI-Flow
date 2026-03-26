// src/app/api/call-groups/user/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import * as callGroupService from '@/services/call-groups/callGroupsService';

/**
 * GET /api/call-groups/user
 * Returns call groups mapped to the authenticated user in the current tenant.
 */
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const userId = context.userId;
    const companyId = context.tenantId;

    const callGroups = await callGroupService.getUserCallGroups(userId, companyId);

    if (callGroups.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No call groups found for this user',
        data: []
      });
    }

    return NextResponse.json({
      success: true,
      message: 'User call groups retrieved successfully',
      data: callGroups
    });

  } catch (error) {
    console.error('Error retrieving user call groups:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to retrieve user call groups',
      error: error.message
    }, { status: 500 });
  }
}
