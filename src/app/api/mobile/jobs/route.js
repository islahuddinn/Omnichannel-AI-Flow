// src/app/api/mobile/jobs/route.js
/**
 * GET /api/mobile/jobs
 * Get all jobs for handyman (home screen)
 * Requires: Mobile authentication
 */

import { NextResponse } from 'next/server';
import { verifyMobileAuth } from '@/middleware/mobile/mobileAuth.js';
import MobileJobService from '@/services/mobile/MobileJobService.js';

export async function GET(request) {
  try {
    // Get companyId from query params
    const { searchParams } = new URL(request.url);
    let companyId = searchParams.get('companyId');

    // If companyId not provided, try to extract from token
    if (!companyId) {
      try {
        const authHeader = request.headers.get('authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const jwt = await import('jsonwebtoken');
          const decoded = jwt.default.decode(token);
          companyId = decoded?.companyId;
        }
      } catch (error) {
        console.warn('⚠️ Could not extract companyId from token:', error);
      }
    }

    if (!companyId) {
      return NextResponse.json(
        { success: false, message: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Verify authentication
    const auth = await verifyMobileAuth(request, companyId);
    const { sfId, companyId: authCompanyId } = auth;

    // Get query parameters
    const status = searchParams.get('status');
    const date = searchParams.get('date'); // 'today', 'tomorrow', 'future', 'past', 'all'

    const options = {};
    if (status) options.status = status;

    // Get jobs organized by date
    const jobs = await MobileJobService.getJobsForHandyman(sfId, authCompanyId, options);

    // Filter by date if specified
    let result = jobs;
    if (date && date !== 'all') {
      result = {
        [date]: jobs[date] || [],
        date
      };
    } else {
      result = {
        ...jobs,
        date: 'all'
      };
    }

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Get mobile jobs error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to get jobs' },
      { status: error.message?.includes('not found') ? 404 : 500 }
    );
  }
}

