// src/app/api/departments/[departmentId]/channels/route.js
import { NextResponse } from 'next/server';
import { connectToTenantDB } from '@/lib/db/connection';
import Department from '@/models/schemas/Department';
import CompanyAccount from '@/models/schemas/CompanyAccount';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';

export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { departmentId } = await params;
    const tenantId = getTenantContext();
    const db = await connectToTenantDB(tenantId);
    
    const { channelIds } = await request.json();

    if (!Array.isArray(channelIds)) {
      return NextResponse.json(
        { success: false, error: 'Channel IDs array is required' },
        { status: 400 }
      );
    }

    const department = await Department.findById(departmentId);
    if (!department) {
      return NextResponse.json(
        { success: false, error: 'Department not found' },
        { status: 404 }
      );
    }

    // Verify all channels exist
    const channels = await CompanyAccount.find({ _id: { $in: channelIds } });
    if (channels.length !== channelIds.length) {
      return NextResponse.json(
        { success: false, error: 'One or more channels not found' },
        { status: 404 }
      );
    }

    department.assignedChannels = channelIds;
    await department.save();

    await department.populate('assignedChannels');

    return NextResponse.json({
      success: true,
      data: department
    });
  } catch (error) {
    console.error('Assign channels error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to assign channels' },
      { status: 500 }
    );
  }
}