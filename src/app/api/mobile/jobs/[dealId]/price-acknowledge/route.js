// src/app/api/mobile/jobs/[dealId]/price-acknowledge
// Step 6: Handyman clicks "I ACKNOWLEDGE" after price approved – can start repair.
// Updates status to "Continue work" and syncs to Salesforce.

import { NextResponse } from 'next/server';
import { verifyMobileAuth } from '@/middleware/mobile/mobileAuth.js';
import MobileJobService from '@/services/mobile/MobileJobService.js';
import SalesforceDealService from '@/services/salesforce/SalesforceDealService.js';
import { getTenantDB } from '@/config/database.js';
import DealSchema from '@/models/schemas/Deal.js';
import ContactSchema from '@/models/schemas/Contact.js';

export async function POST(request, { params }) {
  try {
    const { dealId } = await params;
    const body = await request.json().catch(() => ({}));
    let companyId = body.companyId;

    const auth = await verifyMobileAuth(request, companyId);
    const { sfId, companyId: authCompanyId } = auth;
    if (!companyId) companyId = authCompanyId;

    const tenantDB = await getTenantDB(companyId);
    const Deal = tenantDB.models.Deal || tenantDB.model('Deal', DealSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    const handyman = await Contact.findOne({ SF_id: sfId }).lean();
    if (!handyman || handyman.Contact_Type !== 'Handyman') {
      return NextResponse.json(
        { success: false, message: 'Contact not found or not a handyman' },
        { status: 403 }
      );
    }

    const isMongoId = /^[a-fA-F0-9]{24}$/.test(String(dealId));
    const deal = isMongoId ? await Deal.findById(dealId) : await Deal.findOne({ deal_id: dealId });
    if (!deal) {
      return NextResponse.json(
        { success: false, message: 'Job not found' },
        { status: 404 }
      );
    }
    if (deal.details?.Handyman !== handyman.SF_id) {
      return NextResponse.json(
        { success: false, message: 'Access denied' },
        { status: 403 }
      );
    }

    if (!deal.details) deal.details = {};
    deal.details.HM_End_Price_Check = 'Approved';
    deal.details.Status = 'Continue work';
    deal.status = 'Continue work';
    deal.markModified('details');
    await deal.save();

    const sfResult = await SalesforceDealService.syncPriceAcknowledged(deal.toObject ? deal.toObject() : deal);
    if (!sfResult.success) {
      console.warn('⚠️ Salesforce sync after price-acknowledge failed:', sfResult.error);
    }

    const jobDetails = await MobileJobService.getJobDetails(dealId, sfId, authCompanyId);

    return NextResponse.json({
      success: true,
      message: 'Price acknowledged. You can start repair.',
      data: { job: jobDetails, salesforceSynced: sfResult.success },
    });
  } catch (error) {
    console.error('❌ Price acknowledge error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to acknowledge price' },
      { status: error.message?.includes('not found') ? 404 : 500 }
    );
  }
}
