// src/app/api/ai-providers/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { SUPPORTED_PROVIDERS } from '@/services/bot/AIProviderRegistry';

/**
 * GET /api/ai-providers
 * Returns the list of supported AI providers and their models.
 * Used by the Settings page to dynamically populate provider/model dropdowns.
 */
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: SUPPORTED_PROVIDERS,
    });
  } catch (error) {
    console.error('[AI Providers] GET error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch AI providers' },
      { status: 500 }
    );
  }
}
