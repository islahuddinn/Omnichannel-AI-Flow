// // src/app/api/departments/[departmentId]/route.js
// import { NextResponse } from 'next/server';
// import { connectToTenantDB } from '@/lib/db/connection';
// import Department from '@/models/schemas/Department';
// import { verifyAuth } from '@/middleware/auth';
// import { getTenantContext } from '@/middleware/tenant';

// export async function GET(request, { params }) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
//     }

//     const { departmentId } = await params;
//     const tenantId = getTenantContext();
//     const db = await connectToTenantDB(tenantId);

//     const department = await Department.findById(departmentId)
//       .populate('assignedChannels')
//       .populate('agents', 'firstName lastName email role status')
//       .lean();

//     if (!department) {
//       return NextResponse.json(
//         { success: false, error: 'Department not found' },
//         { status: 404 }
//       );
//     }

//     return NextResponse.json({
//       success: true,
//       data: department
//     });
//   } catch (error) {
//     console.error('Get department error:', error);
//     return NextResponse.json(
//       { success: false, error: 'Failed to fetch department' },
//       { status: 500 }
//     );
//   }
// }

// export async function PUT(request, { params }) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
//     }

//     const { departmentId } = await params;
//     const tenantId = getTenantContext();
//     const db = await connectToTenantDB(tenantId);
    
//     const body = await request.json();
//     const { name, description, businessHours, routingRules, status } = body;

//     const department = await Department.findById(departmentId);
//     if (!department) {
//       return NextResponse.json(
//         { success: false, error: 'Department not found' },
//         { status: 404 }
//       );
//     }

//     // Check for duplicate name if changed
//     if (name && name !== department.name) {
//       const existing = await Department.findOne({ name, _id: { $ne: departmentId } });
//       if (existing) {
//         return NextResponse.json(
//           { success: false, error: 'Department with this name already exists' },
//           { status: 409 }
//         );
//       }
//     }

//     // Update fields
//     if (name) department.name = name;
//     if (description !== undefined) department.description = description;
//     if (businessHours) department.businessHours = businessHours;
//     if (routingRules) department.routingRules = routingRules;
//     if (status) department.status = status;

//     await department.save();
//     await department.populate('assignedChannels');

//     return NextResponse.json({
//       success: true,
//       data: department
//     });
//   } catch (error) {
//     console.error('Update department error:', error);
//     return NextResponse.json(
//       { success: false, error: 'Failed to update department' },
//       { status: 500 }
//     );
//   }
// }

// export async function DELETE(request, { params }) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
//     }

//     const { departmentId } = await params;
//     const tenantId = getTenantContext();
//     const db = await connectToTenantDB(tenantId);

//     const department = await Department.findById(departmentId);
//     if (!department) {
//       return NextResponse.json(
//         { success: false, error: 'Department not found' },
//         { status: 404 }
//       );
//     }

//     // Check if department has active conversations
//     const Conversation = require('@/models/schemas/Conversation').default;
//     const activeConversations = await Conversation.countDocuments({
//       department: departmentId,
//       status: { $in: ['open', 'pending'] }
//     });

//     if (activeConversations > 0) {
//       return NextResponse.json(
//         { success: false, error: 'Cannot delete department with active conversations' },
//         { status: 400 }
//       );
//     }

//     await department.deleteOne();

//     return NextResponse.json({
//       success: true,
//       message: 'Department deleted successfully'
//     });
//   } catch (error) {
//     console.error('Delete department error:', error);
//     return NextResponse.json(
//       { success: false, error: 'Failed to delete department' },
//       { status: 500 }
//     );
//   }
// }



// src/app/api/departments/[departmentId]/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '../../../../config/database.js';
import DepartmentSchema from '../../../../models/schemas/Department.js';
import { verifyAuth } from '../../../../middleware/auth.js';
import { getTenantContext } from '../../../../middleware/tenant.js';

export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { departmentId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);

    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);

    const department = await Department.findById(departmentId).lean();

    if (!department) {
      return NextResponse.json(
        { success: false, error: 'Department not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: department
    });
  } catch (error) {
    console.error('Get department error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { departmentId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    
    const body = await request.json();
    const { name, description } = body;

    const department = await Department.findById(departmentId);
    if (!department) {
      return NextResponse.json(
        { success: false, error: 'Department not found' },
        { status: 404 }
      );
    }

    if (name && name !== department.name) {
      const existing = await Department.findOne({ name, _id: { $ne: departmentId } });
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'Department with this name already exists' },
          { status: 409 }
        );
      }
    }

    if (name) department.name = name;
    if (description !== undefined) department.description = description;

    await department.save();

    return NextResponse.json({
      success: true,
      data: department
    });
  } catch (error) {
    console.error('Update department error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { departmentId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);

    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);

    const department = await Department.findById(departmentId);
    if (!department) {
      return NextResponse.json(
        { success: false, error: 'Department not found' },
        { status: 404 }
      );
    }

    // Check if department has agents
    if (department.agents && department.agents.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete department with assigned agents. Please reassign agents first.' },
        { status: 400 }
      );
    }

    await department.deleteOne();

    return NextResponse.json({
      success: true,
      message: 'Department deleted successfully'
    });
  } catch (error) {
    console.error('Delete department error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}