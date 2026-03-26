// src/app/api/companies/[companyId]/suspend/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import TenantService from '../../../../../services/tenant/TenantService.js';
import AuthService from '../../../../../services/auth/AuthService.js';
import SocketManager from '../../../../../services/socket/SocketManager.js';

async function verifyAuth(request) {
  const cookieStore = cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) {
    throw new Error('Authentication required');
  }

  const decoded = await AuthService.verifyToken(token);
  
  if (decoded.role !== 'super_admin') {
    throw new Error('Super admin access required');
  }

  return decoded;
}

export async function PATCH(request, { params }) {
  try {
    await verifyAuth(request);
    const { companyId } = await params;

    const company = await TenantService.suspendCompany(companyId);

    // ✅ Emit real-time socket event for company status update
    try {
      SocketManager.emitCompanyUpdated(company);
      console.log(`✅ Socket event emitted: company:updated for company ${companyId}`);
    } catch (socketError) {
      console.error('Error emitting socket event:', socketError);
      // Don't fail the request if socket emission fails
    }

    return NextResponse.json({
      success: true,
      data: company
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.message.includes('required') ? 401 : 500 }
    );
  }
}