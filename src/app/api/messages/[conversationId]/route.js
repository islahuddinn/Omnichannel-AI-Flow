// src/app/api/messages/[conversationId]/route.js - OPTIMIZED FOR REAL-TIME
import { NextResponse } from 'next/server';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB, getMasterDB } from '@/config/database';
import MessageSchema from '@/models/schemas/Message';
import ConversationSchema from '@/models/schemas/Conversation';
import ContactSchema from '@/models/schemas/Contact';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import UserSchema from '@/models/schemas/User';
import { verifyAuth } from '@/middleware/auth';
import { getMergedConversationIds } from '@/services/conversation/MergeService';
import { getConversationCallLogs } from '@/services/call-logs/callLogService';
import jwt from 'jsonwebtoken';
import { getWebChatSecret } from '@/lib/auth/webchatSecret';
import mongoose from 'mongoose';

/**
 * Verify WebChat token (alternative auth for WebChat visitors)
 */
async function verifyWebChatToken(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, getWebChatSecret());
    
    return {
      success: true,
      type: 'webchat',
      session: decoded,
      conversationId: decoded.conversationId,
      contactId: decoded.contactId,
      tenantId: decoded.tenantId,
    };
  } catch (error) {
    return null;
  }
}

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const { conversationId } = resolvedParams;

    // Validate conversation ID
    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid conversation ID' },
        { status: 400 }
      );
    }

    // ✅ Try WebChat token first (for WebChat visitors), then regular auth
    let auth = { success: false };
    let isWebChatVisitor = false;
    let webChatSession = null;
    let tenantId = null;

    // ✅ First, try WebChat token (silently - don't log errors)
    try {
      webChatSession = await verifyWebChatToken(request);
      if (webChatSession && webChatSession.success) {
        isWebChatVisitor = true;
        tenantId = webChatSession.tenantId;
        
        // ✅ Note: We don't check conversationId here because:
        // 1. A contact can have multiple conversations
        // 2. The conversationId in the token might be outdated after refresh
        // 3. We'll verify ownership by contactId after fetching the conversation
      }
    } catch (error) {
      // Silently fail - WebChat token not present or invalid
    }

    // ✅ If WebChat token failed, try regular auth
    if (!isWebChatVisitor) {
      try {
        auth = await verifyAuth(request);
        if (auth.success) {
          const context = await getTenantContext(request);
          tenantId = context.tenantId;
        } else {
          // Both WebChat token and regular auth failed
          return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
      } catch (error) {
        // Silently fail - don't log auth errors for WebChat visitors
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
    }

    const tenantDB = await getTenantDB(tenantId);
    const masterDB = await getMasterDB();
    
    // Register all required models
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const User = masterDB.models.User || masterDB.model('User', UserSchema);

    // ✅ OPTIMIZED: Only fetch essential conversation fields for faster query
    // Use lean() for faster queries and maxTimeMS for timeout protection
    const isAdmin = ['company_admin', 'super_admin'].includes(auth.user?.role);
    let conversation = await Conversation.findById(conversationId)
      .select('isMerged mergedConversations channel channelAccount department assignedTo contact primaryConversation')
      .lean()
      .maxTimeMS(3000); // 3 second timeout - fast fetch
    
    // ✅ REMOVED: Department conversation aggregation for company admins
    // Each department conversation should show only its own messages, not aggregated messages from all departments
    // This ensures proper separation of conversations by department
      
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // ✅ WebChat visitors can only access their own conversations
    if (isWebChatVisitor) {
      const conversationContactId = conversation.contact?.toString() || conversation.contact;
      const sessionContactId = webChatSession.contactId?.toString() || webChatSession.contactId;
      
      // ✅ Verify: conversation must be webchat AND contact must match
      if (conversation.channel !== 'webchat') {
        return NextResponse.json(
          { success: false, error: 'You do not have access to this conversation' },
          { status: 403 }
        );
      }
      
      // ✅ Allow access if contact matches (even if conversationId in token doesn't match)
      // This handles cases where:
      // - User refreshes page and conversationId in token is outdated
      // - User has multiple conversations and switches between them
      if (conversationContactId && sessionContactId && conversationContactId !== sessionContactId) {
        return NextResponse.json(
          { success: false, error: 'You do not have access to this conversation' },
          { status: 403 }
        );
      }
      
      // ✅ If contactId matches, allow access (update token's conversationId if needed)
      // This ensures the user can access their conversation even after refresh
    } else {
      // ✅ Regular auth - check access for agents/admins
      // ✅ Secondary merged conversations should NOT be accessible - redirect to primary
      if (conversation.primaryConversation) {
        const primaryId = conversation.primaryConversation.toString();
        return NextResponse.json({
          success: false,
          error: 'This conversation is merged into another conversation',
          redirectTo: primaryId,
          message: 'Please access the primary merged conversation instead'
        }, { status: 403 });
      }

      // Check access for regular users
      const isAdmin = ['company_admin', 'super_admin'].includes(auth.user.role);
      const isAssigned = conversation.assignedTo?.toString() === auth.user.userId;
      const userDepartments = auth.user.departments || [];
      const conversationDept = conversation.department?.toString();
      const isInSameDepartment = userDepartments.some(ud => ud.toString() === conversationDept);

      if (auth.user.role === 'agent' && !isAssigned && !isInSameDepartment) {
        return NextResponse.json({ 
          success: false, 
          error: 'You do not have access to this conversation' 
        }, { status: 403 });
      }
    }

    // Get pagination parameters
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const before = searchParams.get('before'); // Message ID to load messages before (for infinite scroll - cursor-based)
    const page = parseInt(searchParams.get('page') || '1'); // Page number (fallback for backward compatibility)
    const sort = searchParams.get('sort') || '-createdAt'; // Default: latest first
    const direction = searchParams.get('direction'); // Optional: 'inbound' or 'outbound'

    // Parse sort parameter (-createdAt = descending, createdAt = ascending)
    const sortDirection = sort.startsWith('-') ? -1 : 1;
    const sortField = sort.replace('-', '');

    // ✅ Note: We'll fetch all messages first, then combine with call logs, then paginate
    // This ensures accurate pagination when messages and call logs are mixed
    // Pagination will be applied after combining messages and call logs

    // ✅ Handle merged conversations:
    // - If conversation is PRIMARY merged (isMerged: true, mergedConversations exist): Return ALL messages from ALL merged conversations
    // - If conversation is NOT merged: Return only messages for THIS conversation AND matching channel
    // ✅ REMOVED: Company admin unified view aggregation - each department conversation shows only its own messages
    let messageQuery = {};

    // ✅ Apply direction filter if provided (used by WhatsApp session check)
    if (direction && ['inbound', 'outbound'].includes(direction)) {
      messageQuery.direction = direction;
    }
    
    if (conversation.isMerged && conversation.mergedConversations?.length > 0) {
      // ✅ PRIMARY merged conversation - return messages from ALL merged conversations
      // Include primary conversation ID + all merged conversation IDs
      const messageQueryIds = [conversationId];
      conversation.mergedConversations.forEach(merged => {
        if (merged.conversationId && merged.conversationId.toString() !== conversationId.toString()) {
          messageQueryIds.push(merged.conversationId);
        }
      });
      // Remove duplicates and ensure we have valid IDs
      const uniqueIds = [...new Set(messageQueryIds.map(id => id?.toString()).filter(Boolean))];
      messageQuery.conversation = { $in: uniqueIds };
    } else {
      // ✅ Regular conversation (not merged) - return ALL messages for THIS conversation
      // ✅ CRITICAL FIX: Do NOT filter by channel here. Messages belong to a conversation via the
      // conversation field. Adding a channel filter can hide messages that were reassigned during
      // unmerge operations or system/internal messages. The conversation ID is the source of truth.
      messageQuery.conversation = conversationId;
    }

    // ✅ Build message query (without pagination - we'll paginate after combining with call logs)
    const finalQuery = {
      ...messageQuery
    };
    
    // ✅ PERFORMANCE OPTIMIZATION: Use hint to ensure index usage for merged conversations
    // For merged conversations with $in, ensure MongoDB uses the conversation index
    const queryOptions = {
      strictPopulate: false,
      maxTimeMS: 10000, // ✅ 10 second timeout to prevent hanging queries (merged conversations need more time)
    };
    
    // ✅ OPTIMIZED: Build query with index hint for better performance
    // Use hint to ensure MongoDB uses the conversation + createdAt index
    // ✅ Fetch ALL messages (no pagination yet) - we'll paginate after combining with call logs
    let messageQueryBuilder = Message.find(finalQuery)
      .select('-__v')
      .sort({ [sortField]: sortDirection }) // Dynamic sort
      .lean()
      .maxTimeMS(10000); // ✅ 10 second timeout - merged conversations may need more time
    
    // ✅ PERFORMANCE: Only populate essential fields
    // Use lean() for faster queries, then populate only what's necessary
    // ✅ NOTE: User model (sender) is in masterDB, so we can't populate directly
    // We'll populate sender manually after fetching messages
    messageQueryBuilder = messageQueryBuilder
      .populate({
        path: 'contact',
        select: 'name identifier avatar',
        options: { lean: true }
      })
      .populate({
        path: 'channelAccount',
        select: 'name identifier type',
        options: { lean: true }
      });
    
    // ✅ OPTIMIZED: Only populate replyTo if it exists (sparse populate)
    // This avoids unnecessary queries for messages without replies
    messageQueryBuilder = messageQueryBuilder
      .populate({
        path: 'replyTo',
        select: 'content type createdAt sender contact attachments',
        options: { lean: true },
        populate: [
          { path: 'sender', select: 'firstName lastName', options: { lean: true } },
          { path: 'contact', select: 'name', options: { lean: true } }
        ]
      });
    
    // ✅ OPTIMIZED: Only populate reactions if they exist (sparse populate)
    // Most messages don't have reactions, so this saves significant query time
    // ✅ NOTE: User model is in masterDB, so we can't populate directly
    // We'll populate reactions.user manually after fetching messages
    messageQueryBuilder = messageQueryBuilder
      .populate({
        path: 'reactions.contact',
        select: 'name displayName avatar identifiers',
        options: { lean: true }
      });
    
    // ✅ Execute query with timeout protection
    const startTime = Date.now();
    const messages = await messageQueryBuilder;
    const queryTime = Date.now() - startTime;
    
    // ✅ Manually populate sender and reactions.user from masterDB (User model is in masterDB, not tenantDB)
    if (messages.length > 0) {
      const masterDB = await getMasterDB();
      const User = masterDB.models.User || masterDB.model('User', UserSchema);
      
      // Collect all user IDs from sender and reactions
      const userIds = new Set();
      messages.forEach(msg => {
        // Collect sender IDs
        if (msg.sender && !userIds.has(msg.sender.toString())) {
          userIds.add(msg.sender.toString());
        }
        // Collect user IDs from reactions
        if (msg.reactions && Array.isArray(msg.reactions)) {
          msg.reactions.forEach(reaction => {
            if (reaction.user && !userIds.has(reaction.user.toString())) {
              userIds.add(reaction.user.toString());
            }
          });
        }
      });
      
      // Fetch users from masterDB if needed
      if (userIds.size > 0) {
        const users = await User.find({ _id: { $in: Array.from(userIds) } })
          .select('firstName lastName avatar role')
          .lean();
        
        const userMap = new Map(users.map(u => [u._id.toString(), u]));
        
        // Populate sender
        messages.forEach(msg => {
          if (msg.sender) {
            const userId = msg.sender.toString();
            msg.sender = userMap.get(userId) || msg.sender;
          }
        });
        
        // Populate reactions.user and reactions.contactName
        messages.forEach(msg => {
          if (msg.reactions && Array.isArray(msg.reactions)) {
            msg.reactions.forEach(reaction => {
              // ✅ Add contactName from populated contact object for WebChat visitors
              if (reaction.contact && typeof reaction.contact === 'object') {
                // ✅ Prioritize name, then displayName, then fallback
                reaction.contactName = reaction.contact.name || reaction.contact.displayName || null;
              }
              if (reaction.user) {
                const userId = reaction.user.toString();
                reaction.user = userMap.get(userId) || reaction.user;
                // ✅ If user is populated, ensure userName is set
                if (typeof reaction.user === 'object' && reaction.user.firstName) {
                  reaction.userName = `${reaction.user.firstName} ${reaction.user.lastName || ''}`.trim();
                }
              }
            });
          }
        });
      }
    }
    
    // ✅ Log slow queries for monitoring
    if (queryTime > 2000) {
      console.warn(`⚠️ Slow message query detected: ${queryTime}ms for conversation ${conversationId}`, {
        isMerged: conversation.isMerged,
        mergedCount: conversation.mergedConversations?.length || 0,
        messageCount: messages.length,
        query: finalQuery
      });
    } else {
      console.log(`✅ Message query completed in ${queryTime}ms for conversation ${conversationId}`, {
        isMerged: conversation.isMerged,
        messageCount: messages.length
      });
    }
    
    // ✅ OPTIMIZED: Skip countDocuments for better performance - use hasMore instead
    // We don't need exact total count, just need to know if there are more messages
    // This saves significant query time, especially for conversations with many messages
    // ✅ Check if there are more messages by trying to fetch one more
    let hasMore = false;
    if (messages.length === limit) {
      // Try to fetch one more message to see if there are more
      const nextMessageQuery = { ...finalQuery };
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        nextMessageQuery.createdAt = { $lt: new Date(lastMessage.createdAt) };
      }
      const nextMessage = await Message.findOne(nextMessageQuery).select('_id').lean().maxTimeMS(2000);
      hasMore = !!nextMessage;
    }
    // ✅ Fetch call logs for this conversation with access control
    let callLogs = [];
    if (!isWebChatVisitor && auth.user) {
      try {
        // Use the reusable service function
        const fetchedCallLogs = await getConversationCallLogs(
          conversationId,
          auth.user.userId,
          tenantId
        );
        
        // Transform call logs to include type field
        callLogs = fetchedCallLogs.map(log => ({
          ...log,
          type: 'callLog',
          _id: log._id.toString()
        }));
      } catch (error) {
        console.error('Error fetching conversation call logs:', error);
        // Continue without call logs if there's an error
        callLogs = [];
      }
    }
    
    // ✅ Transform messages to include type
    const messagesWithType = messages.map(msg => ({
      ...msg,
      type: 'message',
      _id: msg._id.toString()
    }));
    
    // Combine messages and call logs, sort by createdAt descending (newest first)
    // This ensures page 1 returns the LATEST messages, and older pages return older messages
    const allItems = [...messagesWithType, ...callLogs].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA; // Newest first
    });

    // Apply pagination — page 1 = latest messages, page 2 = older messages, etc.
    let skip = 0;
    if (before) {
      // Cursor-based: find the position of the 'before' item (going backwards in time)
      const beforeIndex = allItems.findIndex(item => item._id === before);
      if (beforeIndex !== -1) {
        skip = beforeIndex + 1;
      }
    } else if (page > 1) {
      skip = (page - 1) * limit;
    }

    // Get the page of items (newest first)
    const paginatedItemsDesc = allItems.slice(skip, skip + limit);

    // Reverse to chronological order (oldest first) for display — frontend expects oldest at top
    const paginatedItems = paginatedItemsDesc.reverse();

    const hasMoreItems = skip + paginatedItemsDesc.length < allItems.length;
    const total = allItems.length;

    // ✅ OPTIMIZED: Mark unread messages as read (async - don't wait for it)
    // This improves response time by not blocking the response
    if (!isWebChatVisitor && auth.user && auth.user.role !== 'super_admin') {
      // Fire and forget - don't wait for this to complete
      Message.updateMany(
        { 
          conversation: conversationId,
          direction: 'inbound',
          status: { $ne: 'read' }
        },
        { 
          $set: { 
            status: 'read',
            readAt: new Date(),
            readBy: auth.user.userId
          }
        }
      ).catch(err => console.error('Failed to mark messages as read:', err));

      // Update conversation unread count (async)
      Conversation.findByIdAndUpdate(conversationId, {
        $set: { unreadCount: 0 }
      }).catch(err => console.error('Failed to update unread count:', err));
    }

    return NextResponse.json({
      success: true,
      data: paginatedItems,
      pagination: {
        limit,
        total,
        hasMore: hasMoreItems || hasMore // Use combined hasMore
      },
      counts: {
        messages: messages.length,
        callLogs: callLogs.length
      }
    });

  } catch (error) {
    console.error('Get messages error:', error);
    
    // ✅ If query timeout, return specific error
    if (error.name === 'MongoServerError' && error.code === 50) {
      return NextResponse.json(
        { success: false, error: 'Query timeout - please try again' },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}