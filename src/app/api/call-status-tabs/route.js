// src/app/api/call-status-tabs/route.js
// Call center API: list and create call status tab records (missed/no-answer, etc.) for the sidebar tabs.

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import * as callStatusTabService from '@/services/call-status-tabs/callStatusTabService';

/**
 * GET /api/call-status-tabs
 * Get all call status records with pagination and filtering
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
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const sortBy = searchParams.get('sortBy') || 'time';
    const sortOrder = searchParams.get('sortOrder') || 'DESC';
    const status = searchParams.get('status');
    const direction = searchParams.get('direction');
    const phoneNumber = searchParams.get('phoneNumber');
    const search = searchParams.get('search');

    // Build filters object
    const filters = {};
    
    // For agents, filter by their userId
    if (auth.user.role === 'agent') {
      filters.userId = auth.user.userId;
    } else if (searchParams.get('userId')) {
      // For admins, allow filtering by userId if provided
      filters.userId = searchParams.get('userId');
    }

    if (status) filters.status = status;
    if (direction) filters.direction = direction;
    if (phoneNumber) filters.phoneNumber = phoneNumber;
    if (search) filters.search = search;

    const result = await callStatusTabService.getAllCallStatus(
      page,
      limit,
      sortBy,
      sortOrder,
      filters,
      companyId
    );

    return NextResponse.json({
      success: true,
      data: {
        callStatusRecords: result.callStatusRecords,
        pagination: result.pagination
      }
    });
  } catch (error) {
    console.error('Error fetching call status records:', error);

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch call status records',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/call-status-tabs
 * Create a new call status record
 */
export async function POST(request) {
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

    const body = await request.json();
    const callStatusData = body;

    // For agents, automatically set userId
    const userId = auth.user.role === 'agent' ? auth.user.userId : (body.userId || null);

    const newCallStatus = await callStatusTabService.createCallStatus(
      callStatusData,
      userId,
      companyId
    );

    return NextResponse.json({
      success: true,
      message: 'Call status record created successfully',
      data: newCallStatus
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating call status record:', error);

    // Handle unique constraint violation (if applicable)
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, message: 'Call status record with this data already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to create call status record',
        error: error.message
      },
      { status: 500 }
    );
  }
}
