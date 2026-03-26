// src/app/api/webchat/auth/route.js
/**
 * WebChat Authentication API
 * POST /api/webchat/auth - Authenticate with PIN and collect contact info
 */

import { NextResponse } from 'next/server';
import { getTenantDB, getMasterDB } from '@/config/database';
import WebChatSessionSchema from '@/models/schemas/WebChatSession';
import ContactSchema from '@/models/schemas/Contact';
import ConversationSchema from '@/models/schemas/Conversation';
import CompanySchema from '@/models/schemas/Company';
import { normalizePhoneNumber, normalizeEmail } from '@/utils/normalizers';
import bcrypt from 'bcryptjs';
import { getWebChatSecret } from '@/lib/auth/webchatSecret';

/**
 * POST /api/webchat/auth
 * Authenticate contact with PIN and collect info
 * Body: { linkId, pin, name?, email?, phone? }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { linkId, pin, name, email, phone } = body;

    if (!linkId || !pin) {
      return NextResponse.json(
        { success: false, error: 'Link ID and PIN are required' },
        { status: 400 }
      );
    }

    // Extract sessionId from linkId (linkId is the sessionId)
    const sessionId = linkId;

    // ✅ Resolve tenant from session metadata
    // First, try to get tenantId from request header (if available)
    let tenantId = request.headers.get('x-tenant-id');
    
    // If not in header, search for session across tenants to get tenantId from metadata
    if (!tenantId) {
      try {
        const masterDB = await getMasterDB();
        const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
        const companies = await Company.find({ status: 'active' }).lean();
        
        for (const company of companies) {
          try {
            const tenantDB = await getTenantDB(company._id.toString());
            const WebChatSession = tenantDB.models.WebChatSession || tenantDB.model('WebChatSession', WebChatSessionSchema);
            
            const session = await WebChatSession.findOne({ sessionId }).lean();
            if (session) {
              // ✅ Get tenantId from session metadata or use company ID
              tenantId = session.metadata?.tenantId || company._id.toString();
              break;
            }
          } catch (err) {
            console.error(`Error checking tenant ${company._id}:`, err.message);
            continue;
          }
        }
      } catch (error) {
        console.error('Error resolving tenant from master DB:', error);
        // Continue without tenantId - will fail gracefully below
      }
    }

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Invalid link or session not found' },
        { status: 404 }
      );
    }

    const tenantDB = await getTenantDB(tenantId);
    const WebChatSession = tenantDB.models.WebChatSession || tenantDB.model('WebChatSession', WebChatSessionSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);

    // Find session by sessionId (which is the linkId)
    const session = await WebChatSession.findOne({ sessionId });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Invalid link' },
        { status: 404 }
      );
    }

    // ✅ Check if contact exists with webchat identifier to determine if first-time
    let existingContact = null;
    if (sessionId) {
      existingContact = await Contact.findOne({ 'identifiers.webchat': sessionId }).lean();
    }
    
    // ✅ Determine if this is truly first-time (no contact exists with credentials)
    const isTrulyFirstTime = !existingContact || !existingContact.name || !existingContact.email || !existingContact.phone;
    
    // ✅ PIN handling: If pinHash is null, this is first-time access - set PIN
    // If pinHash exists, verify the entered PIN
    if (!session.pinHash) {
      // First-time access - user is setting their PIN
      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return NextResponse.json(
          { success: false, error: 'Please enter a valid 4-digit PIN' },
          { status: 400 }
        );
      }
      
      // Set the PIN hash (bcrypt with salt)
      const pinHash = await bcrypt.hash(pin, 10);
      session.pinHash = pinHash;
      await session.save();
      
      // ✅ After PIN is set, check if contact info is needed (for first-time visitors)
      if (isTrulyFirstTime) {
        // Check if contact info is provided
        if (!name || !email || !phone) {
          return NextResponse.json(
            { 
              success: false, 
              error: 'PIN set successfully. Please provide your contact information.',
              requiresInfo: true,
              pinSet: true,
              isFirstTime: true,
              fields: { name: !name, email: !email, phone: !phone }
            },
            { status: 400 }
          );
        }
        // Contact info is provided - proceed to create/update contact (below)
      } else {
        // PIN set for returning visitor with existing contact - authentication complete
        session.isAuthenticated = true;
        session.isFirstTime = false;
        session.contactId = existingContact._id;
        session.authenticatedAt = new Date();
        session.lastActivityAt = new Date();
        await session.save();
        
        // Generate JWT token
        const jwt = await import('jsonwebtoken');
        const token = jwt.sign(
          {
            sessionId: session.sessionId,
            visitorId: session.visitorId,
            widgetId: session.widgetId,
            contactId: session.contactId?.toString(),
            conversationId: session.conversationId?.toString(),
            tenantId,
          },
          getWebChatSecret(),
          { expiresIn: '30d' }
        );

        return NextResponse.json({
          success: true,
          data: {
            authenticated: true,
            token,
            session: {
              sessionId: session.sessionId,
              contactId: session.contactId,
              conversationId: session.conversationId,
              isFirstTime: false,
            },
          },
        });
      }
    } else {
      // Returning visitor - verify PIN (bcrypt compare)
      const pinMatch = await bcrypt.compare(pin, session.pinHash);
      if (!pinMatch) {
        return NextResponse.json(
          { success: false, error: 'Invalid PIN' },
          { status: 401 }
        );
      }
    }

    // ✅ If we reach here, PIN is set and verified
    // Now handle contact info collection for first-time visitors
    // ✅ Create or update contact with provided info
    if (isTrulyFirstTime && name && email && phone) {
      // ✅ Normalize email and phone for accurate matching
      const normalizedEmail = email ? normalizeEmail(email) : null;
      const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;

      // ✅ Check for existing contact by email OR phone (normalized)
      // This handles the case where user enters same email/phone on a new link
      let contact = null;
      
      if (normalizedEmail || normalizedPhone) {
        const queryConditions = [];
        
        if (normalizedEmail) {
          queryConditions.push({ email: normalizedEmail });
        }
        
        if (normalizedPhone) {
          queryConditions.push({ phone: normalizedPhone });
        }
        
        // Also check by webchat identifier (for backward compatibility)
        if (sessionId) {
          queryConditions.push({ 'identifiers.webchat': sessionId });
        }
        
        if (queryConditions.length > 0) {
          contact = await Contact.findOne({
            $or: queryConditions
          });
        }
      }

      // ✅ If existing contact found, update it with new info
      if (contact) {
        console.log(`✅ Found existing contact ${contact._id} for email/phone on new WebChat link`);
        
        // Update existing contact with new info
        let contactUpdated = false;
        if (name && (!contact.name || contact.name === 'WebChat Visitor')) {
          contact.name = name;
          contactUpdated = true;
        }
        if (normalizedEmail && !contact.email) {
          contact.email = normalizedEmail;
          contactUpdated = true;
        }
        if (normalizedPhone && !contact.phone) {
          contact.phone = normalizedPhone;
          contactUpdated = true;
        }
        
        // ✅ Update webchat identifier and link
        if (!contact.identifiers?.webchat) {
          contact.identifiers = contact.identifiers || {};
          contact.identifiers.webchat = sessionId;
          contactUpdated = true;
        }
        
        // ✅ Update WebChat link in contact
        if (session.contactLink && contact.webchatLink !== session.contactLink) {
          contact.webchatLink = session.contactLink;
          contactUpdated = true;
        }
        
        if (contactUpdated) {
          await contact.save();
        }
        
        // ✅ Mark session as NOT first-time since contact already exists
        session.isFirstTime = false;
        session.contactId = contact._id;
      } else {
        // ✅ Create contact with provided info (permanent storage)
        contact = await Contact.create({
          name: name,
          email: normalizedEmail,
          phone: normalizedPhone,
          identifiers: { webchat: sessionId },
          webchatLink: session.contactLink,
          channel: 'webchat',
          Contact_Type: 'Customer',
          department: session.departmentId,
          tenantId: tenantId,
        });
        
        console.log(`✨ Created new contact ${contact._id} with credentials for WebChat session ${sessionId}`);
        
        session.contactId = contact._id;
        session.isFirstTime = false;
      }

      // Update session with contact info
      session.contactInfo = {
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        collectedAt: new Date(),
      };
      await session.save();
    } else if (existingContact && !isTrulyFirstTime) {
      // ✅ Returning user with existing contact - use existing contact
      session.contactId = existingContact._id;
      session.isFirstTime = false;
      session.contactInfo = {
        name: existingContact.name,
        email: existingContact.email,
        phone: existingContact.phone,
      };
      await session.save();
    }

    // Update session status
    session.status = 'authenticated';
    session.isAuthenticated = true;
    session.authenticatedAt = new Date();
    session.lastActivityAt = new Date();
    await session.save();

    // ✅ Create or find conversation
    // Priority: 1. Existing conversation from session, 2. Existing active WebChat conversation for contact, 3. Create new
    let conversation = null;
    
    // First, check if session already has a conversation
    if (session.conversationId) {
      conversation = await Conversation.findById(session.conversationId);
    }
    
    // ✅ If no conversation found and contact exists, check for existing active WebChat conversation
    // This handles the case where user has existing chats from a previous link
    if (!conversation && session.contactId) {
      // Find existing active WebChat conversation for this contact
      // Prioritize: same department > any active WebChat conversation
      conversation = await Conversation.findOne({
        contact: session.contactId,
        channel: 'webchat',
        status: 'active',
        ...(session.departmentId ? { department: session.departmentId } : {})
      }).sort({ lastMessageAt: -1 }); // Get most recent
      
      // If not found with same department, try any active WebChat conversation
      if (!conversation) {
        conversation = await Conversation.findOne({
          contact: session.contactId,
          channel: 'webchat',
          status: 'active',
        }).sort({ lastMessageAt: -1 }); // Get most recent
      }
      
      if (conversation) {
        console.log(`✅ Found existing WebChat conversation ${conversation._id} for contact ${session.contactId}`);
        
        // Link session to existing conversation
        session.conversationId = conversation._id;
        await session.save();
      } else {
        // ✅ Determine conversation mode based on department's AI bot enabled status
        const { getConversationModeForDepartment } = await import('@/services/conversation/ConversationModeHelper.js');
        const conversationMode = await getConversationModeForDepartment({
          departmentId: session.departmentId,
          tenantDB
        });
        
        // ✅ Create new conversation if none exists
        conversation = await Conversation.create({
          contact: session.contactId,
          channel: 'webchat',
          channelAccount: session.channelAccountId,
          department: session.departmentId,
          status: 'active',
          mode: conversationMode, // ✅ Set mode based on department AI bot enabled status
          createdAt: new Date(),
          lastMessageAt: new Date(),
        });
        
        console.log(`✨ Created new WebChat conversation ${conversation._id} for contact ${session.contactId}`);
        
        session.conversationId = conversation._id;
        await session.save();
      }
    }

    // ✅ Fetch company and agent information
    let companyInfo = null;
    let agentInfo = null;
    
    try {
      // Get company info from master database
      const masterDB = await getMasterDB();
      const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
      const company = await Company.findById(tenantId).lean();
      
      if (company) {
        companyInfo = {
          name: company.name,
          email: company.email,
          phone: company.phone,
          website: company.website,
          address: company.address,
        };
      }
      
      // Get agent info from conversation if assigned
      if (conversation?.assignedTo) {
        const UserSchema = (await import('@/models/schemas/User')).default;
        const User = tenantDB.models.User || tenantDB.model('User', UserSchema);
        const agent = await User.findById(conversation.assignedTo).select('firstName lastName email avatar role').lean();
        
        if (agent) {
          agentInfo = {
            id: agent._id.toString(),
            name: `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || 'Support Agent',
            email: agent.email,
            avatar: agent.avatar,
            role: agent.role,
          };
        }
      }
      
      // If no agent assigned, get first agent from department
      if (!agentInfo && session.departmentId) {
        const DepartmentSchema = (await import('@/models/schemas/Department')).default;
        const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
        const department = await Department.findById(session.departmentId).lean();
        
        if (department) {
          // Try first agent from department
          if (department.agents && department.agents.length > 0) {
            const UserSchema = (await import('@/models/schemas/User')).default;
            const User = tenantDB.models.User || tenantDB.model('User', UserSchema);
            const firstAgent = await User.findById(department.agents[0]).select('firstName lastName email avatar role').lean();
            
            if (firstAgent) {
              agentInfo = {
                id: firstAgent._id.toString(),
                name: `${firstAgent.firstName || ''} ${firstAgent.lastName || ''}`.trim() || 'Support Agent',
                email: firstAgent.email,
                avatar: firstAgent.avatar,
                role: firstAgent.role,
              };
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching company/agent info:', error);
      // Continue without company/agent info
    }

    // Generate JWT token for socket connection
    const jwt = await import('jsonwebtoken');
    const token = jwt.sign(
      {
        sessionId: session.sessionId,
        visitorId: session.visitorId,
        widgetId: session.widgetId,
        contactId: session.contactId?.toString(),
        conversationId: conversation?._id?.toString(),
        tenantId,
      },
      getWebChatSecret(),
      {
        expiresIn: '30d', // Long-lived session
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        authenticated: true,
        token,
        session: {
          sessionId: session.sessionId,
          contactId: session.contactId,
          conversationId: session.conversationId,
          isFirstTime: isTrulyFirstTime ? false : false, // Always false after authentication
          companyInfo,
          agentInfo,
          // ✅ Include contactInfo with phone number for welcome message
          contactInfo: session.contactInfo ? {
            name: session.contactInfo.name,
            email: session.contactInfo.email,
            phone: session.contactInfo.phone,
            collectedAt: session.contactInfo.collectedAt,
          } : null,
        },
        contact: session.contactId ? {
          id: session.contactId,
          name: session.contactInfo?.name,
          email: session.contactInfo?.email,
          phone: session.contactInfo?.phone, // ✅ Include phone in contact
        } : null,
        companyInfo,
        agentInfo,
      },
    });

  } catch (error) {
    console.error('❌ WebChat authentication error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Authentication failed',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/webchat/auth/returning
 * Authenticate returning visitor with PIN only
 */
export async function PUT(request) {
  try {
    const body = await request.json();
    const { linkId, pin } = body;

    if (!linkId || !pin) {
      return NextResponse.json(
        { success: false, error: 'Link ID and PIN are required' },
        { status: 400 }
      );
    }

    // Similar to POST but for returning visitors
    // Find session, verify PIN, update status, return token
    // Implementation similar to POST but skip contact creation

    return NextResponse.json({
      success: true,
      message: 'Returning visitor authentication - implement similar to POST',
    });

  } catch (error) {
    console.error('❌ WebChat returning auth error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Authentication failed',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

