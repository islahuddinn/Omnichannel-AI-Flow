// src/app/api/messages/[conversationId]/[messageId]/react/route.js
import { NextResponse } from 'next/server';
import { connectToTenantDB } from '@/lib/db/connection';
import MessageSchema from '@/models/schemas/Message';
import ConversationSchema from '@/models/schemas/Conversation';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import ContactSchema from '@/models/schemas/Contact';
import UserSchema from '@/models/schemas/User';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { ChannelServiceFactory } from '@/services/channel/ChannelServiceFactory.js';

/**
 * POST /api/messages/[conversationId]/[messageId]/react
 * Send a reaction to a WhatsApp message via Meta API
 * ✅ STORES REACTIONS IN MESSAGE.REACTIONS ARRAY (NOT AS SEPARATE MESSAGES)
 */
export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const { conversationId, messageId } = resolvedParams;
    const { emoji } = await request.json();

    // Get tenant context
    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
    }
    const tenantId = context.tenantId;
    const db = await connectToTenantDB(tenantId);

    // Get models
    const Message = db.models.Message || db.model('Message', MessageSchema);
    const Conversation = db.models.Conversation || db.model('Conversation', ConversationSchema);
    const CompanyAccount = db.models.CompanyAccount || db.model('CompanyAccount', CompanyAccountSchema);
    const Contact = db.models.Contact || db.model('Contact', ContactSchema);
    const User = db.models.User || db.model('User', UserSchema);

    // Get the message being reacted to
    // ✅ CRITICAL: Populate channelAccount to get the correct account for merged conversations
    const targetMessage = await Message.findById(messageId)
      .populate('channelAccount')
      .populate('contact');
    
    if (!targetMessage) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    // Get conversation (for contact fallback and validation)
    const conversation = await Conversation.findById(conversationId)
      .populate('contact', 'name displayName identifiers')
      .populate('channelAccount');

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // ✅ CRITICAL: For merged conversations, use the MESSAGE's channel and channelAccount
    // The conversation's channel might be the primary merged channel (e.g., 'email'),
    // but the message itself has its own channel (e.g., 'whatsapp')
    const messageChannel = targetMessage.channel;
    const messageChannelAccountId = targetMessage.channelAccount?._id || targetMessage.channelAccount;

    console.log('🔍 Reaction API - Channel determination:', {
      conversationId,
      messageId,
      conversationChannel: conversation.channel,
      messageChannel,
      conversationIsMerged: conversation.isMerged,
      messageChannelAccountId: messageChannelAccountId?.toString(),
      conversationChannelAccountId: conversation.channelAccount?._id?.toString() || conversation.channelAccount?.toString()
    });

    // ✅ Support both WhatsApp (via Meta API) and WebChat (via socket/database)
    // ✅ CRITICAL: Check message's channel, not conversation's channel (for merged conversations)
    if (messageChannel === 'whatsapp') {
      // ✅ WhatsApp: Send reaction via Meta API
      // ✅ CRITICAL: Use message's channelAccount for merged conversations
      let channelAccount = messageChannelAccountId 
        ? await CompanyAccount.findById(messageChannelAccountId)
        : null;
      
      if (!channelAccount) {
        // Fallback to conversation's channelAccount if message doesn't have one
        const fallbackAccount = conversation.channelAccount?._id || conversation.channelAccount;
        if (fallbackAccount) {
          const fallbackChannelAccount = await CompanyAccount.findById(fallbackAccount);
          if (fallbackChannelAccount && fallbackChannelAccount.type === 'whatsapp') {
            // Use fallback account
            channelAccount = fallbackChannelAccount;
          }
        }
      }
      
      if (!channelAccount) {
        return NextResponse.json(
          { success: false, error: 'WhatsApp channel account not found for this message' },
          { status: 404 }
        );
      }

      // ✅ Get contact's WhatsApp number (prefer message's contact, fallback to conversation's contact)
      const contact = targetMessage.contact || conversation.contact;
      if (!contact) {
        return NextResponse.json(
          { success: false, error: 'Contact not found' },
          { status: 404 }
        );
      }

      // Handle populated and unpopulated contact
      let contactData = null;
      if (contact && contact._id) {
        // Contact is already populated
        contactData = contact;
      } else if (contact) {
        // Contact is just an ID, fetch it
        const contactId = contact._id || contact;
        contactData = await Contact.findById(contactId).lean();
      }
      
      if (!contactData) {
        return NextResponse.json(
          { success: false, error: 'Contact data not found' },
          { status: 404 }
        );
      }

      const contactPhone = contactData.phone || contactData.identifiers?.whatsapp;
      if (!contactPhone) {
        return NextResponse.json(
          { success: false, error: 'Contact phone number not found' },
          { status: 400 }
        );
      }

      // Get WhatsApp message ID (provider ID)
      const whatsappMessageId = targetMessage.providerMessageId || targetMessage.whatsappMessageId || targetMessage.externalId;
      if (!whatsappMessageId) {
        return NextResponse.json(
          { success: false, error: 'WhatsApp message ID not found. This message may not be a WhatsApp message.' },
          { status: 400 }
        );
      }

      // ✅ Create a reaction message record in database for status tracking
      // This allows status updates from WhatsApp to find the message
      let reactionMessageId = null;
      try {
        const reactionMessage = await Message.create({
          conversation: conversationId,
          contact: contactData._id,
          channel: 'whatsapp',
          channelAccount: channelAccount._id,
          type: 'reaction',
          content: emoji ? `Reacted: ${emoji}` : 'Reaction removed',
          direction: 'outbound',
          status: 'pending',
          replyTo: messageId, // Link to the message being reacted to
          metadata: {
            reactionTo: messageId,
            emoji: emoji || null,
            whatsappMessageId: whatsappMessageId, // The message being reacted to
            isReactionMessage: true
          },
          createdAt: new Date(),
        });
        reactionMessageId = reactionMessage._id;
        console.log('✅ Created reaction message record:', reactionMessageId);
      } catch (createError) {
        console.error('❌ Failed to create reaction message record:', createError);
        // Continue even if message creation fails
      }

      try {
        // ✅ Use ChannelServiceFactory to send reaction (proper logging, error handling)
        // ✅ Meta API: Empty string removes reaction, emoji string adds reaction
        const reactionData = {
          to: contactPhone,
          messageId: whatsappMessageId,
          emoji: emoji || '', // Empty string means remove reaction (Meta API requirement)
          metadata: {
            conversationId: conversationId,
            originalMessageId: messageId,
            reactionMessageId: reactionMessageId, // Link to reaction message record
            userId: auth.user.userId
          }
        };

        const response = await ChannelServiceFactory.sendReactionMessage(
          'whatsapp',
          channelAccount,
          reactionData,
          {
            tenantId: tenantId,
            conversationId: conversationId,
            messageId: reactionMessageId // Pass reaction message ID for status updates
          }
        );
        
        // ✅ Update reaction message with provider response
        if (reactionMessageId && response.whatsappMessageId) {
          await Message.findByIdAndUpdate(reactionMessageId, {
            status: 'sent',
            sentAt: new Date(),
            providerMessageId: response.whatsappMessageId,
            whatsappMessageId: response.whatsappMessageId,
            'metadata.providerResponse': response
          });
        }
        
        console.log('✅ WhatsApp reaction sent successfully via ChannelServiceFactory:', response);
      } catch (error) {
        console.error('❌ Failed to send WhatsApp reaction:', error);
        // Update reaction message status to failed
        if (reactionMessageId) {
          await Message.findByIdAndUpdate(reactionMessageId, {
            status: 'failed',
            failedAt: new Date(),
            errorMessage: error.message
          });
        }
        // Continue to update database even if API call fails
      }
    }

    // ✅ 2. Update the original message's reactions array (for both WhatsApp and WebChat)
    // ✅ CRITICAL: Check if user already has this emoji reaction - if yes, toggle it off
    const message = await Message.findById(messageId);
    if (!message.reactions) {
      message.reactions = [];
    }
    
    const existingReactionIndex = message.reactions.findIndex(
      r => r.user?.toString() === auth.user.userId && r.emoji === emoji
    );
    
    let finalEmoji = emoji;
    if (emoji) {
      if (existingReactionIndex >= 0) {
        // User already has this emoji - toggle it off (remove)
        message.reactions.splice(existingReactionIndex, 1);
        finalEmoji = null; // Indicate removal
        console.log('✅ Reaction toggled off (removed)');
      } else {
        // Remove any existing reaction from this user first (only one reaction per user)
        message.reactions = message.reactions.filter(
          r => r.user?.toString() !== auth.user.userId
        );
        
        // Add new reaction
        message.reactions.push({
          emoji: emoji,
          user: auth.user.userId,
          createdAt: new Date()
        });
        console.log('✅ Reaction added to message.reactions array');
      }
      await message.save();
    } else {
      // Remove reaction
      await Message.findByIdAndUpdate(messageId, {
        $pull: { reactions: { user: auth.user.userId } }
      });
      finalEmoji = null;
      console.log('✅ Reaction removed from message.reactions array');
    }

    // ✅ 3. Get user info for socket event
    const user = await User.findById(auth.user.userId).select('firstName lastName');
    const userName = user ? `${user.firstName} ${user.lastName}`.trim() : 'You';
    
    // 4. Get department for socket emission
    const conv = await Conversation.findById(conversationId).select('department').lean();
    const deptId = conv?.department?.toString() || null;

    // 5. Emit real-time reaction event to all rooms
    const SocketEmitter = (await import('@/services/socket/SocketEmitter')).default;
    await SocketEmitter.emitMessageReaction(
      conversationId,
      messageId,
      finalEmoji,
      auth.user.userId,
      tenantId,
      userName,
      null,
      deptId
    );

    // emitMessageReaction already handles both main namespace and webchat namespace emission
    console.log('✅ Reaction event emitted');

    return NextResponse.json({
      success: true,
      data: {
        messageId: messageId,
        emoji: emoji,
        userId: auth.user.userId,
        userName: userName
      }
    });

  } catch (error) {
    console.error('❌ React to message error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to react to message' },
      { status: 500 }
    );
  }
}
