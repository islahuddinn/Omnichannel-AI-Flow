// src/app/api/conversations/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import ConversationSchema from '@/models/schemas/Conversation';
import ContactSchema from '@/models/schemas/Contact';
import MessageSchema from '@/models/schemas/Message';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { normalizePhoneNumber } from '@/utils/normalizers';
import mongoose from 'mongoose';

export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);

    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));
    const status = searchParams.get('status') || 'active';
    const channel = searchParams.get('channel');
    const search = (searchParams.get('search') || '').substring(0, 100) || null;
    const sortBy = searchParams.get('sortBy') || 'recent';
    const skip = (page - 1) * limit;

    // Build query
    const query = {};

    // Agents only see conversations from their departments
    if (auth.user.role === 'agent') {
      const userDepartments = auth.user.departments || [];
      if (userDepartments.length > 0) {
        const departmentObjectIds = userDepartments.map(deptId => {
          if (mongoose.Types.ObjectId.isValid(deptId)) {
            return typeof deptId === 'string' ? new mongoose.Types.ObjectId(deptId) : deptId;
          }
          return null;
        }).filter(Boolean);

        if (departmentObjectIds.length > 0) {
          query.department = { $in: departmentObjectIds };
        } else {
          return NextResponse.json({
            success: true,
            data: [],
            pagination: { page, limit, total: 0, pages: 0 }
          });
        }
      } else {
        return NextResponse.json({
          success: true,
          data: [],
          pagination: { page, limit, total: 0, pages: 0 }
        });
      }
    }

    if (channel) {
      query.channel = channel;
    }

    // Exclude secondary merged conversations
    query.primaryConversation = { $exists: false };

    if (status !== 'all') {
      query.status = status;
    }

    // Build sort criteria based on sortBy parameter
    let sortCriteria = {};

    switch (sortBy) {
      case 'pinned':
        query.isPinned = true;
        sortCriteria = { isPinned: -1, lastMessageAt: -1, updatedAt: -1 };
        break;
      case 'unread':
        query.unreadCount = { $gt: 0 };
        sortCriteria = { unreadCount: -1, isPinned: -1, lastMessageAt: -1, updatedAt: -1 };
        break;
      case 'manual':
        query.mode = 'manual';
        sortCriteria = { isPinned: -1, lastMessageAt: -1, updatedAt: -1 };
        break;
      case 'auto':
        query.mode = 'auto';
        sortCriteria = { isPinned: -1, lastMessageAt: -1, updatedAt: -1 };
        break;
      case 'recent':
      default:
        sortCriteria = { isPinned: -1, lastMessageAt: -1, updatedAt: -1 };
        break;
    }

    // If search query provided, find matching contacts first then filter conversations
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const searchConditions = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { displayName: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } }
      ];

      const hasDigits = /\d/.test(search);

      if (hasDigits) {
        const normalizedSearch = normalizePhoneNumber(search);
        const digitsOnly = search.replace(/\D/g, '');
        const normalizedDigitsOnly = normalizedSearch.replace(/\D/g, '');

        const phoneVariations = new Set();

        if (digitsOnly.length > 0) {
          phoneVariations.add(search.trim());
          phoneVariations.add(normalizedSearch);
          phoneVariations.add(normalizedSearch.replace(/^\+/, ''));
          phoneVariations.add(digitsOnly);
          phoneVariations.add(normalizedDigitsOnly);
          phoneVariations.add(`+${digitsOnly}`);
          phoneVariations.add(`+${normalizedDigitsOnly}`);
          phoneVariations.add(search.replace(/\s/g, '').trim());
        }

        const phoneArray = Array.from(phoneVariations).filter(v => v && v.length > 0);

        if (phoneArray.length > 0) {
          searchConditions.push({ phone: { $in: phoneArray } });
          searchConditions.push({ 'identifiers.whatsapp': { $in: phoneArray } });
          searchConditions.push({ 'identifiers.sms': { $in: phoneArray } });
          searchConditions.push({ normalizedPhone: { $in: phoneArray } });

          if (digitsOnly && digitsOnly.length >= 3) {
            try {
              const simplePattern = digitsOnly.split('').join('.*');
              new RegExp(simplePattern, 'i').test('test');
              searchConditions.push({ phone: { $regex: simplePattern, $options: 'i' } });
              searchConditions.push({ 'identifiers.whatsapp': { $regex: simplePattern, $options: 'i' } });
              searchConditions.push({ 'identifiers.sms': { $regex: simplePattern, $options: 'i' } });
            } catch (regexError) {
              console.error('[Conversations] Search regex failed:', regexError.message);
            }
          }
        }
      } else {
        searchConditions.push({ phone: { $regex: escapedSearch, $options: 'i' } });
      }

      const searchedContacts = await Contact.find({
        $or: searchConditions
      }).select('_id').lean();

      query.contact = { $in: searchedContacts.map(c => c._id) };
    }

    // DB-level pagination: count + paginated fetch in parallel
    const [total, conversations] = await Promise.all([
      Conversation.countDocuments(query),
      Conversation.find(query)
        .populate('department', 'name')
        .sort(sortCriteria)
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    // Populate contact info
    const contactIds = conversations.map(c => c.contact);
    const contacts = await Contact.find({ _id: { $in: contactIds } })
      .select('name displayName phone email avatar identifiers webchatLink')
      .lean();

    const contactMap = {};
    contacts.forEach(c => {
      contactMap[c._id.toString()] = c;
    });

    // Batch-fetch last message status for all conversations
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const lastMessageIds = conversations
      .map(c => c.lastMessage)
      .filter(Boolean);

    let lastMessageStatusMap = {};
    let lastMessagePreviewMap = {};
    if (lastMessageIds.length > 0) {
      try {
        const lastMessages = await Message.find(
          { _id: { $in: lastMessageIds } },
          { status: 1, attachments: { $slice: 1 } }
        ).lean();
        lastMessages.forEach(m => {
          const id = m._id.toString();
          lastMessageStatusMap[id] = m.status;
          const att = m.attachments?.[0];
          if (att && (att.name || att.url)) {
            lastMessagePreviewMap[id] = {
              name: att.name || (att.url ? att.url.split('/').pop() : 'File'),
              size: att.size,
              type: att.type || 'document',
            };
          }
        });
      } catch (e) {
        // Non-critical
      }
    }

    // Enrich conversations with contact data, last message status, and attachment preview
    const enrichedConversations = conversations.map(conv => ({
      ...conv,
      contactData: contactMap[conv.contact.toString()] || null,
      lastMessageStatus: conv.lastMessage
        ? (lastMessageStatusMap[conv.lastMessage.toString()] || null)
        : null,
      lastMessageId: conv.lastMessage ? conv.lastMessage.toString() : null,
      lastMessagePreviewAttachment: conv.lastMessage
        ? (lastMessagePreviewMap[conv.lastMessage.toString()] || null)
        : null,
    }));

    return NextResponse.json({
      success: true,
      data: enrichedConversations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('[Conversations] GET error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
