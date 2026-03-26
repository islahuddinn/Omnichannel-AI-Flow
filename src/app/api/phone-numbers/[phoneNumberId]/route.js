// src/app/api/phone-numbers/[phoneNumberId]/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import * as phoneNumberService from '@/services/phone-numbers/phoneNumberService';

/**
 * PUT /api/phone-numbers/[phoneNumberId]
 * Update a phone number
 */
export async function PUT(request, { params }) {
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
    const body = await request.json();
    const { phoneNumber, internalName, departmentIds } = body;

    // Handle both single department (for backward compatibility) and multiple departments
    const departmentIdsArray = departmentIds !== undefined
      ? (Array.isArray(departmentIds) ? departmentIds : departmentIds ? [departmentIds] : [])
      : null;

    const updatedPhoneNumber = await phoneNumberService.editPhoneNumber(
      phoneNumberId,
      phoneNumber,
      internalName,
      companyId,
      departmentIdsArray
    );

    return NextResponse.json({
      success: true,
      message: 'Phone number updated successfully',
      data: updatedPhoneNumber
    });
  } catch (error) {
    console.error('Error updating phone number:', error);

    if (error.message === 'Phone number not found') {
      return NextResponse.json(
        { success: false, message: 'Phone number not found' },
        { status: 404 }
      );
    }

    if (error.message === 'Phone number already exists') {
      return NextResponse.json(
        { success: false, message: 'Phone number already exists' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: 'Failed to update phone number', error: error.message },
      { status: 500 }
    );
  }
}
