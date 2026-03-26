// src/app/api/conversations/merge/route.js
import { NextResponse } from 'next/server';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import ConversationSchema from '@/models/schemas/Conversation';
import ContactSchema from '@/models/schemas/Contact';
import MessageSchema from '@/models/schemas/Message';
import { verifyAuth } from '@/middleware/auth';
import SocketEmitter from '@/services/socket/SocketEmitter';
import { mergeContacts, canMergeContacts } from '@/services/conversation/MergeService';
import mongoose from 'mongoose';

/**
 * Check if two contacts can be merged
 * Returns: { canMerge: boolean, reason?: string, updateContact?: 'contact1' | 'contact2' }
 */
function checkCanMerge(contact1, contact2) {
  if (!contact1 || !contact2) return { canMerge: false, reason: 'Contact not found' };

  // Same contact
  if (contact1._id.toString() === contact2._id.toString()) {
    return { canMerge: true };
  }

  // Extract phone numbers
  const phone1 = contact1.phone || contact1.identifiers?.whatsapp || contact1.identifiers?.sms || null;
  const phone2 = contact2.phone || contact2.identifiers?.whatsapp || contact2.identifiers?.sms || null;
  
  // Check phones first
  if (phone1 && phone2) {
    // Both have phones - they must match
    if (normalizePhone(phone1) === normalizePhone(phone2)) {
      return { canMerge: true };
    } else {
      // Both have phones but they don't match
      return { 
        canMerge: false, 
        reason: 'Contacts have different phone numbers and cannot be merged' 
      };
    }
  } else if (phone1 && !phone2) {
    // contact1 has phone, contact2 doesn't - can merge and update contact2
    return { canMerge: true, updateContact: 'contact2', updateField: 'phone', updateValue: phone1 };
  } else if (!phone1 && phone2) {
    // contact2 has phone, contact1 doesn't - can merge and update contact1
    return { canMerge: true, updateContact: 'contact1', updateField: 'phone', updateValue: phone2 };
  }
  // Neither has phone - check email

  // Extract emails
  const email1 = contact1.email || contact1.identifiers?.email || null;
  const email2 = contact2.email || contact2.identifiers?.email || null;

  if (email1 && email2) {
    // Both have emails - they must match
    if (email1.toLowerCase() === email2.toLowerCase()) {
      return { canMerge: true };
    } else {
      // Both have emails but they don't match
      return { 
        canMerge: false, 
        reason: 'Contacts have different email addresses and cannot be merged' 
      };
    }
  } else if (email1 && !email2) {
    // contact1 has email, contact2 doesn't - can merge and update contact2
    return { canMerge: true, updateContact: 'contact2', updateField: 'email', updateValue: email1 };
  } else if (!email1 && email2) {
    // contact2 has email, contact1 doesn't - can merge and update contact1
    return { canMerge: true, updateContact: 'contact1', updateField: 'email', updateValue: email2 };
  }

  // Check social media IDs as fallback
  const fb1 = contact1.identifiers?.facebook;
  const fb2 = contact2.identifiers?.facebook;
  if (fb1 && fb2 && fb1 === fb2) {
    return { canMerge: true };
  }

  const ig1 = contact1.identifiers?.instagram;
  const ig2 = contact2.identifiers?.instagram;
  if (ig1 && ig2 && ig1 === ig2) {
    return { canMerge: true };
  }

  // Neither has phone or email, and social IDs don't match
  return { 
    canMerge: false, 
    reason: 'Contacts do not share the same phone number, email, or social media ID' 
  };
}

/**
 * Normalize phone number
 */
function normalizePhone(phone) {
  if (!phone) return null;
  return phone.replace(/[\s+-]/g, '').replace(/^\+/, '');
}

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

    if (conversationIds.length > 10) {
      return NextResponse.json({
        success: false,
        error: 'Cannot merge more than 10 conversations at once'
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

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);

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

    // ✅ Check department access for agents before exposing conversation data
    if (auth.user.role === 'agent') {
      const userDepartments = (auth.user.departments || []).map(d => d.toString());
      const hasAccess = conversations.every(c =>
        userDepartments.includes(c.department?.toString())
      );
      if (!hasAccess) {
        return NextResponse.json({
          success: false,
          error: 'You do not have access to all selected conversations'
        }, { status: 403 });
      }
    }

    // ✅ CRITICAL: Validate that all conversations have the same mode
    const conversationModes = conversations.map(c => c.mode || 'auto');
    const uniqueModes = [...new Set(conversationModes)];

    if (uniqueModes.length > 1) {
      return NextResponse.json({
        success: false,
        error: `Cannot merge conversations - mode mismatch. Conversations have different modes: ${uniqueModes.join(', ')}. All conversations must have the same mode (auto or manual) to be merged.`
      }, { status: 400 });
    }

    // ✅ CRITICAL: Validate department consistency — all conversations must be in the same department
    const conversationDepartments = conversations.map(c => c.department?.toString()).filter(Boolean);
    const uniqueDepartments = [...new Set(conversationDepartments)];
    if (uniqueDepartments.length > 1) {
      return NextResponse.json({
        success: false,
        error: 'Cannot merge conversations from different departments. All conversations must be in the same department.'
      }, { status: 400 });
    }
    
    const conversationMode = uniqueModes[0] || 'auto';
    console.log(`[Manual Merge] All conversations have same mode: ${conversationMode}`);

    // Get all contacts
    const contactIds = [...new Set(conversations.map(c => 
      c.contact?._id?.toString() || c.contact?.toString()
    ).filter(Boolean))];
    const contacts = await Contact.find({ _id: { $in: contactIds } });

    if (contacts.length === 0) {
      return NextResponse.json({ success: false, error: 'Contacts not found' }, { status: 404 });
    }

    // Verify all contacts can be merged and update missing fields
    // First, check all contacts that have phones - they must all match
    const contactsWithPhones = contacts
      .map(c => ({
        contact: c,
        phone: c.phone || c.identifiers?.whatsapp || c.identifiers?.sms || null
      }))
      .filter(c => c.phone)
      .map(c => ({ contact: c.contact, phone: normalizePhone(c.phone) }));
    
    if (contactsWithPhones.length > 1) {
      // All contacts with phones must have the same phone number
      const firstPhone = contactsWithPhones[0].phone;
      for (let i = 1; i < contactsWithPhones.length; i++) {
        if (contactsWithPhones[i].phone !== firstPhone) {
          return NextResponse.json({ 
            success: false, 
            error: 'Cannot merge conversations - contacts have different phone numbers' 
          }, { status: 400 });
        }
      }
    }
    
    // Same check for emails
    const contactsWithEmails = contacts
      .map(c => ({
        contact: c,
        email: (c.email || c.identifiers?.email || null)?.toLowerCase()
      }))
      .filter(c => c.email);
    
    if (contactsWithEmails.length > 1) {
      // All contacts with emails must have the same email
      const firstEmail = contactsWithEmails[0].email;
      for (let i = 1; i < contactsWithEmails.length; i++) {
        if (contactsWithEmails[i].email !== firstEmail) {
          return NextResponse.json({ 
            success: false, 
            error: 'Cannot merge conversations - contacts have different email addresses' 
          }, { status: 400 });
        }
      }
    }
    
    // Now merge all contacts, updating missing phone/email fields
    let primaryContact = contacts[0];
    
    // Determine primary contact (one with phone or email, or oldest)
    if (contactsWithPhones.length > 0) {
      primaryContact = contactsWithPhones[0].contact;
    } else if (contactsWithEmails.length > 0) {
      primaryContact = contactsWithEmails[0].contact;
    } else {
      // Use oldest contact
      primaryContact = contacts.reduce((oldest, current) => {
        const oldestDate = oldest.createdAt || new Date(0);
        const currentDate = current.createdAt || new Date(0);
        return currentDate < oldestDate ? current : oldest;
      });
    }
    
    // Get reference phone and email from primary contact
    const referencePhone = primaryContact.phone || primaryContact.identifiers?.whatsapp || primaryContact.identifiers?.sms || null;
    const referenceEmail = (primaryContact.email || primaryContact.identifiers?.email || null)?.toLowerCase();
    
    // Update all other contacts with missing phone/email and merge them
    for (const contact of contacts) {
      if (contact._id.toString() === primaryContact._id.toString()) continue;
      
      const updateData = {};
      let needsUpdate = false;
      
      // Update phone if missing
      const contactPhone = contact.phone || contact.identifiers?.whatsapp || contact.identifiers?.sms || null;
      if (!contactPhone && referencePhone) {
        updateData.phone = referencePhone;
        if (!contact.identifiers) contact.identifiers = {};
        if (!contact.identifiers.whatsapp && !contact.identifiers.sms) {
          updateData['identifiers.whatsapp'] = referencePhone;
          updateData['identifiers.sms'] = referencePhone;
        }
        needsUpdate = true;
      }
      
      // Update email if missing
      const contactEmail = (contact.email || contact.identifiers?.email || null)?.toLowerCase();
      if (!contactEmail && referenceEmail) {
        updateData.email = referenceEmail;
        if (!contact.identifiers) contact.identifiers = {};
        updateData['identifiers.email'] = referenceEmail;
        needsUpdate = true;
      }
      
      // Update contact if needed
      if (needsUpdate) {
        await Contact.findByIdAndUpdate(contact._id, { $set: updateData });
        await Contact.findById(contact._id); // Refresh
      }
      
      // Merge contact into primary
      const contact1Date = primaryContact.createdAt || new Date(0);
      const contact2Date = contact.createdAt || new Date(0);
      
      if (contact2Date < contact1Date) {
        // contact is older, merge primaryContact into it
        primaryContact = await mergeContacts(context.tenantId, contact._id, primaryContact._id);
      } else {
        // primaryContact is older or same, merge contact into it
        primaryContact = await mergeContacts(context.tenantId, primaryContact._id, contact._id);
      }
    }

    // ✅ Determine primary conversation (the one with the most recent message)
    // Batch query: get latest message per conversation in a single aggregate
    const latestMessages = await Message.aggregate([
      { $match: { conversation: { $in: uniqueIds.map(id => new mongoose.Types.ObjectId(id)) } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$conversation', latestMsg: { $first: '$$ROOT' } } }
    ]);

    const latestMsgMap = {};
    latestMessages.forEach(entry => {
      latestMsgMap[entry._id.toString()] = entry.latestMsg;
    });

    let primaryConv = conversations[0];
    let primaryMsg = latestMsgMap[conversations[0]._id.toString()] || null;

    for (let i = 1; i < conversations.length; i++) {
      const msg = latestMsgMap[conversations[i]._id.toString()] || null;
      if (msg && primaryMsg) {
        if (new Date(msg.createdAt) > new Date(primaryMsg.createdAt)) {
          primaryConv = conversations[i];
          primaryMsg = msg;
        }
      } else if (msg && !primaryMsg) {
        primaryConv = conversations[i];
        primaryMsg = msg;
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

    // Get latest messages for all conversations to determine primary's last message
    const allMessages = await Message.find({
      conversation: { $in: uniqueIds }
    }).sort({ createdAt: -1 }).limit(1);

    const latestMessage = allMessages[0];

    // Update primary conversation
    const mergedConversations = [
      ...(existingPrimary.mergedConversations || []),
      ...secondaryConvs.map(secConv => ({
        conversationId: secConv._id,
        channel: secConv.channel,
        channelAccount: secConv.channelAccount
      }))
    ];

    const updateData = {
      isMerged: true,
      mergedConversations,
      status: 'active', // ✅ Primary conversation should remain 'active'
      mergeHistory: [
        ...(existingPrimary.mergeHistory || []),
        {
          action: 'merge',
          conversations: uniqueIds,
          performedBy: auth.user.userId,
          performedAt: new Date(),
          reason: reason || 'Manual merge'
        }
      ],
      contact: primaryContact._id
    };

    // Use most recent message as last message
    if (latestMessage) {
      const latestConv = conversations.find(c => c._id.toString() === latestMessage.conversation.toString());
      if (latestConv) {
        updateData.lastMessage = latestConv.lastMessage;
        updateData.lastMessageContent = latestConv.lastMessageContent;
        updateData.lastMessageType = latestConv.lastMessageType;
        updateData.lastMessageDirection = latestConv.lastMessageDirection;
        updateData.lastMessageAt = latestConv.lastMessageAt;
      }
    }

    await Conversation.findByIdAndUpdate(primaryConvId, updateData);

    // ✅ Update all secondary conversations to point to primary using optimistic locking
    // Use findOneAndUpdate with isMerged: false condition to prevent concurrent merge race
    for (const secConvId of secondaryConvIds) {
      const updatedSec = await Conversation.findOneAndUpdate(
        { _id: secConvId, isMerged: { $ne: true }, primaryConversation: { $exists: false } },
        {
          $set: {
            primaryConversation: primaryConvId,
            status: 'active',
            isMerged: true,
            contact: primaryContact._id,
          },
          $push: {
            mergeHistory: {
              action: 'merge',
              conversations: uniqueIds,
              performedBy: auth.user.userId,
              performedAt: new Date(),
              reason: reason || 'Manual merge'
            }
          }
        },
        { new: true }
      );

      if (!updatedSec) {
        // Rollback: unset merge flags on already-updated secondary conversations
        await Conversation.updateMany(
          { _id: { $in: secondaryConvIds }, primaryConversation: primaryConvId },
          { $unset: { primaryConversation: '' }, $set: { isMerged: false } }
        );
        await Conversation.findByIdAndUpdate(primaryConvId, {
          isMerged: false,
          mergedConversations: existingPrimary.mergedConversations || [],
        });
        return NextResponse.json({
          success: false,
          error: 'Merge failed: one or more conversations were modified concurrently. Please try again.'
        }, { status: 409 });
      }
    }

    // ✅ CRITICAL: Fetch updated primary conversation to include in socket events (with merged data)
    // Re-fetch after update to ensure mergedConversations array is correctly populated
    const updatedPrimaryConv = await Conversation.findById(primaryConvId)
      .populate('contact', 'name displayName email phone avatar')
      .populate('channelAccount', 'name identifier type')
      .lean();
    
    // ✅ CRITICAL: Ensure mergedConversations array is properly structured with all conversation IDs
    // The mergedConversations array should contain objects with conversationId, channel, and channelAccount
    if (!updatedPrimaryConv.mergedConversations || updatedPrimaryConv.mergedConversations.length === 0) {
      // Reconstruct mergedConversations array if it's missing or incomplete
      updatedPrimaryConv.mergedConversations = [
        ...secondaryConvs.map(secConv => ({
          conversationId: secConv._id,
          channel: secConv.channel,
          channelAccount: secConv.channelAccount
        }))
      ];
    } else {
      // ✅ Ensure all conversation IDs are properly formatted as ObjectIds or strings
      updatedPrimaryConv.mergedConversations = updatedPrimaryConv.mergedConversations.map(merged => {
        // If conversationId is missing, try to find it from secondaryConvs
        if (!merged.conversationId) {
          const matchingConv = secondaryConvs.find(sc => sc.channel === merged.channel);
          if (matchingConv) {
            merged.conversationId = matchingConv._id;
          }
        }
        // ✅ Ensure conversationId is properly formatted (string for API response)
        if (merged.conversationId) {
          merged.conversationId = merged.conversationId.toString();
        }
        // ✅ Ensure channel is present
        if (!merged.channel) {
          const matchingConv = secondaryConvs.find(sc => sc._id.toString() === merged.conversationId?.toString());
          if (matchingConv) {
            merged.channel = matchingConv.channel;
          }
        }
        return merged;
      }).filter(m => m.conversationId && m.channel); // ✅ Filter out incomplete entries
    }
    
    // Emit socket events for all conversations and tenant
    const mergeEventData = {
      primaryConversationId: primaryConvId.toString(),
      mergedConversationIds: secondaryConvIds.map(id => id.toString()),
      mergedBy: auth.user.userId,
      timestamp: new Date().toISOString(),
      updatedPrimaryConversation: updatedPrimaryConv // ✅ Include updated primary conversation data with complete mergedConversations array
    };
    
    // Emit to all conversation rooms
    for (const convId of uniqueIds) {
      await SocketEmitter.emit(`conversation:${convId}`, 'conversation:merged', mergeEventData);
    }
    
    // Also emit to tenant room for list updates
    await SocketEmitter.emit(`tenant:${context.tenantId}`, 'conversation:merged', mergeEventData);

    return NextResponse.json({
      success: true,
      data: {
        primaryConversationId: primaryConvId,
        mergedConversationIds: secondaryConvIds,
        message: 'Conversations merged successfully'
      }
    });

  } catch (error) {
    console.error('Merge conversations error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to merge conversations' },
      { status: 500 }
    );
  }
}
