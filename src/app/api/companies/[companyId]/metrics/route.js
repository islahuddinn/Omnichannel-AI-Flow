// src/app/api/companies/[companyId]/metrics/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import TenantService from '../../../../../services/tenant/TenantService.js';
import AuthService from '../../../../../services/auth/AuthService.js';

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

export async function GET(request, { params }) {
  try {
    await verifyAuth(request);
    const { companyId } = params;

    const metrics = await TenantService.getCompanyMetrics(companyId);

    return NextResponse.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.message.includes('required') ? 401 : 500 }
    );
  }
}