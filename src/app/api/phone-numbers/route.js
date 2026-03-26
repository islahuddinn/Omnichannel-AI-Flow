// src/app/api/phone-numbers/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import * as phoneNumberService from '@/services/phone-numbers/phoneNumberService';

/**
 * GET /api/phone-numbers
 * Get all phone numbers with pagination and search
 */
export async function GET(request) {
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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    
    // Handle departmentIds filter - can be comma-separated string or array
    let departmentIds = null;
    const departmentIdsParam = searchParams.get('departmentIds');
    if (departmentIdsParam) {
      departmentIds = departmentIdsParam.split(',').filter(id => id.trim()).map(id => id.trim());
    }

    const result = await phoneNumberService.getAllPhoneNumbers(page, limit, search, companyId, departmentIds);

    return NextResponse.json({
      success: true,
      data: result.phoneNumbers,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Error getting phone numbers:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to get phone numbers', error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/phone-numbers
 * Create a new phone number
 */
export async function POST(request) {
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

    const body = await request.json();
    const { phoneNumber, internalName, departments } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Handle both single department (for backward compatibility) and multiple departments
    const departmentIds = Array.isArray(departments) 
      ? departments 
      : departments 
        ? [departments] 
        : [];

    const newPhoneNumber = await phoneNumberService.createPhoneNumber(
      phoneNumber,
      internalName,
      companyId,
      departmentIds
    );

    return NextResponse.json({
      success: true,
      message: 'Phone number created successfully',
      data: newPhoneNumber
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating phone number:', error);

    if (error.message === 'Phone number already exists') {
      return NextResponse.json(
        { success: false, message: 'Phone number already exists' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: 'Failed to create phone number', error: error.message },
      { status: 500 }
    );
  }
}
