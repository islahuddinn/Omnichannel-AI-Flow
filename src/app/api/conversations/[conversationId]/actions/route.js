// src/app/api/conversations/[conversationId]/actions/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import ConversationSchema from '@/models/schemas/Conversation';
import MessageSchema from '@/models/schemas/Message';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import SocketEmitter from '@/services/socket/SocketEmitter';

export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    
    const body = await request.json();
    const { action, data } = body;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // ✅ Check department access for agents
    if (auth.user.role === 'agent') {
      const userDepartments = (auth.user.departments || []).map(d => d.toString());
      if (!userDepartments.includes(conversation.department?.toString())) {
        return NextResponse.json(
          { success: false, error: 'You do not have access to this conversation' },
          { status: 403 }
        );
      }
    }

    // ✅ Safe socket emit - don't let socket failures break the API response
    const safeEmit = async (...args) => {
      try {
        await safeEmit(...args);
      } catch (err) {
        console.error('⚠️ Socket emission failed (non-fatal):', err.message);
      }
    };

    let result = null;

    switch (action) {
      case 'pin':
        conversation.isPinned = true;
        conversation.pinnedAt = new Date();
        conversation.pinnedBy = auth.user.userId;
        await conversation.save();
        result = { isPinned: true, pinnedAt: conversation.pinnedAt };
        await safeEmit(`tenant:${context.tenantId}`, 'conversation:pinned', {
          conversationId,
          isPinned: true,
          pinnedAt: conversation.pinnedAt
        });
        break;

      case 'unpin':
        conversation.isPinned = false;
        conversation.pinnedAt = null;
        conversation.pinnedBy = null;
        await conversation.save();
        result = { isPinned: false };
        await safeEmit(`tenant:${context.tenantId}`, 'conversation:unpinned', {
          conversationId,
          isPinned: false
        });
        break;

      case 'markRead':
        // Mark all inbound messages as read
        const updateResult = await Message.updateMany(
          { 
            conversation: conversationId,
            direction: 'inbound',
            readAt: { $exists: false }
          },
          { 
            $set: { 
              readAt: new Date(),
              readBy: auth.user.userId
            }
          }
        );
        
        // Count actual unread messages to ensure accuracy
        const unreadCount = await Message.countDocuments({
          conversation: conversationId,
          direction: 'inbound',
          readAt: { $exists: false }
        });
        
        // Update conversation with accurate unread count (should be 0 after marking as read)
        conversation.unreadCount = unreadCount; // Should be 0
        await conversation.save();
        
        result = { unreadCount: conversation.unreadCount };
        
        // Emit to both conversation room and tenant room for real-time updates
        await safeEmit(`conversation:${conversationId}`, 'conversation:read', {
          conversationId: String(conversationId),
          unreadCount: conversation.unreadCount
        });
        await safeEmit(`tenant:${context.tenantId}`, 'conversation:read', {
          conversationId: String(conversationId),
          unreadCount: conversation.unreadCount
        });
        break;

      case 'markUnread':
        conversation.unreadCount = data?.count || 1;
        await conversation.save();
        result = { unreadCount: conversation.unreadCount };
        
        await safeEmit(`tenant:${context.tenantId}`, 'conversation:unread', {
          conversationId,
          unreadCount: conversation.unreadCount
        });
        break;

      case 'archive':
        conversation.status = 'archived';
        conversation.archivedAt = new Date();
        conversation.archivedBy = auth.user.userId;
        await conversation.save();
        result = { status: 'archived', archivedAt: conversation.archivedAt };
        
        // ✅ Fetch full conversation with contact for socket event (matching API structure)
        const archivedConversation = await Conversation.findById(conversationId)
          .populate({
            path: 'contact',
            select: 'name displayName email phone avatar identifiers webchatLink',
            options: { lean: true }
          })
          .populate('assignedTo', 'firstName lastName avatar')
          .populate('department', 'name')
          .populate('channelAccount', 'name identifier type')
          .lean();
        
        // ✅ Get last message for conversation list display
        const lastMessage = await Message.findOne({ conversation: conversationId })
          .sort({ createdAt: -1 })
          .select('content type createdAt direction status')
          .lean();
        
        // ✅ Format conversation to match API response structure exactly
        const contactData = archivedConversation.contact ? {
          _id: archivedConversation.contact._id,
          name: archivedConversation.contact.name,
          displayName: archivedConversation.contact.displayName,
          phone: archivedConversation.contact.phone,
          email: archivedConversation.contact.email,
          avatar: archivedConversation.contact.avatar,
          identifiers: archivedConversation.contact.identifiers,
          webchatLink: archivedConversation.contact.webchatLink
        } : null;
        
        const formattedConversation = {
          ...archivedConversation,
          contactData, // ✅ Match API structure - use contactData not contact
          lastMessage: lastMessage ? {
            content: lastMessage.content,
            type: lastMessage.type,
            createdAt: lastMessage.createdAt,
            direction: lastMessage.direction,
            status: lastMessage.status
          } : null,
          lastMessageContent: lastMessage?.content || null,
          lastMessageAt: lastMessage?.createdAt || archivedConversation.lastMessageAt || archivedConversation.updatedAt
        };
        
        await safeEmit(`tenant:${context.tenantId}`, 'conversation:archived', {
          conversationId,
          conversation: formattedConversation,
          status: 'archived',
          archivedAt: conversation.archivedAt
        });
        break;

      case 'unarchive':
        conversation.status = 'active';
        conversation.archivedAt = null;
        conversation.archivedBy = null;
        await conversation.save();
        result = { status: 'active' };
        
        // ✅ Fetch full conversation with contact for socket event (matching API structure)
        const unarchivedConversation = await Conversation.findById(conversationId)
          .populate({
            path: 'contact',
            select: 'name displayName email phone avatar identifiers webchatLink',
            options: { lean: true }
          })
          .populate('assignedTo', 'firstName lastName avatar')
          .populate('department', 'name')
          .populate('channelAccount', 'name identifier type')
          .lean();
        
        // ✅ Get last message for conversation list display
        const lastMessageUnarchived = await Message.findOne({ conversation: conversationId })
          .sort({ createdAt: -1 })
          .select('content type createdAt direction status')
          .lean();
        
        // ✅ Format conversation to match API response structure exactly
        const contactDataUnarchived = unarchivedConversation.contact ? {
          _id: unarchivedConversation.contact._id,
          name: unarchivedConversation.contact.name,
          displayName: unarchivedConversation.contact.displayName,
          phone: unarchivedConversation.contact.phone,
          email: unarchivedConversation.contact.email,
          avatar: unarchivedConversation.contact.avatar,
          identifiers: unarchivedConversation.contact.identifiers,
          webchatLink: unarchivedConversation.contact.webchatLink
        } : null;
        
        const formattedConversationUnarchived = {
          ...unarchivedConversation,
          contactData: contactDataUnarchived, // ✅ Match API structure - use contactData not contact
          lastMessage: lastMessageUnarchived ? {
            content: lastMessageUnarchived.content,
            type: lastMessageUnarchived.type,
            createdAt: lastMessageUnarchived.createdAt,
            direction: lastMessageUnarchived.direction,
            status: lastMessageUnarchived.status
          } : null,
          lastMessageContent: lastMessageUnarchived?.content || null,
          lastMessageAt: lastMessageUnarchived?.createdAt || unarchivedConversation.lastMessageAt || unarchivedConversation.updatedAt
        };
        
        await safeEmit(`tenant:${context.tenantId}`, 'conversation:unarchived', {
          conversationId,
          conversation: formattedConversationUnarchived,
          status: 'active'
        });
        break;

      case 'mute':
        conversation.isMuted = true;
        conversation.mutedAt = new Date();
        conversation.mutedBy = auth.user.userId;
        conversation.mutedUntil = data?.until || null; // Optional expiry
        await conversation.save();
        result = { 
          isMuted: true, 
          mutedAt: conversation.mutedAt,
          mutedUntil: conversation.mutedUntil
        };
        
        await safeEmit(`tenant:${context.tenantId}`, 'conversation:muted', {
          conversationId,
          isMuted: true
        });
        break;

      case 'unmute':
        conversation.isMuted = false;
        conversation.mutedAt = null;
        conversation.mutedBy = null;
        conversation.mutedUntil = null;
        await conversation.save();
        result = { isMuted: false };
        
        await safeEmit(`tenant:${context.tenantId}`, 'conversation:unmuted', {
          conversationId,
          isMuted: false
        });
        break;

      case 'snooze':
        const snoozeUntil = data?.until || new Date(Date.now() + 3600000); // 1 hour default
        conversation.isSnoozed = true;
        conversation.snoozedAt = new Date();
        conversation.snoozedBy = auth.user.userId;
        conversation.snoozedUntil = snoozeUntil;
        await conversation.save();
        result = { 
          isSnoozed: true, 
          snoozedUntil: conversation.snoozedUntil 
        };
        
        await safeEmit(`tenant:${context.tenantId}`, 'conversation:snoozed', {
          conversationId,
          isSnoozed: true,
          snoozedUntil
        });
        break;

      case 'unsnooze':
        conversation.isSnoozed = false;
        conversation.snoozedAt = null;
        conversation.snoozedBy = null;
        conversation.snoozedUntil = null;
        await conversation.save();
        result = { isSnoozed: false };
        
        await safeEmit(`tenant:${context.tenantId}`, 'conversation:unsnoozed', {
          conversationId,
          isSnoozed: false
        });
        break;

      case 'star':
        conversation.isStarred = true;
        conversation.starredAt = new Date();
        conversation.starredBy = auth.user.userId;
        await conversation.save();
        result = { isStarred: true, starredAt: conversation.starredAt };
        
        await safeEmit(`tenant:${context.tenantId}`, 'conversation:starred', {
          conversationId,
          isStarred: true
        });
        break;

      case 'unstar':
        conversation.isStarred = false;
        conversation.starredAt = null;
        conversation.starredBy = null;
        await conversation.save();
        result = { isStarred: false };
        
        await safeEmit(`tenant:${context.tenantId}`, 'conversation:unstarred', {
          conversationId,
          isStarred: false
        });
        break;

      case 'delete':
        // Soft delete
        conversation.status = 'deleted';
        conversation.deletedAt = new Date();
        conversation.deletedBy = auth.user.userId;
        await conversation.save();
        result = { status: 'deleted', deletedAt: conversation.deletedAt };
        
        await safeEmit(`tenant:${context.tenantId}`, 'conversation:deleted', {
          conversationId,
          status: 'deleted'
        });
        break;

      case 'deletePermanent':
        // ✅ Hard delete: permanently remove conversation and ALL associated messages
        // This action is irreversible and will delete:
        // 1. All messages in the conversation
        // 2. The conversation itself
        // 3. All related data (reactions, attachments metadata, etc.)
        
        try {
          // Delete all messages first
          const messagesDeleteResult = await Message.deleteMany({ conversation: conversationId });
          console.log(`✅ Deleted ${messagesDeleteResult.deletedCount} messages for conversation ${conversationId}`);
          
          // Then delete the conversation
          const conversationDeleteResult = await Conversation.deleteOne({ _id: conversationId });
          
          if (conversationDeleteResult.deletedCount === 0) {
            return NextResponse.json(
              { success: false, error: 'Conversation not found or already deleted' },
              { status: 404 }
            );
          }
          
          console.log(`✅ Permanently deleted conversation ${conversationId} and ${messagesDeleteResult.deletedCount} messages`);
          
          result = { 
            status: 'removed', 
            removedAt: new Date(),
            messagesDeleted: messagesDeleteResult.deletedCount,
            conversationDeleted: conversationDeleteResult.deletedCount
          };

          // Emit socket events to notify all clients
          await safeEmit(`tenant:${context.tenantId}`, 'conversation:deleted', {
            conversationId,
            status: 'removed',
            messagesDeleted: messagesDeleteResult.deletedCount
          });
          await safeEmit(`tenant:${context.tenantId}`, 'messages:cleared', {
            conversationId,
            messagesDeleted: messagesDeleteResult.deletedCount
          });
        } catch (error) {
          console.error(`❌ Error permanently deleting conversation ${conversationId}:`, error);
          return NextResponse.json(
            { success: false, error: `Failed to permanently delete conversation: ${error.message}` },
            { status: 500 }
          );
        }
        break;

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: `Conversation ${action} successful`
    });

  } catch (error) {
    console.error('Conversation action error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}