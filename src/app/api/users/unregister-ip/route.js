// src/app/api/users/unregister-ip/route.js
// Call center: removes the user's IP from PBX (e.g. on logout or tab close).

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { unRegisterIp } from '@/services/pbx/PbxService.js';

/**
 * POST /api/users/unregister-ip
 * Unregister an IP address from PBX.
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

    const result = await unRegisterIp(ip);

    return NextResponse.json({
      success: true,
      message: 'IP unregistered successfully',
      data: result
    });
  } catch (error) {
    console.error('Error unregistering IP:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to unregister IP',
        error: error.message
      },
      { status: 500 }
    );
  }
}
