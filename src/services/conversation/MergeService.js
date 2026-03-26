// src/services/conversation/MergeService.js
/**
 * Service for handling conversation merging and unmerging
 */

import mongoose from 'mongoose';
import { getTenantDB } from '../../config/database.js';
import ConversationSchema from '../../models/schemas/Conversation.js';
import ContactSchema from '../../models/schemas/Contact.js';
import MessageSchema from '../../models/schemas/Message.js';
import SocketEmitter from '../socket/SocketEmitter.js';

/**
 * Normalize phone number for comparison
 * Handles: + prefix, 00 prefix, or no prefix
 * Returns digits only for comparison
 */
function normalizePhone(phone) {
  if (!phone) return null;
  let normalized = String(phone).trim();
  
  // Remove all non-digit characters
  normalized = normalized.replace(/\D/g, '');
  
  // Handle 00 prefix (international format without +)
  // 00 is equivalent to +, so remove it
  if (normalized.startsWith('00')) {
    normalized = normalized.substring(2);
  }
  
  return normalized;
}

/**
 * Normalize email for comparison
 */
function normalizeEmail(email) {
  if (!email) return null;
  return email.toLowerCase().trim();
}

/**
 * Check if two contacts can be merged
 */
export function canMergeContacts(contact1, contact2) {
  if (!contact1 || !contact2) return { canMerge: false, reason: 'Contact not found' };

  // Same contact
  if (contact1._id.toString() === contact2._id.toString()) {
    return { canMerge: true };
  }

  // Same phone number (handle +, 00, or no prefix)
  const phone1 = contact1.phone || contact1.normalizedPhone || contact1.identifiers?.whatsapp || contact1.identifiers?.sms;
  const phone2 = contact2.phone || contact2.normalizedPhone || contact2.identifiers?.whatsapp || contact2.identifiers?.sms;
  
  if (phone1 && phone2) {
    const normalized1 = normalizePhone(phone1);
    const normalized2 = normalizePhone(phone2);
    if (normalized1 && normalized2 && normalized1 === normalized2) {
      return { canMerge: true };
    }
  }

  // Same email
  const email1 = contact1.email || contact1.identifiers?.email;
  const email2 = contact2.email || contact2.identifiers?.email;

  if (email1 && email2 && normalizeEmail(email1) === normalizeEmail(email2)) {
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
 * Find existing conversation that should be merged with
 * ✅ CRITICAL: Only merges conversations within the SAME department to maintain department isolation
 */
export async function findMergeableConversation(tenantId, newConversation, contact) {
  const tenantDB = await getTenantDB(tenantId);
  const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
  const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

  // Check if contact has auto-merge disabled
  if (contact.autoMergeDisabled) {
    console.log(`[findMergeableConversation] Auto-merge disabled for contact ${contact._id}`);
    return null;
  }

  // Ensure contact is a full document (not just lean) to access all fields
  let fullContact = contact;
  if (!contact.phone && !contact.email && !contact.identifiers) {
    fullContact = await Contact.findById(contact._id).lean();
    if (!fullContact) {
      console.log(`[findMergeableConversation] Contact ${contact._id} not found`);
      return null;
    }
  }

  // First, find other conversations for this contact (different channel)
  // ✅ CRITICAL: Filter by department to prevent cross-department merging
  const newConvDepartment = newConversation.department?.toString() || newConversation.department;
  let otherConversations = await Conversation.find({
    contact: fullContact._id,
    channel: { $ne: newConversation.channel },
    status: { $in: ['active', 'pending', 'open'] },
    primaryConversation: null, // Not already merged into another
    autoMergeDisabled: { $ne: true }, // Not disabled from auto-merge
    mode: newConversation.mode || 'auto', // ✅ CRITICAL: Only merge conversations with same mode
    ...(newConvDepartment ? { department: newConvDepartment } : {}) // ✅ CRITICAL: Same department only
  }).sort({ lastMessageAt: -1 }).lean();

  // If found, return the most recent one
  if (otherConversations.length > 0) {
    console.log(`[findMergeableConversation] Found ${otherConversations.length} conversation(s) for same contact ${fullContact._id}`);
    return otherConversations[0];
  }

  // ✅ Also search for conversations with same email/phone but different contact
  // This handles cases where the same person has multiple contact records
  const contactEmail = fullContact.email || fullContact.identifiers?.email;
  const contactPhone = fullContact.phone || fullContact.normalizedPhone || fullContact.identifiers?.whatsapp || fullContact.identifiers?.sms;
  
  console.log(`[findMergeableConversation] Searching for conversations with same email/phone:`, {
    contactId: fullContact._id,
    email: contactEmail,
    phone: contactPhone,
    normalizedPhone: fullContact.normalizedPhone,
    identifiers: fullContact.identifiers
  });
  
  if (contactEmail || contactPhone) {
    // Build query to find contacts with same email or phone
    const contactQuery = {};
    if (contactEmail) {
      const normalizedEmail = contactEmail.toLowerCase().trim();
      contactQuery.$or = [
        { email: normalizedEmail },
        { 'identifiers.email': normalizedEmail }
      ];
    }
    if (contactPhone) {
      // Normalize phone to digits only for comparison
      const normalizedPhoneDigits = normalizePhone(contactPhone);
      // Generate all possible variations: with +, without +, with 00, without prefix
      const phoneWithPlus = normalizedPhoneDigits ? `+${normalizedPhoneDigits}` : null;
      const phoneWith00 = normalizedPhoneDigits ? `00${normalizedPhoneDigits}` : null;
      
      const phoneVariations = [
        contactPhone, // Original
        phoneWithPlus, // With + prefix
        normalizedPhoneDigits, // Digits only
        phoneWith00, // With 00 prefix
      ].filter(Boolean); // Remove null/undefined
      
      if (contactQuery.$or) {
        // Add phone variations to existing $or array
        phoneVariations.forEach(phoneVar => {
          contactQuery.$or.push(
            { phone: phoneVar },
            { normalizedPhone: phoneVar },
            { 'identifiers.whatsapp': phoneVar },
            { 'identifiers.sms': phoneVar }
          );
        });
      } else {
        // Create new $or array with phone variations
        contactQuery.$or = [];
        phoneVariations.forEach(phoneVar => {
          contactQuery.$or.push(
            { phone: phoneVar },
            { normalizedPhone: phoneVar },
            { 'identifiers.whatsapp': phoneVar },
            { 'identifiers.sms': phoneVar }
          );
        });
      }
    }
    
    // Find contacts with same email/phone (excluding current contact)
    const matchingContacts = await Contact.find({
      ...contactQuery,
      _id: { $ne: fullContact._id }
    }).select('_id phone normalizedPhone identifiers').lean();
    
    console.log(`[findMergeableConversation] Found ${matchingContacts.length} matching contact(s) with same phone/email`);
    if (matchingContacts.length > 0) {
      matchingContacts.forEach(mc => {
        console.log(`  - Contact ${mc._id}: phone=${mc.phone}, normalized=${mc.normalizedPhone}, identifiers=${JSON.stringify(mc.identifiers)}`);
      });
      
      const matchingContactIds = matchingContacts.map(c => c._id);
      
      // Find conversations for these matching contacts (different channel, not disabled, same mode, same department)
      otherConversations = await Conversation.find({
        contact: { $in: matchingContactIds },
        channel: { $ne: newConversation.channel },
        status: { $in: ['active', 'pending', 'open'] },
        primaryConversation: null,
        autoMergeDisabled: { $ne: true },
        mode: newConversation.mode || 'auto', // ✅ CRITICAL: Only merge conversations with same mode
        ...(newConvDepartment ? { department: newConvDepartment } : {}) // ✅ CRITICAL: Same department only
      }).sort({ lastMessageAt: -1 }).lean();
      
      console.log(`[findMergeableConversation] Found ${otherConversations.length} conversation(s) for matching contacts`);
      if (otherConversations.length > 0) {
        otherConversations.forEach(conv => {
          console.log(`  - Conversation ${conv._id}: channel=${conv.channel}, contact=${conv.contact}`);
        });
        return otherConversations[0];
      }
    } else {
      console.log(`[findMergeableConversation] No matching contacts found. Query was:`, JSON.stringify(contactQuery, null, 2));
    }
  } else {
    console.log(`[findMergeableConversation] No email or phone found on contact ${fullContact._id}`);
  }

  console.log(`[findMergeableConversation] No mergeable conversation found for contact ${fullContact._id}`);
  return null;
}

/**
 * Auto-merge conversation with existing conversation
 */
export async function autoMergeConversation(tenantId, newConversationId, primaryConversationId, userId) {
  try {
    const tenantDB = await getTenantDB(tenantId);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    const newConv = await Conversation.findById(newConversationId);
    const primaryConv = await Conversation.findById(primaryConversationId);

    if (!newConv || !primaryConv) {
      throw new Error('Conversation not found');
    }

    // Check if already merged — only block if new conv is already a secondary
    // or primary is itself merged INTO another conversation (is a secondary)
    // Note: primaryConv.isMerged being true just means it already has merges, which is fine for adding more
    if (newConv.primaryConversation || primaryConv.primaryConversation) {
      return { success: false, error: 'Conversation already merged' };
    }

    // ✅ CRITICAL: Validate that both conversations have the same mode
    const newConvMode = newConv.mode || 'auto';
    const primaryConvMode = primaryConv.mode || 'auto';
    
    if (newConvMode !== primaryConvMode) {
      console.log(`[autoMergeConversation] Cannot merge - mode mismatch:`, {
        newConversationId: newConversationId,
        newConvMode: newConvMode,
        primaryConversationId: primaryConversationId,
        primaryConvMode: primaryConvMode
      });
      return { 
        success: false, 
        error: `Cannot merge conversations - mode mismatch. New conversation mode: ${newConvMode}, Primary conversation mode: ${primaryConvMode}` 
      };
    }

    // Update primary conversation
    const mergedConversations = [
      ...(primaryConv.mergedConversations || []),
      {
        conversationId: newConversationId,
        channel: newConv.channel,
        channelAccount: newConv.channelAccount
      }
    ];

    // Get latest message from both conversations
    const newConvLatest = await Message.findOne({ conversation: newConversationId }).sort({ createdAt: -1 });
    const primaryConvLatest = await Message.findOne({ conversation: primaryConversationId }).sort({ createdAt: -1 });

    // Build merge history entry - only include performedBy if it's a valid ObjectId
    const mergeHistoryEntry = {
      action: 'merge',
      conversations: [primaryConversationId, newConversationId],
      performedAt: new Date(),
      reason: 'Auto-merge: Same contact identifier'
    };
    
    // Only add performedBy if userId is a valid ObjectId (not 'system' string)
    // Explicitly check and only add if it's a valid ObjectId
    if (userId && userId !== 'system') {
      try {
        if (mongoose.Types.ObjectId.isValid(userId)) {
          mergeHistoryEntry.performedBy = new mongoose.Types.ObjectId(userId);
        }
      } catch (e) {
        // If userId is not a valid ObjectId, don't add performedBy
        console.warn('Invalid userId for mergeHistory performedBy:', userId);
      }
    }

    const updateData = {
      isMerged: true,
      mergedConversations,
      status: 'active', // ✅ Primary conversation should remain 'active'
      mergeHistory: [
        ...(primaryConv.mergeHistory || []),
        mergeHistoryEntry
      ]
    };

    // Use most recent message as last message
    if (newConvLatest && primaryConvLatest) {
      if (newConvLatest.createdAt > primaryConvLatest.createdAt) {
        updateData.lastMessage = newConv.lastMessage;
        updateData.lastMessageContent = newConv.lastMessageContent;
        updateData.lastMessageType = newConv.lastMessageType;
        updateData.lastMessageDirection = newConv.lastMessageDirection;
        updateData.lastMessageAt = newConv.lastMessageAt;
      }
    } else if (newConvLatest) {
      updateData.lastMessage = newConv.lastMessage;
      updateData.lastMessageContent = newConv.lastMessageContent;
      updateData.lastMessageType = newConv.lastMessageType;
      updateData.lastMessageDirection = newConv.lastMessageDirection;
      updateData.lastMessageAt = newConv.lastMessageAt;
    }

    // Use optimistic locking to prevent concurrent merge corruption
    const updateResult = await Conversation.findOneAndUpdate(
      { _id: primaryConversationId, primaryConversation: { $exists: false } },
      updateData,
      { new: true }
    );
    if (!updateResult) {
      return { success: false, error: 'Concurrent merge detected, aborting' };
    }

    // Build merge history entry for new conversation
    const newConvMergeHistoryEntry = {
      action: 'merge',
      conversations: [primaryConversationId, newConversationId],
      performedAt: new Date(),
      reason: 'Auto-merge: Same contact identifier'
    };
    
    // Only add performedBy if userId is a valid ObjectId (not 'system' string)
    // Explicitly check and only add if it's a valid ObjectId
    if (userId && userId !== 'system') {
      try {
        if (mongoose.Types.ObjectId.isValid(userId)) {
          newConvMergeHistoryEntry.performedBy = new mongoose.Types.ObjectId(userId);
        }
      } catch (e) {
        // If userId is not a valid ObjectId, don't add performedBy
        console.warn('Invalid userId for mergeHistory performedBy:', userId);
      }
    }

    // Update new conversation to point to primary - Use 'active' status (not 'merged')
    await Conversation.findByIdAndUpdate(newConversationId, {
      primaryConversation: primaryConversationId,
      status: 'active', // ✅ Use 'active' status (not 'merged') - isMerged flag handles merge state
      isMerged: true, // ✅ All merged conversations should have isMerged: true for proper querying
      mergeHistory: [
        ...(newConv.mergeHistory || []),
        newConvMergeHistoryEntry
      ]
    });

    // ✅ Fetch updated primary conversation so frontend can update immediately
    const updatedPrimaryConversation = await Conversation.findById(primaryConversationId)
      .populate('contact', 'name displayName email phone avatar')
      .populate('channelAccount', 'name identifier type')
      .lean();

    // Emit socket events
    const mergeEventData = {
      primaryConversationId: primaryConversationId.toString(),
      mergedConversationIds: [newConversationId.toString()],
      autoMerged: true,
      mergedBy: userId,
      timestamp: new Date().toISOString(),
      updatedPrimaryConversation // ✅ Include full data for real-time cache update
    };

    await SocketEmitter.emit(`conversation:${primaryConversationId}`, 'conversation:merged', mergeEventData);
    await SocketEmitter.emit(`conversation:${newConversationId}`, 'conversation:merged', mergeEventData);

    // ✅ CRITICAL: Also emit to tenant room so conversation list page receives the merge event
    // Without this, the list page only gets updates via conversation-specific rooms it may not be in
    await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:merged', mergeEventData);

    // ✅ Emit to department room if available (for department-scoped agents)
    const deptId = updatedPrimaryConversation?.department?._id || updatedPrimaryConversation?.department;
    if (deptId) {
      await SocketEmitter.emit(`department:${deptId}`, 'conversation:merged', mergeEventData);
    }

    return {
      success: true,
      primaryConversationId,
      mergedConversationId: newConversationId
    };

  } catch (error) {
    console.error('Auto-merge error:', error);
    throw error;
  }
}

/**
 * Merge contacts (used when merging conversations)
 */
export async function mergeContacts(tenantId, contact1Id, contact2Id) {
  const tenantDB = await getTenantDB(tenantId);
  const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
  const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
  const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

  const contact1 = await Contact.findById(contact1Id);
  const contact2 = await Contact.findById(contact2Id);

  if (!contact1 || !contact2) {
    throw new Error('Contact not found');
  }

  if (contact1._id.toString() === contact2._id.toString()) {
    return contact1; // Same contact
  }

  // Merge identifiers
  const mergedIdentifiers = {
    ...contact1.identifiers,
    ...contact2.identifiers
  };

  // Merge contact data (prefer non-empty values)
  const mergedData = {
    ...contact1.toObject(),
    identifiers: mergedIdentifiers,
    phone: contact1.phone || contact2.phone,
    email: contact1.email || contact2.email,
    name: contact1.name || contact2.name,
    firstName: contact1.firstName || contact2.firstName,
    lastName: contact1.lastName || contact2.lastName,
    displayName: contact1.displayName || contact2.displayName,
    avatar: contact1.avatar || contact2.avatar,
    mergedFrom: [
      ...(contact1.mergedFrom || []),
      contact2._id
    ],
    updatedAt: new Date()
  };

  // Update contact1 with merged data
  await Contact.findByIdAndUpdate(contact1Id, mergedData);

  // Update all conversations and messages from contact2 to use contact1
  await Conversation.updateMany(
    { contact: contact2Id },
    { $set: { contact: contact1Id } }
  );

  await Message.updateMany(
    { contact: contact2Id },
    { $set: { contact: contact1Id } }
  );

  // Delete duplicate contact
  await Contact.findByIdAndDelete(contact2Id);

  return await Contact.findById(contact1Id);
}

/**
 * Find primary merged conversation for a contact that includes a specific channel
 * This is used to prevent duplicate conversation creation when incoming messages arrive
 */
export async function findPrimaryMergedConversation(tenantId, contactId, channel) {
  const tenantDB = await getTenantDB(tenantId);
  const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);

  // Find all primary merged conversations for this contact
  const primaryMergedConversations = await Conversation.find({
    contact: contactId,
    isMerged: true,
    status: 'active',
    primaryConversation: null, // Must be primary (not merged into another)
  }).lean();

  // Check if any primary merged conversation includes this channel
  for (const primaryConv of primaryMergedConversations) {
    // Check if the primary conversation itself matches the channel
    if (primaryConv.channel === channel) {
      return primaryConv;
    }

    // Check if any merged conversation matches the channel
    if (primaryConv.mergedConversations?.some(mc => mc.channel === channel)) {
      return primaryConv;
    }
  }

  return null;
}

/**
 * Get all conversation IDs (primary + merged) for fetching messages
 */
export async function getMergedConversationIds(tenantId, conversationId) {
  const tenantDB = await getTenantDB(tenantId);
  const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);

  const conversation = await Conversation.findById(conversationId).lean();

  if (!conversation) {
    return [conversationId]; // Return original if not found
  }

  // Only return merged conversation IDs if conversation is explicitly marked as merged
  // IMPORTANT: Only return multiple IDs if conversation is actually merged via merge API
  const conversationIds = [conversationId];

  // Check if conversation is explicitly merged (has primaryConversation reference OR is marked as merged with mergedConversations array)
  const isExplicitlyMerged = conversation.primaryConversation || 
    (conversation.isMerged && conversation.mergedConversations?.length > 0);

  if (!isExplicitlyMerged) {
    // NOT merged - only return this conversation's ID
    return conversationIds;
  }

  // If this is a primary conversation with merged conversations (explicitly merged)
  if (conversation.isMerged && conversation.mergedConversations?.length > 0) {
    conversation.mergedConversations.forEach(merged => {
      if (merged.conversationId && merged.conversationId.toString() !== conversationId.toString()) {
        conversationIds.push(merged.conversationId);
      }
    });
  }

  // If this is merged into another conversation (explicitly merged)
  if (conversation.primaryConversation) {
    const primaryId = conversation.primaryConversation.toString();
    if (!conversationIds.includes(primaryId)) {
      conversationIds.push(primaryId);
    }
    
    // Also get merged conversations from primary
    const primary = await Conversation.findById(conversation.primaryConversation).lean();
    if (primary?.isMerged && primary.mergedConversations?.length > 0) {
      primary.mergedConversations.forEach(merged => {
        const mergedId = merged.conversationId?.toString();
        if (mergedId && !conversationIds.includes(mergedId)) {
          conversationIds.push(mergedId);
        }
      });
    }
    
    // Return all merged IDs, but make sure primary is first
    return [primaryId, ...conversationIds.filter(id => id !== primaryId)];
  }

  // If only isMerged is true but no mergedConversations, still only return this conversation
  return conversationIds;
}

/**
 * Propagate mode change to all merged conversations (primary + all secondaries)
 * Call this whenever a conversation's mode changes to keep all merged conversations in sync.
 * @param {string} tenantId - Tenant ID
 * @param {string} conversationId - The conversation whose mode just changed
 * @param {string} mode - The new mode ('manual' or 'auto')
 * @returns {Array} IDs of conversations that were updated
 */
export async function propagateModeToMergedConversations(tenantId, conversationId, mode) {
  try {
    const tenantDB = await getTenantDB(tenantId);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);

    const conversation = await Conversation.findById(conversationId)
      .select('isMerged mergedConversations primaryConversation')
      .lean();

    if (!conversation) return [];

    const idsToUpdate = [];

    // If PRIMARY: update all secondaries
    if (conversation.isMerged && conversation.mergedConversations?.length > 0) {
      for (const merged of conversation.mergedConversations) {
        if (merged.conversationId) {
          idsToUpdate.push(merged.conversationId);
        }
      }
    }

    // If SECONDARY: update primary + all sibling secondaries
    if (conversation.primaryConversation) {
      idsToUpdate.push(conversation.primaryConversation);
      const primary = await Conversation.findById(conversation.primaryConversation)
        .select('mergedConversations')
        .lean();
      if (primary?.mergedConversations) {
        for (const merged of primary.mergedConversations) {
          if (merged.conversationId &&
              merged.conversationId.toString() !== conversationId.toString()) {
            idsToUpdate.push(merged.conversationId);
          }
        }
      }
    }

    if (idsToUpdate.length === 0) return [];

    // Bulk update all related conversations
    await Conversation.updateMany(
      { _id: { $in: idsToUpdate } },
      { $set: { mode, updatedAt: new Date() } }
    );

    console.log(`✅ Propagated mode '${mode}' to ${idsToUpdate.length} merged conversations:`, idsToUpdate.map(id => id.toString()));

    // ✅ Fetch department info for each conversation so agents receive socket events
    const mergedConversations = await Conversation.find(
      { _id: { $in: idsToUpdate } }
    ).select('_id department').lean();
    const deptMap = {};
    for (const mc of mergedConversations) {
      deptMap[mc._id.toString()] = mc.department?.toString() || null;
    }

    // Emit socket events for each so UI stays in sync
    for (const id of idsToUpdate) {
      const deptId = deptMap[id.toString()] || null;
      await SocketEmitter.emitConversationUpdate(id, { mode }, tenantId, deptId);
    }

    return idsToUpdate;
  } catch (error) {
    console.error('⚠️ Failed to propagate mode to merged conversations:', error);
    return [];
  }
}

