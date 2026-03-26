// src/app/api/mobile/jobs/[dealId]/repair-complete
// Step 7: Repair work done – end time, after photos.
// Accepts afterPhotos (base64 array) and/or afterPhotoUrls (URLs). Backend uploads base64 to S3, updates deal and Salesforce.

import { NextResponse } from 'next/server';
import { verifyMobileAuth } from '@/middleware/mobile/mobileAuth.js';
import MobileJobService from '@/services/mobile/MobileJobService.js';
import SalesforceDealService from '@/services/salesforce/SalesforceDealService.js';
import { getTenantDB } from '@/config/database.js';
import DealSchema from '@/models/schemas/Deal.js';
import ContactSchema from '@/models/schemas/Contact.js';
import { uploadToS3, generateMobileJobS3Key } from '@/lib/storage/s3.js';

function isBase64Image(value) {
  if (typeof value !== 'string') return false;
  return value.startsWith('data:image/') || (value.length > 500 && !value.startsWith('http'));
}

async function uploadAfterPhotoToS3(base64, companyId, dealId, index) {
  const match = base64.match(/^data:([^;]+);base64,(.+)$/);
  const contentType = match ? match[1].trim() : 'image/jpeg';
  const b64 = match ? match[2] : base64;
  const buffer = Buffer.from(b64, 'base64');
  const ext = contentType.split('/')[1] || 'jpg';
  const filename = `after-${index}.${ext}`;
  const key = generateMobileJobS3Key(companyId, dealId, 'after', filename);
  const { url } = await uploadToS3(buffer, key, contentType);
  return url;
}

function getCurrentVisitNumber(deal) {
  for (let i = 1; i <= 5; i++) {
    const status = deal.details?.[`Visit_${i}_Status`];
    if (status === 'In Progress' || status === 'Active') return i;
  }
  for (let i = 1; i <= 5; i++) {
    const status = deal.details?.[`Visit_${i}_Status`];
    if (!status || status === 'Planned' || status === 'Scheduled') return i;
  }
  return 1;
}

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

    const currentVisit = getCurrentVisitNumber(deal);
    const now = new Date();
    if (!deal.details) deal.details = {};

    const endTimeIso = (body.endTime ? new Date(body.endTime) : now).toISOString();
    deal.details[`Job_End_Time_${currentVisit}`] = endTimeIso;
    deal.details.HM_Job_End_Time = endTimeIso;

    const existing = deal.details.Pictures_of_work;
    let afterUrls = typeof existing === 'string' ? (existing ? existing.split(',').map(s => s.trim()) : []) : (Array.isArray(existing) ? [...existing] : []);
    const afterPhotos = Array.isArray(body.afterPhotos) ? body.afterPhotos : [];
    for (let i = 0; i < afterPhotos.length; i++) {
      const item = afterPhotos[i];
      if (isBase64Image(item)) {
        try {
          const url = await uploadAfterPhotoToS3(item, companyId, dealId, i);
          afterUrls.push(url);
        } catch (err) {
          console.warn('Repair-complete after-photo upload to S3 failed:', err?.message);
        }
      } else if (typeof item === 'string' && item.startsWith('http')) {
        afterUrls.push(item);
      }
    }
    if (body.afterPhotoUrls && Array.isArray(body.afterPhotoUrls)) {
      body.afterPhotoUrls.forEach(u => afterUrls.push(u));
    }
    if (afterUrls.length > 0) {
      deal.details.Pictures_of_work = Array.isArray(afterUrls) ? afterUrls : afterUrls;
      deal.details.HM_Files_uploaded = 'Uploaded';
    }
    deal.details.After_Job_Info = 'Form';
    deal.status = 'Protocol creation';
    deal.details.Status = 'Protocol creation';
    deal.markModified('details');
    await deal.save();

    const sfResult = await SalesforceDealService.syncRepairComplete(deal.toObject ? deal.toObject() : deal, currentVisit);
    if (!sfResult.success) {
      console.warn('⚠️ Salesforce sync after repair-complete failed:', sfResult.error);
    }

    const jobDetails = await MobileJobService.getJobDetails(dealId, sfId, authCompanyId);

    return NextResponse.json({
      success: true,
      message: 'Repair marked complete. Proceed to protocol.',
      data: { job: jobDetails, salesforceSynced: sfResult.success },
    });
  } catch (error) {
    console.error('❌ Repair complete error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to mark repair complete' },
      { status: error.message?.includes('not found') ? 404 : 500 }
    );
  }
}
