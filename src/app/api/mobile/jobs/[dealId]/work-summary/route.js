// src/app/api/mobile/jobs/[dealId]/work-summary
// Step 10: Review work summary – agree or dispute.
// POST .../work-summary  Body: { companyId, agreed: true|false, disputeReason? }
// Agree: { companyId, agreed: true } → proceed to step 11 (invoice).
// Dispute: { companyId, agreed: false, disputeReason: "..." } → office reviews; when office sends corrected summary via bulk-upsert,
//   mobile gets job:deal_updated; handyman then calls this again with agreed: true to approve corrected summary → step 11.

import { NextResponse } from 'next/server';
import { verifyMobileAuth } from '@/middleware/mobile/mobileAuth.js';
import MobileJobService from '@/services/mobile/MobileJobService.js';
import SalesforceDealService from '@/services/salesforce/SalesforceDealService.js';
import { getTenantDB } from '@/config/database.js';
import DealSchema from '@/models/schemas/Deal.js';
import ContactSchema from '@/models/schemas/Contact.js';
import SocketEmitter from '@/services/socket/SocketEmitter.js';

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

    const agreed = body.agreed === true;
    const disputeReason = body.disputeReason || body.reason || null;
    if (!deal.details) deal.details = {};

    if (agreed) {
      deal.details.Schvalenie_FA_majstra = 'Súhlasím';
      deal.details.Reason_for_Diagreement = null;
      deal.status = 'Invoice process';
      deal.details.Status = 'Invoice process';
    } else {
      deal.details.Schvalenie_FA_majstra = null;
      deal.details.Reason_for_Diagreement = disputeReason || 'Dispute';
      deal.status = 'Waiting for approval';
      deal.details.Status = 'Waiting for approval';
    }
    deal.markModified('details');
    await deal.save();

    if (deal.deal_id) {
      const sfResult = await SalesforceDealService.syncWorkSummary(
        deal.toObject ? deal.toObject() : deal,
        agreed,
        deal.details.Reason_for_Diagreement
      );
      if (!sfResult.success) console.warn('⚠️ Salesforce work-summary sync failed:', sfResult.error);
    }

    const handymanSFId = deal.details?.Handyman;
    const dealObj = deal.toObject ? deal.toObject() : deal;
    const customerSFId = dealObj.details?.Customer;
    let customer = null;
    if (customerSFId) {
      customer = await Contact.findOne({ SF_id: customerSFId }).lean();
    }
    const jobData = MobileJobService.formatJobForMobile(dealObj, handyman || {}, customer);

    if (handymanSFId) {
      await SocketEmitter.emit(
        `mobile:handyman:${handymanSFId}`,
        'job:deal_updated',
        { job: jobData, source: 'work_summary', timestamp: new Date() }
      );
    }
    await SocketEmitter.emit(
      `company:${companyId}`,
      'mobile:job:work_summary_approved',
      {
        dealId: deal._id.toString(),
        deal_id: deal.deal_id,
        agreed,
        disputeReason: deal.details.Reason_for_Diagreement,
        timestamp: new Date(),
      }
    );

    const jobDetails = await MobileJobService.getJobDetails(dealId, sfId, authCompanyId);

    return NextResponse.json({
      success: true,
      message: agreed ? 'Summary agreed. Proceed to invoice type.' : 'Dispute recorded. Office will review.',
      data: { job: jobDetails, agreed },
    });
  } catch (error) {
    console.error('❌ Work summary error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to submit' },
      { status: error.message?.includes('not found') ? 404 : 500 }
    );
  }
}
