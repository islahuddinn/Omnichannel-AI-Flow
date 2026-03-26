// src/app/api/departments/[departmentId]/agents/route.js
import { NextResponse } from 'next/server';
import { connectToTenantDB } from '@/lib/db/connection';
import Department from '@/models/schemas/Department';
import User from '@/models/schemas/User';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';

export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { departmentId } = await params;
    const tenantId = getTenantContext();
    const db = await connectToTenantDB(tenantId);

    const agents = await User.find({
      departments: departmentId,
      role: 'agent'
    })
      .select('firstName lastName email status lastActive')
      .lean();

    return NextResponse.json({
      success: true,
      data: agents
    });
  } catch (error) {
    console.error('Get department agents error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { departmentId } = await params;
    const tenantId = getTenantContext();
    const db = await connectToTenantDB(tenantId);
    
    const { agentIds } = await request.json();

    if (!Array.isArray(agentIds) || agentIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Agent IDs array is required' },
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

    // Update agents' departments
    await User.updateMany(
      { _id: { $in: agentIds }, role: 'agent' },
      { $addToSet: { departments: departmentId } }
    );

    // Update department's agents list
    department.agents = department.agents || [];
    agentIds.forEach(id => {
      if (!department.agents.includes(id)) {
        department.agents.push(id);
      }
    });

    await department.save();

    return NextResponse.json({
      success: true,
      message: 'Agents assigned successfully'
    });
  } catch (error) {
    console.error('Assign agents error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to assign agents' },
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
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: 'Agent ID is required' },
        { status: 400 }
      );
    }

    const tenantId = getTenantContext();
    const db = await connectToTenantDB(tenantId);

    // Remove department from agent
    await User.findByIdAndUpdate(agentId, {
      $pull: { departments: departmentId }
    });

    // Remove agent from department
    await Department.findByIdAndUpdate(departmentId, {
      $pull: { agents: agentId }
    });

    return NextResponse.json({
      success: true,
      message: 'Agent removed successfully'
    });
  } catch (error) {
    console.error('Remove agent error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove agent' },
      { status: 500 }
    );
  }
}