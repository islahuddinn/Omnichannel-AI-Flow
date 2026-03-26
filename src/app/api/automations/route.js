// src/app/api/automations/route.js
import { NextResponse } from 'next/server';
import { getTenantDB, getMasterDB } from '@/config/database';
import AutomationSchema from '@/models/schemas/Automation';
import TemplateSchema from '@/models/schemas/Template';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import DepartmentSchema from '@/models/schemas/Department';
import UserSchema from '@/models/schemas/User';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import mongoose from 'mongoose';

// ✅ Helper function to normalize names: trim, collapse multiple spaces, lowercase
function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    // Register schemas in tenant DB
    const Automation = tenantDB.models.Automation || tenantDB.model('Automation', AutomationSchema);
    const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    
    const { searchParams } = new URL(request.url);
    const checkName = searchParams.get('checkName'); // ✅ Check if automation name is available
    const excludeAutomationId = searchParams.get('excludeAutomationId'); // ✅ Exclude automation ID when checking (for edit mode)

    // ✅ If checkName is provided, only check name availability and return early
    if (checkName) {
      const normalizedName = normalizeName(checkName);
      const query = {
        tenantId: context.tenantId,
        name: { $regex: new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      };
      
      // Exclude current automation if editing
      if (excludeAutomationId && mongoose.Types.ObjectId.isValid(excludeAutomationId)) {
        query._id = { $ne: new mongoose.Types.ObjectId(excludeAutomationId) };
      }
      
      const Automation = tenantDB.models.Automation || tenantDB.model('Automation', AutomationSchema);
      const existingAutomation = await Automation.findOne(query).lean();
      
      return NextResponse.json({
        success: true,
        available: !existingAutomation,
        message: existingAutomation 
          ? `Automation name "${checkName}" already exists. Please use a different name.`
          : `Automation name "${checkName}" is available.`
      });
    }

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;
    const search = searchParams.get('search');
    const isPublished = searchParams.get('isPublished');

    const query = { tenantId: context.tenantId };
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    if (isPublished !== null && isPublished !== undefined) {
      query.isPublished = isPublished === 'true';
    }

    // Get master DB for User model
    const masterDB = await getMasterDB();
    const User = masterDB.models.User || masterDB.model('User', UserSchema);

    // Register schemas in tenant DB (already done above, but ensure they're registered)
    // Template and CompanyAccount are already registered above

    const [automations, total] = await Promise.all([
      Automation.find(query)
        .populate('departments', 'name')
        .populate('channels.channelAccountId', 'name type identifier')
        .populate('channels.templateId', 'name channel body subject')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .lean(),
      Automation.countDocuments(query)
    ]);

    // Manually populate createdBy from master DB
    const userIds = [...new Set(automations.map(a => a.createdBy).filter(Boolean))];
    const users = await User.find({ _id: { $in: userIds } })
      .select('firstName lastName email')
      .lean();
    const userMap = new Map(users.map(u => [u._id.toString(), u]));

    // Attach user data to automations
    const automationsWithUsers = automations.map(automation => ({
      ...automation,
      createdBy: automation.createdBy ? userMap.get(automation.createdBy.toString()) || automation.createdBy : null
    }));

    return NextResponse.json({
      success: true,
      data: automationsWithUsers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Automations] GET error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch automations' },
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
    const masterDB = await getMasterDB();
    
    const Automation = tenantDB.models.Automation || tenantDB.model('Automation', AutomationSchema);
    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    
    const body = await request.json();
    const { type = 'owm', name } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Automation name is required' },
        { status: 400 }
      );
    }

    // ✅ CRITICAL: Automation names must be globally unique across all automations
    // Normalize the name: trim, collapse multiple spaces, lowercase
    const normalizedName = normalizeName(name);
    
    // Check for existing automations with the same name (case-insensitive, space-normalized, globally unique)
    const existingAutomation = await Automation.findOne({
      tenantId: context.tenantId,
      name: { $regex: new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    if (existingAutomation) {
      return NextResponse.json(
        { success: false, error: `Automation name "${name}" already exists. Automation names must be unique. Please use a different name.` },
        { status: 400 }
      );
    }

    // Create automation with minimal data (will be configured later)
    // Note: aiPrompt is now stored separately in AIPrompt collection
    const automation = await Automation.create({
      name: name.trim().replace(/\s+/g, ' '), // Normalize spaces but keep original case
      type,
      isPublished: false,
      departments: [],
      channels: [],
      triggerConditions: {
        contactType: 'both',
        conditions: []
      },
      timing: {
        type: 'immediate'
      },
      createdBy: auth.user.userId,
      tenantId: context.tenantId
    });

    await automation.populate('departments', 'name');
    
    // Manually populate createdBy from master DB
    const user = await User.findById(auth.user.userId)
      .select('firstName lastName email')
      .lean();
    const automationObj = automation.toObject();
    automationObj.createdBy = user;

    return NextResponse.json({
      success: true,
      data: automationObj
    }, { status: 201 });
  } catch (error) {
    console.error('[Automations] POST error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to create automation' },
      { status: 500 }
    );
  }
}

