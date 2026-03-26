// src/app/api/mobile/jobs/[dealId]/schedule/route.js
/**
 * POST /api/mobile/jobs/[dealId]/schedule
 * Schedule appointment: sets details.Appointment_DateTime and status to Scheduled.
 * Requires: Mobile authentication
 */

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
    const body = await request.json();
    let companyId = body.companyId;

    // Verify authentication (companyId can come from body or token)
    const auth = await verifyMobileAuth(request, companyId);
    const { sfId, companyId: authCompanyId } = auth;
    if (!companyId) companyId = authCompanyId;

    if (!dealId) {
      return NextResponse.json(
        { success: false, message: 'Job ID is required' },
        { status: 400 }
      );
    }

    // appointmentDate: YYYY-MM-DD or ISO string; appointmentTime: HH:mm (optional)
    const appointmentDateRaw = body.appointmentDate || body.date;
    if (!appointmentDateRaw) {
      return NextResponse.json(
        { success: false, message: 'Appointment date is required' },
        { status: 400 }
      );
    }

    const tenantDB = await getTenantDB(authCompanyId);
    const Deal = tenantDB.models.Deal || tenantDB.model('Deal', DealSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    // Get handyman by SF_id
    const handyman = await Contact.findOne({ SF_id: sfId }).lean();
    if (!handyman || handyman.Contact_Type !== 'Handyman') {
      throw new Error('Contact not found or not a handyman');
    }

    // Get deal (by Mongo _id or Salesforce deal_id)
    const isMongoId = /^[a-fA-F0-9]{24}$/.test(String(dealId));
    const deal = isMongoId ? await Deal.findById(dealId) : await Deal.findOne({ deal_id: dealId });
    if (!deal) {
      throw new Error('Job not found');
    }

    // Verify assignment
    if (deal.details?.Handyman !== handyman.SF_id) {
      throw new Error('Access denied');
    }

    if (!deal.details) deal.details = {};

    const appointmentDate = new Date(appointmentDateRaw);
    if (isNaN(appointmentDate.getTime())) {
      return NextResponse.json(
        { success: false, message: 'Invalid appointment date' },
        { status: 400 }
      );
    }
    const appointmentTime = body.appointmentTime || body.time || null;
    const hours = appointmentTime && typeof appointmentTime === 'string' && appointmentTime.trim() !== ''
      ? parseInt(appointmentTime.trim().split(':')[0], 10) || 0
      : 0;
    const minutes = appointmentTime && typeof appointmentTime === 'string' && appointmentTime.trim() !== ''
      ? parseInt(appointmentTime.trim().split(':')[1], 10) || 0
      : 0;

    const appointmentDateTime = new Date(appointmentDate);
    appointmentDateTime.setHours(hours, minutes, 0, 0);
    deal.details.Appointment_DateTime = appointmentDateTime.toISOString();
    deal.details.Planned_DateTime = appointmentDateTime.toISOString();

    deal.status = 'Scheduled';
    deal.details.Status = 'Scheduled';

    deal.markModified('details');
    await deal.save();

    if (deal.deal_id) {
      const sfResult = await SalesforceDealService.syncSchedule(deal.toObject ? deal.toObject() : deal);
      if (!sfResult.success) console.warn('⚠️ Salesforce schedule sync failed:', sfResult.error);
    }

    const jobDetails = await MobileJobService.getJobDetails(dealId, sfId, authCompanyId);

    return NextResponse.json({
      success: true,
      message: 'Appointment scheduled successfully',
      data: {
        appointmentDateTime: deal.details.Appointment_DateTime,
        status: deal.status,
        job: jobDetails
      }
    });
  } catch (error) {
    console.error('❌ Schedule appointment error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to schedule appointment' },
      { status: error.message?.includes('not found') ? 404 : 500 }
    );
  }
}
