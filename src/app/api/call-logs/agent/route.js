// src/app/api/call-logs/agent/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import * as callLogService from '@/services/call-logs/callLogService';

/**
 * GET /api/call-logs/agent
 * Get agent call logs with access control
 */
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const companyId = context.tenantId;
    const userId = auth.user?.userId;

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'Tenant context required' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID required' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const queryParams = {
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
      operator_id: searchParams.get('operator_id'),
      caller_number: searchParams.get('caller_number'),
      reciever_number: searchParams.get('reciever_number'),
      group_id: searchParams.get('group_id'),
      start_date: searchParams.get('start_date'),
      end_date: searchParams.get('end_date'),
      operator_name: searchParams.get('operator_name'),
      query: searchParams.get('query'),
      filter: searchParams.get('filter')
    };

    // Returns only logs visible to this authenticated agent within the tenant.
    const result = await callLogService.getAgentCallLogs(userId, companyId, queryParams);

    return NextResponse.json({
      success: true,
      message: 'Agent call logs retrieved successfully',
      data: result.callLogs,
      stats: result.stats,
      pagination: result.pagination,
      accessLevel: result.accessLevel,
      canDownloadRecordings: result.canDownloadRecordings
    });
  } catch (error) {
    console.error('Error retrieving agent call logs:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to retrieve agent call logs',
        error: error.message
      },
      { status: 500 }
    );
  }
}
