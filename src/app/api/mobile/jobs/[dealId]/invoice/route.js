// src/app/api/mobile/jobs/[dealId]/invoice/route.js
/**
 * POST /api/mobile/jobs/[dealId]/invoice
 * Step 11: Choose invoice type – IFA (internal, we create) or EFA (external, handyman uploads).
 * IFA: sync choice to SF; SF will create invoice and send data later via bulk-upsert.
 * EFA: accept amountWithoutVAT, vatEnum (EFA_DPH picklist), deliveryDate, variableSymbol, file (base64) or fileUrl; upload to S3; sync to SF (Celkova_suma_bez_DPH_efa, EFA_DPH, Datum_dodania_efa, VS_efa).
 * Actions: create (IFA), create_efa (EFA), update, mark_paid
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

function isBase64Data(value) {
  if (typeof value !== 'string') return false;
  return value.startsWith('data:') || (value.length > 200 && !value.startsWith('http'));
}

async function uploadEfaFileToS3(base64, companyId, dealId) {
  const match = base64.match(/^data:([^;]+);base64,(.+)$/);
  const contentType = match ? match[1].trim() : 'application/pdf';
  const b64 = match ? match[2] : base64;
  const buffer = Buffer.from(b64, 'base64');
  const ext = (contentType.split('/')[1] || 'pdf').replace('+xml', '');
  const filename = `efa-invoice.${ext}`;
  const key = generateMobileJobS3Key(companyId, dealId, 'invoice', filename);
  const { url } = await uploadToS3(buffer, key, contentType);
  return url;
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

    const { action, invoiceData } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, message: 'Action is required (create, create_efa, update, mark_paid)' },
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
    const dealIdStr = String(dealId);
    const isMongoId = dealIdStr.length === 24 && /^[a-fA-F0-9]{24}$/.test(dealIdStr);
    const deal = isMongoId ? await Deal.findById(dealIdStr) : await Deal.findOne({ deal_id: dealIdStr });
    if (!deal) {
      throw new Error('Job not found');
    }

    // Verify assignment
    if (deal.details?.Handyman !== handyman.SF_id) {
      throw new Error('Access denied');
    }

    if (!deal.details) deal.details = {};

    let result;

    switch (action) {
      case 'create':
        deal.details.iFA = true;
        deal.details.eFA = false;
        deal.details.Invoice_Type = 'iFA';
        deal.details.Invoice_Status = 'Pending';
        deal.details.Invoice_Created_At = new Date().toISOString();
        deal.status = 'Invoice process';
        deal.details.Status = 'Invoice process';

        if (deal.deal_id) {
          const sfResult = await SalesforceDealService.syncInvoiceChoice(deal.toObject ? deal.toObject() : deal, 'iFA');
          if (!sfResult.success) console.warn('⚠️ Salesforce invoice (iFA) sync failed:', sfResult.error);
        }
        result = { message: 'IFA selected. We will create invoice for you.', status: 'Pending', type: 'iFA' };
        break;

      case 'update':
        // Update invoice details
        if (invoiceData?.amount) {
          deal.details.Invoice_Amount = invoiceData.amount;
        }
        if (invoiceData?.invoiceNumber) {
          deal.details.Invoice_Number = invoiceData.invoiceNumber;
        }
        if (invoiceData?.fileUrl) {
          deal.details.Invoice_Link = invoiceData.fileUrl;
        }
        if (invoiceData?.status) {
          deal.details.Invoice_Status = invoiceData.status;
        }

        result = { message: 'Invoice updated' };
        break;

      case 'mark_paid':
        deal.details.Invoice_Status = 'Paid';
        deal.details.Invoice_Paid_At = new Date().toISOString();
        deal.status = 'Invoice paid';
        deal.details.Status = 'Invoice paid';

        result = { message: 'Invoice marked as paid', status: 'Paid' };
        break;

      case 'create_efa': {
        // EFA – handyman uploads their invoice. SF fields: Celkova suma bez DPH efa, EFA DPH, Datum dodania efa, VS efa.
        if (!invoiceData) {
          return NextResponse.json(
            { success: false, message: 'invoiceData is required for EFA (amountWithoutVAT, vatEnum, deliveryDate, variableSymbol, file base64 or fileUrl)' },
            { status: 400 }
          );
        }

        const amountWithoutVAT = invoiceData.amountWithoutVAT != null ? Number(invoiceData.amountWithoutVAT) : null;
        const rawVatEnum = typeof invoiceData.vatEnum === 'string' ? invoiceData.vatEnum.trim() : null;
        const allowedVatEnums = new Set([
          '--None--',
          'Prenos DPH 0%',
          'Prenos DPH 12%',
          'Prenos DPH 21%',
          'Prenos DPH 23%',
          'Vycislena DPH 12%',
          'Vycislena DPH 21%',
          'Vycislena DPH 23%',
        ]);
        const vatEnum = rawVatEnum && allowedVatEnums.has(rawVatEnum) ? rawVatEnum : null;
        const deliveryDate = invoiceData.deliveryDate ? String(invoiceData.deliveryDate).trim() : null;
        const variableSymbol = invoiceData.variableSymbol != null ? String(invoiceData.variableSymbol).trim() : null;

        let fileUrl = invoiceData.fileUrl || null;
        const rawFile = invoiceData.file || invoiceData.base64;
        if (rawFile && isBase64Data(rawFile)) {
          try {
            fileUrl = await uploadEfaFileToS3(rawFile, authCompanyId, deal.deal_id || dealId);
          } catch (err) {
            console.warn('EFA invoice file upload to S3 failed:', err?.message);
          }
        }

        deal.details.iFA = false;
        deal.details.eFA = true;
        deal.details.Invoice_Type = 'EFA';
        deal.details.Invoice_Status = 'Pending';
        deal.details.Invoice_Created_At = new Date().toISOString();
        deal.details.Celkova_suma_bez_DPH_efa = amountWithoutVAT;
        deal.details.EFA_DPH = vatEnum;
        deal.details.Datum_dodania_efa = deliveryDate;
        deal.details.VS_efa = variableSymbol;
        deal.details.EFA_Invoice_File_URL = fileUrl;
        deal.status = 'Invoice process';
        deal.details.Status = 'Invoice process';

        if (deal.deal_id) {
          const sfResult = await SalesforceDealService.syncInvoiceChoice(deal.toObject ? deal.toObject() : deal, 'eFA');
          if (!sfResult.success) console.warn('⚠️ Salesforce invoice (eFA) sync failed:', sfResult.error);
        }
        result = { message: 'EFA invoice submitted', status: 'Pending', type: 'EFA', fileUrl: fileUrl || undefined };
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
      'mobile:job:invoice_updated',
      {
        dealId: deal._id.toString(),
        action,
        status: deal.details.Invoice_Status,
        timestamp: new Date()
      }
    );

    await SocketEmitter.emit(
      `company:${authCompanyId}`,
      'mobile:job:update',
      {
        dealId: deal._id.toString(),
        updateType: 'invoice',
        action,
        status: deal.details.Invoice_Status,
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
    console.error('❌ Invoice management error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to manage invoice' },
      { status: error.message?.includes('not found') ? 404 : 500 }
    );
  }
}

