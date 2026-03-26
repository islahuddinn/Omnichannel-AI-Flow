
// src/app/api/channels/[channelId]/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import DepartmentSchema from '@/models/schemas/Department';
import TemplateSchema from '@/models/schemas/Template';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import mongoose from 'mongoose';

export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
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

    // ✅ FIX: Populate both departmentIds and departmentId
    // Get the document (not lean) so we can call methods on it
    const channelDoc = await CompanyAccount.findById(channelId)
      .populate('departmentIds', 'name description')
      .populate('departmentId', 'name');
    
    if (!channelDoc) {
      return NextResponse.json(
        { success: false, error: 'Channel not found' },
        { status: 404 }
      );
    }
    
    // ✅ Convert to object and include credentials (they may be encrypted, but we'll return them)
    const channel = channelDoc.toObject();
    
    // ✅ Try to decrypt credentials if encrypted, otherwise use as-is
    if (channel.credentials) {
      try {
        // Check if credentials are encrypted
        if (channel.credentials.encrypted && typeof channelDoc.getDecryptedCredentials === 'function') {
          const decrypted = channelDoc.getDecryptedCredentials();
          if (decrypted && Object.keys(decrypted).length > 0) {
            // Merge decrypted credentials with existing structure
            channel.credentials = { ...channel.credentials, ...decrypted };
          }
        }
        // If not encrypted, credentials are already in plain text, use as-is
      } catch (decryptError) {
        console.warn('Could not decrypt credentials, using as-is:', decryptError.message);
        // Continue with existing credentials (may be plain text)
      }
    }

    if (!channel) {
      return NextResponse.json(
        { success: false, error: 'Channel not found' },
        { status: 404 }
      );
    }

    // ✅ CRITICAL: For agents, verify they have access to this channel's department
    if (auth.user.role === 'agent') {
      const userDepartments = auth.user.departments || [];
      const channelDepartmentId = channel.departmentId?.toString();
      const channelDepartmentIds = (channel.departmentIds || []).map(d => d._id?.toString() || d.toString());
      
      const hasAccess = userDepartments.some(userDeptId => {
        const userDeptStr = userDeptId.toString();
        return userDeptStr === channelDepartmentId || channelDepartmentIds.includes(userDeptStr);
      });

      if (!hasAccess) {
        return NextResponse.json(
          { success: false, error: 'Access denied. You do not have permission to view this channel.' },
          { status: 403 }
        );
      }
    }

    // Get template count and templates for this channel
    const templateCount = await Template.countDocuments({
      companyAccounts: channelId,
      isActive: true
    });

    const templates = await Template.find({
      companyAccounts: channelId,
      isActive: true
    })
      .select('name channel category isActive usageCount')
      .sort('name')
      .lean();

    const channelWithDetails = {
      ...channel,
      templateCount,
      templates
    };

    return NextResponse.json({
      success: true,
      data: channelWithDetails
    });

  } catch (error) {
    console.error('Get channel error:', error);
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
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);

    const channel = await CompanyAccount.findById(channelId);
    if (!channel) {
      return NextResponse.json(
        { success: false, error: 'Channel not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, credentials, settings, departmentIds, departmentId, status } = body;

    // ✅ FIX: Handle both departmentIds (array) and departmentId (single)
    const departmentsToAssign = departmentIds || (departmentId ? [departmentId] : null);

    // Update fields if provided
    if (name) channel.name = name;
    
    // ✅ FIX: Update credentials - only update provided fields (don't overwrite with empty strings)
    if (credentials) {
      Object.keys(credentials).forEach(key => {
        if (credentials[key] !== '' && credentials[key] !== null && credentials[key] !== undefined) {
          channel.credentials[key] = credentials[key];
        }
      });
    }
    
    if (settings) channel.settings = { ...channel.settings, ...settings };
    if (status) channel.status = status;
    
    // ✅ FIX: Handle department assignment
    if (departmentsToAssign) {
      // Validate departments exist and are active
      const departments = await Department.find({ 
        _id: { $in: departmentsToAssign },
        status: 'active'
      });
      
      if (departments.length !== departmentsToAssign.length) {
        return NextResponse.json(
          { success: false, error: 'One or more departments not found or inactive' },
          { status: 400 }
        );
      }
      
      // Update both departmentIds (array) and departmentId (first one for backward compatibility)
      channel.departmentIds = departmentsToAssign;
      channel.departmentId = departmentsToAssign[0];
    }

    channel.updatedAt = new Date();
    await channel.save();
    
    // ✅ FIX: Populate both department fields
    await channel.populate('departmentIds', 'name description');
    await channel.populate('departmentId', 'name');

    // Remove sensitive data before returning
    const channelObj = channel.toObject();
    if (channelObj.credentials) {
      delete channelObj.credentials.token;
      delete channelObj.credentials.apiKey;
      delete channelObj.credentials.smtpPass;
      delete channelObj.credentials.password;
      delete channelObj.credentials.accessToken;
      delete channelObj.credentials.appSecret;
    }

    return NextResponse.json({
      success: true,
      data: channelObj
    });

  } catch (error) {
    console.error('Update channel error:', error);
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

    // Count templates linked to this channel
    const linkedTemplates = await Template.find({
      companyAccounts: channelId
    }).select('_id name');

    const templateCount = linkedTemplates.length;

    // CASCADE DELETE: Delete all templates linked to this channel
    if (templateCount > 0) {
      await Template.deleteMany({
        companyAccounts: channelId
      });
      console.log(`🗑️ Deleted ${templateCount} templates linked to channel ${channelId}`);
    }

    // HARD DELETE: Permanently remove the channel from database
    await CompanyAccount.findByIdAndDelete(channelId);

    console.log(`✅ Channel ${channelId} and ${templateCount} linked templates deleted permanently`);

    return NextResponse.json({
      success: true,
      message: 'Channel deleted successfully',
      data: {
        deletedTemplates: templateCount,
        templateNames: linkedTemplates.map(t => t.name)
      }
    });

  } catch (error) {
    console.error('Delete channel error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
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

    const channel = await CompanyAccount.findById(channelId);
    if (!channel) {
      return NextResponse.json(
        { success: false, error: 'Channel not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { status } = body;

    if (!status || !['active', 'inactive', 'error', 'pending'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Valid status is required' },
        { status: 400 }
      );
    }

    channel.status = status;
    channel.updatedAt = new Date();
    
    if (status === 'active') {
      channel.lastSync = new Date();
    }
    
    await channel.save();
    
    // ✅ FIX: Populate both department fields
    await channel.populate('departmentIds', 'name description');
    await channel.populate('departmentId', 'name');

    // Remove sensitive data before returning
    const channelObj = channel.toObject();
    if (channelObj.credentials) {
      delete channelObj.credentials.token;
      delete channelObj.credentials.apiKey;
      delete channelObj.credentials.smtpPass;
      delete channelObj.credentials.password;
      delete channelObj.credentials.accessToken;
      delete channelObj.credentials.appSecret;
    }

    return NextResponse.json({
      success: true,
      data: channelObj
    });

  } catch (error) {
    console.error('Update channel status error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}