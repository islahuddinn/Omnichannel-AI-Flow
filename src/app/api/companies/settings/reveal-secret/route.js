// src/app/api/companies/settings/reveal-secret/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getMasterDB } from '@/config/database';
import CompanySchema from '@/models/schemas/Company';
import UserSchema from '@/models/schemas/User';

/**
 * POST /api/companies/settings/reveal-secret
 * Reveals the AI Bot API secret after verifying the user's login password.
 * Only company_admin and super_admin can access this.
 */
export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== 'string' || !password.trim()) {
      return NextResponse.json(
        { success: false, error: 'Password is required' },
        { status: 400 }
      );
    }

    const masterDB = await getMasterDB();
    const User = masterDB.models.User || masterDB.model('User', UserSchema);

    // Fetch user WITH password field (normally excluded)
    const user = await User.findById(auth.user.userId).select('+password');
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Verify password
    const isMatch = await user.comparePassword(password.trim());
    if (!isMatch) {
      return NextResponse.json(
        { success: false, error: 'Incorrect password' },
        { status: 401 }
      );
    }

    // Password verified — fetch the actual secret
    const context = await getTenantContext(request);
    const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
    const company = await Company.findById(context.tenantId).lean();

    if (!company) {
      return NextResponse.json(
        { success: false, error: 'Company not found' },
        { status: 404 }
      );
    }

    const apiSecret = company.features?.aiBot?.apiSecret || '';
    const apiKey = company.features?.aiBot?.apiKey || '';

    if (!apiSecret && !apiKey) {
      return NextResponse.json(
        { success: false, error: 'No API key or secret is configured' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...(apiSecret && { apiSecret }),
        ...(apiKey && { apiKey }),
      }
    });
  } catch (error) {
    console.error('[RevealSecret] Error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to reveal secret' },
      { status: 500 }
    );
  }
}
