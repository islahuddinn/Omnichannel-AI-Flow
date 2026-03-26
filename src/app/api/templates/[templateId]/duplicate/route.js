// src/app/api/templates/[templateId]/duplicate/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import TemplateSchema from '@/models/schemas/Template';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import mongoose from 'mongoose';

export async function POST(request, { params }) {
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

    const originalTemplate = await Template.findById(templateId);
    if (!originalTemplate) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      );
    }

    // Create duplicate
    const duplicateTemplate = await Template.create({
      ...originalTemplate.toObject(),
      _id: undefined,
      name: `${originalTemplate.name} (Copy)`,
      usageCount: 0,
      createdBy: auth.user.userId,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await duplicateTemplate.populate('companyAccounts', 'name identifier type');

    return NextResponse.json({
      success: true,
      data: duplicateTemplate
    }, { status: 201 });

  } catch (error) {
    console.error('Duplicate template error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}