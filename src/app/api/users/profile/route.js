// src/app/api/users/profile/route.js
import { NextResponse } from 'next/server';
import { getMasterDB, getTenantDB } from '@/config/database';
import UserSchema from '@/models/schemas/User';
import DepartmentSchema from '@/models/schemas/Department';
import CompanySchema from '@/models/schemas/Company';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import bcrypt from 'bcryptjs';
import { getUserProfile } from '@/services/users/userProfileService.js';

/**
 * GET /api/users/profile
 * Get current user's profile
 * For agents: returns PBX extension, outbound numbers, and departments with channel accounts
 */
export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const masterDB = await getMasterDB();
    const tenantDB = context.tenantId ? await getTenantDB(context.tenantId) : null;

    const User = masterDB.models.User || masterDB.model('User', UserSchema);

    // If user is an agent, use the detailed profile service
    if (auth.user.role === 'agent' && context.tenantId) {
      try {
        const userProfile = await getUserProfile(auth.user.userId, context.tenantId);
        return NextResponse.json({
          success: true,
          data: userProfile
        });
      } catch (error) {
        console.error('[Profile] GET agent profile error:', error?.message || error);
        return NextResponse.json(
          { success: false, error: error.message || 'Failed to fetch user profile' },
          { status: 500 }
        );
      }
    }

    // For non-agents, return basic profile
    const user = await User.findById(auth.user.userId)
      .select('-password -refreshToken -passwordResetToken -emailVerificationToken')
      .lean();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Populate departments if user has departments
    if (user.departments && user.departments.length > 0 && tenantDB) {
      const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
      const departments = await Department.find({ _id: { $in: user.departments } })
        .select('name description')
        .lean();
      user.departmentDetails = departments;
    }

    // Populate company info if user is company_admin or agent
    // ✅ Company is stored in masterDB, not tenantDB
    if ((user.role === 'company_admin' || user.role === 'agent') && user.companyId) {
      const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
      const company = await Company.findById(user.companyId)
        .select('name email phone address')
        .lean();
      user.companyDetails = company;
    }

    return NextResponse.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('[Profile] GET error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users/profile
 * Update current user's profile
 */
export async function PUT(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const masterDB = await getMasterDB();
    const body = await request.json();
    const { firstName, lastName, phone, password, currentPassword, preferences, avatar } = body;

    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    const user = await User.findById(auth.user.userId);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Update basic fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    if (avatar !== undefined) user.avatar = avatar;

    // Update password if provided
    if (password) {
      if (!currentPassword) {
        return NextResponse.json(
          { success: false, error: 'Current password is required to change password' },
          { status: 400 }
        );
      }

      // Verify current password
      const isPasswordValid = await user.comparePassword(currentPassword);
      if (!isPasswordValid) {
        return NextResponse.json(
          { success: false, error: 'Current password is incorrect' },
          { status: 401 }
        );
      }

      // Validate new password
      if (password.length < 8) {
        return NextResponse.json(
          { success: false, error: 'Password must be at least 8 characters long' },
          { status: 400 }
        );
      }

      user.password = password; // Will be hashed by pre-save hook
    }

    // Update preferences
    if (preferences) {
      user.preferences = {
        ...user.preferences,
        ...preferences
      };
    }

    await user.save();

    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.refreshToken;
    delete userObj.passwordResetToken;
    delete userObj.emailVerificationToken;

    return NextResponse.json({
      success: true,
      data: userObj
    });
  } catch (error) {
    console.error('[Profile] PUT error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update profile' },
      { status: 500 }
    );
  }
}

