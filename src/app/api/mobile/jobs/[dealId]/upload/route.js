// src/app/api/mobile/jobs/[dealId]/upload
// Upload images to S3 for job: before (diagnostic), after (repair), protocol (signed paper photo).
// POST body: { companyId, type: 'before'|'after'|'protocol', file: base64 or multipart }

import { NextResponse } from 'next/server';
import { verifyMobileAuth } from '@/middleware/mobile/mobileAuth.js';
import { getTenantDB } from '@/config/database.js';
import DealSchema from '@/models/schemas/Deal.js';
import ContactSchema from '@/models/schemas/Contact.js';
import { uploadToS3, generateMobileJobS3Key } from '@/lib/storage/s3.js';

const ALLOWED_TYPES = ['before', 'after', 'protocol'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];

export async function POST(request, { params }) {
  try {
    const { dealId } = await params;
    let companyId;
    let type;
    let buffer;
    let contentType = 'image/jpeg';
    let filename = 'upload.jpg';

    const contentTypeHeader = request.headers.get('content-type') || '';
    if (contentTypeHeader.includes('multipart/form-data')) {
      const formData = await request.formData();
      companyId = formData.get('companyId') || formData.get('company_id');
      type = formData.get('type');
      const file = formData.get('file') || formData.get('image');
      if (!file || typeof file.arrayBuffer !== 'function') {
        return NextResponse.json(
          { success: false, message: 'File is required (multipart file or image)' },
          { status: 400 }
        );
      }
      buffer = Buffer.from(await file.arrayBuffer());
      contentType = file.type || 'image/jpeg';
      filename = file.name || `upload.${contentType.split('/')[1] || 'jpg'}`;
    } else {
      const body = await request.json();
      companyId = body.companyId || body.company_id;
      type = body.type;
      const b64 = body.file || body.image || body.base64;
      if (!b64) {
        return NextResponse.json(
          { success: false, message: 'file (base64) or multipart file required' },
          { status: 400 }
        );
      }
      buffer = Buffer.from(b64, 'base64');
      contentType = body.contentType || body.mimeType || 'image/jpeg';
      filename = body.filename || `upload.${contentType.split('/')[1] || 'jpg'}`;
    }

    if (!companyId) {
      return NextResponse.json(
        { success: false, message: 'companyId is required' },
        { status: 400 }
      );
    }
    if (!ALLOWED_TYPES.includes(type)) {
      return NextResponse.json(
        { success: false, message: `type must be one of: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 }
      );
    }
    if (buffer.length > MAX_SIZE) {
      return NextResponse.json(
        { success: false, message: 'File too large (max 10MB)' },
        { status: 400 }
      );
    }
    if (!ALLOWED_MIME.some(m => contentType.toLowerCase().startsWith(m.split('/')[0]))) {
      const allowed = ALLOWED_MIME.join(', ');
      if (!contentType.startsWith('image/') && contentType !== 'application/pdf') {
        return NextResponse.json(
          { success: false, message: `Invalid content type. Allowed: ${allowed}` },
          { status: 400 }
        );
      }
    }

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
    const deal = isMongoId
      ? await Deal.findById(dealId)
      : await Deal.findOne({ deal_id: dealId });
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

    const key = generateMobileJobS3Key(companyId, dealId, type, filename);
    const { url, key: savedKey } = await uploadToS3(buffer, key, contentType);

    const visitNum = 1;
    if (type === 'before') {
      await Deal.updateOne(
        { _id: deal._id },
        { $push: { [`details.Diagnostic_${visitNum}.photosBefore`]: url } }
      );
    } else if (type === 'after') {
      const existing = deal.details?.Pictures_of_work;
      const newVal = typeof existing === 'string' ? (existing ? `${existing},${url}` : url) : (Array.isArray(existing) ? [...existing, url] : url);
      await Deal.updateOne(
        { _id: deal._id },
        { $set: { 'details.Pictures_of_work': newVal, 'details.HM_Files_uploaded': 'Uploaded' } }
      );
    } else {
      await Deal.updateOne(
        { _id: deal._id },
        { $push: { 'details.Protocol_Photo_URLs': url } }
      );
    }

    return NextResponse.json({
      success: true,
      data: { url, key: savedKey, type, filename },
    });
  } catch (error) {
    console.error('❌ Mobile upload error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}
