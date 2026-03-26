// // src/app/api/templates/route.js
// import { NextResponse } from 'next/server';
// import { getTenantDB } from '@/config/database';
// import TemplateSchema from '@/models/schemas/Template';
// import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
// import { verifyAuth } from '@/middleware/auth';
// import { getTenantContext } from '@/middleware/tenant';

// export async function GET(request) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
//     }

//     const context = await getTenantContext(request);
//     const tenantDB = await getTenantDB(context.tenantId);
    
//     const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);
    
//     const { searchParams } = new URL(request.url);
//     const channel = searchParams.get('channel');
//     const channelAccountId = searchParams.get('channelAccountId');

//     const query = { isActive: true };
    
//     if (channel) {
//       query.channel = channel;
//     }

//     if (channelAccountId) {
//       query.companyAccounts = channelAccountId;
//     }

//     const templates = await Template.find(query)
//       .sort('name')
//       .lean();

//     return NextResponse.json({
//       success: true,
//       data: templates
//     });

//   } catch (error) {
//     console.error('Get templates error:', error);
//     return NextResponse.json(
//       { success: false, error: error.message },
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

//     const context = await getTenantContext(request);
//     const tenantDB = await getTenantDB(context.tenantId);
    
//     const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);
    
//     const body = await request.json();
//     const { 
//       name, 
//       channel, 
//       companyAccounts,
//       templateLanguage, // WhatsApp only
//       body: templateBody, // Other channels
//       subject, // Email only
//       category,
//       parameters
//     } = body;

//     if (!name || !channel || !companyAccounts || companyAccounts.length === 0) {
//       return NextResponse.json(
//         { success: false, error: 'Missing required fields' },
//         { status: 400 }
//       );
//     }

//     // Validate channel-specific requirements
//     if (channel === 'whatsapp') {
//       if (!templateLanguage) {
//         return NextResponse.json(
//           { success: false, error: 'Template language required for WhatsApp' },
//           { status: 400 }
//         );
//       }
//     } else {
//       if (!templateBody) {
//         return NextResponse.json(
//           { success: false, error: 'Template body required' },
//           { status: 400 }
//         );
//       }
//     }

//     const template = await Template.create({
//       name,
//       channel,
//       companyAccounts,
//       templateLanguage,
//       body: templateBody,
//       subject,
//       category,
//       parameters: parameters || [],
//       isActive: true,
//       usageCount: 0,
//       createdBy: auth.user.userId
//     });

//     return NextResponse.json({
//       success: true,
//       data: template
//     }, { status: 201 });

//   } catch (error) {
//     console.error('Create template error:', error);
//     return NextResponse.json(
//       { success: false, error: error.message },
//       { status: 500 }
//     );
//   }
// }





// // src/app/api/templates/route.js
// import { NextResponse } from 'next/server';
// import { getTenantDB } from '@/config/database';
// import TemplateSchema from '@/models/schemas/Template';
// import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
// import { verifyAuth } from '@/middleware/auth';
// import { getTenantContext } from '@/middleware/tenant';

// export async function GET(request) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
//     }

//     const context = await getTenantContext(request);
//     const tenantDB = await getTenantDB(context.tenantId);
    
//     const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);
//     const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    
//     const { searchParams } = new URL(request.url);
//     const channel = searchParams.get('channel');
//     const channelAccountId = searchParams.get('channelAccountId');

//     const query = {};
    
//     if (channel) {
//       query.channel = channel;
//     }

//     if (channelAccountId) {
//       query.companyAccounts = channelAccountId;
//     }

//     // Only show active templates by default
//     if (!searchParams.has('includeInactive')) {
//       query.isActive = true;
//     }

//     const templates = await Template.find(query)
//       .populate('companyAccounts', 'name identifier type')
//       .sort('name')
//       .lean();

//     return NextResponse.json({
//       success: true,
//       data: templates
//     });

//   } catch (error) {
//     console.error('Get templates error:', error);
//     return NextResponse.json(
//       { success: false, error: error.message },
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

//     const context = await getTenantContext(request);
//     const tenantDB = await getTenantDB(context.tenantId);
    
//     const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);
    
//     const body = await request.json();
//     const { 
//       name, 
//       channel, 
//       companyAccounts,
//       templateLanguage,
//       body: templateBody,
//       subject,
//       category,
//       parameters,
//       isActive = true
//     } = body;

//     if (!name || !channel || !companyAccounts || companyAccounts.length === 0) {
//       return NextResponse.json(
//         { success: false, error: 'Missing required fields' },
//         { status: 400 }
//       );
//     }

//     // Validate channel-specific requirements
//     if (channel === 'whatsapp') {
//       if (!templateLanguage) {
//         return NextResponse.json(
//           { success: false, error: 'Template language required for WhatsApp' },
//           { status: 400 }
//         );
//       }
//     } else {
//       if (!templateBody) {
//         return NextResponse.json(
//           { success: false, error: 'Template body required' },
//           { status: 400 }
//         );
//       }
//     }

//     // Check if template name already exists for this channel
//     const existingTemplate = await Template.findOne({
//       name,
//       channel,
//       companyAccounts: { $in: companyAccounts }
//     });

//     if (existingTemplate) {
//       return NextResponse.json(
//         { success: false, error: 'Template name already exists for this channel and account' },
//         { status: 400 }
//       );
//     }

//     const template = await Template.create({
//       name,
//       channel,
//       companyAccounts,
//       templateLanguage,
//       body: templateBody,
//       subject,
//       category,
//       parameters: parameters || [],
//       isActive,
//       usageCount: 0,
//       createdBy: auth.user.userId,
//       tenantId: context.tenantId
//     });

//     await template.populate('companyAccounts', 'name identifier type');

//     return NextResponse.json({
//       success: true,
//       data: template
//     }, { status: 201 });

//   } catch (error) {
//     console.error('Create template error:', error);
//     return NextResponse.json(
//       { success: false, error: error.message },
//       { status: 500 }
//     );
//   }
// }










// src/app/api/templates/route.js
import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getTenantDB } from '@/config/database';
import TemplateSchema from '@/models/schemas/Template';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';

// WhatsApp language codes validation
const WHATSAPP_LANGUAGE_CODES = [
  'af', 'sq', 'ar', 'az', 'bn', 'bg', 'ca', 'zh_CN', 'zh_HK', 'zh_TW', 
  'hr', 'cs', 'da', 'nl', 'en', 'en_GB', 'en_US', 'et', 'fil', 'fi', 
  'fr', 'ka', 'de', 'el', 'gu', 'ha', 'he', 'hi', 'hu', 'id', 'ga', 
  'it', 'ja', 'kn', 'kk', 'rw_RW', 'ko', 'ky_KG', 'lo', 'lv', 'lt', 
  'mk', 'ms', 'ml', 'mr', 'nb', 'fa', 'pl', 'pt_BR', 'pt_PT', 'pa', 
  'ro', 'ru', 'sr', 'sk', 'sl', 'es', 'es_AR', 'es_ES', 'es_MX', 'sw', 
  'sv', 'ta', 'te', 'th', 'tr', 'uk', 'ur', 'uz', 'vi', 'zu'
];

// ✅ Helper function to normalize names: trim, collapse multiple spaces, lowercase
function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get('channel');
    let channelAccountId = searchParams.get('channelAccountId');
    const checkName = searchParams.get('checkName'); // ✅ Check if template name is available
    const excludeTemplateId = searchParams.get('excludeTemplateId'); // ✅ Exclude template ID when checking (for edit mode)

    // ✅ If checkName is provided, only check name availability and return early
    if (checkName) {
      const normalizedName = normalizeName(checkName);
      const query = {
        name: { $regex: new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      };
      
      // Exclude current template if editing
      if (excludeTemplateId && mongoose.Types.ObjectId.isValid(excludeTemplateId)) {
        query._id = { $ne: new mongoose.Types.ObjectId(excludeTemplateId) };
      }
      
      const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);
      const existingTemplate = await Template.findOne(query).lean();
      
      return NextResponse.json({
        success: true,
        available: !existingTemplate,
        message: existingTemplate 
          ? `Template name "${checkName}" already exists. Please use a different name.`
          : `Template name "${checkName}" is available.`
      });
    }

    // Validate and clean channelAccountId
    if (channelAccountId) {
      // Remove any URL encoding issues
      channelAccountId = decodeURIComponent(channelAccountId);
      // If it's still not a valid ObjectId format, return error
      if (!mongoose.Types.ObjectId.isValid(channelAccountId)) {
        return NextResponse.json(
          { success: false, error: 'Invalid channel account ID format' },
          { status: 400 }
        );
      }
    }

    const query = {};
    
    if (channel) {
      query.channel = channel;
    }

    // ✅ CRITICAL: Always filter templates by the selected account when channelAccountId is provided
    // Company admins can see all accounts in the dropdown, but templates are filtered by selected account
    // Agents can only see accounts from their departments, and templates are filtered by selected account
    const isAdmin = ['company_admin', 'super_admin'].includes(auth.user?.role);
    
    console.log('📋 Templates API - User role check:', {
      userId: auth.user?.userId,
      role: auth.user?.role,
      isAdmin,
      channel,
      channelAccountId,
      willFilterByAccount: !!channelAccountId
    });
    
    if (channelAccountId) {
      // ✅ Both admins and agents: Filter templates by the selected account
      query.companyAccounts = { $in: [new mongoose.Types.ObjectId(channelAccountId)] };
      console.log('📋 Filtering templates by selected account:', channelAccountId, isAdmin ? '(admin)' : '(agent)');
    }
    // ✅ If no channelAccountId, query will only filter by channel (show all templates for the channel)

    // Only show active templates by default
    if (!searchParams.has('includeInactive')) {
      query.isActive = true;
    }

    const templates = await Template.find(query)
      .populate('companyAccounts', 'name identifier type')
      .sort('name')
      .lean();

    return NextResponse.json({
      success: true,
      data: templates
    });

  } catch (error) {
    console.error('Get templates error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
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
    
    const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);
    
    const body = await request.json();
    const { 
      name, 
      channel, 
      companyAccounts,
      templateLanguage,
      body: templateBody,
      subject,
      category,
      parameters,
      isActive = true
    } = body;

    if (!name || !channel || !companyAccounts || companyAccounts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // WhatsApp-specific validation - language is mandatory only for WhatsApp
    if (channel === 'whatsapp') {
      if (!templateLanguage) {
        return NextResponse.json(
          { success: false, error: 'Template language is required for WhatsApp templates' },
          { status: 400 }
        );
      }
      
      // Validate WhatsApp language code format
      if (!WHATSAPP_LANGUAGE_CODES.includes(templateLanguage)) {
        return NextResponse.json(
          { success: false, error: 'Invalid WhatsApp template language code' },
          { status: 400 }
        );
      }
    } else {
      // For non-WhatsApp channels, body is required
      if (!templateBody) {
        return NextResponse.json(
          { success: false, error: 'Template body is required' },
          { status: 400 }
        );
      }
      
      // Language should not be set for non-WhatsApp channels
      if (templateLanguage) {
        return NextResponse.json(
          { success: false, error: 'Template language is only applicable for WhatsApp templates' },
          { status: 400 }
        );
      }
    }

    // Email-specific validation
    if (channel === 'email' && !subject) {
      return NextResponse.json(
        { success: false, error: 'Subject is required for email templates' },
        { status: 400 }
      );
    }

    // ✅ CRITICAL: Template names must be globally unique across all templates
    // Normalize the name: trim, collapse multiple spaces, lowercase
    const normalizedName = normalizeName(name);
    
    // Check for existing templates with the same name (case-insensitive, space-normalized, globally unique)
    const existingTemplate = await Template.findOne({
      name: { $regex: new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    if (existingTemplate) {
      return NextResponse.json(
        { success: false, error: `Template name "${name}" already exists. Template names must be unique across all templates. Please use a different name.` },
        { status: 400 }
      );
    }

    // For WhatsApp templates, don't allow parameters for now
    const finalParameters = channel === 'whatsapp' ? [] : (parameters || []);

    const template = await Template.create({
      name,
      channel,
      companyAccounts,
      templateLanguage: channel === 'whatsapp' ? templateLanguage : undefined, // Only save for WhatsApp
      body: templateBody,
      subject,
      category,
      parameters: finalParameters, // Empty array for WhatsApp
      isActive,
      usageCount: 0,
      createdBy: auth.user.userId,
      tenantId: context.tenantId
    });

    await template.populate('companyAccounts', 'name identifier type');

    return NextResponse.json({
      success: true,
      data: template
    }, { status: 201 });

  } catch (error) {
    console.error('Create template error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}