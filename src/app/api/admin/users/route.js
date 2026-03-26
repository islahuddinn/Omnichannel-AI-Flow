// src/app/api/admin/users/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getMasterDB } from '../../../../config/database.js';
import UserSchema from '../../../../models/schemas/User.js';
import CompanySchema from '../../../../models/schemas/Company.js';
import AuthService from '../../../../services/auth/AuthService.js';
import AuditService from '../../../../services/audit/AuditService.js';

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
 * GET /api/admin/users
 * Get all users across all companies with filters
 */
export async function GET(request) {
  try {
    const auth = await verifySuperAdmin(request);
    const masterDB = await getMasterDB();
    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const companyId = searchParams.get('companyId');
    const role = searchParams.get('role');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const skip = (page - 1) * limit;

    // Build query
    const query = {};
    
    if (companyId) {
      query.companyId = companyId;
    }
    
    if (role) {
      query.role = role;
    }
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Get users
    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -refreshToken')
        .skip(skip)
        .limit(limit)
        .sort('-createdAt')
        .lean(),
      User.countDocuments(query)
    ]);

    // Get company names for users
    const companyIds = [...new Set(users.map(u => u.companyId).filter(Boolean))];
    const companies = await Company.find({ _id: { $in: companyIds } })
      .select('name _id')
      .lean();
    
    const companyMap = {};
    companies.forEach(c => {
      companyMap[c._id.toString()] = c.name;
    });

    // Attach company names
    const usersWithCompanies = users.map(user => ({
      ...user,
      companyName: user.companyId ? companyMap[user.companyId.toString()] : null
    }));

    // Get statistics
    const statistics = {
      total: await User.countDocuments({}),
      active: await User.countDocuments({ status: 'active' }),
      inactive: await User.countDocuments({ status: 'inactive' }),
      suspended: await User.countDocuments({ status: 'suspended' }),
      byRole: {
        super_admin: await User.countDocuments({ role: 'super_admin' }),
        company_admin: await User.countDocuments({ role: 'company_admin' }),
        agent: await User.countDocuments({ role: 'agent' })
      }
    };

    // Log the action
    await AuditService.log({
      action: 'api.access',
      actor: auth.userId,
      resourceType: 'user',
      metadata: {
        endpoint: '/api/admin/users',
        method: 'GET',
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown'
      },
      status: 'success'
    });

    return NextResponse.json({
      success: true,
      data: usersWithCompanies,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      statistics
    });
  } catch (error) {
    console.error('Get all users error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch users' },
      { status: error.message.includes('required') ? 401 : 500 }
    );
  }
}

