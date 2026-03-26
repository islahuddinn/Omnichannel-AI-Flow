// src/app/api/mobile/jobs/[dealId]/status/route.js
/**
 * POST /api/mobile/jobs/[dealId]/status
 * Update job status
 * Requires: Mobile authentication
 */

import { NextResponse } from 'next/server';
import { verifyMobileAuth } from '@/middleware/mobile/mobileAuth.js';
import MobileJobService from '@/services/mobile/MobileJobService.js';

export async function POST(request, { params }) {
  try {
    const { dealId } = await params;
    const body = await request.json();
    const { companyId } = body;

    if (!companyId) {
      return NextResponse.json(
        { success: false, message: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Verify authentication
    const auth = await verifyMobileAuth(request, companyId);
    const { sfId, companyId: authCompanyId } = auth;

    if (!dealId) {
      return NextResponse.json(
        { success: false, message: 'Job ID is required' },
        { status: 400 }
      );
    }

    if (!body.status) {
      return NextResponse.json(
        { success: false, message: 'Status is required' },
        { status: 400 }
      );
    }

    const additionalData = {
      endTime: body.endTime ? new Date(body.endTime).toISOString() : null
    };

    const result = await MobileJobService.updateJobStatus(
      dealId,
      sfId,
      authCompanyId,
      body.status,
      additionalData
    );

    return NextResponse.json({
      success: true,
      message: 'Job status updated successfully',
      data: result
    });
  } catch (error) {
    console.error('❌ Update job status error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update job status' },
      { status: error.message?.includes('not found') ? 404 : 500 }
    );
  }
}

