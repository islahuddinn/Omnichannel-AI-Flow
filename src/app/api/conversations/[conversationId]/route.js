// // src/app/api/conversations/[conversationId]/route.js
// import { NextResponse } from 'next/server';
// import { connectToTenantDB } from '@/lib/db/connection';
// import Conversation from '@/models/schemas/Conversation';
// import { verifyAuth } from '@/middleware/auth';
// import { getTenantContext } from '@/middleware/tenant';

// export async function GET(request, { params }) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
//     }

//     const { conversationId } = await params;
//     const tenantId = getTenantContext();
//     const db = await connectToTenantDB(tenantId);

//     const conversation = await Conversation.findById(conversationId)
//       .populate('contact', 'name email phone avatar customFields')
//       .populate('assignedTo', 'firstName lastName email avatar')
//       .populate('department', 'name')
//       .lean();

//     if (!conversation) {
//       return NextResponse.json(
//         { success: false, error: 'Conversation not found' },
//         { status: 404 }
//       );
//     }

//     // Check access
//     if (auth.user.role === 'agent' && conversation.assignedTo?._id.toString() !== auth.user.userId) {
//       return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
//     }

//     return NextResponse.json({
//       success: true,
//       data: conversation
//     });
//   } catch (error) {
//     console.error('Get conversation error:', error);
//     return NextResponse.json(
//       { success: false, error: 'Failed to fetch conversation' },
//       { status: 500 }
//     );
//   }
// }

// export async function PUT(request, { params }) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
//     }

//     const { conversationId } = await params;
//     const tenantId = getTenantContext();
//     const db = await connectToTenantDB(tenantId);
    
//     const body = await request.json();
//     const { status, priority, tags } = body;

//     const conversation = await Conversation.findById(conversationId);
//     if (!conversation) {
//       return NextResponse.json(
//         { success: false, error: 'Conversation not found' },
//         { status: 404 }
//       );
//     }

//     // Check access
//     if (auth.user.role === 'agent' && conversation.assignedTo?.toString() !== auth.user.userId) {
//       return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
//     }

//     if (status) conversation.status = status;
//     if (priority) conversation.priority = priority;
//     if (tags) conversation.tags = tags;

//     if (status === 'closed') {
//       conversation.closedAt = new Date();
//       conversation.closedBy = auth.user.userId;
//     }

//     await conversation.save();

//     return NextResponse.json({
//       success: true,
//       data: conversation
//     });
//   } catch (error) {
//     console.error('Update conversation error:', error);
//     return NextResponse.json(
//       { success: false, error: 'Failed to update conversation' },
//       { status: 500 }
//     );
//   }
// }

// src/app/api/conversations/[conversationId]/route.js
import { NextResponse } from 'next/server';
import { connectToTenantDB } from '@/lib/db/connection';
import ConversationSchema from '@/models/schemas/Conversation';
import UserSchema from '@/models/schemas/User';
import DepartmentSchema from '@/models/schemas/Department';
import ContactSchema from '@/models/schemas/Contact';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import MessageSchema from '@/models/schemas/Message';
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
    const { conversationId } = resolvedParams;

    // Validate conversation ID
    if (typeof conversationId !== 'string' || conversationId === 'new' || !mongoose.Types.ObjectId.isValid(conversationId)) {
      console.log(`Invalid conversationId: "${conversationId}"`);
      return NextResponse.json(
        { success: false, error: 'Invalid conversation ID (must be valid ObjectId)' },
        { status: 400 }
      );
    }

    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
    }
    
    const tenantId = context.tenantId;
    const db = await connectToTenantDB(tenantId);

    // Register all required models
    const Conversation = db.models.Conversation || db.model('Conversation', ConversationSchema);
    const User = db.models.User || db.model('User', UserSchema);
    const Department = db.models.Department || db.model('Department', DepartmentSchema);
    const Contact = db.models.Contact || db.model('Contact', ContactSchema);

    const CompanyAccount = db.models.CompanyAccount || db.model('CompanyAccount', CompanyAccountSchema);
    
    // ✅ Check if user is admin for grouped conversation handling
    const isAdmin = ['company_admin', 'super_admin'].includes(auth.user?.role);
    
    // ✅ OPTIMIZED: Fast conversation fetch - try populate first, but always ensure contact is fetched
    let conversation = await Conversation.findById(conversationId)
      .populate({
        path: 'contact',
        select: 'name displayName email phone avatar customFields identifiers webchatLink SF_id Contact_Type',
        options: { lean: true, maxTimeMS: 1000 } // ✅ Increased to 1000ms to ensure contact loads
      })
      .populate('assignedTo', 'firstName lastName email avatar')
      .populate('department', 'name aiBotEnabled') // ✅ Include aiBotEnabled for mode toggle restriction
      .populate('channelAccount', 'name identifier type isActive')
      .populate('mergedConversations.channelAccount', 'name identifier type')
      .lean()
      .maxTimeMS(2000); // ✅ Increased to 2 seconds to ensure all data loads
    
    // ✅ Validate conversation exists first
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }
    
    // ✅ CRITICAL: For email conversations, ALWAYS ensure contact is properly fetched
    // Email conversations often have contact issues due to how they're created
    const isEmailConversation = conversation.channel === 'email';
    let contactData = conversation.contact;
    
    // ✅ OPTIMIZED: Calculate counts asynchronously (non-blocking)
    // This improves response time by not waiting for count calculations
    const calculateContactCounts = async (contact) => {
      if (!contact || !contact._id) {
        contact.conversationCount = 0;
        contact.messageCount = 0;
        return;
      }
      
      // ✅ Fire and forget - don't wait for counts
      // Set defaults immediately
      contact.conversationCount = 0;
      contact.messageCount = 0;
      
      // ✅ Calculate counts in background (non-blocking)
      Promise.resolve().then(async () => {
        try {
          const MessageSchema = (await import('@/models/schemas/Message.js')).default;
          const Message = db.models.Message || db.model('Message', MessageSchema);

          // ✅ Fast count queries with reduced timeout (non-blocking)
          const [actualConversationCount, contactConversations] = await Promise.all([
            Conversation.countDocuments({ contact: contact._id }).maxTimeMS(500),
            Conversation.find({ contact: contact._id }).select('_id').lean().maxTimeMS(500)
          ]);

          const contactConversationIds = contactConversations.map(c => c._id);
          
          const actualMessageCount = contactConversationIds.length > 0
            ? await Message.countDocuments({
                conversation: { $in: contactConversationIds }
              }).maxTimeMS(500)
            : 0;

          // ✅ Update counts (if still needed)
          contact.conversationCount = actualConversationCount;
          contact.messageCount = actualMessageCount;
        } catch (countError) {
          // Silently fail - counts are not critical
          console.error('❌ Error calculating counts for contact:', countError);
        }
      }).catch(() => {
        // Ignore errors - counts are not critical
      });
    };
    
    // ✅ CRITICAL: Check if contact is missing, not properly populated, or is just an ID string
    // More lenient check - contact is valid if it has _id AND at least one identifying field
    const hasValidContactData = contactData && 
                                 typeof contactData === 'object' && 
                                 contactData._id &&
                                 (contactData.name || 
                                  contactData.displayName || 
                                  contactData.email || 
                                  contactData.phone ||
                                  contactData.identifiers?.email ||
                                  contactData.identifiers?.phone ||
                                  contactData.identifiers?.whatsapp);
    
    if (!hasValidContactData) {
      const Contact = db.models.Contact || db.model('Contact', ContactSchema);
      const contactId = typeof contactData === 'string' 
        ? contactData 
        : (contactData?._id?.toString() || conversation.contact?.toString() || conversation.contact);
      
      if (contactId && mongoose.Types.ObjectId.isValid(contactId)) {
        try {
          // ✅ OPTIMIZED: Fast contact fetch - ensure we get the contact data
          contactData = await Contact.findById(contactId)
            .select('name displayName email phone avatar customFields identifiers webchatLink SF_id Contact_Type')
            .lean()
            .maxTimeMS(2000); // ✅ Increased to 2 seconds to ensure contact loads
          
          if (!contactData) {
            // ✅ OPTIMIZED: Simplified fallback - create contact immediately instead of multiple queries
            // This prevents timeout from multiple slow queries
            console.warn(`⚠️ Contact ${contactId} not found, creating minimal contact object`);
            // ✅ Try to get identifier from conversation or contact lookup
            const fallbackIdentifier = conversation.contactIdentifier || 
                                      (isEmailConversation ? conversation.contactEmail : conversation.contactPhone) ||
                                      null;
            contactData = {
              _id: contactId,
              name: fallbackIdentifier || 'Contact', // ✅ Use identifier (phone/email) instead of generic names
              displayName: fallbackIdentifier || 'Contact', // ✅ Use identifier (phone/email) instead of generic names
              email: isEmailConversation ? fallbackIdentifier : null,
              phone: (conversation.channel === 'whatsapp' || conversation.channel === 'sms') ? fallbackIdentifier : null,
              avatar: null,
              customFields: {},
              identifiers: {},
              webchatLink: null, // ✅ Include webchatLink field (null if not set)
              SF_id: null, // ✅ Include SF_id field (null if not set)
              Contact_Type: null // ✅ Include Contact_Type field (null if not set)
            };
          }
        } catch (error) {
          console.error(`❌ Error fetching contact ${contactId}:`, error);
          // ✅ Create contact object immediately on error
          // ✅ Try to get identifier from conversation or contact lookup
          const fallbackIdentifier = conversation.contactIdentifier || 
                                    (isEmailConversation ? conversation.contactEmail : conversation.contactPhone) ||
                                    null;
          contactData = {
            _id: contactId,
            name: fallbackIdentifier || 'Contact', // ✅ Use identifier (phone/email) instead of generic names
            displayName: fallbackIdentifier || 'Contact', // ✅ Use identifier (phone/email) instead of generic names
            email: isEmailConversation ? fallbackIdentifier : null,
            phone: (conversation.channel === 'whatsapp' || conversation.channel === 'sms') ? fallbackIdentifier : null,
            avatar: null,
            customFields: {},
            identifiers: {},
            webchatLink: null, // ✅ Include webchatLink field (null if not set)
            SF_id: null, // ✅ Include SF_id field (null if not set)
            Contact_Type: null // ✅ Include Contact_Type field (null if not set)
          };
        }
      } else {
        // ✅ No valid contact ID - create contact object using identifier (phone/email) as name
        // ✅ Try to get identifier from conversation
        const fallbackIdentifier = conversation.contactIdentifier || 
                                  (isEmailConversation ? conversation.contactEmail : conversation.contactPhone) ||
                                  null;
        contactData = {
          _id: new mongoose.Types.ObjectId(),
          name: fallbackIdentifier || 'Contact', // ✅ Use identifier (phone/email) instead of generic names
          displayName: fallbackIdentifier || 'Contact', // ✅ Use identifier (phone/email) instead of generic names
          email: isEmailConversation ? fallbackIdentifier : null,
          phone: (conversation.channel === 'whatsapp' || conversation.channel === 'sms') ? fallbackIdentifier : null,
          avatar: null,
          customFields: {},
          identifiers: {},
          webchatLink: null, // ✅ Include webchatLink field (null if not set)
          SF_id: null, // ✅ Include SF_id field (null if not set)
          Contact_Type: null // ✅ Include Contact_Type field (null if not set)
        };
      }
      
      // ✅ Calculate counts asynchronously (non-blocking)
      calculateContactCounts(contactData);
      
      // ✅ Assign contact data to conversation object
      conversation.contact = contactData;
      console.log(`✅ Contact data assigned to ${isEmailConversation ? 'email' : ''} conversation ${conversationId}:`, {
        name: contactData.name,
        email: contactData.email,
        phone: contactData.phone,
        hasIdentifiers: !!contactData.identifiers,
        conversationCount: contactData.conversationCount,
        messageCount: contactData.messageCount
      });
    } else if (contactData && contactData._id) {
      // ✅ Contact is already populated, calculate counts asynchronously (non-blocking)
      calculateContactCounts(contactData);
    }

    // ✅ Secondary merged conversations should NOT be accessible - redirect to primary
    // ✅ Check if primaryConversation exists and is not null (after unmerge, it should be null/undefined)
    const hasPrimaryConversation = conversation.primaryConversation && 
                                    conversation.primaryConversation.toString() !== 'null' &&
                                    conversation.primaryConversation.toString() !== '';
    
    if (hasPrimaryConversation) {
      const primaryId = conversation.primaryConversation.toString();
      console.log(`⚠️ Conversation ${conversationId} is merged - redirecting to primary: ${primaryId}`);
      return NextResponse.json({
        success: false,
        error: 'This conversation is merged into another conversation',
        redirectTo: primaryId,
        message: 'Please access the primary merged conversation instead'
      }, { status: 403 });
    }

    // FIXED: More flexible access control
    // Allow access if:
    // 1. User is admin/super_admin
    // 2. User is assigned to this conversation
    // 3. User is in the same department as the conversation
    // ✅ isAdmin is already declared above (line 150)
    const isAssigned = conversation.assignedTo?._id?.toString() === auth.user.userId;
    const userDepartments = auth.user.departments || [];
    const conversationDept = conversation.department?._id?.toString() || conversation.department?.toString();
    const isInSameDepartment = userDepartments.some(ud => ud.toString() === conversationDept);

    if (auth.user.role === 'agent' && !isAssigned && !isInSameDepartment) {
      return NextResponse.json({ 
        success: false, 
        error: 'You do not have access to this conversation' 
      }, { status: 403 });
    }

    // ✅ Calculate message statistics (inbound vs outbound, bot vs manual) for conversation statistics panel
    const calculateMessageStats = async () => {
      try {
        const MessageSchema = (await import('@/models/schemas/Message.js')).default;
        const Message = db.models.Message || db.model('Message', MessageSchema);
        
        // ✅ Count inbound messages (received from contacts)
        const inboundMessagesCount = await Message.countDocuments({
          conversation: conversationId,
          direction: 'inbound',
          $and: [
            {
              $or: [
                { deleted: { $exists: false } },
                { deleted: false }
              ]
            }
          ]
        }).maxTimeMS(1000);
        
        // ✅ Count outbound bot messages - check both metadata.isBotResponse and sendingModule
        // Bot messages are identified by: metadata.isBotResponse = true OR sendingModule = 'bot'
        const botMessagesCount = await Message.countDocuments({
          conversation: conversationId,
          direction: 'outbound',
          $and: [
            {
              $or: [
                { 'metadata.isBotResponse': true },
                { sendingModule: 'bot' }
              ]
            },
            {
              $or: [
                { deleted: { $exists: false } },
                { deleted: false }
              ]
            }
          ]
        }).maxTimeMS(1000);
        
        // ✅ Count outbound manual messages (sent by agents/users)
        // Manual messages: NOT bot (isBotResponse != true AND sendingModule != 'bot') AND has sender
        const manualMessagesCount = await Message.countDocuments({
          conversation: conversationId,
          direction: 'outbound',
          $and: [
            {
              $or: [
                { 'metadata.isBotResponse': { $exists: false } },
                { 'metadata.isBotResponse': false }
              ]
            },
            {
              $or: [
                { sendingModule: { $exists: false } },
                { sendingModule: { $ne: 'bot' } }
              ]
            },
            { sender: { $exists: true, $ne: null } },
            {
              $or: [
                { deleted: { $exists: false } },
                { deleted: false }
              ]
            }
          ]
        }).maxTimeMS(1000);
        
        return {
          inboundMessages: inboundMessagesCount,
          botMessages: botMessagesCount,
          manualMessages: manualMessagesCount,
          totalOutbound: botMessagesCount + manualMessagesCount
        };
      } catch (error) {
        console.error('❌ Error calculating message stats:', error);
        return {
          inboundMessages: 0,
          botMessages: 0,
          manualMessages: 0,
          totalOutbound: 0
        };
      }
    };
    
    // ✅ Get message statistics
    const messageStats = await calculateMessageStats();
    
    // ✅ Add message statistics to conversation object
    conversation.messageStats = messageStats;

    // ✅ Return conversation as-is (no aggregation for company admins)

    return NextResponse.json({
      success: true,
      data: conversation
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch conversation' },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const { conversationId } = resolvedParams;

    if (typeof conversationId !== 'string' || conversationId === 'new' || !mongoose.Types.ObjectId.isValid(conversationId)) {
      console.log(`Invalid conversationId for PUT: "${conversationId}"`);
      return NextResponse.json(
        { success: false, error: 'Invalid conversation ID (must be valid ObjectId)' },
        { status: 400 }
      );
    }

    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
    }
    
    const tenantId = context.tenantId;
    const db = await connectToTenantDB(tenantId);

    // Register models
    const Conversation = db.models.Conversation || db.model('Conversation', ConversationSchema);
    const User = db.models.User || db.model('User', UserSchema);
    const Department = db.models.Department || db.model('Department', DepartmentSchema);
    
    const body = await request.json();
    const { status, priority, tags } = body;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Check access — agents can update if assigned OR in same department
    if (auth.user.role === 'agent') {
      const isAssigned = conversation.assignedTo?.toString() === auth.user.userId;
      const userDepts = (auth.user.departments || []).map(d => d.toString());
      const isInSameDepartment = userDepts.includes(conversation.department?.toString());
      if (!isAssigned && !isInSameDepartment) {
        return NextResponse.json({ success: false, error: 'You do not have access to this conversation' }, { status: 403 });
      }
    }

    if (status) conversation.status = status;
    if (priority) conversation.priority = priority;
    if (tags) conversation.tags = tags;

    if (status === 'closed') {
      conversation.closedAt = new Date();
      conversation.closedBy = auth.user.userId;
    }

    await conversation.save();

    return NextResponse.json({
      success: true,
      data: conversation
    });
  } catch (error) {
    console.error('Update conversation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update conversation' },
      { status: 500 }
    );
  }
}