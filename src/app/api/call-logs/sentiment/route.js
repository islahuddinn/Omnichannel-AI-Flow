// src/app/api/call-logs/sentiment/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import * as callLogService from '@/services/call-logs/callLogService';

/**
 * GET /api/call-logs/sentiment
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
    const calllogId = searchParams.get('calllogId');

    // Dual mode:
    // - with calllogId => detailed single record
    // - without calllogId => paginated sentiment list
    if (calllogId) {
      const callLog = await callLogService.getCallLogById(calllogId, companyId);
      if (!callLog) {
        return NextResponse.json(
          { success: false, error: 'Call log not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        message: 'Call log retrieved successfully',
        data: callLog
      });
    }

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
      filter: searchParams.get('filter'),
      // New filters
      country: searchParams.get('country'), // 'CZ' or 'SK'
      time_period: searchParams.get('time_period') // '1', '3', '7', '30' days
    };

    const result = await callLogService.getAllCallLogswithSentimentAnalysis(companyId, queryParams);

    return NextResponse.json({
      success: true,
      message: 'Call logs with sentiment analysis retrieved successfully',
      data: result.callLogs || [],
      agents: result.agents || null,
      stats: result.stats,
      operatorStats: result.operatorStats || null,
      groupStats: result.groupStats || null,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Error retrieving call logs with sentiment analysis:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to retrieve call logs with sentiment analysis',
        error: error.message
      },
      { status: 500 }
    );
  }
}

