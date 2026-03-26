// src/app/api/call-routes/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import * as callRouteService from '@/services/call-routing/callRouteService';

/**
 * POST /api/call-routes
 * Create or update call routing for a phone number
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
    const { phoneNumberId, flowData, isLoop } = body;

    if (!phoneNumberId) {
      return NextResponse.json(
        { success: false, error: 'Phone number ID is required' },
        { status: 400 }
      );
    }

    if (!flowData) {
      return NextResponse.json(
        { success: false, error: 'Flow data is required' },
        { status: 400 }
      );
    }

    // Idempotent at service layer: updates existing flow or creates a new one.
    const result = await callRouteService.createOrUpdateCallRouting(
      flowData,
      phoneNumberId,
      isLoop,
      companyId
    );

    if (result.isUpdate) {
      return NextResponse.json({
        success: true,
        message: 'Call Routing updated successfully',
        data: result.callRouting
      });
    } else {
      return NextResponse.json({
        success: true,
        message: 'Call Routing created successfully',
        data: result.callRouting
      }, { status: 201 });
    }
  } catch (error) {
    console.error('Error managing call routing:', error);

    if (error.message === 'Phone Number not found') {
      return NextResponse.json(
        { success: false, message: 'Phone Number not found' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: 'Failed to manage call routing', error: error.message },
      { status: 500 }
    );
  }
}
