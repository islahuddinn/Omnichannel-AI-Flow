// src/app/api/mobile/jobs/[dealId]/visits/route.js
/**
 * POST /api/mobile/jobs/[dealId]/visits
 * Manage visits for multi-visit jobs
 * Actions: create, update, delete, complete
 * Requires: Mobile authentication
 */

import { NextResponse } from 'next/server';
import { verifyMobileAuth } from '@/middleware/mobile/mobileAuth.js';
import MobileJobService from '@/services/mobile/MobileJobService.js';
import { getTenantDB } from '@/config/database.js';
import DealSchema from '@/models/schemas/Deal.js';
import ContactSchema from '@/models/schemas/Contact.js';
import SocketEmitter from '@/services/socket/SocketEmitter.js';

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

    const { action, visitNumber, visitData } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, message: 'Action is required (create, update, delete, complete)' },
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

    // Get deal
    const deal = await Deal.findById(dealId);
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
        // Create new visit
        if (!visitNumber || visitNumber < 1 || visitNumber > 5) {
          return NextResponse.json(
            { success: false, message: 'Valid visit number (1-5) is required' },
            { status: 400 }
          );
        }

        deal.details[`Visit_${visitNumber}_Date`] = visitData?.date || null;
        deal.details[`Visit_${visitNumber}_Status`] = 'Planned';
        deal.details[`Visit_${visitNumber}_Description`] = visitData?.description || null;

        // Update total visits if needed
        const currentTotal = deal.details?.Total_Visits_Planned || 1;
        if (visitNumber > currentTotal) {
          deal.details.Total_Visits_Planned = visitNumber;
        }

        result = { visitNumber, status: 'Planned', message: 'Visit created' };
        break;

      case 'update':
        // Update existing visit
        if (!visitNumber) {
          return NextResponse.json(
            { success: false, message: 'Visit number is required' },
            { status: 400 }
          );
        }

        if (visitData?.date) {
          deal.details[`Visit_${visitNumber}_Date`] = visitData.date;
        }
        if (visitData?.description) {
          deal.details[`Visit_${visitNumber}_Description`] = visitData.description;
        }
        if (visitData?.status) {
          deal.details[`Visit_${visitNumber}_Status`] = visitData.status;
        }

        result = { visitNumber, message: 'Visit updated' };
        break;

      case 'delete':
        // Delete visit (request to office)
        if (!visitNumber) {
          return NextResponse.json(
            { success: false, message: 'Visit number is required' },
            { status: 400 }
          );
        }

        // Store deletion request
        const deleteReason = visitData?.reason || 'No reason provided';
        deal.details[`Visit_${visitNumber}_Delete_Request`] = {
          requested: true,
          reason: deleteReason,
          requestedAt: new Date().toISOString(),
          requestedBy: handyman.SF_id
        };

        // Emit to office for approval
        await SocketEmitter.emit(
          `company:${authCompanyId}`,
          'mobile:job:visit_delete_request',
          {
            dealId: deal._id.toString(),
            dealName: deal.name,
            visitNumber,
            reason: deleteReason,
            handymanName: `${handyman.firstName || ''} ${handyman.lastName || ''}`.trim(),
            timestamp: new Date()
          }
        );

        result = { visitNumber, message: 'Delete request sent to office' };
        break;

      case 'complete':
        // Complete visit
        if (!visitNumber) {
          return NextResponse.json(
            { success: false, message: 'Visit number is required' },
            { status: 400 }
          );
        }

        const now = new Date();
        const startTime = deal.details?.[`Job_Start_Time_${visitNumber}`];
        const duration = startTime ? Math.round((now - new Date(startTime)) / 1000 / 60) : 0; // minutes

        deal.details[`Visit_${visitNumber}_Status`] = 'Completed';
        deal.details[`Job_End_Time_${visitNumber}`] = now.toISOString();
        
        // Store end GPS if available
        if (visitData?.gpsEnd) {
          if (visitNumber === 1) {
            deal.details.GPS_End_Latitude = visitData.gpsEnd.latitude;
            deal.details.GPS_End_Longitude = visitData.gpsEnd.longitude;
          }
          deal.details[`GPS_End_Lat_${visitNumber}`] = visitData.gpsEnd.latitude;
          deal.details[`GPS_End_Long_${visitNumber}`] = visitData.gpsEnd.longitude;
        }

        if (visitData?.workDescription) {
          deal.details[`Visit_${visitNumber}_Work_Description`] = visitData.workDescription;
        }
        if (visitData?.materialsUsed) {
          deal.details[`Visit_${visitNumber}_Materials_Used`] = visitData.materialsUsed;
        }
        if (visitData?.photosAfter) {
          deal.details[`Visit_${visitNumber}_Photos_After`] = visitData.photosAfter;
        }

        // Update visit history (Historia_navstev)
        const visitDate = startTime ? new Date(startTime).toLocaleDateString('sk-SK') : new Date().toLocaleDateString('sk-SK');
        const durationHours = duration ? (duration / 60).toFixed(1) : '0';
        const workDone = visitData?.workDescription || 'Work completed';
        const visitEntry = `Visit ${visitNumber}: ${visitDate} - ${durationHours}h - ${workDone}`;
        let history = deal.details.Historia_navstev || '';
        const visitPattern = new RegExp(`Visit ${visitNumber}:.*`, 'g');
        if (visitPattern.test(history)) {
          history = history.replace(visitPattern, visitEntry);
        } else {
          history = history ? `${history}\n${visitEntry}` : visitEntry;
        }
        deal.details.Historia_navstev = history;

        result = { visitNumber, status: 'Completed', message: 'Visit completed', duration };
        break;

      default:
        return NextResponse.json(
          { success: false, message: 'Invalid action' },
          { status: 400 }
        );
    }

    await deal.save();

    // Emit real-time update
    await SocketEmitter.emit(
      `mobile:handyman:${sfId}`,
      'mobile:job:visit_updated',
      {
        dealId: deal._id.toString(),
        visitNumber,
        action,
        timestamp: new Date()
      }
    );

    await SocketEmitter.emit(
      `company:${authCompanyId}`,
      'mobile:job:update',
      {
        dealId: deal._id.toString(),
        updateType: 'visit',
        visitNumber,
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
    console.error('❌ Manage visits error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to manage visit' },
      { status: error.message?.includes('not found') ? 404 : 500 }
    );
  }
}

