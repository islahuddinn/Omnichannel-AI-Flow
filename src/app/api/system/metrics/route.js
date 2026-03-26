// src/app/api/system/metrics/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import TenantService from '../../../../services/tenant/TenantService.js';
import AuthService from '../../../../services/auth/AuthService.js';

async function verifyAuth(request) {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) {
    throw new Error('Authentication required');
  }

  const decoded = await AuthService.verifyToken(token);
  
  if (decoded.role !== 'super_admin') {
    throw new Error('Super admin access required');
  }

  return decoded;
}

export async function GET(request) {
  try {
    await verifyAuth(request);

    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get('timeRange') || 'realtime';
    const includeConversations = searchParams.get('includeConversations') === 'true';

    const metrics = await TenantService.getGlobalMetrics();

    // ✅ If conversations are requested, get conversation metrics with time range
    if (includeConversations) {
      const conversationMetrics = await TenantService.getConversationMetrics(timeRange);
      return NextResponse.json({
        success: true,
        data: {
          ...metrics,
          conversations: conversationMetrics
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.message.includes('required') ? 401 : 500 }
    );
  }
}