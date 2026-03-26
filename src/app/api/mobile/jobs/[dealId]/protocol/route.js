// src/app/api/mobile/jobs/[dealId]/protocol/route.js
/**
 * POST /api/mobile/jobs/[dealId]/protocol
 * Create and manage protocols
 * Requires: Mobile authentication
 */

import { NextResponse } from 'next/server';
import { verifyMobileAuth } from '@/middleware/mobile/mobileAuth.js';
import MobileJobService from '@/services/mobile/MobileJobService.js';
import SalesforceDealService from '@/services/salesforce/SalesforceDealService.js';
import { getTenantDB } from '@/config/database.js';
import DealSchema from '@/models/schemas/Deal.js';
import ContactSchema from '@/models/schemas/Contact.js';
import SocketEmitter from '@/services/socket/SocketEmitter.js';
import { uploadToS3, generateMobileJobS3Key } from '@/lib/storage/s3.js';

/**
 * Parse a data URL or raw base64 string into { contentType, buffer }.
 * Handles newlines/whitespace in base64 and various data URL formats.
 * @returns {{ contentType: string, buffer: Buffer } | null}
 */
function parseBase64Image(input) {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();
  let contentType = 'image/png';
  let b64 = '';

  if (raw.startsWith('data:')) {
    // Match with [\s\S]+ so base64 can contain newlines
    const match = raw.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (match) {
      contentType = match[1].trim().split(';')[0];
      b64 = match[2].replace(/\s/g, '');
    } else {
      // Fallback: split on ",base64," and take the rest (handles malformed or line-wrapped)
      const idx = raw.indexOf(';base64,');
      if (idx !== -1) {
        const prefix = raw.slice(0, idx);
        const m = prefix.match(/data:([^;]+)/);
        if (m) contentType = m[1].trim().split(';')[0];
        b64 = raw.slice(idx + 8).replace(/\s/g, '');
      } else {
        return null;
      }
    }
  } else if (raw.length > 100) {
    // Raw base64 string (no data URL prefix)
    b64 = raw.replace(/\s/g, '');
  } else {
    return null;
  }

  if (!b64) return null;
  try {
    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length === 0) return null;
    return { contentType, buffer };
  } catch {
    return null;
  }
}

export async function POST(request, { params }) {
  try {
    const { dealId } = await params;
    const body = await request.json();
    const { companyId } = body;

    if (!companyId) {
      return NextResponse.json(
        { success: false, message: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Verify authentication
    const auth = await verifyMobileAuth(request, companyId);
    const { sfId, companyId: authCompanyId } = auth;

    if (!dealId) {
      return NextResponse.json(
        { success: false, message: 'Job ID is required' },
        { status: 400 }
      );
    }

    const { action, visitNumber, protocolData } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, message: 'Action is required (create, sign, upload)' },
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

    // Get deal (support both Mongo _id and Salesforce deal_id)
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

    // Get current visit number (helper function)
    const getCurrentVisitNumber = (deal) => {
      for (let i = 1; i <= 5; i++) {
        const status = deal.details?.[`Visit_${i}_Status`];
        if (status === 'In Progress' || status === 'Active') {
          return i;
        }
      }
      for (let i = 1; i <= 5; i++) {
        const status = deal.details?.[`Visit_${i}_Status`];
        if (!status || status === 'Planned' || status === 'Scheduled') {
          return i;
        }
      }
      return 1;
    };

    const currentVisit = visitNumber || getCurrentVisitNumber(deal);
    let result;

    switch (action) {
      case 'create':
        // Create protocol
        const protocolId = `protocol_${deal._id}_${currentVisit}_${Date.now()}`;
        
        deal.details[`Protocol_${currentVisit}`] = {
          id: protocolId,
          type: protocolData?.type || 'standard', // standard, diagnostic, surcharge
          visitNumber: currentVisit,
          createdAt: new Date().toISOString(),
          status: 'draft',
          data: protocolData?.data || {}
        };

        deal.status = 'Protocol creation';
        deal.details.Status = 'Protocol creation';

        // For diagnostic-only protocol, also sync surcharge-related notes to Salesforce
        if (protocolData?.type === 'diagnostic' && deal.deal_id) {
          const sfResult = await SalesforceDealService.syncSurchargeDiagnostic(
            deal.toObject ? deal.toObject() : deal,
            currentVisit
          );
          if (!sfResult.success) {
            console.warn('⚠️ Salesforce surcharge diagnostic sync failed:', sfResult.error);
          }
        }

        result = { protocolId, visitNumber: currentVisit, message: 'Protocol created' };
        break;

      case 'sign': {
        // Sign protocol (customer signature): upload base64 to S3, store URL in DB
        if (!protocolData?.signature) {
          return NextResponse.json(
            { success: false, message: 'Customer signature is required' },
            { status: 400 }
          );
        }

        const protocol = deal.details[`Protocol_${currentVisit}`];
        if (!protocol) {
          return NextResponse.json(
            { success: false, message: 'Protocol not found. Create protocol first.' },
            { status: 400 }
          );
        }

        const signedAt = new Date();
        let signatureFileUrl = null;
        const raw = protocolData.signature;
        // Only treat as existing URL if it's clearly an http(s) link; otherwise upload base64/data URL to S3
        if (typeof raw === 'string' && (raw.startsWith('http://') || raw.startsWith('https://'))) {
          signatureFileUrl = raw;
        } else {
          const parsed = parseBase64Image(raw);
          if (parsed) {
            try {
              const ext = (parsed.contentType.split('/')[1] || 'png').split(';')[0];
              const key = generateMobileJobS3Key(authCompanyId, dealId, 'protocol-signature', `signature-${Date.now()}.${ext}`);
              const uploaded = await uploadToS3(parsed.buffer, key, parsed.contentType);
              signatureFileUrl = uploaded.url;
            } catch (err) {
              console.warn('Protocol signature upload to S3 failed:', err?.message);
            }
          }
        }
        // Never store raw base64/data URL in DB – only S3 URL or null
        protocol.signature = {
          fileUrl: signatureFileUrl,
          signedAt: signedAt.toISOString(),
          customerName: protocolData.customerName || deal.details?.Customer_Name
        };
        protocol.status = 'signed';

        deal.details[`Date_on_Protocol_${currentVisit}`] = signedAt.toISOString().split('T')[0];

        deal.status = 'Protocol signed';
        deal.details.Status = 'Protocol signed';
        deal.details.Protocol_Email_To_Handyman = 'Sent';

        // Store protocol link
        const protocolIdForLink = protocol.id || `protocol_${deal._id}_${currentVisit}`;
        deal.details[`Protocol_Link_${currentVisit}`] = protocolIdForLink;

        if (deal.deal_id) {
          const sfResult = await SalesforceDealService.syncProtocolSigned(deal.toObject ? deal.toObject() : deal, currentVisit);
          if (!sfResult.success) console.warn('⚠️ Salesforce protocol-signed sync failed:', sfResult.error);
        }
        result = { protocolId: protocol.id, visitNumber: currentVisit, message: 'Protocol signed', signatureFileUrl };
        break;
      }

      case 'upload': {
        // Protocol file (paper protocol image): accept fileUrl (from /upload) or base64/data URL → always upload to S3, never store data URL
        let fileUrl = protocolData?.fileUrl;
        const rawInput = fileUrl ?? protocolData?.file ?? protocolData?.base64;
        if (rawInput != null && typeof rawInput === 'string') {
          const parsed = parseBase64Image(rawInput);
          if (parsed) {
            try {
              const ext = (parsed.contentType.split('/')[1] || 'jpg').split(';')[0];
              const key = generateMobileJobS3Key(authCompanyId, dealId, 'protocol', `signed-${Date.now()}.${ext}`);
              const uploaded = await uploadToS3(parsed.buffer, key, parsed.contentType);
              fileUrl = uploaded.url;
            } catch (err) {
              console.warn('Protocol file upload to S3 failed:', err?.message);
            }
          } else if (rawInput.startsWith('http://') || rawInput.startsWith('https://')) {
            fileUrl = rawInput;
          }
        }
        if (!fileUrl) {
          return NextResponse.json(
            { success: false, message: 'Protocol file URL or file (base64) is required' },
            { status: 400 }
          );
        }

        const uploadProtocol = deal.details[`Protocol_${currentVisit}`] || {};
        uploadProtocol.fileUrl = fileUrl;
        uploadProtocol.uploadedAt = new Date().toISOString();
        uploadProtocol.status = 'uploaded';

        deal.details[`Protocol_${currentVisit}`] = uploadProtocol;
        deal.details[`Protocol_Link_${currentVisit}`] = fileUrl;
        if (!Array.isArray(deal.details.Protocol_Photo_URLs)) deal.details.Protocol_Photo_URLs = [];
        if (!deal.details.Protocol_Photo_URLs.includes(fileUrl)) deal.details.Protocol_Photo_URLs.push(fileUrl);

        result = { visitNumber: currentVisit, message: 'Protocol uploaded', fileUrl };
        break;
      }

      default:
        return NextResponse.json(
          { success: false, message: 'Invalid action' },
          { status: 400 }
        );
    }

    deal.markModified('details');
    await deal.save();

    // Emit real-time update
    await SocketEmitter.emit(
      `mobile:handyman:${sfId}`,
      'mobile:job:protocol_updated',
      {
        dealId: deal._id.toString(),
        visitNumber: currentVisit,
        action,
        timestamp: new Date()
      }
    );

    await SocketEmitter.emit(
      `company:${authCompanyId}`,
      'mobile:job:update',
      {
        dealId: deal._id.toString(),
        updateType: 'protocol',
        visitNumber: currentVisit,
        action,
        timestamp: new Date()
      }
    );

    // Get updated job details
    const jobDetails = await MobileJobService.getJobDetails(dealId, sfId, authCompanyId);

    return NextResponse.json({
      success: true,
      message: result.message,
      data: {
        ...result,
        job: jobDetails
      }
    });
  } catch (error) {
    console.error('❌ Protocol management error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to manage protocol' },
      { status: error.message?.includes('not found') ? 404 : 500 }
    );
  }
}

