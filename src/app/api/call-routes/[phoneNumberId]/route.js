// src/app/api/call-routes/[phoneNumberId]/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import * as callRouteService from '@/services/call-routing/callRouteService';

/**
 * GET /api/call-routes/[phoneNumberId]
 * Get call routing by phone number ID
 */
// export async function GET(request, { params }) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
//     }

//     const context = await getTenantContext(request);
//     const companyId = context.tenantId;

//     if (!companyId) {
//       return NextResponse.json(
//         { success: false, error: 'Tenant context required' },
//         { status: 400 }
//       );
//     }

//     const { phoneNumberId } = await params;

//     const callRouting = await callRouteService.getCallRoutingByPhoneNumberId(phoneNumberId, companyId);

//     return NextResponse.json({
//       success: true,
//       data: callRouting
//     });
//   } catch (error) {
//     console.error('Error getting call routing by phone number:', error);

//     if (error.message === 'Phone Number not found') {
//       return NextResponse.json(
//         { success: false, message: 'Phone Number not found' },
//         { status: 400 }
//       );
//     }

//     if (error.message === 'Call Routing not found for this phone number') {
//       return NextResponse.json(
//         { success: false, message: 'Call Routing not found for this phone number' },
//         { status: 404 }
//       );
//     }

//     return NextResponse.json(
//       { success: false, message: 'Failed to get call routing', error: error.message },
//       { status: 500 }
//     );
//   }
// }


export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const companyId = context.tenantId;

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'Tenant context required' },
        { status: 400 }
      );
    }

    const { phoneNumberId } = await params;

    // Read route config strictly within the authenticated tenant boundary.
    const result =
      await callRouteService.getCallRoutingByPhoneNumberId(phoneNumberId, companyId);

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting call routing by phone number:', error);

    if (error.message === 'Phone Number not found') {
      return NextResponse.json(
        { success: false, message: 'Phone Number not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, message: 'Failed to get call routing', error: error.message },
      { status: 500 }
    );
  }
}

