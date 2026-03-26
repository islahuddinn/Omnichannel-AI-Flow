// src/app/api/mobile/jobs/[dealId]/start/route.js
/**
 * POST /api/mobile/jobs/[dealId]/start
 * Start work on a job
 * Records GPS location, start time, updates status to "Diagnostic running"
 * Requires: Mobile authentication
 */

import { NextResponse } from 'next/server';
import { verifyMobileAuth } from '@/middleware/mobile/mobileAuth.js';
import MobileJobService from '@/services/mobile/MobileJobService.js';

export async function POST(request, { params }) {
  try {
    const body = await request.json();
    let companyId = body.companyId;

    const auth = await verifyMobileAuth(request, companyId);
    const { sfId, companyId: authCompanyId } = auth;
    if (!companyId) companyId = authCompanyId;

    if (!companyId) {
      return NextResponse.json(
        { success: false, message: 'Company ID is required' },
        { status: 400 }
      );
    }

    const { dealId } = await params;

    if (!dealId) {
      return NextResponse.json(
        { success: false, message: 'Job ID is required' },
        { status: 400 }
      );
    }

    // GPS data (optional but recommended)
    const gpsData = body.gpsLocation ? {
      latitude: body.gpsLocation.latitude,
      longitude: body.gpsLocation.longitude,
      accuracy: body.gpsLocation.accuracy
    } : null;

    const jobDetails = await MobileJobService.startWork(dealId, sfId, authCompanyId, gpsData);

    return NextResponse.json({
      success: true,
      message: 'Work started successfully',
      data: jobDetails
    });
  } catch (error) {
    console.error('❌ Start work error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to start work' },
      { status: error.message?.includes('not found') ? 404 : 500 }
    );
  }
}

