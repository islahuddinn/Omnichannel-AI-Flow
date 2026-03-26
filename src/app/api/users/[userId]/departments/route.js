// src/app/api/users/[userId]/departments/route.js
import { NextResponse } from 'next/server';
import { connectToMasterDB, connectToTenantDB } from '@/lib/db/connection';
import User from '@/models/schemas/User';
import Department from '@/models/schemas/Department';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';

export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { userId } = await params;
    const { departmentIds } = await request.json();

    if (!Array.isArray(departmentIds)) {
      return NextResponse.json(
        { success: false, error: 'Department IDs array is required' },
        { status: 400 }
      );
    }

    const tenantId = getTenantContext();
    const masterDb = await connectToMasterDB();
    const tenantDb = await connectToTenantDB(tenantId);

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    if (user.tenantId !== tenantId && auth.user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Verify departments exist
    const departments = await Department.find({ _id: { $in: departmentIds } });
    if (departments.length !== departmentIds.length) {
      return NextResponse.json(
        { success: false, error: 'One or more departments not found' },
        { status: 404 }
      );
    }

    user.departments = departmentIds;
    await user.save();

    // Update departments' agent lists
    await Department.updateMany(
      { agents: userId },
      { $pull: { agents: userId } }
    );

    await Department.updateMany(
      { _id: { $in: departmentIds } },
      { $addToSet: { agents: userId } }
    );

    return NextResponse.json({
      success: true,
      message: 'Departments assigned successfully'
    });
  } catch (error) {
    console.error('Assign departments error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to assign departments' },
      { status: 500 }
    );
  }
}