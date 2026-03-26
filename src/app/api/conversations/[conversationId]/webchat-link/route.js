// src/app/api/conversations/[conversationId]/webchat-link/route.js
/**
 * API Route for getting/generating WebChat link for a conversation
 * GET /api/conversations/[conversationId]/webchat-link - Get existing link
 * POST /api/conversations/[conversationId]/webchat-link - Generate new link
 */

import { NextResponse } from 'next/server';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import { verifyAuth } from '@/middleware/auth';
import ConversationSchema from '@/models/schemas/Conversation';
import ContactSchema from '@/models/schemas/Contact';
import WebChatSessionSchema from '@/models/schemas/WebChatSession';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import DepartmentSchema from '@/models/schemas/Department';
import { CHANNEL_TYPES } from '@/config/constants';
import crypto from 'crypto';

/**
 * GET /api/conversations/[conversationId]/webchat-link
 * Get existing WebChat link for conversation
 */
export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const conversationId = resolvedParams.conversationId;

    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: 'Conversation ID is required' },
        { status: 400 }
      );
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);

    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const WebChatSession = tenantDB.models.WebChatSession || tenantDB.model('WebChatSession', WebChatSessionSchema);

    // Get conversation with contact
    const conversation = await Conversation.findById(conversationId)
      .populate('contact', 'webchatLink identifiers')
      .lean();

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // ✅ Check if contact has webchatLink
    if (conversation.contact?.webchatLink) {
      return NextResponse.json({
        success: true,
        data: {
          linkId: conversation.contact.webchatLink.split('/').pop(),
          contactLink: conversation.contact.webchatLink,
          existing: true,
        },
      });
    }

    // ✅ Check for active WebChat session
    if (conversation.contact?._id) {
      const session = await WebChatSession.findOne({
        contactId: conversation.contact._id,
        status: { $in: ['active', 'authenticated', 'pending_auth'] },
      })
        .sort({ createdAt: -1 })
        .lean();

      if (session?.contactLink) {
        // ✅ Update contact with link if not present
        await Contact.findByIdAndUpdate(conversation.contact._id, {
          webchatLink: session.contactLink,
        });

        return NextResponse.json({
          success: true,
          data: {
            linkId: session.contactLink.split('/').pop(),
            contactLink: session.contactLink,
            existing: true,
          },
        });
      }
    }

    // No link found
    return NextResponse.json({
      success: true,
      data: {
        linkId: null,
        contactLink: null,
        existing: false,
      },
    });

  } catch (error) {
    console.error('❌ Get WebChat link error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get WebChat link',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/conversations/[conversationId]/webchat-link
 * Generate new WebChat link for conversation
 */
export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const conversationId = resolvedParams.conversationId;

    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: 'Conversation ID is required' },
        { status: 400 }
      );
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);

    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const WebChatSession = tenantDB.models.WebChatSession || tenantDB.model('WebChatSession', WebChatSessionSchema);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);

    // Get conversation with contact
    const conversation = await Conversation.findById(conversationId)
      .populate('contact')
      .lean();

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    if (!conversation.contact) {
      return NextResponse.json(
        { success: false, error: 'Conversation has no contact' },
        { status: 400 }
      );
    }

    const contact = await Contact.findById(conversation.contact._id || conversation.contact);

    // Get WebChat channel account
    const channelAccount = await CompanyAccount.findOne({
      type: CHANNEL_TYPES.WEBCHAT || 'webchat',
      $or: [
        { isActive: true },
        { status: 'active' }
      ]
    }).lean();

    if (!channelAccount) {
      return NextResponse.json(
        { success: false, error: 'No active WebChat account configured' },
        { status: 404 }
      );
    }

    // Get department from conversation or channel account
    const departmentId = conversation.department || channelAccount.departmentId || (channelAccount.departmentIds && channelAccount.departmentIds[0]);
    
    if (!departmentId) {
      return NextResponse.json(
        { success: false, error: 'Department not found' },
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

    // Create WebChat session
    const session = await WebChatSession.create({
      sessionId: linkId,
      visitorId: `visitor_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
      widgetId: channelAccount.identifier || channelAccount._id.toString(),
      channelAccountId: channelAccount._id,
      departmentId: department._id,
      contactId: contact._id,
      contactLink,
      pinHash: null,
      status: 'pending_auth',
      isAuthenticated: false,
      isFirstTime: false, // Contact already exists
      createdBy: auth.user.userId,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      metadata: {
        tenantId: context.tenantId,
        companyId: context.companyId,
      },
    });

    // ✅ Update contact with WebChat link
    contact.webchatLink = contactLink;
    if (!contact.identifiers?.webchat) {
      contact.identifiers = contact.identifiers || {};
      contact.identifiers.webchat = linkId;
    }
    await contact.save();

    console.log(`✅ Generated WebChat link for conversation ${conversationId}: ${contactLink}`);

    return NextResponse.json({
      success: true,
      data: {
        linkId,
        contactLink,
        contactId: contact._id,
        departmentId: department._id,
        departmentName: department.name,
      },
    });

  } catch (error) {
    console.error('❌ Generate WebChat link error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate WebChat link',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

