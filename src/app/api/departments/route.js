// // src/app/api/departments/route.js
// import { NextResponse } from 'next/server';
// import { connectToTenantDB } from '@/lib/db/connection';
// import Department from '@/models/schemas/Department';
// import { verifyAuth } from '@/middleware/auth';
// import { getTenantContext } from '@/middleware/tenant';

// export async function GET(request) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
//     }

//     const tenantId = getTenantContext();
//     const db = await connectToTenantDB(tenantId);
    
//     const { searchParams } = new URL(request.url);
//     const page = parseInt(searchParams.get('page') || '1');
//     const limit = parseInt(searchParams.get('limit') || '10');
//     const skip = (page - 1) * limit;

//     const departments = await Department.find()
//       .populate('assignedChannels')
//       .populate('agents', 'firstName lastName email')
//       .skip(skip)
//       .limit(limit)
//       .sort('-createdAt')
//       .lean();

//     const total = await Department.countDocuments();

//     return NextResponse.json({
//       success: true,
//       data: departments,
//       pagination: {
//         page,
//         limit,
//         total,
//         pages: Math.ceil(total / limit)
//       }
//     });
//   } catch (error) {
//     console.error('Get departments error:', error);
//     return NextResponse.json(
//       { success: false, error: 'Failed to fetch departments' },
//       { status: 500 }
//     );
//   }
// }

// export async function POST(request) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
//     }

//     const tenantId = getTenantContext();
//     const db = await connectToTenantDB(tenantId);
    
//     const body = await request.json();
//     const { name, description, channels, businessHours, routingRules } = body;

//     // Validate required fields
//     if (!name) {
//       return NextResponse.json(
//         { success: false, error: 'Department name is required' },
//         { status: 400 }
//       );
//     }

//     // Check for duplicate name
//     const existing = await Department.findOne({ name });
//     if (existing) {
//       return NextResponse.json(
//         { success: false, error: 'Department with this name already exists' },
//         { status: 409 }
//       );
//     }

//     const department = await Department.create({
//       name,
//       description,
//       assignedChannels: channels || [],
//       businessHours: businessHours || {
//         enabled: false,
//         timezone: 'UTC',
//         schedule: {}
//       },
//       routingRules: routingRules || {
//         type: 'round_robin',
//         priority: 'normal'
//       },
//       createdBy: auth.user.userId
//     });

//     await department.populate('assignedChannels');

//     return NextResponse.json({
//       success: true,
//       data: department
//     }, { status: 201 });
//   } catch (error) {
//     console.error('Create department error:', error);
//     return NextResponse.json(
//       { success: false, error: 'Failed to create department' },
//       { status: 500 }
//     );
//   }
// }



// src/app/api/departments/route.js
// src/app/api/departments/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import DepartmentSchema from '@/models/schemas/Department';
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
    
    // ✅ Register model with tenant DB
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    // ✅ Filter departments based on user role
    let query = { companyId: context.tenantId }; // ✅ Always filter by company
    
    console.log('📋 Get departments - User role:', auth.user.role);
    console.log('📋 Get departments - Tenant ID:', context.tenantId);
    console.log('📋 Get departments - User departments:', auth.user.departments);
    
    if (auth.user.role === 'agent') {
      // ✅ For agents: only show departments they are assigned to (within this company)
      if (auth.user.departments && auth.user.departments.length > 0) {
        // ✅ Filter by both companyId AND department IDs assigned to agent
        query._id = { $in: auth.user.departments };
        console.log('📋 Agent departments query:', JSON.stringify(query, null, 2));
      } else {
        // Agent has no departments assigned - return empty list
        console.log('📋 Agent has no departments assigned');
        return NextResponse.json({
          success: true,
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            pages: 0
          }
        });
      }
    } else {
      // ✅ For company_admin and super_admin: show all departments for this company (only companyId filter)
      console.log('📋 Admin - showing all departments for company:', context.tenantId);
    }

    const [departments, total] = await Promise.all([
      Department.find(query)
        .skip(skip)
        .limit(limit)
        .sort('-createdAt')
        .lean(),
      Department.countDocuments(query)
    ]);

    // ✅ Count channels assigned to each department
    const CompanyAccountSchema = (await import('@/models/schemas/CompanyAccount.js')).default;
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    
    // Get all channels and count by department
    const allChannels = await CompanyAccount.find({ companyId: context.tenantId })
      .select('departmentIds')
      .lean();
    
    // Create a map of department ID to channel count
    const departmentChannelCounts = {};
    allChannels.forEach(channel => {
      if (channel.departmentIds && Array.isArray(channel.departmentIds)) {
        channel.departmentIds.forEach(deptId => {
          const deptIdStr = deptId.toString();
          departmentChannelCounts[deptIdStr] = (departmentChannelCounts[deptIdStr] || 0) + 1;
        });
      }
    });
    
    // Add channel count to each department
    const departmentsWithCounts = departments.map(dept => ({
      ...dept,
      assignedChannels: departmentChannelCounts[dept._id.toString()] || 0
    }));

    console.log(`📋 Found ${departments.length} departments (total: ${total}) for user ${auth.user.role}`);
    if (departments.length > 0) {
      console.log('📋 Sample department:', {
        _id: departments[0]._id,
        name: departments[0].name,
        companyId: departments[0].companyId,
        channelCount: departmentsWithCounts[0].assignedChannels
      });
    }

    return NextResponse.json({
      success: true,
      data: departmentsWithCounts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get departments error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}


// src/app/api/departments/route.js - UPDATE the POST method
export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    
    const body = await request.json();
    const { name, description, code } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Department name is required' },
        { status: 400 }
      );
    }

    // Check for duplicate name
    const existingName = await Department.findOne({ name });
    if (existingName) {
      return NextResponse.json(
        { success: false, error: 'Department with this name already exists' },
        { status: 409 }
      );
    }

    // ✅ Generate unique code
    let departmentCode;
    if (code && code.trim()) {
      // Use provided code
      departmentCode = code.trim().toUpperCase();
    } else {
      // Generate from name
      departmentCode = name.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'DEPT';
    }
    
    // ✅ Ensure code is unique within the same company - keep trying until we find one
    let attempts = 0;
    let finalCode = departmentCode;
    
    while (attempts < 10) {
      // ✅ Check for duplicate code WITHIN THE SAME COMPANY
      const existingCode = await Department.findOne({ 
        code: finalCode,
        companyId: context.tenantId 
      });
      if (!existingCode) {
        break; // Code is unique for this company
      }
      // Add random suffix
      finalCode = `${departmentCode}${Math.floor(Math.random() * 9999)}`;
      attempts++;
    }
    
    if (attempts >= 10) {
      return NextResponse.json(
        { success: false, error: 'Unable to generate a unique department code. Please try again or provide a custom code.' },
        { status: 500 }
      );
    }

    const department = await Department.create({
      companyId: context.tenantId,
      name,
      description: description || '',
      code: finalCode, // ✅ Always has a unique code
      isActive: true,
      agents: []
    });

    return NextResponse.json({
      success: true,
      data: department
    }, { status: 201 });
  } catch (error) {
    console.error('Create department error:', error);
    
    // Handle duplicate key error gracefully
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'A department with this code already exists. Please try again.' },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}