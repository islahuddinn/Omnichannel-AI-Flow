// src/app/api/conversations/[conversationId]/merge/route.js
import { NextResponse } from 'next/server';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import ConversationSchema from '@/models/schemas/Conversation';
import ContactSchema from '@/models/schemas/Contact';
import MessageSchema from '@/models/schemas/Message';
import { verifyAuth } from '@/middleware/auth';
import SocketEmitter from '@/services/socket/SocketEmitter';
import { mergeContacts } from '@/services/conversation/MergeService';
import mongoose from 'mongoose';

/**
 * POST /api/conversations/merge
 * Merge multiple conversations with the same phone number or email
 * Body: { conversationIds: string[], reason?: string }
 */
export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { conversationIds, reason } = body;

    if (!Array.isArray(conversationIds) || conversationIds.length < 2) {
      return NextResponse.json({ 
        success: false, 
        error: 'At least 2 conversation IDs are required' 
      }, { status: 400 });
    }

    // Validate all conversation IDs
    const validIds = conversationIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length < 2) {
      return NextResponse.json({ 
        success: false, 
        error: 'At least 2 valid conversation IDs are required' 
      }, { status: 400 });
    }

    // Remove duplicates
    const uniqueIds = [...new Set(validIds)];
    if (uniqueIds.length < 2) {
      return NextResponse.json({ 
        success: false, 
        error: 'Cannot merge - duplicate conversation IDs' 
      }, { status: 400 });
    }

    const tenantContext = await getTenantContext(request);
    const tenantDB = await getTenantDB(tenantContext.tenantId);
    
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    // Get all conversations
    const conversations = await Conversation.find({
      _id: { $in: uniqueIds }
    }).populate('contact').lean();

    if (conversations.length < 2) {
      return NextResponse.json({
        success: false,
        error: 'At least 2 conversations must be found'
      }, { status: 404 });
    }

    // Validate mode consistency — all conversations must have the same mode
    const modes = conversations.map(c => c.mode || 'auto');
    const uniqueModes = [...new Set(modes)];
    if (uniqueModes.length > 1) {
      return NextResponse.json({
        success: false,
        error: `Cannot merge - mode mismatch: ${uniqueModes.join(', ')}. All conversations must have the same mode.`
      }, { status: 400 });
    }

    // ✅ CRITICAL: Validate department consistency — all conversations must be in the same department
    const departments = conversations.map(c => c.department?.toString()).filter(Boolean);
    const uniqueDepartments = [...new Set(departments)];
    if (uniqueDepartments.length > 1) {
      return NextResponse.json({
        success: false,
        error: 'Cannot merge conversations from different departments. All conversations must be in the same department.'
      }, { status: 400 });
    }

    // Get all contacts
    const contactIds = [...new Set(conversations.map(c => c.contact?._id?.toString() || c.contact?.toString()).filter(Boolean))];
    const contacts = await Contact.find({ _id: { $in: contactIds } });

    if (contacts.length === 0) {
      return NextResponse.json({ success: false, error: 'Contacts not found' }, { status: 404 });
    }

    // Verify all contacts can be merged (same phone or email)
    let primaryContact = contacts[0];
    for (let i = 1; i < contacts.length; i++) {
      const canMerge = checkCanMerge(primaryContact, contacts[i]);
      if (!canMerge.canMerge) {
        return NextResponse.json({ 
          success: false, 
          error: `Cannot merge conversations - ${canMerge.reason || 'contacts do not share the same phone number or email'}` 
        }, { status: 400 });
      }
      
      // Merge contacts if different
      if (primaryContact._id.toString() !== contacts[i]._id.toString()) {
        primaryContact = await mergeContacts(tenantContext.tenantId, primaryContact._id, contacts[i]._id);
      }
    }

    // Determine primary conversation (most recent message or oldest)
    let primaryConv = conversations[0];
    for (const conv of conversations) {
      if (!primaryConv.lastMessageAt || (conv.lastMessageAt && new Date(conv.lastMessageAt) > new Date(primaryConv.lastMessageAt))) {
        primaryConv = conv;
      }
    }

    const primaryConvId = primaryConv._id;
    const secondaryConvIds = uniqueIds.filter(id => id !== primaryConvId.toString());

    // Check if any conversation is already merged
    const existingPrimary = await Conversation.findById(primaryConvId);
    if (existingPrimary?.primaryConversation) {
      return NextResponse.json({ 
        success: false, 
        error: 'One or more conversations are already merged. Please unmerge first.' 
      }, { status: 400 });
    }

    // Check secondary conversations
    const secondaryConvs = await Conversation.find({ _id: { $in: secondaryConvIds } });
    for (const secConv of secondaryConvs) {
      if (secConv.primaryConversation || secConv.isMerged) {
        return NextResponse.json({ 
          success: false, 
          error: 'One or more conversations are already merged. Please unmerge first.' 
        }, { status: 400 });
      }
    }

    // Get the most recent messages for primary conversation determination
    const msg1 = await Message.findOne({ conversation: primaryConv._id }).sort({ createdAt: -1 });
    const secondaryConvsWithMessages = await Promise.all(
      secondaryConvIds.map(async (id) => {
        const msg = await Message.findOne({ conversation: id }).sort({ createdAt: -1 });
        return { id, msg };
      })
    );

    // Find if any secondary conversation has a more recent message
    let mostRecentSecondary = null;
    if (msg1) {
      for (const { id, msg } of secondaryConvsWithMessages) {
        if (msg && msg.createdAt > msg1.createdAt) {
          if (!mostRecentSecondary || msg.createdAt > mostRecentSecondary.msg.createdAt) {
            mostRecentSecondary = { id, msg };
          }
        }
      }
    }

    // Build merged conversations array
    const mergedConversations = [
      ...(primaryConv.mergedConversations || []),
      ...secondaryConvs.map(secConv => ({
        conversationId: secConv._id,
        channel: secConv.channel,
        channelAccount: secConv.channelAccount
      }))
    ];

    // Determine last message data (use most recent from all conversations)
    let lastMessageData = {};
    if (mostRecentSecondary) {
      const secondaryConv = conversations.find(c => c._id.toString() === mostRecentSecondary.id);
      if (secondaryConv) {
        lastMessageData = {
          lastMessage: secondaryConv.lastMessage,
          lastMessageContent: secondaryConv.lastMessageContent,
          lastMessageType: secondaryConv.lastMessageType,
          lastMessageDirection: secondaryConv.lastMessageDirection,
          lastMessageAt: secondaryConv.lastMessageAt
        };
      }
    } else if (msg1) {
      // Use primary conversation's last message
      const primaryConvFull = await Conversation.findById(primaryConv._id);
      if (primaryConvFull) {
        lastMessageData = {
          lastMessage: primaryConvFull.lastMessage,
          lastMessageContent: primaryConvFull.lastMessageContent,
          lastMessageType: primaryConvFull.lastMessageType,
          lastMessageDirection: primaryConvFull.lastMessageDirection,
          lastMessageAt: primaryConvFull.lastMessageAt
        };
      }
    }

    // Update primary conversation
    await Conversation.findByIdAndUpdate(primaryConv._id, {
      isMerged: true,
      mergedConversations,
      ...lastMessageData,
      mergeHistory: [
        ...(primaryConv.mergeHistory || []),
        {
      action: 'merge',
          conversations: [primaryConv._id, ...secondaryConvIds],
      performedBy: auth.user.userId,
          performedAt: new Date(),
          reason: reason || 'Manual merge'
        }
      ]
    });

    // Update all secondary conversations to point to primary
    for (const secConv of secondaryConvs) {
      await Conversation.findByIdAndUpdate(secConv._id, {
        isMerged: true, // Part of a merge — primaryConversation reference tracks direction
        primaryConversation: primaryConv._id,
        status: 'active',
        mergeHistory: [
          ...(secConv.mergeHistory || []),
          {
            action: 'merge',
            conversations: [primaryConv._id, secConv._id],
            performedBy: auth.user.userId,
            performedAt: new Date(),
            reason: reason || 'Manual merge'
          }
        ]
      });
    }

    // Fetch updated primary conversation for socket event data
    const updatedPrimary = await Conversation.findById(primaryConv._id)
      .populate('contact', 'name displayName email phone avatar')
      .populate('channelAccount', 'name identifier type')
      .lean();

    // Emit socket events
    const mergeEventData = {
      primaryConversationId: primaryConv._id.toString(),
      mergedConversationIds: secondaryConvIds,
      mergedBy: auth.user.userId,
      timestamp: new Date().toISOString(),
      updatedPrimaryConversation: updatedPrimary
    };
    
    await SocketEmitter.emit(`conversation:${primaryConv._id}`, 'conversation:merged', mergeEventData);
    for (const secId of secondaryConvIds) {
      await SocketEmitter.emit(`conversation:${secId}`, 'conversation:merged', mergeEventData);
    }
    
    // Also emit to tenant room for list updates
    if (tenantContext?.tenantId) {
      await SocketEmitter.emit(`tenant:${tenantContext.tenantId}`, 'conversation:merged', mergeEventData);
    }

    return NextResponse.json({
      success: true,
      data: {
        primaryConversationId: primaryConv._id,
        mergedConversationIds: secondaryConvIds,
        message: 'Conversations merged successfully'
      }
    }); 

  } catch (error) {
    console.error('Merge conversation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to merge conversations' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/conversations/[conversationId]/unmerge
 * Unmerge a conversation from its primary conversation
 */
export async function DELETE(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId } = await params;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return NextResponse.json({ success: false, error: 'Invalid conversation ID' }, { status: 400 });
    }

    const tenantContext = await getTenantContext(request);
    const tenantDB = await getTenantDB(tenantContext.tenantId);

    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 });
    }

    // Check if this is a secondary conversation (merged into another)
    if (conversation.primaryConversation) {
      const primaryConv = await Conversation.findById(conversation.primaryConversation);
      
      if (primaryConv) {
        // Remove from primary's merged conversations
        const updatedMerged = (primaryConv.mergedConversations || []).filter(
          merged => merged.conversationId.toString() !== conversationId
        );

        await Conversation.findByIdAndUpdate(primaryConv._id, {
          mergedConversations: updatedMerged,
          isMerged: updatedMerged.length > 0,
          status: updatedMerged.length === 0 ? 'active' : primaryConv.status, // ✅ If no more merged conversations, set to 'active'
          mergeHistory: [
            ...(primaryConv.mergeHistory || []),
            {
              action: 'unmerge',
              conversations: [conversationId],
              performedBy: auth.user.userId,
              performedAt: new Date(),
              reason: 'Manual unmerge'
            }
          ]
        });

        // Update this conversation - Set to 'active' when unmerged
        await Conversation.findByIdAndUpdate(conversationId, {
          primaryConversation: null,
          status: 'active', // ✅ Set to 'active' when unmerged
          isMerged: false, // ✅ Clear isMerged flag
          autoMergeDisabled: true, // Prevent auto-merge after manual unmerge
          mergeHistory: [
            ...(conversation.mergeHistory || []),
            {
              action: 'unmerge',
              conversations: [primaryConv._id],
              performedBy: auth.user.userId,
              performedAt: new Date(),
              reason: 'Manual unmerge'
            }
          ]
        });

        // Reassign messages that belong to the unmerged conversation's channel back from primary
        const unmergedConv = await Conversation.findById(conversationId).lean();
        if (unmergedConv?.channel) {
          const mergeHistoryEntries = primaryConv.mergeHistory?.filter(h => h.action === 'merge') || [];
          const mostRecentMerge = mergeHistoryEntries.length > 0
            ? mergeHistoryEntries.sort((a, b) => new Date(b.performedAt || 0) - new Date(a.performedAt || 0))[0]
            : null;
          const mergeDate = mostRecentMerge?.performedAt || primaryConv.updatedAt || new Date(0);

          const messageFilter = {
            conversation: primaryConv._id,
            channel: unmergedConv.channel,
            createdAt: { $gte: mergeDate }
          };
          if (unmergedConv.channelAccount) {
            messageFilter.channelAccount = unmergedConv.channelAccount;
          }

          // ✅ CRITICAL: Also update departmentId to match the target conversation's department
          const updateFields = { conversation: conversationId };
          if (unmergedConv.department) {
            updateFields.departmentId = unmergedConv.department;
          }
          const reassignResult = await Message.updateMany(
            messageFilter,
            { $set: updateFields }
          );
          if (reassignResult.modifiedCount > 0) {
            console.log(`✅ Reassigned ${reassignResult.modifiedCount} messages back to conversation ${conversationId} (dept: ${unmergedConv.department})`);
          }
        }

        // Recalculate lastMessage for both conversations
        await recalculateLastMessage(Conversation, Message, primaryConv._id);
        await recalculateLastMessage(Conversation, Message, conversationId);

        // Fetch updated conversations for socket event
        const [updatedPrimaryConv, updatedUnmergedConv] = await Promise.all([
          Conversation.findById(primaryConv._id)
            .populate('contact', 'name displayName email phone avatar')
            .lean(),
          Conversation.findById(conversationId)
            .populate('contact', 'name displayName email phone avatar')
            .lean()
        ]);

        // Emit socket events
        const unmergeEventData = {
          primaryConversationId: primaryConv._id.toString(),
          unmergedConversationId: conversationId,
          unmergedConversationIds: [conversationId.toString()],
          unmergedBy: auth.user.userId,
          timestamp: new Date().toISOString(),
          updatedConversations: [updatedPrimaryConv, updatedUnmergedConv].filter(Boolean)
        };

        await SocketEmitter.emit(`conversation:${primaryConv._id}`, 'conversation:unmerged', unmergeEventData);
        await SocketEmitter.emit(`conversation:${conversationId}`, 'conversation:unmerged', unmergeEventData);

        // Also emit to tenant room for list updates
        if (tenantContext?.tenantId) {
          await SocketEmitter.emit(`tenant:${tenantContext.tenantId}`, 'conversation:unmerged', unmergeEventData);
        }

        return NextResponse.json({
          success: true,
          data: {
            conversationId,
            primaryConversationId: primaryConv._id,
            message: 'Conversation unmerged successfully'
          }
        });
      }
    }

    // Check if this is a primary conversation (has merged conversations)
    if (conversation.isMerged && conversation.mergedConversations?.length > 0) {
      const body = await request.json();
      const { unmergeConversationId } = body;

      if (!unmergeConversationId) {
        return NextResponse.json({ 
          success: false, 
          error: 'unmergeConversationId is required when unmerging from primary conversation' 
        }, { status: 400 });
      }

      const targetConv = await Conversation.findById(unmergeConversationId);
      if (!targetConv) {
        return NextResponse.json({ success: false, error: 'Target conversation not found' }, { status: 404 });
      }

      // Remove from merged list
      const updatedMerged = (conversation.mergedConversations || []).filter(
        merged => merged.conversationId.toString() !== unmergeConversationId
      );

      // Update primary conversation
      await Conversation.findByIdAndUpdate(conversationId, {
        mergedConversations: updatedMerged,
        isMerged: updatedMerged.length > 0,
        status: updatedMerged.length === 0 ? 'active' : conversation.status, // ✅ If no more merged conversations, set to 'active'
        mergeHistory: [
          ...(conversation.mergeHistory || []),
          {
            action: 'unmerge',
            conversations: [unmergeConversationId],
            performedBy: auth.user.userId,
            performedAt: new Date(),
            reason: 'Manual unmerge'
          }
        ]
      });

      // Update target conversation - Set to 'active' when unmerged
      await Conversation.findByIdAndUpdate(unmergeConversationId, {
        primaryConversation: null,
        status: 'active', // ✅ Set to 'active' when unmerged
        isMerged: false, // ✅ Clear isMerged flag
        autoMergeDisabled: true,
        mergeHistory: [
          ...(targetConv.mergeHistory || []),
          {
            action: 'unmerge',
            conversations: [conversationId],
            performedBy: auth.user.userId,
            performedAt: new Date(),
            reason: 'Manual unmerge'
          }
        ]
      });

      // Reassign messages that belong to the target conversation's channel back from primary
      if (targetConv.channel) {
        const mergeHistoryEntries = conversation.mergeHistory?.filter(h => h.action === 'merge') || [];
        const mostRecentMerge = mergeHistoryEntries.length > 0
          ? mergeHistoryEntries.sort((a, b) => new Date(b.performedAt || 0) - new Date(a.performedAt || 0))[0]
          : null;
        const mergeDate = mostRecentMerge?.performedAt || conversation.updatedAt || new Date(0);

        const messageFilter = {
          conversation: conversationId,
          channel: targetConv.channel,
          createdAt: { $gte: mergeDate }
        };
        if (targetConv.channelAccount) {
          messageFilter.channelAccount = targetConv.channelAccount;
        }

        // ✅ CRITICAL: Also update departmentId to match the target conversation's department
        const updateFields = { conversation: unmergeConversationId };
        if (targetConv.department) {
          updateFields.departmentId = targetConv.department;
        }
        const reassignResult = await Message.updateMany(
          messageFilter,
          { $set: updateFields }
        );
        if (reassignResult.modifiedCount > 0) {
          console.log(`✅ Reassigned ${reassignResult.modifiedCount} messages back to conversation ${unmergeConversationId} (dept: ${targetConv.department})`);
        }
      }

      // Recalculate lastMessage for both conversations
      await recalculateLastMessage(Conversation, Message, conversationId);
      await recalculateLastMessage(Conversation, Message, unmergeConversationId);

      // Fetch updated conversations for socket event
      const [updatedPrimaryConv2, updatedTargetConv] = await Promise.all([
        Conversation.findById(conversationId)
          .populate('contact', 'name displayName email phone avatar')
          .lean(),
        Conversation.findById(unmergeConversationId)
          .populate('contact', 'name displayName email phone avatar')
          .lean()
      ]);

      // Emit socket events
      const unmergeEventData = {
        primaryConversationId: conversationId,
        unmergedConversationId,
        unmergedConversationIds: [unmergeConversationId.toString()],
        unmergedBy: auth.user.userId,
        timestamp: new Date().toISOString(),
        updatedConversations: [updatedPrimaryConv2, updatedTargetConv].filter(Boolean)
      };

      await SocketEmitter.emit(`conversation:${conversationId}`, 'conversation:unmerged', unmergeEventData);
      await SocketEmitter.emit(`conversation:${unmergeConversationId}`, 'conversation:unmerged', unmergeEventData);

      // Also emit to tenant room for list updates
      if (tenantContext?.tenantId) {
        await SocketEmitter.emit(`tenant:${tenantContext.tenantId}`, 'conversation:unmerged', unmergeEventData);
      }

      return NextResponse.json({
        success: true,
        data: {
          conversationId,
          unmergedConversationId,
          message: 'Conversation unmerged successfully'
        }
      });
    }

    return NextResponse.json({ 
      success: false, 
      error: 'Conversation is not merged' 
    }, { status: 400 });

  } catch (error) {
    console.error('Unmerge conversation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to unmerge conversation' },
      { status: 500 }
    );
  }
}

/**
 * Check if two contacts can be merged
 */
function checkCanMerge(contact1, contact2) {
  // Same contact
  if (contact1._id.toString() === contact2._id.toString()) {
    return { canMerge: true };
  }

  // Same phone number
  const phone1 = contact1.phone || contact1.identifiers?.whatsapp || contact1.identifiers?.sms;
  const phone2 = contact2.phone || contact2.identifiers?.whatsapp || contact2.identifiers?.sms;
  
  if (phone1 && phone2 && normalizePhone(phone1) === normalizePhone(phone2)) {
    return { canMerge: true };
  }

  // Same email
  const email1 = contact1.email || contact1.identifiers?.email;
  const email2 = contact2.email || contact2.identifiers?.email;

  if (email1 && email2 && email1.toLowerCase() === email2.toLowerCase()) {
    return { canMerge: true };
  }

  // Same Facebook ID
  const fb1 = contact1.identifiers?.facebook;
  const fb2 = contact2.identifiers?.facebook;
  if (fb1 && fb2 && fb1 === fb2) {
    return { canMerge: true };
  }

  // Same Instagram ID
  const ig1 = contact1.identifiers?.instagram;
  const ig2 = contact2.identifiers?.instagram;
  if (ig1 && ig2 && ig1 === ig2) {
    return { canMerge: true };
  }

  return { 
    canMerge: false, 
    reason: 'Contacts do not share the same phone number, email, or social media ID' 
  };
}

/**
 * Recalculate lastMessage fields for a conversation after unmerge
 */
async function recalculateLastMessage(Conversation, Message, convId) {
  try {
    const conv = await Conversation.findById(convId).lean();
    if (!conv) return false;

    // ✅ CRITICAL FIX: Only filter by conversation ID, NOT by channel
    // After unmerge, messages may have been reassigned and the conversation ID is the source of truth
    const lastMessage = await Message.findOne({
      conversation: convId
    }).sort({ createdAt: -1 }).limit(1).lean();

    if (lastMessage) {
      let messageContent = '';
      let messageType = lastMessage.type || 'text';

      if (typeof lastMessage.content === 'string') {
        messageContent = lastMessage.content;
      } else if (lastMessage.content?.text) {
        messageContent = lastMessage.content.text;
      } else if (lastMessage.content?.type) {
        messageType = lastMessage.content.type;
      }

      let previewContent = '';
      if (['image', 'photo'].includes(messageType)) {
        previewContent = 'Photo';
      } else if (messageType === 'video') {
        previewContent = 'Video';
      } else if (['audio', 'voice'].includes(messageType)) {
        previewContent = 'Voice message';
      } else if (['document', 'file'].includes(messageType)) {
        previewContent = 'Document';
      } else if (messageType === 'location') {
        previewContent = 'Location';
      } else if (messageType === 'contact') {
        previewContent = 'Contact';
      } else {
        previewContent = messageContent.length > 100
          ? messageContent.substring(0, 100) + '...'
          : messageContent || '';
      }

      const messageCount = await Message.countDocuments({
        conversation: convId
      }).maxTimeMS(3000);

      await Conversation.findByIdAndUpdate(convId, {
        lastMessage: lastMessage._id,
        lastMessageContent: previewContent,
        lastMessageType: messageType,
        lastMessageDirection: lastMessage.direction || 'inbound',
        lastMessageAt: lastMessage.createdAt,
        messageCount
      });
      return true;
    } else {
      await Conversation.findByIdAndUpdate(convId, {
        $unset: {
          lastMessage: '',
          lastMessageContent: '',
          lastMessageType: '',
          lastMessageDirection: '',
          lastMessageAt: ''
        },
        $set: { messageCount: 0 }
      });
      return true;
    }
  } catch (error) {
    console.error(`Error recalculating last message for ${convId}:`, error);
    return false;
  }
}

/**
 * Normalize phone number
 */
function normalizePhone(phone) {
  if (!phone) return null;
  let normalized = String(phone).trim();
  normalized = normalized.replace(/\D/g, '');
  if (normalized.startsWith('00')) {
    normalized = normalized.substring(2);
  }
  return normalized;
}
