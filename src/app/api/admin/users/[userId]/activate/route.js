// src/app/api/admin/users/[userId]/activate/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getMasterDB } from '../../../../../../config/database.js';
import UserSchema from '../../../../../../models/schemas/User.js';
import AuthService from '../../../../../../services/auth/AuthService.js';
import AuditService from '../../../../../../services/audit/AuditService.js';

async function verifySuperAdmin(request) {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) {
    throw new Error('Authentication required');
  }

  const decoded = await AuthService.verifyToken(token);
  
  if (decoded.role !== 'super_admin') {
    throw new Error('Super admin access required');
  }

  return decoded;
}

/**
 * POST /api/admin/users/[userId]/activate
 * Activate a user
 */
export async function POST(request, { params }) {
  try {
    const auth = await verifySuperAdmin(request);
    const resolvedParams = await params;
    const { userId } = resolvedParams;
    
    const masterDB = await getMasterDB();
    const User = masterDB.models.User || masterDB.model('User', UserSchema);

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      );
    }

    // Get old status for audit log
    const oldStatus = user.status;

    // Update status
    user.status = 'active';
    await user.save();

    // Log the action
    await AuditService.log({
      action: 'user.activated',
      actor: auth.userId,
      companyId: user.companyId,
      resourceType: 'user',
      resourceId: user._id,
      changes: {
        before: { status: oldStatus },
        after: { status: 'active' }
      },
      metadata: {
        endpoint: `/api/admin/users/${userId}/activate`,
        method: 'POST',
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown'
      },
      status: 'success'
    });

    return NextResponse.json({
      success: true,
      message: 'User activated successfully',
      data: {
        _id: user._id,
        email: user.email,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Activate user error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to activate user' },
      { status: error.message.includes('required') ? 401 : 500 }
    );
  }
}

