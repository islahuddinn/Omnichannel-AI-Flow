// src/app/api/companies/settings/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getMasterDB } from '@/config/database';
import CompanySchema from '@/models/schemas/Company';

export async function PUT(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only company_admin can update settings
    if (auth.user.role !== 'company_admin') {
      return NextResponse.json(
        { success: false, error: 'Only company admins can update settings' },
        { status: 403 }
      );
    }

    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
    }

    const body = await request.json();
    const { features, settings, branding, emailSettings } = body;

    const masterDB = await getMasterDB();
    const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);

    // Find company
    let company;
    if (auth.user.companyId) {
      company = await Company.findById(auth.user.companyId);
    } else {
      company = await Company.findOne({ tenantDatabaseName: context.tenantId });
    }

    if (!company) {
      return NextResponse.json(
        { success: false, error: 'Company not found' },
        { status: 404 }
      );
    }

    // Update features - properly merge nested objects
    if (features) {
      // Deep merge features, especially for nested aiBot object
      company.features = {
        ...(company.features || {}),
        ...features
      };

      // If aiBot is being updated, ensure proper merge
      if (features.aiBot) {
        const existing = company.features?.aiBot || {};
        // Store secrets before merge to handle masking logic
        const existingApiSecret = existing.apiSecret;
        const existingApiKey = existing.apiKey;

        company.features.aiBot = {
          ...existing,
          ...features.aiBot,
        };

        // Server-side validation for legacy baseUrl
        if (features.aiBot.baseUrl && features.aiBot.enabled) {
          try {
            const parsed = new URL(features.aiBot.baseUrl);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
              return NextResponse.json(
                { success: false, error: 'Base URL must use http:// or https:// protocol' },
                { status: 400 }
              );
            }
          } catch {
            return NextResponse.json(
              { success: false, error: 'Invalid Base URL format' },
              { status: 400 }
            );
          }
        }

        // Handle masked/cleared secrets — applies to both apiSecret (legacy) and apiKey (new)
        const MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
        const handleSecret = (incomingVal, existingVal) => {
          if (incomingVal === MASK) return existingVal || '';
          if (incomingVal === '' || incomingVal === null) return '';
          if (incomingVal !== undefined) return incomingVal;
          return existingVal || '';
        };

        company.features.aiBot.apiSecret = handleSecret(features.aiBot.apiSecret, existingApiSecret);
        company.features.aiBot.apiKey = handleSecret(features.aiBot.apiKey, existingApiKey);

        // Validate provider + model if provided
        if (features.aiBot.provider && features.aiBot.enabled) {
          const { validateProviderModel } = await import('@/services/bot/AIProviderRegistry');
          const modelToValidate = features.aiBot.model || existing.model;
          if (modelToValidate) {
            const validation = validateProviderModel(features.aiBot.provider, modelToValidate);
            if (!validation.valid) {
              return NextResponse.json(
                { success: false, error: validation.error },
                { status: 400 }
              );
            }
          }
        }
      }
    }

    // Update settings
    if (settings) {
      company.settings = {
        ...company.settings,
        ...settings
      };
    }

    // Update branding
    if (branding) {
      company.branding = {
        ...company.branding,
        ...branding
      };
    }

    // Update email settings (fromName, replyToEmail)
    if (emailSettings) {
      company.emailSettings = {
        ...(company.emailSettings || {}),
        ...emailSettings
      };
      // Validate replyToEmail format if provided
      if (emailSettings.replyToEmail && emailSettings.replyToEmail.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailSettings.replyToEmail.trim())) {
          return NextResponse.json(
            { success: false, error: 'Invalid reply-to email address format' },
            { status: 400 }
          );
        }
      }
    }

    await company.save();

    // Invalidate bot settings cache so new config takes effect immediately
    if (features?.aiBot) {
      try {
        const { invalidateCompanyBotCache } = await import('@/services/bot/BotService');
        invalidateCompanyBotCache(context.tenantId);
        // Also invalidate by company ID since BotService tries multiple lookup strategies
        invalidateCompanyBotCache(company._id.toString());
        if (company.tenantDatabaseName) {
          invalidateCompanyBotCache(company.tenantDatabaseName);
        }
      } catch (cacheErr) {
        console.warn('Failed to invalidate bot cache:', cacheErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      data: company,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error('[Company Settings] PUT error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}
