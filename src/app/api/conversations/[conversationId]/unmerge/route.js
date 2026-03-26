// src/app/api/conversations/[conversationId]/unmerge/route.js
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
    
    // Get primary conversation
    const primaryConversation = await Conversation.findById(conversationId);
    if (!primaryConversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    if (!primaryConversation.isMerged) {
      return NextResponse.json(
        { success: false, error: 'Conversation is not merged' },
        { status: 400 }
      );
    }

    // Get merged conversation IDs with their channel info
    const mergedConversationsInfo = primaryConversation.mergedConversations || [];
    const mergedConvIds = mergedConversationsInfo.map(mc => mc.conversationId);

    // ✅ Get all merged conversations from database to access their channels
    const mergedConvs = await Conversation.find({ _id: { $in: mergedConvIds } }).lean();
    
    // Create a map of channel -> conversation ID for reassigning messages
    const channelToConversationMap = {};
    mergedConvs.forEach(conv => {
      if (conv.channel) {
        channelToConversationMap[conv.channel] = conv._id.toString();
      }
    });
    // Also include primary conversation's channel
    if (primaryConversation.channel) {
      channelToConversationMap[primaryConversation.channel] = conversationId.toString();
    }

    // ✅ Reassign messages that were created during merge period back to their original conversations
    // Messages should be reassigned based on their channel to the corresponding conversation
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    
    // Find when the merge happened (from mergeHistory - use the most recent merge)
    const mergeHistoryEntries = primaryConversation.mergeHistory?.filter(h => h.action === 'merge') || [];
    const mostRecentMerge = mergeHistoryEntries.length > 0 
      ? mergeHistoryEntries.sort((a, b) => new Date(b.performedAt || 0) - new Date(a.performedAt || 0))[0]
      : null;
    const mergeDate = mostRecentMerge?.performedAt || primaryConversation.updatedAt || new Date(0);
    
    console.log(`🔄 Reassigning messages created after merge date: ${mergeDate.toISOString()}`);
    
    // ✅ OPTIMIZED: Reassign messages in parallel for all merged conversations
    // Build mapping using departmentId + channel + channelAccount for accurate reassignment
    // ✅ CRITICAL: Use departmentId as primary criterion to handle same-channel cross-department merges
    const convLookup = [];
    mergedConvs.forEach(mergedConv => {
      if (mergedConv.channel) {
        convLookup.push({
          channel: mergedConv.channel,
          channelAccount: mergedConv.channelAccount?.toString() || null,
          department: mergedConv.department?.toString() || null,
          targetConvId: mergedConv._id.toString(),
        });
      }
    });

    // ✅ OPTIMIZED: Find all messages to reassign in a single query, then bulk update
    // Include messages that match merged channels OR merged departments
    const mergedChannels = [...new Set(convLookup.map(c => c.channel))];
    const mergedDepartments = [...new Set(convLookup.map(c => c.department).filter(Boolean))];

    const messagesToReassign = await Message.find({
      conversation: conversationId,
      createdAt: { $gte: mergeDate },
      $or: [
        { channel: { $in: mergedChannels } },
        { departmentId: { $in: mergedDepartments } }
      ]
    }).select('_id channel channelAccount departmentId').lean();

    // ✅ Group messages by target conversation using departmentId + channel + channelAccount match
    // Priority: 1) departmentId match, 2) channel+channelAccount exact, 3) channel-only fallback
    const primaryDeptId = primaryConversation.department?.toString() || null;
    const updatesByConv = new Map();
    messagesToReassign.forEach(msg => {
      const msgDeptId = msg.departmentId?.toString() || null;

      // ✅ Priority 1: Match by departmentId (most accurate for cross-department merges)
      const deptMatch = convLookup.find(c => c.department && c.department === msgDeptId);

      // ✅ Priority 2: Match by channel + channelAccount (for same-department different-channel merges)
      const exactMatch = convLookup.find(
        c => c.channel === msg.channel && c.channelAccount === (msg.channelAccount?.toString() || null)
      );

      // ✅ Priority 3: Match by channel only (fallback)
      const channelMatch = convLookup.find(c => c.channel === msg.channel);

      // ✅ If message belongs to primary's department, skip it (it stays in primary)
      if (msgDeptId && msgDeptId === primaryDeptId && !deptMatch) {
        return; // Message belongs to primary conversation's department - don't move it
      }

      const target = deptMatch || exactMatch || channelMatch;

      if (target) {
        if (!updatesByConv.has(target.targetConvId)) {
          updatesByConv.set(target.targetConvId, []);
        }
        updatesByConv.get(target.targetConvId).push(msg._id);
      }
    });

    // ✅ Build a map of conversationId -> departmentId so we can fix departmentId on reassigned messages
    const convToDepartmentMap = {};
    mergedConvs.forEach(conv => {
      convToDepartmentMap[conv._id.toString()] = conv.department?.toString() || null;
    });
    convToDepartmentMap[conversationId.toString()] = primaryConversation.department?.toString() || null;

    // ✅ Execute all bulk updates in parallel
    const updatePromises = Array.from(updatesByConv.entries()).map(async ([targetConvId, messageIds]) => {
      if (messageIds.length > 0) {
        // ✅ CRITICAL: Update both conversation AND departmentId to maintain department isolation
        const updateFields = { conversation: targetConvId };
        const targetDeptId = convToDepartmentMap[targetConvId];
        if (targetDeptId) {
          updateFields.departmentId = targetDeptId;
        }
        await Message.updateMany(
          { _id: { $in: messageIds } },
          { $set: updateFields }
        );
        console.log(`✅ Reassigned ${messageIds.length} message(s) to conversation ${targetConvId} (dept: ${targetDeptId})`);
        return { targetConvId, count: messageIds.length };
      }
      return { targetConvId, count: 0 };
    });

    await Promise.all(updatePromises);
    console.log(`✅ Message reassignment complete for all merged conversations`);

    // ✅ Helper function to recalculate last message for a conversation (WhatsApp-style approach)
    // This fetches the actual last message from the messages collection, ensuring accuracy
    const recalculateLastMessage = async (convId) => {
      try {
        // Get conversation to know its channel for proper filtering
        const conv = await Conversation.findById(convId).lean();
        if (!conv) {
          console.error(`❌ Conversation ${convId} not found for last message recalculation`);
          return false;
        }
        
        // ✅ Fetch the actual last message from messages collection
        // ✅ CRITICAL FIX: Only filter by conversation ID, NOT by channel
        // After unmerge, messages may have been reassigned and their channel may not match
        // The conversation ID is the authoritative link between messages and conversations
        const messageQuery = {
          conversation: convId
        };
        
        // ✅ OPTIMIZED: Use index hint and limit for faster query
        const lastMessage = await Message.findOne(messageQuery)
          .sort({ createdAt: -1 })
          .limit(1)
          .lean();
        
        if (lastMessage) {
          // Extract message content
          let messageContent = '';
          let messageType = lastMessage.type || 'text';
          
          if (typeof lastMessage.content === 'string') {
            messageContent = lastMessage.content;
          } else if (lastMessage.content?.text) {
            messageContent = lastMessage.content.text;
          } else if (lastMessage.content?.type) {
            messageType = lastMessage.content.type;
          }
          
          // Format content for preview (WhatsApp-style truncation)
          let previewContent = '';
          if (messageType === 'image' || messageType === 'photo') {
            previewContent = '📷 Photo';
          } else if (messageType === 'video') {
            previewContent = '🎥 Video';
          } else if (messageType === 'audio' || messageType === 'voice') {
            previewContent = '🎤 Voice message';
          } else if (messageType === 'document' || messageType === 'file') {
            previewContent = '📄 Document';
          } else if (messageType === 'location') {
            previewContent = '📍 Location';
          } else if (messageType === 'contact') {
            previewContent = '👤 Contact';
          } else {
            // Text message - show preview (truncate if needed)
            previewContent = messageContent.length > 100 
              ? messageContent.substring(0, 100) + '...' 
              : messageContent || '';
          }
          
          // ✅ OPTIMIZED: Use estimated count for better performance (exact count not critical)
          const messageCount = await Message.countDocuments(messageQuery).maxTimeMS(3000);
          
          // Update conversation with last message info
          await Conversation.findByIdAndUpdate(convId, {
            lastMessage: lastMessage._id,
            lastMessageContent: previewContent,
            lastMessageType: messageType,
            lastMessageDirection: lastMessage.direction || 'inbound',
            lastMessageAt: lastMessage.createdAt,
            messageCount: messageCount
          });
          
          console.log(`✅ Recalculated last message for conversation ${convId}: "${previewContent.substring(0, 30)}..." (${messageCount} messages)`);
          return true;
        } else {
          // No messages - clear last message fields
          await Conversation.findByIdAndUpdate(convId, {
            $unset: {
              lastMessage: '',
              lastMessageContent: '',
              lastMessageType: '',
              lastMessageDirection: '',
              lastMessageAt: ''
            },
            $set: {
              messageCount: 0
            }
          });
          console.log(`✅ No messages found for conversation ${convId} - cleared last message`);
          return true;
        }
      } catch (error) {
        console.error(`❌ Error recalculating last message for conversation ${convId}:`, error);
        return false;
      }
    };

    // ✅ OPTIMIZED: Recalculate last messages for ALL conversations in parallel
    console.log(`🔄 Recalculating last messages for all conversations after unmerge...`);
    
    // ✅ Execute all recalculations in parallel for better performance
    const recalculationPromises = [
      recalculateLastMessage(conversationId),
      ...mergedConvIds.map(id => recalculateLastMessage(id))
    ];
    
    await Promise.all(recalculationPromises);
    console.log(`✅ Last message recalculation complete for all conversations`);
    
    // ✅ IMPORTANT: After recalculation, ensure each conversation has its own isolated last message
    // Never mix last messages between conversations - each conversation should only use its own cached data

    // Restore merged conversations - Set ALL to 'active' (not 'open')
    // ✅ CRITICAL: Use separate operations to avoid MongoDB conflict (cannot $set and $unset same field)
    // First, remove primaryConversation field
    await Conversation.updateMany(
      { _id: { $in: mergedConvIds } },
      {
        $unset: {
          primaryConversation: '' // ✅ Only use $unset to remove field
        }
      }
    );
    
    // Then, update status, isMerged, and reset unreadCount
    await Conversation.updateMany(
      { _id: { $in: mergedConvIds } },
      {
        $set: {
          status: 'active', // ✅ Use 'active' not 'open'
          isMerged: false,
          unreadCount: 0 // ✅ Reset unread count — messages were already read in merged view
        }
      }
    );

    // Update primary conversation - Set status back to 'active'
    primaryConversation.isMerged = false;
    primaryConversation.status = 'active'; // ✅ Set primary to 'active' when unmerged
    primaryConversation.autoMergeDisabled = true; // Prevent auto-merge
    primaryConversation.mergeHistory.push({
      action: 'unmerge',
      conversations: mergedConvIds,
      performedBy: auth.user.userId,
      performedAt: new Date()
    });
    const previousMergedConversations = primaryConversation.mergedConversations;
    primaryConversation.mergedConversations = [];
    
    // Recalculate last message before saving (will be done above, but ensure it's saved)
    // ✅ Primary conversation should never have primaryConversation set, but ensure it's cleared
    // Use separate operations to avoid MongoDB conflict
    await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $unset: {
          primaryConversation: '' // ✅ Remove primaryConversation field if it exists
        }
      }
    );
    
    const updatedPrimary = await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $set: {
          isMerged: false,
          status: 'active',
          autoMergeDisabled: true,
          mergedConversations: [],
          unreadCount: 0 // ✅ Reset unread count — messages were already read in merged view
        }
      },
      { new: true }
    );
    
    // ✅ OPTIMIZED: Fetch updated conversations in parallel
    const [updatedPrimaryConv, ...updatedMergedConvsArray] = await Promise.all([
      Conversation.findById(conversationId)
        .populate('contact', 'name displayName email phone avatar')
        .lean(),
      ...mergedConvIds.map(id => 
        Conversation.findById(id)
          .populate('contact', 'name displayName email phone avatar')
          .lean()
      )
    ]);
    
    const updatedMergedConvs = updatedMergedConvsArray.filter(Boolean);

    // Emit socket events
    const unmergeEventData = {
      primaryConversationId: conversationId.toString(),
      unmergedConversationIds: mergedConvIds.map(id => id.toString()),
      unmergedBy: auth.user.userId,
      timestamp: new Date().toISOString(),
      updatedConversations: [
        updatedPrimaryConv,
        ...updatedMergedConvs
      ].filter(Boolean) // ✅ Include updated conversation data with recalculated last messages
    };

    // ✅ OPTIMIZED: Emit all socket events in parallel for better performance
    const socketEmitPromises = [];
    
    // Emit unmerged event to all conversation rooms
    socketEmitPromises.push(
      SocketEmitter.emit(`conversation:${conversationId}`, 'conversation:unmerged', unmergeEventData)
    );
    mergedConvIds.forEach(mergedId => {
      socketEmitPromises.push(
        SocketEmitter.emit(`conversation:${mergedId}`, 'conversation:unmerged', unmergeEventData)
      );
    });
    
    // ✅ Emit conversation:update events for each conversation (in parallel)
    if (updatedPrimaryConv) {
      const primaryUpdate = {
        conversationId: conversationId.toString(),
        update: {
          lastMessage: updatedPrimaryConv.lastMessage,
          lastMessageContent: updatedPrimaryConv.lastMessageContent,
          lastMessageType: updatedPrimaryConv.lastMessageType,
          lastMessageDirection: updatedPrimaryConv.lastMessageDirection,
          lastMessageAt: updatedPrimaryConv.lastMessageAt,
          messageCount: updatedPrimaryConv.messageCount,
          isMerged: false,
          unreadCount: 0 // ✅ Messages were already read in merged view
        }
      };
      socketEmitPromises.push(
        SocketEmitter.emit(`conversation:${conversationId}`, 'conversation:update', primaryUpdate),
        SocketEmitter.emit(`tenant:${context.tenantId}`, 'conversation:update', primaryUpdate)
      );
    }

    updatedMergedConvs.forEach(mergedConv => {
      const mergedUpdate = {
        conversationId: mergedConv._id.toString(),
        update: {
          lastMessage: mergedConv.lastMessage,
          lastMessageContent: mergedConv.lastMessageContent,
          lastMessageType: mergedConv.lastMessageType,
          lastMessageDirection: mergedConv.lastMessageDirection,
          lastMessageAt: mergedConv.lastMessageAt,
          messageCount: mergedConv.messageCount,
          isMerged: false,
          primaryConversation: null,
          unreadCount: 0 // ✅ Messages were already read in merged view
        }
      };
      socketEmitPromises.push(
        SocketEmitter.emit(`conversation:${mergedConv._id}`, 'conversation:update', mergedUpdate),
        SocketEmitter.emit(`tenant:${context.tenantId}`, 'conversation:update', mergedUpdate)
      );
    });
    
    // Emit to tenant room for list updates
    socketEmitPromises.push(
      SocketEmitter.emit(`tenant:${context.tenantId}`, 'conversation:unmerged', unmergeEventData)
    );
    
    // ✅ Execute all socket emissions in parallel
    await Promise.all(socketEmitPromises);

    return NextResponse.json({
      success: true,
      data: {
        conversation: primaryConversation,
        unmergedCount: mergedConvIds.length,
        unmergedConversations: previousMergedConversations
      }
    });

  } catch (error) {
    console.error('Unmerge conversation error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}