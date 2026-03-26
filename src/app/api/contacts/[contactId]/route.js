// src/app/api/contacts/[contactId]/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '../../../../config/database.js';
import ContactSchema from '../../../../models/schemas/Contact.js';
import ConversationSchema from '../../../../models/schemas/Conversation.js';
import MessageSchema from '../../../../models/schemas/Message.js';
import { verifyAuth } from '../../../../middleware/auth.js';
import { getTenantContext } from '../../../../middleware/tenant.js';
import SocketEmitter from '../../../../services/socket/SocketEmitter.js';

// GET - Get single contact
export async function GET(request, { params }) {
  try {
    // ✅ Authenticate request
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // ✅ Get tenant context
    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
    }

    // ✅ Get correct tenant database
    const tenantDB = await getTenantDB(context.tenantId);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    
    const { contactId } = await params;
    // ✅ Use lean() to get plain JavaScript object (automatically converts Maps to objects)
    const contact = await Contact.findById(contactId).lean();

    if (!contact) {
      return NextResponse.json(
        { success: false, error: 'Contact not found' },
        { status: 404 }
      );
    }

    // ✅ Calculate actual conversation and message counts from database
    try {
      const ConversationSchema = (await import('../../../../models/schemas/Conversation.js')).default;
      const MessageSchema = (await import('../../../../models/schemas/Message.js')).default;
      const mongoose = (await import('mongoose')).default;
      
      const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
      const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

      // ✅ Get contact email for additional matching (for email conversations)
      const contactEmail = contact?.email || contact?.identifiers?.email;
      const normalizedContactEmail = contactEmail ? contactEmail.toLowerCase().trim() : null;

      // ✅ Convert contactId to ObjectId for proper matching
      const contactObjectId = mongoose.Types.ObjectId.isValid(contactId) 
        ? new mongoose.Types.ObjectId(contactId) 
        : contactId;

      // ✅ First, try direct contact ID match (most common case)
      let conversationQuery = {
        contact: contactObjectId,
        status: { $nin: ['deleted', 'archived'] }
      };
      
      let conversations = await Conversation.find(conversationQuery).select('_id').lean();
      
      // ✅ If no conversations found and we have an email, try finding by email via aggregation
      // This handles cases where email conversations might be linked differently
      if (conversations.length === 0 && normalizedContactEmail) {
        const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
        
        // Find all contacts with this email
        const contactsWithEmail = await Contact.find({
          $or: [
            { email: normalizedContactEmail },
            { 'identifiers.email': normalizedContactEmail }
          ]
        }).select('_id').lean();
        
        const contactIdsWithEmail = contactsWithEmail.map(c => c._id);
        
        if (contactIdsWithEmail.length > 0) {
          // Find conversations for any of these contacts
          conversations = await Conversation.find({
            contact: { $in: contactIdsWithEmail },
            status: { $nin: ['deleted', 'archived'] }
          }).select('_id').lean();
        }
      }
      
      const conversationIds = conversations.map(c => c._id);
      const actualValidConversationCount = conversationIds.length;
      
      const actualMessageCount = conversationIds.length > 0
        ? await Message.countDocuments({
            conversation: { $in: conversationIds },
            $or: [
              { deleted: { $exists: false } }, // Messages without deleted field
              { deleted: false }, // Messages explicitly not deleted
              { deleted: { $ne: true } } // Messages not set to true
            ]
          })
        : 0;

      // Stats calculated: conversations and messages counted

      // ✅ Contact is already a plain object (from lean()), just add counts
      const contactData = contact || {};
      contactData.conversationCount = actualValidConversationCount;
      contactData.messageCount = actualMessageCount;

      // ✅ CRITICAL: Ensure details and metadata are plain objects (lean() should handle this, but double-check)
      if (contactData.details instanceof Map) {
        contactData.details = Object.fromEntries(contactData.details);
      } else if (!contactData.details || typeof contactData.details !== 'object') {
        contactData.details = {};
      }

      if (contactData.metadata instanceof Map) {
        contactData.metadata = Object.fromEntries(contactData.metadata);
      } else if (!contactData.metadata || typeof contactData.metadata !== 'object') {
        contactData.metadata = {};
      }

      // ✅ Normalize Contact_Type: use schema field; if missing, set from details (including nested e.g. Company_Information["Contact Type"])
      const contactTypeKeys = ['Contact_Type', 'Contact Type', 'ContactType', 'contact_type', 'contactType'];
      function getContactTypeFromNested(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
        for (const k of contactTypeKeys) {
          const v = obj[k];
          if (v != null && String(v).trim()) return String(v).trim();
        }
        for (const val of Object.values(obj)) {
          if (val && typeof val === 'object' && !Array.isArray(val)) {
            const nested = getContactTypeFromNested(val);
            if (nested) return nested;
          }
        }
        return null;
      }
      if (!contactData.Contact_Type) {
        const fromDetails = getContactTypeFromNested(contactData.details || {});
        const fromMeta = getContactTypeFromNested(contactData.metadata || {});
        contactData.Contact_Type = fromDetails || fromMeta || null;
      }

      return NextResponse.json({
        success: true,
        data: contactData
      });
    } catch (countError) {
      console.error('[Contact] Count calculation error:', countError?.message || countError);
      // ✅ Return contact even if count calculation fails (contact is already plain object from lean())
      const contactData = contact || {};
      
      // ✅ CRITICAL: Ensure details and metadata are plain objects
      if (contactData.details instanceof Map) {
        contactData.details = Object.fromEntries(contactData.details);
      } else if (!contactData.details || typeof contactData.details !== 'object') {
        contactData.details = {};
      }

      if (contactData.metadata instanceof Map) {
        contactData.metadata = Object.fromEntries(contactData.metadata);
      } else if (!contactData.metadata || typeof contactData.metadata !== 'object') {
        contactData.metadata = {};
      }

      if (!contactData.Contact_Type) {
        const contactTypeKeys = ['Contact_Type', 'Contact Type', 'ContactType', 'contact_type', 'contactType'];
        function getContactTypeFromNested(obj) {
          if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
          for (const k of contactTypeKeys) {
            const v = obj[k];
            if (v != null && String(v).trim()) return String(v).trim();
          }
          for (const val of Object.values(obj)) {
            if (val && typeof val === 'object' && !Array.isArray(val)) {
              const nested = getContactTypeFromNested(val);
              if (nested) return nested;
            }
          }
          return null;
        }
        const fromDetails = getContactTypeFromNested(contactData.details || {});
        const fromMeta = getContactTypeFromNested(contactData.metadata || {});
        contactData.Contact_Type = fromDetails || fromMeta || null;
      }

      return NextResponse.json({
        success: true,
        data: contactData
      });
    }
  } catch (error) {
    console.error('[Contact] GET error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch contact' },
      { status: 500 }
    );
  }
}

// PUT - Update contact
export async function PUT(request, { params }) {
  try {
    // ✅ Authenticate request
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // ✅ Get tenant context
    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
    }

    // ✅ Get correct tenant database
    const tenantDB = await getTenantDB(context.tenantId);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    
    const { contactId } = await params;
    const body = await request.json();
    const { firstName, lastName, name, email, phone, Contact_Type } = body;

    const contact = await Contact.findById(contactId);
    if (!contact) {
      return NextResponse.json(
        { success: false, error: 'Contact not found' },
        { status: 404 }
      );
    }

    // Build name from firstName and lastName if not provided
    const contactName = name || (firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ').trim() : undefined);

    // Ensure phone has + prefix using professional normalizer and validate
    const { normalizePhoneNumber, isValidPhoneNumber, isValidEmail } = await import('@/utils/normalizers');
    const normalizedPhone = phone ? normalizePhoneNumber(phone) : undefined;

    // Validate phone format if provided
    if (phone && !isValidPhoneNumber(phone)) {
      return NextResponse.json(
        { success: false, error: 'Invalid phone number format. Phone must be 8-15 digits in E.164 format (e.g., +1234567890)' },
        { status: 400 }
      );
    }

    // Validate email format if provided
    if (email && !isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check for duplicates across all identifier fields
    const duplicateQuery = [];
    if (email && email.toLowerCase().trim() !== contact.email?.toLowerCase()?.trim()) {
      const normalizedEmail = email.toLowerCase().trim();
      duplicateQuery.push({ email: normalizedEmail });
      duplicateQuery.push({ 'identifiers.email': normalizedEmail });
    }
    if (normalizedPhone && normalizedPhone !== contact.phone) {
      const phoneWithoutPlus = normalizedPhone.replace(/^\+/, '');
      duplicateQuery.push({ phone: normalizedPhone });
      duplicateQuery.push({ phone: phoneWithoutPlus });
      duplicateQuery.push({ normalizedPhone: normalizedPhone });
      duplicateQuery.push({ 'identifiers.whatsapp': normalizedPhone });
      duplicateQuery.push({ 'identifiers.whatsapp': phoneWithoutPlus });
      duplicateQuery.push({ 'identifiers.sms': normalizedPhone });
      duplicateQuery.push({ 'identifiers.sms': phoneWithoutPlus });
    }

    if (duplicateQuery.length > 0) {
      const existing = await Contact.findOne({
        $or: duplicateQuery,
        _id: { $ne: contactId }
      });
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'Contact with this email or phone already exists' },
          { status: 409 }
        );
      }
    }

    // ✅ Update contact fields
    // Priority: If firstName or lastName is provided, use them and build name from them
    // Otherwise, if only name is provided, use it and clear firstName/lastName
    if (firstName !== undefined || lastName !== undefined) {
      // ✅ If firstName or lastName is provided, update them and build name
      if (firstName !== undefined) contact.firstName = firstName;
      if (lastName !== undefined) contact.lastName = lastName;
      // ✅ Always update name from firstName and lastName when they exist
      if (contactName !== undefined) {
        contact.name = contactName;
        contact.displayName = contactName;
      }
    } else if (contactName !== undefined) {
      // ✅ If only name is provided (no firstName/lastName), use it and clear firstName/lastName
      contact.name = contactName;
      contact.displayName = contactName;
      contact.firstName = undefined;
      contact.lastName = undefined;
    }
    
    if (email !== undefined) contact.email = email?.toLowerCase().trim() || undefined;
    if (normalizedPhone !== undefined) {
      contact.phone = normalizedPhone; // Save with + prefix
      contact.normalizedPhone = normalizedPhone; // Update normalized field too
      // Update all phone-based identifiers to ensure consistency
      if (!contact.identifiers) contact.identifiers = {};
      contact.identifiers.whatsapp = normalizedPhone;
      contact.identifiers.sms = normalizedPhone;
      contact.identifiers.call = normalizedPhone;
    }
    if (Contact_Type !== undefined) contact.Contact_Type = Contact_Type || undefined;

    await contact.save();

    // ✅ Convert to plain object for JSON response
    const updatedContact = contact.toObject ? contact.toObject() : contact;

    return NextResponse.json({
      success: true,
      message: 'Contact updated successfully',
      data: updatedContact
    });
  } catch (error) {
    console.error('[Contact] PUT error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update contact' },
      { status: 500 }
    );
  }
}

// DELETE - Delete contact and all associated conversations and messages
export async function DELETE(request, { params }) {
  try {
    // ✅ Authenticate request
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // ✅ Get tenant context
    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
    }

    // ✅ Get correct tenant database
    const tenantDB = await getTenantDB(context.tenantId);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    
    const { contactId } = await params;
    const contact = await Contact.findById(contactId);

    if (!contact) {
      return NextResponse.json(
        { success: false, error: 'Contact not found' },
        { status: 404 }
      );
    }

    // Starting deletion of contact and all associated data

    // ✅ Step 1: Find all conversations associated with this contact
    const conversations = await Conversation.find({ contact: contactId }).lean();
    const conversationIds = conversations.map(conv => conv._id);
    
    // Found conversations associated with contact

    // ✅ Step 2: Delete all messages in these conversations
    let totalMessagesDeleted = 0;
    if (conversationIds.length > 0) {
      const messagesDeleteResult = await Message.deleteMany({ 
        conversation: { $in: conversationIds } 
      });
      totalMessagesDeleted = messagesDeleteResult.deletedCount;
      // Messages deleted from conversations
    }

    // ✅ Step 3: Delete all conversations associated with this contact
    let totalConversationsDeleted = 0;
    if (conversationIds.length > 0) {
      const conversationsDeleteResult = await Conversation.deleteMany({ 
        contact: contactId 
      });
      totalConversationsDeleted = conversationsDeleteResult.deletedCount;
      // Conversations deleted for contact
    }

    // ✅ Step 4: Delete the contact itself
    await contact.deleteOne();
    // Contact deleted

    // ✅ Step 5: Emit socket events to notify all clients about deleted conversations
    if (conversationIds.length > 0) {
      // Emit events for each deleted conversation
      for (const convId of conversationIds) {
        await SocketEmitter.emit(`tenant:${context.tenantId}`, 'conversation:deleted', {
          conversationId: convId.toString(),
          status: 'removed',
          messagesDeleted: totalMessagesDeleted, // Total messages deleted across all conversations
          reason: 'contact_deleted'
        });
        
        await SocketEmitter.emit(`tenant:${context.tenantId}`, 'messages:cleared', {
          conversationId: convId.toString(),
          messagesDeleted: totalMessagesDeleted
        });
      }
      
      // Socket events emitted for deleted conversations
    }

    // ✅ Step 6: Emit contact deleted event
    await SocketEmitter.emit(`tenant:${context.tenantId}`, 'contact:deleted', {
      contactId: contactId.toString(),
      conversationsDeleted: totalConversationsDeleted,
      messagesDeleted: totalMessagesDeleted
    });
    // Contact:deleted event emitted

    return NextResponse.json({
      success: true,
      message: 'Contact and all associated data deleted successfully',
      data: {
        contactId: contactId.toString(),
        conversationsDeleted: totalConversationsDeleted,
        messagesDeleted: totalMessagesDeleted
      }
    });
  } catch (error) {
    console.error('[Contact] DELETE error:', error?.message || error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to delete contact',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
