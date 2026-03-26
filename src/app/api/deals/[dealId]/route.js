// src/app/api/deals/[dealId]/route.js
/**
 * Deal Details API
 * GET /api/deals/[dealId] - Get single deal details
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import DealSchema from '@/models/schemas/Deal';

export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { dealId } = params;

    if (!dealId) {
      return NextResponse.json(
        { success: false, error: 'Deal ID is required' },
        { status: 400 }
      );
    }

    const context = await getTenantContext(request);
    const tenantId = context.tenantId;
    
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant context required' },
        { status: 400 }
      );
    }

    const tenantDB = await getTenantDB(tenantId);
    
    // Delete existing model if it exists to avoid schema conflicts
    if (tenantDB.models.Deal) {
      delete tenantDB.models.Deal;
    }
    
    const Deal = tenantDB.model('Deal', DealSchema);

    const deal = await Deal.findById(dealId).lean();

    if (!deal) {
      return NextResponse.json(
        { success: false, error: 'Deal not found' },
        { status: 404 }
      );
    }

    // Convert details Map to object if needed
    const dealData = { ...deal };
    if (dealData.details instanceof Map) {
      dealData.details = Object.fromEntries(dealData.details);
    } else if (!dealData.details || typeof dealData.details !== 'object') {
      dealData.details = {};
    }

    if (dealData.metadata instanceof Map) {
      dealData.metadata = Object.fromEntries(dealData.metadata);
    } else if (!dealData.metadata || typeof dealData.metadata !== 'object') {
      dealData.metadata = {};
    }

    return NextResponse.json({
      success: true,
      data: dealData,
    });
  } catch (error) {
    console.error('❌ Get deal error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get deal',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

