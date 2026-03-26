// src/app/api/companies/[companyId]/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import TenantService from '../../../../services/tenant/TenantService.js';
import AuthService from '../../../../services/auth/AuthService.js';

async function verifyAuth(request) {
  const cookieStore = await cookies();
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
    
    // ✅ Await params before accessing properties
    const { companyId } = await params;
    
    const company = await TenantService.getCompany(companyId);
    
    if (!company) {
      return NextResponse.json(
        { success: false, message: 'Company not found' },
        { status: 404 }
      );
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

export async function PUT(request, { params }) {
  try {
    await verifyAuth(request);
    
    // ✅ Await params before accessing properties
    const { companyId } = await params;
    const data = await request.json();
    
    const company = await TenantService.updateCompany(companyId, data);
    
    return NextResponse.json({
      success: true,
      data: company
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.message.includes('required') ? 401 : 400 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    await verifyAuth(request);
    
    // ✅ Await params before accessing properties
    const { companyId } = await params;
    
    // Suspend instead of delete
    const company = await TenantService.suspendCompany(companyId);
    
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