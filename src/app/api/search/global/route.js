// src/app/api/search/global/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '../../../../middleware/auth.js';
import { getTenantContext } from '../../../../middleware/tenant.js';
import { getTenantDB, getMasterDB } from '../../../../config/database.js';
import ContactSchema from '../../../../models/schemas/Contact.js';
import ConversationSchema from '../../../../models/schemas/Conversation.js';
import UserSchema from '../../../../models/schemas/User.js';
import DealSchema from '../../../../models/schemas/Deal.js';
import MessageSchema from '../../../../models/schemas/Message.js';
import { normalizePhoneNumber } from '../../../../utils/normalizers.js';

export async function GET(request) {
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

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        success: true,
        data: {
          contacts: [],
          conversations: [],
          users: [],
          deals: [],
          messages: []
        }
      });
    }

    const searchTerm = query.trim();
    
    // ✅ Escape special regex characters to prevent errors with +, *, ?, etc.
    const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapedSearch, 'i');

    // ✅ Get correct tenant database for contacts, conversations, deals, and messages
    const tenantDB = await getTenantDB(context.tenantId);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Deal = tenantDB.models.Deal || tenantDB.model('Deal', DealSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    
    // ✅ Get master database for users (users are stored in master DB)
    const masterDB = await getMasterDB();
    const User = masterDB.models.User || masterDB.model('User', UserSchema);

    // ✅ Build contact search conditions
    const contactSearchConditions = [
      { name: searchRegex },
      { firstName: searchRegex },
      { lastName: searchRegex },
      { email: searchRegex },
      { 'identifiers.email': searchRegex }
    ];

    // ✅ Check if search query looks like a phone number (contains digits)
    const hasDigits = /\d/.test(searchTerm);
    
    if (hasDigits) {
      // Normalize the search query to E.164 format
      const normalizedSearch = normalizePhoneNumber(searchTerm);
      // Remove all non-digits for flexible matching
      const digitsOnly = searchTerm.replace(/\D/g, '');
      const normalizedDigitsOnly = normalizedSearch.replace(/\D/g, '');
      
      // Generate all possible phone number variations for searching
      const phoneVariations = new Set();
      
      if (digitsOnly.length > 0) {
        phoneVariations.add(searchTerm.trim());
        phoneVariations.add(normalizedSearch);
        phoneVariations.add(normalizedSearch.replace(/^\+/, ''));
        phoneVariations.add(digitsOnly);
        phoneVariations.add(normalizedDigitsOnly);
        phoneVariations.add(`+${digitsOnly}`);
        phoneVariations.add(`+${normalizedDigitsOnly}`);
        phoneVariations.add(searchTerm.replace(/\s/g, '').trim());
      }

      const phoneArray = Array.from(phoneVariations).filter(v => v && v.length > 0);
      
      if (phoneArray.length > 0) {
        // Use $in for exact matches (more efficient than regex)
        contactSearchConditions.push({ phone: { $in: phoneArray } });
        contactSearchConditions.push({ 'identifiers.whatsapp': { $in: phoneArray } });
        contactSearchConditions.push({ 'identifiers.sms': { $in: phoneArray } });
        
        // Also add regex patterns for flexible matching if we have at least 3 digits
        if (digitsOnly && digitsOnly.length >= 3) {
          try {
            const simplePattern = digitsOnly.split('').join('.*');
            const testRegex = new RegExp(simplePattern, 'i');
            testRegex.test('test'); // Validate it works
            
            contactSearchConditions.push({ phone: { $regex: simplePattern, $options: 'i' } });
            contactSearchConditions.push({ 'identifiers.whatsapp': { $regex: simplePattern, $options: 'i' } });
            contactSearchConditions.push({ 'identifiers.sms': { $regex: simplePattern, $options: 'i' } });
          } catch (regexError) {
            console.error('[Global Search] Regex pattern failed, skipping regex search:', regexError.message);
          }
        }
      }
    } else {
      // If it doesn't look like a phone number, just do a simple regex search on phone field
      contactSearchConditions.push({ phone: searchRegex });
      contactSearchConditions.push({ 'identifiers.whatsapp': searchRegex });
      contactSearchConditions.push({ 'identifiers.sms': searchRegex });
    }

    // ✅ Search contacts - with timeout for performance
    let contacts = [];
    try {
      // Limit conditions to prevent timeout
      const limitedContactConditions = contactSearchConditions.slice(0, 15);
      
      contacts = await Contact.find({
        $or: limitedContactConditions
      })
        .select('name firstName lastName email phone avatar identifiers')
        .limit(limit)
        .maxTimeMS(2000) // ✅ 2 second max query time
        .lean();
    } catch (error) {
      if (error.code === 50 || error.codeName === 'MaxTimeMSExpired') {
        console.warn('[Global Search] Contact search timed out, using simplified search.');
        try {
          contacts = await Contact.find({
            $or: [
              { name: searchRegex },
              { email: searchRegex },
              { phone: searchRegex }
            ]
          })
            .select('name firstName lastName email phone avatar identifiers')
            .limit(limit)
            .maxTimeMS(1000)
            .lean();
        } catch (fallbackError) {
          console.error('[Global Search] Simplified contact search also failed:', fallbackError.message);
          contacts = [];
        }
      } else {
        throw error;
      }
    }

    // ✅ Search conversations (with populated contact info) - with timeout
    let conversations = [];
    try {
      conversations = await Conversation.find({
        $or: [
          { lastMessageContent: searchRegex }
        ]
      })
        .populate('contact', 'name firstName lastName email phone avatar')
        .select('_id contact channel status lastMessageContent lastMessageAt department')
        .limit(limit)
        .maxTimeMS(2000) // ✅ 2 second max query time
        .lean();
    } catch (error) {
      if (error.code === 50 || error.codeName === 'MaxTimeMSExpired') {
        console.warn('[Global Search] Conversation search timed out');
        conversations = [];
      } else {
        throw error;
      }
    }

    // ✅ Build user search conditions
    const userSearchConditions = [
      { firstName: searchRegex },
      { lastName: searchRegex },
      { email: searchRegex }
    ];

    // ✅ Add phone search for users if it contains digits
    if (hasDigits) {
      const normalizedSearch = normalizePhoneNumber(searchTerm);
      const digitsOnly = searchTerm.replace(/\D/g, '');
      const normalizedDigitsOnly = normalizedSearch.replace(/\D/g, '');
      
      const phoneVariations = new Set();
      if (digitsOnly.length > 0) {
        phoneVariations.add(searchTerm.trim());
        phoneVariations.add(normalizedSearch);
        phoneVariations.add(normalizedSearch.replace(/^\+/, ''));
        phoneVariations.add(digitsOnly);
        phoneVariations.add(normalizedDigitsOnly);
        phoneVariations.add(`+${digitsOnly}`);
        phoneVariations.add(`+${normalizedDigitsOnly}`);
        phoneVariations.add(searchTerm.replace(/\s/g, '').trim());
      }

      const phoneArray = Array.from(phoneVariations).filter(v => v && v.length > 0);
      if (phoneArray.length > 0) {
        userSearchConditions.push({ phone: { $in: phoneArray } });
      }
    } else {
      userSearchConditions.push({ phone: searchRegex });
    }

    // ✅ Search users - with timeout
    let users = [];
    try {
      // Limit conditions to prevent timeout
      const limitedUserConditions = userSearchConditions.slice(0, 10);
      
      users = await User.find({
        $or: limitedUserConditions,
        companyId: context.tenantId
      })
        .select('firstName lastName email phone avatar role status')
        .limit(limit)
        .maxTimeMS(2000) // ✅ 2 second max query time
        .lean();
    } catch (error) {
      if (error.code === 50 || error.codeName === 'MaxTimeMSExpired') {
        console.warn('[Global Search] User search timed out, using simplified search');
        try {
          users = await User.find({
            $or: [
              { firstName: searchRegex },
              { lastName: searchRegex },
              { email: searchRegex }
            ],
            companyId: context.tenantId
          })
            .select('firstName lastName email phone avatar role status')
            .limit(limit)
            .maxTimeMS(1000)
            .lean();
        } catch (fallbackError) {
          console.error('[Global Search] Simplified user search also failed:', fallbackError.message);
          users = [];
        }
      } else {
        throw error;
      }
    }

    // ✅ Search deals - fully dynamic search
    const dealSearchConditions = [
      { name: searchRegex },
      { deal_id: searchRegex },
      { stage: searchRegex },
      { status: searchRegex }
    ];

    // ✅ Check if search query looks like a phone number (contains digits)
    // Deals might have phone numbers in their details
    if (hasDigits) {
      const normalizedSearch = normalizePhoneNumber(searchTerm);
      const digitsOnly = searchTerm.replace(/\D/g, '');
      const normalizedDigitsOnly = normalizedSearch.replace(/\D/g, '');
      
      const phoneVariations = new Set();
      if (digitsOnly.length > 0) {
        phoneVariations.add(searchTerm.trim());
        phoneVariations.add(normalizedSearch);
        phoneVariations.add(normalizedSearch.replace(/^\+/, ''));
        phoneVariations.add(digitsOnly);
        phoneVariations.add(normalizedDigitsOnly);
        phoneVariations.add(`+${digitsOnly}`);
        phoneVariations.add(`+${normalizedDigitsOnly}`);
        phoneVariations.add(searchTerm.replace(/\s/g, '').trim());
      }

      const phoneArray = Array.from(phoneVariations).filter(v => v && v.length > 0);
      
      if (phoneArray.length > 0) {
        // Search phone in common phone fields in details
        phoneArray.forEach(phone => {
          dealSearchConditions.push({ 'details.Phone': phone });
          dealSearchConditions.push({ 'details.phone': phone });
          dealSearchConditions.push({ 'details.Phone_Number': phone });
          dealSearchConditions.push({ 'details.phone_number': phone });
          dealSearchConditions.push({ 'details.Mobile': phone });
          dealSearchConditions.push({ 'details.mobile': phone });
        });
        
        // Also add regex patterns for flexible matching if we have at least 3 digits
        if (digitsOnly && digitsOnly.length >= 3) {
          try {
            const simplePattern = digitsOnly.split('').join('.*');
            const testRegex = new RegExp(simplePattern, 'i');
            testRegex.test('test'); // Validate it works
            
            dealSearchConditions.push({ 'details.Phone': { $regex: simplePattern, $options: 'i' } });
            dealSearchConditions.push({ 'details.phone': { $regex: simplePattern, $options: 'i' } });
            dealSearchConditions.push({ 'details.Phone_Number': { $regex: simplePattern, $options: 'i' } });
            dealSearchConditions.push({ 'details.phone_number': { $regex: simplePattern, $options: 'i' } });
            dealSearchConditions.push({ 'details.Mobile': { $regex: simplePattern, $options: 'i' } });
            dealSearchConditions.push({ 'details.mobile': { $regex: simplePattern, $options: 'i' } });
          } catch (regexError) {
            console.error('[Global Search] Deal phone regex pattern failed:', regexError.message);
          }
        }
      }
    }

    // ✅ Search in most common deal details fields (limited to prevent timeout)
    // Focus on the most frequently used fields to keep query fast
    const priorityDetailsFields = [
      'Name', 'name', 'Company', 'company', 'Contact', 'contact',
      'Email', 'email', 'Phone', 'phone', 'Mobile', 'mobile',
      'Description', 'description', 'Notes', 'notes', 'Comments', 'comments',
      'Address', 'address', 'City', 'city', 'State', 'state',
      'Amount', 'amount', 'Value', 'value', 'Price', 'price'
    ];
    
    // Add search conditions for priority fields only (keeps query fast)
    priorityDetailsFields.forEach(field => {
      dealSearchConditions.push({ [`details.${field}`]: searchRegex });
    });

    // ✅ Search deals - with timeout and optimized query
    // Limit the number of conditions to prevent timeout
    // If we have too many conditions, split into multiple smaller queries
    let deals = [];
    try {
      // Limit to first 20 conditions to prevent timeout
      const limitedConditions = dealSearchConditions.slice(0, 20);
      
      deals = await Deal.find({
        $or: limitedConditions
      })
        .select('name deal_id stage status details createdAt')
        .limit(limit)
        .maxTimeMS(2000) // ✅ 2 second max query time
        .lean();
    } catch (error) {
      // If query times out, try a simpler search on just name and deal_id
      if (error.code === 50 || error.codeName === 'MaxTimeMSExpired') {
        console.warn('[Global Search] Deal search timed out, using simplified search');
        try {
          deals = await Deal.find({
            $or: [
              { name: searchRegex },
              { deal_id: searchRegex }
            ]
          })
            .select('name deal_id stage status details createdAt')
            .limit(limit)
            .maxTimeMS(1000)
            .lean();
        } catch (fallbackError) {
          console.error('[Global Search] Simplified deal search also failed:', fallbackError.message);
          deals = [];
        }
      } else {
        throw error;
      }
    }

    // ✅ Search messages (with populated contact and conversation info)
    const messageSearchConditions = [
      { content: searchRegex }
    ];

    // ✅ Also search in email subject if it's an email message
    if (escapedSearch) {
      messageSearchConditions.push({ 'emailData.subject': searchRegex });
    }

    // ✅ Search messages - with timeout
    let messages = [];
    try {
      messages = await Message.find({
        $or: messageSearchConditions,
        deleted: { $ne: true }
      })
        .populate('contact', 'name firstName lastName email phone avatar')
        .populate('conversation', '_id channel status')
        .select('_id content type channel direction createdAt contact conversation emailData')
        .sort({ createdAt: -1 })
        .limit(limit)
        .maxTimeMS(2000) // ✅ 2 second max query time
        .lean();
    } catch (error) {
      if (error.code === 50 || error.codeName === 'MaxTimeMSExpired') {
        console.warn('[Global Search] Message search timed out');
        messages = [];
      } else {
        throw error;
      }
    }

    // ✅ Format results
    const formattedContacts = contacts.map(contact => ({
      id: contact._id.toString(),
      type: 'contact',
      title: contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unnamed Contact',
      subtitle: contact.email || contact.phone || 'No contact info',
      avatar: contact.avatar,
      metadata: {
        email: contact.email,
        phone: contact.phone
      }
    }));

    const formattedConversations = conversations.map(conv => ({
      id: conv._id.toString(),
      type: 'conversation',
      title: conv.contact?.name || `${conv.contact?.firstName || ''} ${conv.contact?.lastName || ''}`.trim() || 'Unknown Contact',
      subtitle: conv.lastMessageContent || `Conversation via ${conv.channel}`,
      avatar: conv.contact?.avatar,
      metadata: {
        channel: conv.channel,
        status: conv.status,
        lastMessageAt: conv.lastMessageAt
      }
    }));

    const formattedUsers = users.map(user => ({
      id: user._id.toString(),
      type: 'user',
      title: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      subtitle: user.email || user.role || 'User',
      avatar: user.avatar,
      metadata: {
        email: user.email,
        role: user.role,
        status: user.status
      }
    }));

    const formattedDeals = deals.map(deal => {
      // Extract deal name or use deal_id
      const dealName = deal.name || deal.deal_id || 'Unnamed Deal';
      const dealDetails = deal.details || {};
      const detailsStr = typeof dealDetails === 'object' 
        ? JSON.stringify(dealDetails).substring(0, 100)
        : String(dealDetails).substring(0, 100);
      
      return {
        id: deal._id.toString(),
        type: 'deal',
        title: dealName,
        subtitle: `${deal.stage || 'No stage'} • ${deal.status || 'No status'}`,
        avatar: null,
        metadata: {
          deal_id: deal.deal_id,
          stage: deal.stage,
          status: deal.status,
          details: detailsStr
        }
      };
    });

    const formattedMessages = messages.map(message => {
      const contactName = message.contact?.name 
        || `${message.contact?.firstName || ''} ${message.contact?.lastName || ''}`.trim() 
        || 'Unknown Contact';
      
      const messagePreview = message.content 
        ? (message.content.length > 80 ? message.content.substring(0, 80) + '...' : message.content)
        : (message.type === 'image' ? '📷 Image' 
          : message.type === 'video' ? '🎥 Video'
          : message.type === 'audio' ? '🎵 Audio'
          : message.type === 'document' ? '📄 Document'
          : message.type === 'location' ? '📍 Location'
          : message.type === 'contact' ? '👤 Contact'
          : 'Message');
      
      const emailSubject = message.emailData?.subject;
      const subtitle = emailSubject 
        ? `Email: ${emailSubject}`
        : `${messagePreview} • ${message.channel}`;

      return {
        id: message._id.toString(),
        type: 'message',
        title: contactName,
        subtitle: subtitle,
        avatar: message.contact?.avatar,
        metadata: {
          conversationId: message.conversation?._id?.toString(),
          channel: message.channel,
          type: message.type,
          direction: message.direction,
          createdAt: message.createdAt
        }
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        contacts: formattedContacts,
        conversations: formattedConversations,
        users: formattedUsers,
        deals: formattedDeals,
        messages: formattedMessages
      }
    });
  } catch (error) {
    console.error('[Global Search] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to perform search' },
      { status: 500 }
    );
  }
}

