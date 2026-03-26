// src/app/api/mobile/jobs/[dealId]/gps/route.js
/**
 * POST /api/mobile/jobs/[dealId]/gps
 * Update GPS location for real-time tracking
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

    if (!body.latitude || !body.longitude) {
      return NextResponse.json(
        { success: false, message: 'Latitude and longitude are required' },
        { status: 400 }
      );
    }

    const gpsData = {
      latitude: parseFloat(body.latitude),
      longitude: parseFloat(body.longitude),
      accuracy: body.accuracy ? parseFloat(body.accuracy) : null,
      timestamp: body.timestamp || new Date().toISOString()
    };

    const result = await MobileJobService.updateGPSLocation(dealId, sfId, authCompanyId, gpsData);

    return NextResponse.json({
      success: true,
      message: 'GPS location updated',
      data: result
    });
  } catch (error) {
    console.error('❌ Update GPS location error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update GPS location' },
      { status: error.message?.includes('not found') ? 404 : 500 }
    );
  }
}

