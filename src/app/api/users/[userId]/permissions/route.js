// src/app/api/users/[userId]/permissions/route.js
import { NextResponse } from 'next/server';
import { connectToMasterDB } from '@/lib/db/connection';
import User from '@/models/schemas/User';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';

export async function PUT(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { userId } = await params;
    const { permissions } = await request.json();

    if (!permissions || typeof permissions !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Permissions object is required' },
        { status: 400 }
      );
    }

    const tenantId = getTenantContext();
    const masterDb = await connectToMasterDB();

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

    user.permissions = {
      ...user.permissions,
      ...permissions
    };

    await user.save();

    const userObj = user.toObject();
    delete userObj.password;

    return NextResponse.json({
      success: true,
      data: userObj
    });
  } catch (error) {
    console.error('Update permissions error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update permissions' },
      { status: 500 }
    );
  }
}