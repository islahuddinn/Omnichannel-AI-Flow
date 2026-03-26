// src/app/api/mobile/jobs/[dealId]/route.js
/**
 * GET /api/mobile/jobs/[dealId]
 * Get single job details with visit timeline
 * Requires: Mobile authentication
 */

import { NextResponse } from 'next/server';
import { verifyMobileAuth } from '@/middleware/mobile/mobileAuth.js';
import MobileJobService from '@/services/mobile/MobileJobService.js';

export async function GET(request, { params }) {
  try {
    // Get companyId from query params
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { success: false, message: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Verify authentication
    const auth = await verifyMobileAuth(request, companyId);
    const { sfId, companyId: authCompanyId } = auth;

    const { dealId } = await params;

    if (!dealId) {
      return NextResponse.json(
        { success: false, message: 'Job ID is required' },
        { status: 400 }
      );
    }

    const jobDetails = await MobileJobService.getJobDetails(dealId, sfId, authCompanyId);

    return NextResponse.json({
      success: true,
      data: jobDetails
    });
  } catch (error) {
    console.error('❌ Get mobile job details error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to get job details' },
      { status: error.message?.includes('not found') ? 404 : 500 }
    );
  }
}

