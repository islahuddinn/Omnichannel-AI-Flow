// src/app/api/companies/current/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getMasterDB } from '@/config/database';
import CompanySchema from '@/models/schemas/Company';

export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
    }

    const masterDB = await getMasterDB();
    const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);

    // Find company by tenantId or companyId from user
    let company;
    if (auth.user.companyId) {
      company = await Company.findById(auth.user.companyId).lean();
    } else {
      // Try to find by tenantDatabaseName
      company = await Company.findOne({ 
        tenantDatabaseName: context.tenantId 
      }).lean();
    }

    if (!company) {
      return NextResponse.json(
        { success: false, error: 'Company not found' },
        { status: 404 }
      );
    }

    // Mask sensitive data before returning
    if (company.features?.aiBot?.apiSecret) {
      company.features.aiBot.apiSecret = '••••••••';
    }
    if (company.features?.aiBot?.apiKey) {
      company.features.aiBot.apiKey = '••••••••';
    }

    return NextResponse.json({
      success: true,
      data: company
    });
  } catch (error) {
    console.error('Get current company error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch company' },
      { status: 500 }
    );
  }
}

