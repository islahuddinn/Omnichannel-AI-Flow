// src/app/api/templates/[templateId]/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import TemplateSchema from '@/models/schemas/Template';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import mongoose from 'mongoose';

// ✅ Helper function to normalize names: trim, collapse multiple spaces, lowercase
function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const { templateId } = resolvedParams;

    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid template ID' },
        { status: 400 }
      );
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);

    const template = await Template.findById(templateId)
      .populate('companyAccounts', 'name identifier type')
      .lean();

    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: template
    });

  } catch (error) {
    console.error('Get template error:', error);
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

    const resolvedParams = await params;
    const { templateId } = resolvedParams;

    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid template ID' },
        { status: 400 }
      );
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
      isActive
    } = body;

    const template = await Template.findById(templateId);
    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      );
    }

    // Validate channel-specific requirements
    if (channel === 'whatsapp') {
      if (!templateLanguage) {
        return NextResponse.json(
          { success: false, error: 'Template language required for WhatsApp' },
          { status: 400 }
        );
      }
    } else {
      if (!templateBody) {
        return NextResponse.json(
          { success: false, error: 'Template body required' },
          { status: 400 }
        );
      }
    }

    // ✅ CRITICAL: Template names must be globally unique across all templates
    // Check if template name already exists (excluding current template)
    if (name && name.trim()) {
      const normalizedName = normalizeName(name);
      const existingTemplate = await Template.findOne({
        _id: { $ne: templateId },
        name: { $regex: new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });

      if (existingTemplate) {
        return NextResponse.json(
          { success: false, error: `Template name "${name}" already exists. Template names must be unique across all templates. Please use a different name.` },
          { status: 400 }
        );
      }
    }

    // Update template
    if (name) template.name = name.trim().replace(/\s+/g, ' '); // Normalize spaces but keep original case
    if (channel) template.channel = channel;
    if (companyAccounts) template.companyAccounts = companyAccounts;
    if (templateLanguage !== undefined) template.templateLanguage = templateLanguage;
    if (templateBody !== undefined) template.body = templateBody;
    if (subject !== undefined) template.subject = subject;
    if (category !== undefined) template.category = category;
    if (parameters !== undefined) template.parameters = parameters;
    if (isActive !== undefined) template.isActive = isActive;

    await template.save();
    await template.populate('companyAccounts', 'name identifier type');

    return NextResponse.json({
      success: true,
      data: template
    });

  } catch (error) {
    console.error('Update template error:', error);
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

    const resolvedParams = await params;
    const { templateId } = resolvedParams;

    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid template ID' },
        { status: 400 }
      );
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);

    const template = await Template.findById(templateId);
    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      );
    }

    await Template.findByIdAndDelete(templateId);

    return NextResponse.json({
      success: true,
      message: 'Template deleted successfully'
    });

  } catch (error) {
    console.error('Delete template error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}