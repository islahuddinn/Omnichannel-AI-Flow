// src/app/api/channels/[channelId]/disconnect/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
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
    const { channelId } = resolvedParams;

    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid channel ID' },
        { status: 400 }
      );
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);

    const channel = await CompanyAccount.findById(channelId);
    if (!channel) {
      return NextResponse.json(
        { success: false, error: 'Channel not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { removeTemplates = false } = body;

    // Check if channel has active templates
    const activeTemplateCount = await Template.countDocuments({
      companyAccounts: channelId,
      isActive: true
    });

    if (activeTemplateCount > 0 && !removeTemplates) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Channel has ${activeTemplateCount} active templates. Set removeTemplates=true to disconnect anyway, or delete templates first.`,
          templateCount: activeTemplateCount
        },
        { status: 400 }
      );
    }

    // Remove templates if requested
    if (removeTemplates && activeTemplateCount > 0) {
      await Template.updateMany(
        { companyAccounts: channelId },
        { 
          $pull: { companyAccounts: channelId },
          updatedAt: new Date()
        }
      );
    }

    // ✅ FIX: Disconnect channel - clear credentials but keep department assignments
    channel.credentials = {};
    channel.status = 'inactive';
    channel.isActive = false;
    channel.lastError = {
      message: 'Channel disconnected by user',
      timestamp: new Date()
    };
    channel.updatedAt = new Date();
    
    await channel.save();

    return NextResponse.json({
      success: true,
      message: `Channel disconnected successfully${removeTemplates ? ' and templates removed' : ''}`,
      data: {
        templatesRemoved: removeTemplates ? activeTemplateCount : 0,
        // ✅ FIX: Keep department information in response
        departments: channel.departmentIds?.length || 0
      }
    });

  } catch (error) {
    console.error('Disconnect channel error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to disconnect channel' },
      { status: 500 }
    );
  }
}