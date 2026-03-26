// src/app/api/conversations/start/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import ConversationSchema from '@/models/schemas/Conversation';
import ContactSchema from '@/models/schemas/Contact';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import WebChatSessionSchema from '@/models/schemas/WebChatSession';
import DepartmentSchema from '@/models/schemas/Department';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { generateWebChatLinkForContact } from '@/services/contact/ContactService';
import crypto from 'crypto';

export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    const WebChatSession = tenantDB.models.WebChatSession || tenantDB.model('WebChatSession', WebChatSessionSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    
    const body = await request.json();
    const { 
      channel, 
      identifier, // phone/email/facebookId/instagramId
      channelAccountId,
      departmentId,
      generateWebChatLink,
      contactName
    } = body;

    // Validate
    if (!channel) {
      return NextResponse.json(
        { success: false, error: 'Channel is required' },
        { status: 400 }
      );
    }

    // Get user's department
    let selectedDepartment = departmentId;
    if (!selectedDepartment) {
      // ✅ Try to get department from channel account if channelAccountId is provided
      if (channelAccountId) {
        const channelAccount = await CompanyAccount.findById(channelAccountId).lean();
        if (channelAccount) {
          // ✅ Use departmentId from channel account if available
          if (channelAccount.departmentId) {
            selectedDepartment = channelAccount.departmentId;
            console.log('✅ Using department from channel account:', selectedDepartment);
          } else if (channelAccount.departmentIds && channelAccount.departmentIds.length > 0) {
            // ✅ Use first department from departmentIds array if available
            selectedDepartment = channelAccount.departmentIds[0];
            console.log('✅ Using first department from channel account departmentIds:', selectedDepartment);
          }
        }
      }
      
      // ✅ If still no department, try user's department
      if (!selectedDepartment) {
        if (auth.user.role === 'agent') {
          selectedDepartment = auth.user.departments?.[0];
          if (!selectedDepartment) {
            return NextResponse.json(
              { success: false, error: 'No department assigned to your account' },
              { status: 400 }
            );
          }
        } else {
          // ✅ Company admin - try to get default department or first available
          const defaultDept = await Department.findOne({ isDefault: true }).lean();
          if (defaultDept) {
            selectedDepartment = defaultDept._id;
            console.log('✅ Using default department:', selectedDepartment);
          } else {
            // ✅ Try to get first available department
            const firstDept = await Department.findOne().lean();
            if (firstDept) {
              selectedDepartment = firstDept._id;
              console.log('✅ Using first available department:', selectedDepartment);
            } else {
              // ✅ Only require department selection if no department can be determined
              return NextResponse.json(
                { success: false, error: 'Department selection required', requiresDepartment: true },
                { status: 400 }
              );
            }
          }
        }
      }
    }

    // Handle WebChat link generation
    if (channel === 'webchat' && generateWebChatLink) {
      const channelAccount = await CompanyAccount.findOne({
        type: 'webchat',
        isActive: true
      });

      if (!channelAccount) {
        return NextResponse.json(
          { success: false, error: 'No WebChat channel configured' },
          { status: 400 }
        );
      }

      // Generate unique session
      const sessionId = crypto.randomBytes(16).toString('hex');
      const token = crypto.randomBytes(32).toString('hex');
      
      const webChatSession = await WebChatSession.create({
        sessionId,
        token,
        channelAccount: channelAccount._id,
        department: selectedDepartment,
        createdBy: auth.user.userId
      });

      // ✅ Use dynamic URL helper for port flexibility
      const { getAppUrl } = await import('@/lib/utils.js');
      const webChatLink = `${getAppUrl()}/webchat/${sessionId}?token=${token}`;

      return NextResponse.json({
        success: true,
        data: {
          type: 'webchat_link',
          sessionId,
          link: webChatLink,
          message: 'WebChat link generated. Share this link with your contact.'
        }
      });
    }

    // Validate identifier for non-webchat (webchat uses linkId as identifier)
    if (!identifier && channel !== 'webchat') {
      return NextResponse.json(
        { success: false, error: 'Contact identifier is required' },
        { status: 400 }
      );
    }

    // ✅ Normalize identifier using the same logic as message sending
    let normalizedIdentifier = identifier ? identifier.trim() : '';
    if (channel === 'whatsapp' || channel === 'sms') {
      // Use the same normalization function as message sending
      const { normalizePhoneNumber } = await import('@/utils/normalizers');
      normalizedIdentifier = normalizePhoneNumber(identifier);
      // ✅ Ensure normalizedIdentifier always has + prefix
      if (!normalizedIdentifier.startsWith('+')) {
        normalizedIdentifier = '+' + normalizedIdentifier.replace(/^\+/, '');
      }
    } else if (channel === 'email') {
      normalizedIdentifier = normalizedIdentifier.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedIdentifier)) {
        return NextResponse.json(
          { success: false, error: 'Invalid email format' },
          { status: 400 }
        );
      }
    } else if (channel === 'webchat') {
      // For webchat, identifier is the linkId (webchat session ID)
      // Find contact by webchat identifier
      normalizedIdentifier = normalizedIdentifier.trim();
    }

    // ✅ ONLY FIND contact - DO NOT CREATE IT HERE
    // Contact will be created when the first message is sent (in /messages/send route)
    let contact = null;
    
    if (channel === 'whatsapp' || channel === 'sms') {
      // ✅ Use comprehensive phone matching logic (same as bulk SMS and ContactService)
      const phoneWithoutPlus = normalizedIdentifier.replace(/^\+/, '');
      const phoneWith00 = phoneWithoutPlus ? `00${phoneWithoutPlus}` : null;
      
      // Build array of all phone variations to search
      const allPhoneVariations = new Set();
      
      // Add normalized phone (with +)
      if (normalizedIdentifier) allPhoneVariations.add(normalizedIdentifier);
      
      // Add without + prefix
      if (phoneWithoutPlus) allPhoneVariations.add(phoneWithoutPlus);
      
      // Add with 00 prefix
      if (phoneWith00) allPhoneVariations.add(phoneWith00);
      
      // Add original format
      if (identifier) allPhoneVariations.add(identifier.trim());
      
      // Add variations with leading 0 removed (some numbers might have leading 0)
      if (phoneWithoutPlus && phoneWithoutPlus.startsWith('0') && phoneWithoutPlus.length > 1) {
        const phoneWithoutLeadingZero = phoneWithoutPlus.substring(1);
        allPhoneVariations.add(phoneWithoutLeadingZero);
        allPhoneVariations.add('+' + phoneWithoutLeadingZero);
      }
      
      // Convert to array for query building
      const phoneVariationsArray = Array.from(allPhoneVariations).filter(Boolean);
      
      // ✅ Build comprehensive query - check ALL variations across ALL phone-related fields
      const contactQuery = {
        $or: []
      };
      
      // Add all variations for each field
      phoneVariationsArray.forEach(phoneVar => {
        if (phoneVar) {
          contactQuery.$or.push(
            { phone: phoneVar },
            { normalizedPhone: phoneVar },
            { 'identifiers.sms': phoneVar },
            { 'identifiers.whatsapp': phoneVar },
            { 'identifiers.webchat': phoneVar },
            { 'identifiers.call': phoneVar }
          );
        }
      });
      
      if (contactQuery.$or.length > 0) {
        contact = await Contact.findOne(contactQuery).lean();
        
        if (contact) {
          console.log(`✅ [Start Conversation] Found existing contact: ${contact._id}`, {
            contactPhone: contact.phone,
            contactNormalizedPhone: contact.normalizedPhone,
            searchIdentifier: identifier,
            normalizedIdentifier: normalizedIdentifier
          });
        } else {
          console.log(`ℹ️ [Start Conversation] No existing contact found for: ${identifier} - will be created when first message is sent`);
        }
      }
    } else if (channel === 'email') {
      contact = await Contact.findOne({
        $or: [
          { email: normalizedIdentifier },
          { 'identifiers.email': normalizedIdentifier }
        ]
      }).lean();
    } else if (channel === 'webchat') {
      contact = await Contact.findOne({
        'identifiers.webchat': normalizedIdentifier
      }).lean();
    } else if (channel === 'facebook') {
      contact = await Contact.findOne({
        'identifiers.facebook': normalizedIdentifier
      }).lean();
    } else if (channel === 'instagram') {
      contact = await Contact.findOne({
        'identifiers.instagram': normalizedIdentifier
      }).lean();
    }

    // ✅ If contact doesn't exist, create a temporary contact object for the response
    // The actual contact will be created when the first message is sent
    if (!contact) {
      contact = {
        _id: null, // Will be created when first message is sent
        name: contactName || null,
        displayName: contactName || null,
        phone: (channel === 'whatsapp' || channel === 'sms') ? normalizedIdentifier : null,
        email: channel === 'email' ? normalizedIdentifier : null,
        identifiers: {
          [channel]: normalizedIdentifier
        },
        webchatLink: null
      };
    }
    
    // ✅ Check for existing conversations - only if contact exists
    let existingConversation = null;
    if (contact._id) {
      // First check exact match (contact + channel)
      existingConversation = await Conversation.findOne({
        contact: contact._id,
        channel,
        status: { $in: ['active', 'open', 'pending'] }
      }).sort({ lastMessageAt: -1 }).lean();

      // ✅ If no exact match, check for ANY conversation with this contact and identifier (reopen logic)
      if (!existingConversation) {
        existingConversation = await Conversation.findOne({
          contact: contact._id,
          status: { $in: ['active', 'open', 'pending', 'closed'] },
          channel: channel,
        }).sort({ lastMessageAt: -1 }).lean();
      }
    }

    // ✅ Ensure selectedChannelAccount is defined before checking existing conversations
    // ✅ If found, reopen it instead of creating duplicate
    if (existingConversation) {
      // ✅ Check if agent has access to this conversation's department
      if (auth.user.role === 'agent') {
        const userDepartments = auth.user.departments || [];
        const existingConvDept = existingConversation.department?.toString() || existingConversation.department;
        const hasAccess = userDepartments.some(ud => ud.toString() === existingConvDept);
        
        if (!hasAccess) {
          // ✅ Fetch department name for better error message
          let departmentName = 'another department';
          try {
            const dept = await Department.findById(existingConvDept).lean();
            if (dept && dept.name) {
              departmentName = dept.name;
            }
          } catch (deptError) {
            console.error('Error fetching department:', deptError);
          }
          
          return NextResponse.json({
            success: false,
            error: `A conversation with this contact already exists in ${departmentName}`,
            errorCode: 'CONVERSATION_EXISTS_IN_OTHER_DEPARTMENT',
            departmentName: departmentName,
            existingConversationId: existingConversation._id
          }, { status: 403 });
        }
      }
      
      // Get available accounts to use in response
      const availableAccounts = await CompanyAccount.find({
        type: channel,
        isActive: true
      }).lean();
      
      // If conversation was closed, reactivate it
      if (existingConversation.status === 'closed') {
        await Conversation.findByIdAndUpdate(existingConversation._id, {
          status: 'active',
        });
        existingConversation.status = 'active';
      }
      
      // ✅ Reload contact to get latest data including webchatLink (only if contact exists)
      const reloadedContact = contact._id ? await Contact.findById(contact._id).lean() : contact;
      
      return NextResponse.json({
        success: true,
        data: {
          type: 'existing',
          conversationId: existingConversation._id,
          conversation: existingConversation,
          contact: {
            _id: reloadedContact._id || null,
            name: reloadedContact.name || reloadedContact.displayName || null,
            displayName: reloadedContact.displayName || reloadedContact.name || null,
            phone: reloadedContact.phone || null,
            email: reloadedContact.email || null,
            avatar: reloadedContact.avatar || null,
            identifiers: reloadedContact.identifiers || {},
            webchatLink: reloadedContact.webchatLink || null // ✅ Include webchatLink in response
          },
          channelAccount: availableAccounts.find(acc => 
            acc._id.toString() === existingConversation.channelAccount?.toString()
          ) || availableAccounts[0],
          // ✅ Return all available accounts so frontend can show them
          availableAccounts: availableAccounts.map(acc => ({
            _id: acc._id,
            name: acc.name,
            identifier: acc.identifier,
            type: acc.type
          })),
          message: 'Opening existing conversation'
        }
      });
    }

    // ✅ Get all available channel accounts for this channel type
    // ✅ CRITICAL: For agents, filter by their assigned departments
    const accountQuery = {
      type: channel,
      isActive: true
    };
    
    // ✅ For agents, only show accounts from their departments
    // Check both departmentId (single) and departmentIds (array)
    if (auth.user.role === 'agent') {
      const userDepartments = auth.user.departments || [];
      if (userDepartments.length > 0) {
        accountQuery.$or = [
          { departmentId: { $in: userDepartments } },
          { departmentIds: { $in: userDepartments } }
        ];
      } else {
        // Agent has no departments - return error
        return NextResponse.json(
          { success: false, error: `No ${channel} account available for your department` },
          { status: 400 }
        );
      }
    }
    
    const availableAccounts = await CompanyAccount.find(accountQuery).lean();

    if (availableAccounts.length === 0) {
      return NextResponse.json(
        { success: false, error: `No ${channel} account configured` },
        { status: 400 }
      );
    }

    // ✅ Auto-select account: use provided channelAccountId, or first available account
    let selectedChannelAccount;
    if (channelAccountId) {
      selectedChannelAccount = availableAccounts.find(acc => acc._id.toString() === channelAccountId);
      if (!selectedChannelAccount) {
        // ✅ If provided account not found, fall back to first available
        console.log('⚠️ Provided channel account not found, using first available:', channelAccountId);
        selectedChannelAccount = availableAccounts[0];
      }
    } else {
      // ✅ Auto-select first available account
      selectedChannelAccount = availableAccounts[0];
      console.log('✅ Auto-selected first available channel account:', selectedChannelAccount._id);
    }

    // Check if we should auto-merge (only if contact exists)
    let shouldAutoMerge = false;
    let primaryConversation = null;

    if (contact._id && !contact.autoMergeDisabled) {
      // Find other open conversations for this contact
      const otherConversations = await Conversation.find({
        contact: contact._id,
        channel: { $ne: channel },
        status: { $in: ['open', 'pending'] },
        isMerged: false
      }).lean();

      if (otherConversations.length > 0) {
        shouldAutoMerge = true;
        primaryConversation = otherConversations[0];
      }
    }

    // ✅ Determine conversation mode based on department's AI bot enabled status
    const { getConversationModeForDepartment } = await import('@/services/conversation/ConversationModeHelper.js');
    const conversationMode = await getConversationModeForDepartment({
      departmentId: selectedDepartment,
      tenantDB
    });

    // ✅ Create draft conversation data (temporary - will be saved on first message)
    // Note: contact._id may be null if contact doesn't exist yet - it will be created when first message is sent
    const conversationData = {
      contact: contact._id || null, // Will be set when contact is created on first message
      channel,
      channelAccount: selectedChannelAccount._id,
      department: selectedDepartment,
      assignedTo: auth.user.userId,
      status: 'active',
      mode: conversationMode, // ✅ Set mode based on department AI bot enabled status
      messageCount: 0,
      unreadCount: 0,
      autoMerge: shouldAutoMerge,
      primaryConversation: primaryConversation?._id,
      tenantId: context.tenantId,
    };

    return NextResponse.json({
      success: true,
      data: {
        type: 'new',
        conversation: conversationData,
        contact: {
          _id: contact._id || null, // Will be created when first message is sent
          name: contact.name || contact.displayName || contactName || null,
          displayName: contact.displayName || contact.name || contactName || null,
          phone: contact.phone || ((channel === 'whatsapp' || channel === 'sms') ? normalizedIdentifier : null),
          email: contact.email || (channel === 'email' ? normalizedIdentifier : null),
          avatar: contact.avatar || null,
          identifiers: contact.identifiers || { [channel]: normalizedIdentifier },
          webchatLink: contact.webchatLink || null // ✅ Include webchatLink in response
        },
        channelAccount: {
          _id: selectedChannelAccount._id,
          name: selectedChannelAccount.name,
          identifier: selectedChannelAccount.identifier,
          type: selectedChannelAccount.type
        },
        // ✅ Return all available accounts so frontend can show them
        availableAccounts: availableAccounts.map(acc => ({
          _id: acc._id,
          name: acc.name,
          identifier: acc.identifier,
          type: acc.type
        })),
        shouldAutoMerge,
        primaryConversation,
        message: shouldAutoMerge 
          ? 'This conversation will be merged with existing conversations'
          : 'Ready to send first message'
      }
    });

  } catch (error) {
    console.error('Start conversation error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}