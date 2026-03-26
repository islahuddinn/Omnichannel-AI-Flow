// src/app/api/mobile/jobs/[dealId]/diagnostic/route.js
/**
 * POST /api/mobile/jobs/[dealId]/diagnostic
 * Submit diagnostic form. All images (URLs or base64) are stored as S3 URLs.
 * Requires: Mobile authentication
 */

import { NextResponse } from 'next/server';
import { verifyMobileAuth } from '@/middleware/mobile/mobileAuth.js';
import MobileJobService from '@/services/mobile/MobileJobService.js';
import { uploadToS3, generateMobileJobS3Key } from '@/lib/storage/s3.js';

/** Return true if string looks like base64 image data. */
function isBase64Image(value) {
  if (typeof value !== 'string') return false;
  return value.startsWith('data:image/') || (value.length > 500 && !value.startsWith('http'));
}

/** Upload base64 image to S3 and return URL. */
async function uploadBase64ToS3(base64, companyId, dealId, index) {
  const match = base64.match(/^data:([^;]+);base64,(.+)$/);
  const contentType = match ? match[1].trim() : 'image/jpeg';
  const b64 = match ? match[2] : base64;
  const buffer = Buffer.from(b64, 'base64');
  const ext = contentType.split('/')[1] || 'jpg';
  const filename = `before-${index}.${ext}`;
  const key = generateMobileJobS3Key(companyId, dealId, 'before', filename);
  const { url } = await uploadToS3(buffer, key, contentType);
  return url;
}

/** Upload customer signature (base64) to S3 and return URL. */
async function uploadSignatureToS3(base64, companyId, dealId) {
  const match = base64.match(/^data:([^;]+);base64,(.+)$/);
  const contentType = match ? match[1].trim() : 'image/png';
  const b64 = match ? match[2] : base64;
  const buffer = Buffer.from(b64, 'base64');
  const ext = contentType.split('/')[1] || 'png';
  const filename = `customer-signature.${ext}`;
  const key = generateMobileJobS3Key(companyId, dealId, 'signature', filename);
  const { url } = await uploadToS3(buffer, key, contentType);
  return url;
}

export async function POST(request, { params }) {
  try {
    const { dealId } = await params;
    const body = await request.json();
    let companyId = body.companyId;

    const auth = await verifyMobileAuth(request, companyId);
    const { sfId, companyId: authCompanyId } = auth;
    if (!companyId) companyId = authCompanyId;

    if (!companyId) {
      return NextResponse.json(
        { success: false, message: 'Company ID is required' },
        { status: 400 }
      );
    }

    if (!dealId) {
      return NextResponse.json(
        { success: false, message: 'Job ID is required' },
        { status: 400 }
      );
    }

    // Estimated work time required (app may send workTime in hours as number)
    const estimatedWorkTime = body.estimatedWorkTime ?? body.workTime;
    if (estimatedWorkTime == null || estimatedWorkTime === '') {
      return NextResponse.json(
        { success: false, message: 'Estimated work time (estimatedWorkTime or workTime) is required' },
        { status: 400 }
      );
    }

    // Normalize photosBefore: upload any base64 to S3, keep URLs as-is
    let photosBefore = Array.isArray(body.photosBefore) ? body.photosBefore : (body.images || []);
    const resolvedPhotos = [];
    for (let i = 0; i < photosBefore.length; i++) {
      const item = photosBefore[i];
      if (isBase64Image(item)) {
        try {
          const url = await uploadBase64ToS3(item, companyId, dealId, i);
          resolvedPhotos.push(url);
        } catch (err) {
          console.warn('Diagnostic photo upload to S3 failed:', err?.message);
        }
      } else if (typeof item === 'string' && item.startsWith('http')) {
        resolvedPhotos.push(item);
      }
    }

    // Customer signature (HM app Sign Summary): base64 → S3 URL, or keep URL as-is
    let customerSignatureUrl = null;
    const rawSignature = body.customerSignature ?? body.customer_signature;
    if (rawSignature) {
      if (isBase64Image(rawSignature)) {
        try {
          customerSignatureUrl = await uploadSignatureToS3(rawSignature, companyId, dealId);
        } catch (err) {
          console.warn('Diagnostic customer signature upload to S3 failed:', err?.message);
        }
      } else if (typeof rawSignature === 'string' && rawSignature.startsWith('http')) {
        customerSignatureUrl = rawSignature;
      }
    }

    // Protocol fields (from HM app Diagnostic Protocol screen – optional, can be sent in same submit)
    const protocol = body.protocolData || {};
    const diagnosticData = {
      estimatedWorkTime: Number(estimatedWorkTime) || 0,
      kilometersPerVisit: Number(body.kilometersPerVisit ?? body.kilometer ?? 0) || 0,
      estimatedVisits: parseInt(body.estimatedVisits ?? body.visits ?? 1, 10) || 1,
      materials: body.materials || [],
      photosBefore: resolvedPhotos,
      reasonForNextVisit: body.reasonForNextVisit ?? null,
      materialPurchaseHours: body.materialPurchaseHours ?? null,
      complexPriceCalculation: body.complexPriceCalculation ?? false,
      // Protocol / repair details (HM app: repair subject, problem, solution, visit data)
      repairSubject: body.repairSubject ?? protocol.repairSubject ?? null,
      problemDescription: body.problemDescription ?? protocol.problemDescription ?? null,
      solutionProposal: body.solutionProposal ?? protocol.solutionProposal ?? null,
      visitLocation: body.visitLocation ?? protocol.visitLocation ?? null,
      visitDate: body.visitDate ?? protocol.visitDate ?? null,
      technicianArrivalTime: body.technicianArrivalTime ?? protocol.technicianArrivalTime ?? null,
      technicianDepartureTime: body.technicianDepartureTime ?? protocol.technicianDepartureTime ?? null,
      fullName: body.fullName ?? protocol.fullName ?? null,
      phone: body.phone ?? protocol.phone ?? null,
      address: body.address ?? protocol.address ?? null,
      customerSignature: customerSignatureUrl,
    };

    const jobDetails = await MobileJobService.submitDiagnostic(
      dealId,
      sfId,
      authCompanyId,
      diagnosticData
    );

    return NextResponse.json({
      success: true,
      message: 'Diagnostic submitted successfully',
      data: jobDetails
    });
  } catch (error) {
    console.error('❌ Submit diagnostic error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to submit diagnostic' },
      { status: error.message?.includes('not found') ? 404 : 500 }
    );
  }
}

