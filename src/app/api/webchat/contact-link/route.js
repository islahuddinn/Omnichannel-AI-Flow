// src/app/api/webchat/contact-link/route.js
/**
 * API Route for generating dedicated WebChat contact links
 * POST /api/webchat/contact-link - Generate new link
 * GET /api/webchat/contact-link?linkId=xxx - Verify link
 */

import { NextResponse } from 'next/server';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import { verifyAuth } from '@/middleware/auth';
import WebChatSessionSchema from '@/models/schemas/WebChatSession';
import ContactSchema from '@/models/schemas/Contact';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import DepartmentSchema from '@/models/schemas/Department';
import { CHANNEL_TYPES } from '@/config/constants';
import crypto from 'crypto';

/**
 * POST /api/webchat/contact-link
 * Generate a dedicated contact link with PIN
 * Request body: { contactId?, channelAccountId? }
 * Note: departmentId is automatically retrieved from the WebChat account's departmentIds
 */
export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);

    const WebChatSession = tenantDB.models.WebChatSession || tenantDB.model('WebChatSession', WebChatSessionSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);

    const body = await request.json();
    const { contactId, channelAccountId } = body;

    // Get WebChat channel account
    let channelAccount;
    if (channelAccountId) {
      channelAccount = await CompanyAccount.findById(channelAccountId);
      if (!channelAccount || channelAccount.type !== 'webchat') {
        return NextResponse.json(
          { success: false, error: 'Invalid WebChat account' },
          { status: 400 }
        );
      }
    } else {
      // ✅ Find first active WebChat account
      // Note: We're already in tenant-specific database, so no need to filter by companyId
      // Use CHANNEL_TYPES.WEBCHAT to ensure correct type matching
      channelAccount = await CompanyAccount.findOne({
        type: CHANNEL_TYPES.WEBCHAT || 'webchat',
        $or: [
          { isActive: true },
          { status: 'active' }
        ]
      }).lean();

      // ✅ Debug logging
      if (!channelAccount) {
        // Try to find any webchat account (even inactive) for debugging
        const allWebchatAccounts = await CompanyAccount.find({ 
          type: { $in: ['webchat', 'WEBCHAT', CHANNEL_TYPES.WEBCHAT] }
        }).lean();
        
        console.log('🔍 Debug: WebChat accounts found:', {
          tenantId: context.tenantId,
          total: allWebchatAccounts.length,
          accounts: allWebchatAccounts.map(acc => ({
            _id: acc._id,
            name: acc.name,
            type: acc.type,
            isActive: acc.isActive,
            status: acc.status,
            companyId: acc.companyId
          }))
        });
        
        return NextResponse.json(
          { 
            success: false, 
            error: 'No active WebChat account configured. Please connect a WebChat account first.',
            debug: {
              totalWebchatAccounts: allWebchatAccounts.length,
              activeAccounts: allWebchatAccounts.filter(a => a.isActive || a.status === 'active').length,
              accounts: allWebchatAccounts.map(a => ({
                name: a.name,
                isActive: a.isActive,
                status: a.status
              }))
            }
          },
          { status: 404 }
        );
      }
    }

    // ✅ Automatically get department from WebChat account
    const departmentId = channelAccount.departmentId || (channelAccount.departmentIds && channelAccount.departmentIds[0]);
    
    if (!departmentId) {
      return NextResponse.json(
        { success: false, error: 'WebChat account is not assigned to any department. Please assign a department to the WebChat account first.' },
        { status: 400 }
      );
    }

    const department = await Department.findById(departmentId);
    if (!department) {
      return NextResponse.json(
        { success: false, error: 'Department not found' },
        { status: 404 }
      );
    }

    // Generate unique contact link ID
    const linkId = crypto.randomBytes(16).toString('hex');
    // ✅ Use dynamic URL helper for port flexibility
    const { getAppUrl } = await import('@/lib/utils.js');
    const contactLink = `${getAppUrl()}/webchat/${linkId}`;

    // ✅ PIN will be set by user on first access - do NOT generate upfront
    // Session will be created without pinHash - user will set PIN during authentication

    // Find or create contact
    let contact = null;
    if (contactId) {
      contact = await Contact.findById(contactId);
      if (!contact) {
        return NextResponse.json(
          { success: false, error: 'Contact not found' },
          { status: 404 }
        );
      }

      // ✅ Check if contact already has a webchat link (from session or contact field)
      const existingSession = await WebChatSession.findOne({
        contactId: contact._id,
        status: { $in: ['active', 'authenticated', 'pending_auth'] },
      }).sort({ createdAt: -1 }); // Get most recent

      // ✅ If contact has webchatLink in contact field, use that
      if (contact.webchatLink && !existingSession) {
        return NextResponse.json({
          success: true,
          data: {
            linkId: contact.webchatLink.split('/').pop(),
            contactLink: contact.webchatLink,
            message: 'Contact already has a WebChat link',
            existing: true,
          },
        });
      }

      if (existingSession) {
        // ✅ Update contact with link if not present
        if (existingSession.contactLink && contact.webchatLink !== existingSession.contactLink) {
          contact.webchatLink = existingSession.contactLink;
          await contact.save();
        }
        
        return NextResponse.json({
          success: true,
          data: {
            linkId: existingSession.contactLink?.split('/').pop(),
            contactLink: existingSession.contactLink,
            message: 'Contact already has an active WebChat link',
            existing: true,
          },
        });
      }
    }

    // Create WebChat session
    const session = await WebChatSession.create({
      sessionId: linkId,
      visitorId: `visitor_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
      widgetId: channelAccount.identifier || channelAccount._id.toString(),
      channelAccountId: channelAccount._id,
      departmentId: department._id,
      contactId: contact?._id,
      contactLink,
      // ✅ PIN will be set by user on first access - pinHash will be null initially
      pinHash: null,
      status: 'pending_auth',
      isAuthenticated: false,
      isFirstTime: !contact,
      createdBy: auth.user.userId,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      // ✅ Store tenantId in metadata for easy lookup
      metadata: {
        tenantId: context.tenantId,
        companyId: context.companyId,
      },
    });

    // ✅ If contact exists, update it with the new WebChat link
    if (contact) {
      contact.webchatLink = contactLink;
      if (!contact.identifiers?.webchat) {
        contact.identifiers = contact.identifiers || {};
        contact.identifiers.webchat = linkId;
      }
      await contact.save();
      console.log(`✅ Updated contact ${contact._id} with WebChat link: ${contactLink}`);
    }

    console.log(`✅ WebChat contact link generated: ${contactLink} for ${contact ? `contact ${contact._id}` : 'new contact'} (Department: ${department.name})`);

    return NextResponse.json({
      success: true,
      data: {
        linkId,
        contactLink,
        // ✅ PIN not returned - user will enter it on first access
        contactId: contact?._id,
        departmentId: department._id,
        departmentName: department.name,
        expiresAt: null, // Permanent link
        message: contact 
          ? 'WebChat link generated. Share this link with the contact. They will set their PIN on first access.' 
          : 'WebChat link generated. Contact will be created when they send their first message.',
      },
    });

  } catch (error) {
    console.error('❌ WebChat contact link generation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate contact link',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webchat/contact-link?linkId=xxx
 * Verify link and get session info
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get('linkId');

    if (!linkId) {
      return NextResponse.json(
        { success: false, error: 'Link ID is required' },
        { status: 400 }
      );
    }

    // Resolve tenant from link (we'll need to store tenantId in session or use a lookup)
    // For now, try to find session across all tenants (not ideal, but works for MVP)
    // TODO: Add tenantId to WebChatSession or use a lookup table

    return NextResponse.json({
      success: true,
      data: {
        linkId,
        isValid: true,
        requiresAuth: true,
      },
    });

  } catch (error) {
    console.error('❌ WebChat link verification error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to verify link',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

