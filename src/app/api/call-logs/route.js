// src/app/api/call-logs/route.js
// Call center API: list call logs with filters and pagination (company admin scope).

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import * as callLogService from '@/services/call-logs/callLogService';

/**
 * GET /api/call-logs
 * Get all call logs with filtering, pagination, and search
 */
export async function GET(request) {
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

    const { searchParams } = new URL(request.url);
    // Keep query parsing in route layer; service handles normalization and defaults.
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

    const result = await callLogService.getAllCallLogs(companyId, queryParams);

    return NextResponse.json({
      success: true,
      message: 'Call logs retrieved successfully',
      data: result.callLogs,
      stats: result.stats,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Error retrieving call logs:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to retrieve call logs',
        error: error.message
      },
      { status: 500 }
    );
  }
}

