// src/app/api/users/register-ip/route.js
// Call center: registers the current user's IP with the PBX for SIP/voice access control.

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { registerIp } from '@/services/pbx/PbxService.js';

/**
 * POST /api/users/register-ip
 * Register an IP address with PBX (required for call center SIP access).
 */
export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ip } = body;

    if (!ip) {
      return NextResponse.json(
        { success: false, message: 'IP address is required' },
        { status: 400 }
      );
    }

    const result = await registerIp(ip);

    return NextResponse.json({
      success: true,
      message: 'IP registered successfully',
      data: result
    });
  } catch (error) {
    console.error('Error registering IP:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to register IP',
        error: error.message
      },
      { status: 500 }
    );
  }
}
