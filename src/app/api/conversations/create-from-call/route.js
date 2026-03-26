// src/app/api/conversations/create-from-call/route.js
// Call center: creates or finds conversation and contact when an incoming call is received (used by useCallCenter).

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import ConversationSchema from '@/models/schemas/Conversation';
import ContactSchema from '@/models/schemas/Contact';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import { normalizePhoneNumber } from '@/utils/normalizers';
import SocketEmitter from '@/services/socket/SocketEmitter';
import { CHANNEL_TYPES } from '@/config/constants';

/**
 * POST /api/conversations/create-from-call
 * 
 * Creates a conversation and contact for an incoming call in real-time.
 * Handles phone number normalization (+, 00 prefixes, etc.) to prevent duplicates.
 * 
 * Request Body:
 * - phoneNumber: string (required) - The caller's phone number
 * - channelAccountId: string (optional) - Specific channel account ID
 * - departmentId: string (optional) - Specific department ID
 * 
 * Response:
 * - success: boolean
 * - message: string
 * - data: {
 *     conversationId: string
 *     contactId: string
 *     contactCreated: boolean
 *     conversationCreated: boolean
 *     phoneNumber: string (normalized)
 *   }
 */
export async function POST(request) {
  try {
    console.log('📞 [create-from-call] API endpoint called');
    
    // Verify authentication
    const auth = await verifyAuth(request);
    if (!auth.success) {
      console.error('❌ [create-from-call] Authentication failed');
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get tenant context
    const context = await getTenantContext(request);
    if (!context?.tenantId) {
      console.error('❌ [create-from-call] No tenant context');
      return NextResponse.json(
        { success: false, error: 'Tenant context required' },
        { status: 400 }
      );
    }

    // Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('❌ [create-from-call] Invalid JSON in request body:', parseError);
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { phoneNumber, channelAccountId, departmentId, contactName: requestContactName } = body;

    console.log('📞 [create-from-call] Request data:', { 
      phoneNumber, 
      channelAccountId, 
      departmentId,
      tenantId: context.tenantId 
    });

    // Validate required fields
    if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.trim() === '') {
      console.error('❌ [create-from-call] Phone number is required');
      return NextResponse.json(
        { success: false, error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Get tenant database connection
    const tenantDB = await getTenantDB(context.tenantId);
    if (!tenantDB) {
      console.error('❌ [create-from-call] Failed to get tenant database');
      return NextResponse.json(
        { success: false, error: 'Database connection failed' },
        { status: 500 }
      );
    }

    // Initialize models
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);

    // Clean phone number: remove +00, + prefixes to store in clean format (like WhatsApp example)
    // Example: "00923353514100" -> "923353514100", "+923353514100" -> "923353514100"
    let cleanPhone = phoneNumber.trim();
    // Remove +00 prefix
    if (cleanPhone.startsWith('+00')) {
      cleanPhone = cleanPhone.substring(3);
    }
    // Remove 00 prefix
    else if (cleanPhone.startsWith('00')) {
      cleanPhone = cleanPhone.substring(2);
    }
    // Remove + prefix
    else if (cleanPhone.startsWith('+')) {
      cleanPhone = cleanPhone.substring(1);
    }

    // Normalize for searching (to find existing contacts with various formats)
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const phoneWithoutPlus = normalizedPhone.replace(/^\+/, '');
    const phoneWith00 = normalizedPhone.startsWith('+')
      ? '00' + normalizedPhone.substring(1)
      : normalizedPhone;

    console.log('📞 [create-from-call] Phone processing:', {
      original: phoneNumber,
      cleanPhone: cleanPhone, // This is what we'll store
      normalized: normalizedPhone,
      withoutPlus: phoneWithoutPlus,
      with00: phoneWith00
    });

    // Find existing contact by multiple criteria to prevent duplicates
    // Checks: phone (various formats), identifiers.call, identifiers.whatsapp, identifiers.sms
    let contact = await Contact.findOne({
      $or: [
        { phone: cleanPhone }, // Clean format (what we store)
        { phone: normalizedPhone },
        { phone: phoneWithoutPlus },
        { phone: phoneWith00 },
        { phone: phoneNumber }, // Original format
        { normalizedPhone: normalizedPhone },
        { normalizedPhone: phoneWithoutPlus },
        { normalizedPhone: phoneWith00 },
        { normalizedPhone: phoneNumber },
        { normalizedPhone: cleanPhone },
        { 'identifiers.call': cleanPhone }, // Clean format
        { 'identifiers.call': normalizedPhone },
        { 'identifiers.call': phoneWithoutPlus },
        { 'identifiers.call': phoneWith00 },
        { 'identifiers.call': phoneNumber },
        { 'identifiers.whatsapp': cleanPhone }, // Clean format
        { 'identifiers.whatsapp': normalizedPhone },
        { 'identifiers.whatsapp': phoneWithoutPlus },
        { 'identifiers.whatsapp': phoneWith00 },
        { 'identifiers.sms': cleanPhone }, // Clean format
        { 'identifiers.sms': normalizedPhone },
        { 'identifiers.sms': phoneWithoutPlus },
        { 'identifiers.sms': phoneWith00 }
      ]
    });

    let contactWasJustCreated = false;

    if (!contact) {
      // Create new contact with clean phone format (matching WhatsApp example format)
      // Store phone without + or 00 prefixes, just the number
      const identifiers = {
        call: cleanPhone // Store call identifier in clean format
      };
      
      // Only set whatsapp/sms if they don't already exist (preserve existing values)
      // This matches the pattern where identifiers are set per channel
      
      // ✅ Use provided name if available, otherwise fallback to phone number
      const contactName = (requestContactName && requestContactName.trim()) || phoneNumber || normalizedPhone || cleanPhone;
      contact = await Contact.create({
        phone: cleanPhone, // Store clean phone (no +, no 00) - matches WhatsApp example
        normalizedPhone: normalizedPhone, // Keep normalized for search purposes
        identifiers: identifiers,
        name: contactName,
        displayName: contactName,
        channel: 'call',
        tenantId: context.tenantId,
        Contact_Type: 'Customer',
        lastInteraction: new Date()
      });
      contactWasJustCreated = true;
      console.log(`✅ [create-from-call] Contact created: ${contact._id} with phone: ${cleanPhone}`);
      
      // ✅ Generate WebChat link for newly created contact (async, non-blocking)
      // Use IIFE to run async without blocking the main flow
      (async () => {
        try {
          // Reload contact to ensure it has all fields including _id and tenantId
          const savedContact = await Contact.findById(contact._id).lean();
          if (savedContact) {
            console.log(`🔄 [create-from-call] Generating WebChat link for contact ${savedContact._id}...`);
            const { generateWebChatLinkForContact } = await import('@/services/contact/ContactService.js');
            await generateWebChatLinkForContact(savedContact, tenantDB);
            console.log(`✅ [create-from-call] WebChat link generation completed for contact ${savedContact._id}`);
          } else {
            console.warn(`⚠️ [create-from-call] Contact ${contact._id} not found after save, skipping webchat link generation`);
          }
        } catch (webchatError) {
          console.error('⚠️ [create-from-call] Failed to create WebChat link for contact:', webchatError);
          console.error('⚠️ [create-from-call] Error details:', webchatError.stack || webchatError.message);
          // Don't throw - webchat link creation is optional
        }
      })().catch(error => {
        console.error('⚠️ [create-from-call] Error in webchat link generation promise:', error);
        console.error('⚠️ [create-from-call] Error stack:', error.stack);
      });
    } else {
      // Update existing contact if needed
      const updates = {};
      const identifierUpdates = {};

      // Update phone to clean format if it's in a different format
      // Only update if current phone has + or 00 prefix
      if (contact.phone && (contact.phone.startsWith('+') || contact.phone.startsWith('00'))) {
        updates.phone = cleanPhone;
      } else if (!contact.phone) {
        updates.phone = cleanPhone;
      }

      // Update normalizedPhone for search purposes
      if (!contact.normalizedPhone) {
        updates.normalizedPhone = normalizedPhone;
      }
      
      // Ensure identifiers object exists
      if (!contact.identifiers) {
        contact.identifiers = {};
      }

      // Add/update call identifier in clean format if it doesn't exist or is different
      // Check if call identifier is missing, empty, or different from cleanPhone
      const currentCallIdentifier = contact.identifiers?.call;
      if (!currentCallIdentifier || currentCallIdentifier !== cleanPhone) {
        identifierUpdates['identifiers.call'] = cleanPhone;
      }

      // Merge identifier updates with other updates
      Object.assign(updates, identifierUpdates);
      
      if (Object.keys(updates).length > 0) {
        await Contact.findByIdAndUpdate(contact._id, { $set: updates });
        // Refresh contact data to get updated identifiers
        contact = await Contact.findById(contact._id).lean();
        console.log(`✅ [create-from-call] Updated existing contact ${contact._id} with missing fields:`, {
          updates: Object.keys(updates),
          hasCallIdentifier: !!contact.identifiers?.call
        });
        
        // ✅ Generate WebChat link for existing contact if it doesn't have one (async, non-blocking)
        if (contact && !contact.webchatLink) {
          (async () => {
            try {
              console.log(`🔄 [create-from-call] Generating WebChat link for existing contact ${contact._id}...`);
              const { generateWebChatLinkForContact } = await import('@/services/contact/ContactService.js');
              await generateWebChatLinkForContact(contact, tenantDB);
              console.log(`✅ [create-from-call] WebChat link generation completed for contact ${contact._id}`);
            } catch (webchatError) {
              console.error('⚠️ [create-from-call] Failed to create WebChat link for existing contact:', webchatError);
              // Don't throw - webchat link creation is optional
            }
          })().catch(error => {
            console.error('⚠️ [create-from-call] Error in webchat link generation promise:', error);
          });
        }
      } else {
        // Even if no other updates, ensure call identifier exists
        if (!contact.identifiers?.call) {
          await Contact.findByIdAndUpdate(contact._id, { 
            $set: { 'identifiers.call': cleanPhone } 
          });
          // Refresh contact data
          contact = await Contact.findById(contact._id).lean();
          console.log(`✅ [create-from-call] Added call identifier to existing contact ${contact._id}`);
          
          // ✅ Generate WebChat link for existing contact if it doesn't have one (async, non-blocking)
          if (contact && !contact.webchatLink) {
            (async () => {
              try {
                console.log(`🔄 [create-from-call] Generating WebChat link for existing contact ${contact._id}...`);
                const { generateWebChatLinkForContact } = await import('@/services/contact/ContactService.js');
                await generateWebChatLinkForContact(contact, tenantDB);
                console.log(`✅ [create-from-call] WebChat link generation completed for contact ${contact._id}`);
              } catch (webchatError) {
                console.error('⚠️ [create-from-call] Failed to create WebChat link for existing contact:', webchatError);
                // Don't throw - webchat link creation is optional
              }
            })().catch(error => {
              console.error('⚠️ [create-from-call] Error in webchat link generation promise:', error);
            });
          }
      } else {
        console.log(`✅ [create-from-call] Found existing contact: ${contact._id}`);
        
        // ✅ Generate WebChat link for existing contact if it doesn't have one (async, non-blocking)
        if (contact && !contact.webchatLink) {
          (async () => {
            try {
              // Ensure contact is a plain object for the service
              const contactForService = typeof contact.toObject === 'function' ? contact.toObject() : contact;
              console.log(`🔄 [create-from-call] Generating WebChat link for existing contact ${contactForService._id}...`);
              const { generateWebChatLinkForContact } = await import('@/services/contact/ContactService.js');
              await generateWebChatLinkForContact(contactForService, tenantDB);
              console.log(`✅ [create-from-call] WebChat link generation completed for contact ${contactForService._id}`);
            } catch (webchatError) {
              console.error('⚠️ [create-from-call] Failed to create WebChat link for existing contact:', webchatError);
              // Don't throw - webchat link creation is optional
            }
          })().catch(error => {
            console.error('⚠️ [create-from-call] Error in webchat link generation promise:', error);
          });
        }
        }
      }
    }

    // Get or determine channel account (call type) - REQUIRED
    let channelAccount = null;
    if (channelAccountId) {
      try {
      channelAccount = await CompanyAccount.findById(channelAccountId).lean();
        if (!channelAccount) {
          console.warn(`⚠️ [create-from-call] Channel account ${channelAccountId} not found`);
        } else {
      console.log(`📞 [create-from-call] Using provided channel account: ${channelAccountId}`);
        }
      } catch (error) {
        console.error(`❌ [create-from-call] Error fetching channel account:`, error);
      }
    }

    if (!channelAccount) {
      // Find first active call channel account
      // Note: CompanyAccount uses 'companyId' field, not 'tenantId'
      channelAccount = await CompanyAccount.findOne({
        type: CHANNEL_TYPES.CALL,
        isActive: true,
        status: 'active',
        companyId: context.tenantId
      }).lean();
      console.log(
        `📞 [create-from-call] Found channel account:`,
        channelAccount ? channelAccount._id : 'none'
      );
    }

    // Validate channelAccount is required
    if (!channelAccount) {
      console.error('❌ [create-from-call] No channel account found - channelAccount is required');
      return NextResponse.json(
        {
          success: false,
          error: 'Channel account is required. Please create a call channel account first.'
        },
        { status: 400 }
      );
    }

    // Get department (priority: request > channel account > user's first department) - REQUIRED
    let selectedDepartment = departmentId;
    if (!selectedDepartment && channelAccount) {
      selectedDepartment =
        channelAccount.departmentId ||
        (channelAccount.departmentIds && channelAccount.departmentIds[0]);
    }
    if (!selectedDepartment && auth.user?.departments?.length > 0) {
      selectedDepartment = auth.user.departments[0];
    }

    console.log('📞 [create-from-call] Department selection:', {
      fromRequest: departmentId,
      fromChannelAccount: channelAccount?.departmentId || channelAccount?.departmentIds?.[0],
      fromUser: auth.user?.departments?.[0],
      selected: selectedDepartment
    });

    // Validate department is required
    if (!selectedDepartment) {
      console.error('❌ [create-from-call] No department found - department is required');
      return NextResponse.json(
        {
          success: false,
          error: 'Department is required. Please provide departmentId or ensure channel account has a department.'
        },
        { status: 400 }
      );
    }

    // Find or create conversation
    // Include channelAccount in query to ensure we match the correct conversation
    const conversationQuery = {
      contact: contact._id,
      channel: 'call',
      channelAccount: channelAccount._id,
      department: selectedDepartment
    };

    let conversation = await Conversation.findOne(conversationQuery)
      .populate('contact', 'name phone email avatar identifiers')
      .populate('department', 'name')
      .populate('channelAccount', 'name type')
      .lean();

    let conversationWasJustCreated = false;

    if (!conversation) {
      // ✅ Determine conversation mode based on department's AI bot enabled status
      const { getConversationModeForDepartment } = await import('@/services/conversation/ConversationModeHelper.js');
      const conversationMode = await getConversationModeForDepartment({
        departmentId: selectedDepartment,
        tenantDB
      });
      
      // Create new conversation
      // Note: channelAccount and department are required by schema, so we ensure they're set
      conversation = await Conversation.create({
        contact: contact._id,
        channel: 'call',
        department: selectedDepartment, // Required - already validated above
        channelAccount: channelAccount._id, // Required - already validated above
        mode: conversationMode, // ✅ Set mode based on department AI bot enabled status
        status: 'active',
        isArchived: false,
        isPinned: false,
        lastMessageAt: new Date(),
        messageCount: 0,
        tenantId: context.tenantId
      });

      conversationWasJustCreated = true;
      console.log(`✅ [create-from-call] Conversation created: ${conversation._id}`);

      // Populate conversation for socket emission
      conversation = await Conversation.findById(conversation._id)
        .populate('contact', 'name phone email avatar identifiers')
        .populate('department', 'name')
        .populate('channelAccount', 'name type')
        .lean();
    } else {
      // Update existing conversation timestamp
      await Conversation.findByIdAndUpdate(conversation._id, {
        lastMessageAt: new Date(),
        updatedAt: new Date()
      });
      console.log(
        `✅ [create-from-call] Found existing conversation: ${conversation._id}, updated timestamp`
      );
    }

    // Prepare contact data for socket emission
    const contactDataForEmission = {
      _id: contact._id,
      name: contact.name || null,
      displayName: contact.displayName || contact.name || null,
      phone: contact.phone || null,
      email: contact.email || null,
      avatar: contact.avatar || null,
      identifiers: contact.identifiers || {}
    };

    // Emit new conversation event in real-time (only if just created)
    if (conversationWasJustCreated) {
      const conversationData = {
        _id: conversation._id,
        contact: contactDataForEmission,
        contactData: contactDataForEmission, // Include contactData field (used by ConversationList component)
        channel: 'call',
        department: conversation.department
          ? {
          _id: conversation.department._id,
              name: conversation.department.name
            }
          : null,
        channelAccount: conversation.channelAccount
          ? {
          _id: conversation.channelAccount._id,
          type: conversation.channelAccount.type,
              name: conversation.channelAccount.name
            }
          : null,
        status: 'active',
        lastMessageAt: conversation.lastMessageAt || new Date(),
        messageCount: conversation.messageCount || 0,
        mode: conversation.mode || 'auto',
        createdAt: conversation.createdAt || new Date(),
        updatedAt: conversation.updatedAt || new Date()
      };

      // Extract departmentId for department-based segregation
      const deptId =
        conversation.department?._id || conversation.department || selectedDepartment;

      console.log('📢 [create-from-call] Emitting new conversation event:', {
        conversationId: conversation._id,
        tenantId: context.tenantId,
        departmentId: deptId,
        hasContact: !!contactDataForEmission,
        hasDepartment: !!conversationData.department
      });

      try {
        // Emit new conversation event using SocketEmitter
      await SocketEmitter.emitNewConversation(
        context.tenantId,
        conversationData,
        null, // No message for calls
        contactDataForEmission,
        deptId
      );

        console.log(
          `📢 [create-from-call] Successfully emitted new conversation event in real-time: ${conversation._id}`
        );
      } catch (socketError) {
        // Don't fail the request if socket emission fails
        console.error('⚠️ [create-from-call] Socket emission failed (non-blocking):', socketError);
      }
    }

    // Return success response
    return NextResponse.json(
      {
      success: true,
      message: 'Conversation and contact processed successfully',
      data: {
        conversationId: conversation._id,
        contactId: contact._id,
        contactCreated: contactWasJustCreated,
        conversationCreated: conversationWasJustCreated,
          phoneNumber: cleanPhone // Return clean phone format (matches stored format)
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('❌ [create-from-call] Error creating conversation from call:', error);
    console.error('❌ [create-from-call] Error stack:', error.stack);
    console.error('❌ [create-from-call] Error details:', {
      message: error.message,
      name: error.name,
      code: error.code
    });
    
    // Return appropriate error response
    const statusCode = error.statusCode || error.status || 500;
    const errorMessage =
      error.message || 'Failed to create conversation from call';
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create conversation from call', 
        message: errorMessage
      },
      { status: statusCode }
    );
  }
}
