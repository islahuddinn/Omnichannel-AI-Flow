// src/app/api/users/with-call-feature/route.js
import { NextResponse } from 'next/server';
import { getMasterDB, getTenantDB } from '@/config/database';
import UserSchema from '@/models/schemas/User';
import DepartmentSchema from '@/models/schemas/Department';
import PbxExtensionSchema from '@/models/schemas/PbxExtension';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';

/**
 * GET /api/users/with-call-feature
 * Lists tenant agents with call-center enabled, with optional status/department filtering.
 */
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const masterDB = await getMasterDB();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const departmentIdsParam = searchParams.get('departmentIds');
    const companyId = context.tenantId; // Current company/tenant

    const User = masterDB.models.User || masterDB.model('User', UserSchema);

    // Get tenant DB for departments and PBX extensions
    const tenantDB = await getTenantDB(companyId);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    const PbxExtension = tenantDB.models.PbxExtension || tenantDB.model('PbxExtension', PbxExtensionSchema);

    // Parse departmentIds if provided
    let departmentIds = null;
    if (departmentIdsParam) {
      departmentIds = departmentIdsParam.split(',').filter(id => id.trim());
      // Validate department IDs exist and belong to this company
      if (departmentIds.length > 0) {
        const mongoose = (await import('mongoose')).default;
        const validDepartmentIds = await Department.find({
          _id: { $in: departmentIds.map(id => new mongoose.Types.ObjectId(id)) },
          companyId: new mongoose.Types.ObjectId(companyId)
        }).select('_id').lean();
        departmentIds = validDepartmentIds.map(dept => dept._id.toString());
      }
    }

    // Restrict to agents in this company that have call-center enabled.
    // Additional filters (status/department) are applied below.
    // This keeps route logic explicit and service-free for this composite read.
    // (master + tenant data is joined here.)
    const query = {
      role: 'agent',
      'callCenter.call_center': 'on',
      companyId: companyId
    };

    if (status) {
      query['callCenter.call_status'] = status;
    }

    // Fetch users with call center enabled
    const users = await User.find(query)
      .select('-password -refreshToken')
      .sort({ createdAt: -1 })
      .lean();

    // Fetch departments and PBX extensions for each user
    const usersWithDetails = await Promise.all(
      users.map(async (user) => {
        // Get departments
        const departments = await Department.find({ agents: user._id })
          .select('name description _id')
          .lean();

        // Get PBX extension
        const pbxExtension = await PbxExtension.findOne({ userId: user._id }).lean();

        return {
          ...user,
          departments: departments || [],
          pbxExtension: pbxExtension || null
        };
      })
    );

    // Filter users by departmentIds if provided
    let filteredUsers = usersWithDetails;
    if (departmentIds && departmentIds.length > 0) {
      filteredUsers = usersWithDetails.filter(user => {
        const userDepartmentIds = user.departments.map(dept => dept._id.toString());
        // User must belong to at least one of the specified departments
        return userDepartmentIds.some(userDeptId => departmentIds.includes(userDeptId));
      });
    }

    return NextResponse.json({
      success: true,
      data: filteredUsers
    });

  } catch (error) {
    console.error('Get users with call feature error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
