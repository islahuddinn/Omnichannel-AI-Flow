// src/app/api/channels/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import DepartmentSchema from '@/models/schemas/Department';
import TemplateSchema from '@/models/schemas/Template';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';

export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);
    
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const departmentId = searchParams.get('departmentId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search');

    const skip = (page - 1) * limit;

    const query = { isActive: true };
    if (type) query.type = type;
    if (status) query.status = status;

    // ✅ Add search functionality
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { identifier: { $regex: escapedSearch, $options: 'i' } },
        { type: { $regex: escapedSearch, $options: 'i' } }
      ];
    }

    // ✅ CRITICAL: For agents, filter by their assigned departments
    // Agents should only see company accounts from their departments
    // Company admins see all accounts
    if (auth.user.role === 'agent') {
      const userDepartments = auth.user.departments || [];
      if (userDepartments.length > 0) {
        // Filter accounts where departmentId OR departmentIds contains one of the user's departments
        if (query.$or) {
          // If search already has $or, combine with $and
          query.$and = [
            { $or: query.$or },
            {
              $or: [
                { departmentId: { $in: userDepartments } },
                { departmentIds: { $in: userDepartments } }
              ]
            }
          ];
          delete query.$or;
        } else {
          query.$or = [
            { departmentId: { $in: userDepartments } },
            { departmentIds: { $in: userDepartments } }
          ];
        }
      } else {
        // Agent has no departments - return empty result
        return NextResponse.json({
          success: true,
          data: [],
          pagination: {
            page: 1,
            limit: limit,
            total: 0,
            pages: 0
          }
        });
      }
    } else if (departmentId) {
      // ✅ For company admins, allow filtering by specific departmentId if provided
      if (query.$or && !query.$and) {
        // If search already has $or, combine with $and
        query.$and = [
          { $or: query.$or },
          {
            $or: [
              { departmentId: departmentId },
              { departmentIds: departmentId }
            ]
          }
        ];
        delete query.$or;
      } else {
        query.$or = [
          { departmentId: departmentId },
          { departmentIds: departmentId }
        ];
      }
    }

    // Get total count for pagination
    const total = await CompanyAccount.countDocuments(query);

    const channels = await CompanyAccount.find(query)
      .populate('departmentIds', 'name description')
      .populate('departmentId', 'name')
      .select('-credentials.token -credentials.apiKey -credentials.smtpPass')
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .lean();

    const channelsWithTemplateCount = await Promise.all(
      channels.map(async (channel) => {
        const templateCount = await Template.countDocuments({
          companyAccounts: channel._id,
          isActive: true
        });
        return {
          ...channel,
          templateCount
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: channelsWithTemplateCount,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Channels] GET error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch channels' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    
    const body = await request.json();
    const { type, name, credentials, identifier, settings, departmentIds, departmentId } = body;

    if (!type || !name || !credentials || !identifier) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const departmentsToAssign = departmentIds || (departmentId ? [departmentId] : []);
    if (departmentsToAssign.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one department is required' },
        { status: 400 }
      );
    }

    const departments = await Department.find({ 
      _id: { $in: departmentsToAssign },
      status: 'active'
    });
    
    if (departments.length !== departmentsToAssign.length) {
      return NextResponse.json(
        { success: false, error: 'One or more departments not found or inactive' },
        { status: 400 }
      );
    }

    const existing = await CompanyAccount.findOne({ type, identifier, isActive: true });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Channel with this identifier already exists' },
        { status: 409 }
      );
    }

    const channel = await CompanyAccount.create({
      companyId: context.tenantId,
      type,
      name,
      credentials,
      identifier,
      departmentIds: departmentsToAssign,
      departmentId: departmentsToAssign[0],
      settings: settings || {},
      status: 'active',
      isActive: true,
      createdBy: auth.user.userId,
      lastSync: new Date()
    });

    await channel.populate('departmentIds', 'name description');

    const channelObj = channel.toObject();
    if (channelObj.credentials) {
      delete channelObj.credentials.token;
      delete channelObj.credentials.apiKey;
      delete channelObj.credentials.smtpPass;
      delete channelObj.credentials.password;
    }

    return NextResponse.json({
      success: true,
      data: channelObj
    }, { status: 201 });
  } catch (error) {
    console.error('[Channels] POST error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to create channel' },
      { status: 500 }
    );
  }
}