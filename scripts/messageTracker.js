// src/scripts/messageTracker.js
import { getTenantDB } from '../config/database.js';
import MessageSchema from '../models/schemas/Message.js';
import ConversationSchema from '../models/schemas/Conversation.js';
import ContactSchema from '../models/schemas/Contact.js';
import CompanyAccountSchema from '../models/schemas/CompanyAccount.js';

/**
 * Track message delivery details
 */
export async function trackMessageDelivery(tenantId, messageId) {
  try {
    const tenantDB = await getTenantDB(tenantId);
    const Message = tenantDB.model('Message', MessageSchema);
    const Conversation = tenantDB.model('Conversation', ConversationSchema);
    const Contact = tenantDB.model('Contact', ContactSchema);
    const CompanyAccount = tenantDB.model('CompanyAccount', CompanyAccountSchema);

    const message = await Message.findById(messageId)
      .populate('contact')
      .populate('channelAccount')
      .populate('conversation');

    if (!message) {
      console.log('❌ Message not found:', messageId);
      return null;
    }

    const deliveryInfo = {
      messageId: message._id,
      status: message.status,
      createdAt: message.createdAt,
      sentAt: message.metadata?.sentAt,
      failedAt: message.metadata?.failedAt,
      contact: {
        id: message.contact?._id,
        identifier: message.contact?.identifier,
        name: message.contact?.name
      },
      channel: {
        type: message.channel,
        account: message.channelAccount?.name,
        accountId: message.channelAccount?._id
      },
      content: message.content,
      metadata: message.metadata,
      deliveryDetails: message.metadata?.deliveryDetails,
      providerMessageId: message.metadata?.providerMessageId,
      whatsappMessageId: message.metadata?.whatsappMessageId
    };

    console.log('📊 MESSAGE DELIVERY TRACKING:');
    console.log('================================');
    console.log(`📨 Message ID: ${deliveryInfo.messageId}`);
    console.log(`📞 To: ${deliveryInfo.contact.identifier}`);
    console.log(`👤 Contact: ${deliveryInfo.contact.name}`);
    console.log(`📱 Channel: ${deliveryInfo.channel.type}`);
    console.log(`🏢 Account: ${deliveryInfo.channel.account}`);
    console.log(`🔄 Status: ${deliveryInfo.status}`);
    console.log(`⏰ Created: ${deliveryInfo.createdAt}`);
    
    if (deliveryInfo.sentAt) {
      console.log(`✅ Sent: ${deliveryInfo.sentAt}`);
    }
    if (deliveryInfo.failedAt) {
      console.log(`❌ Failed: ${deliveryInfo.failedAt}`);
    }
    if (deliveryInfo.providerMessageId) {
      console.log(`🔗 Provider ID: ${deliveryInfo.providerMessageId}`);
    }
    if (deliveryInfo.whatsappMessageId) {
      console.log(`💬 WhatsApp ID: ${deliveryInfo.whatsappMessageId}`);
    }
    
    console.log('================================');

    return deliveryInfo;

  } catch (error) {
    console.error('❌ Error tracking message:', error);
    return null;
  }
}

/**
 * Track all recent messages for a tenant
 */
export async function trackRecentMessages(tenantId, limit = 10) {
  try {
    const tenantDB = await getTenantDB(tenantId);
    const Message = tenantDB.model('Message', MessageSchema);

    const recentMessages = await Message.find()
      .populate('contact')
      .populate('channelAccount')
      .sort({ createdAt: -1 })
      .limit(limit);

    console.log(`\n📊 RECENT MESSAGES (Last ${limit}):`);
    console.log('================================');

    for (const message of recentMessages) {
      console.log(`\n📨 ${message._id}`);
      console.log(`   To: ${message.contact?.identifier || 'Unknown'}`);
      console.log(`   Channel: ${message.channel}`);
      console.log(`   Account: ${message.channelAccount?.name || 'Unknown'}`);
      console.log(`   Status: ${message.status}`);
      console.log(`   Created: ${message.createdAt.toLocaleString()}`);
      console.log(`   Content: ${message.content?.substring(0, 50)}...`);
    }

    console.log('================================');

    return recentMessages;

  } catch (error) {
    console.error('❌ Error tracking recent messages:', error);
    return [];
  }
}

/**
 * Track messages by status
 */
export async function trackMessagesByStatus(tenantId, status = 'sent', limit = 20) {
  try {
    const tenantDB = await getTenantDB(tenantId);
    const Message = tenantDB.model('Message', MessageSchema);

    const messages = await Message.find({ status })
      .populate('contact')
      .populate('channelAccount')
      .sort({ createdAt: -1 })
      .limit(limit);

    console.log(`\n📊 MESSAGES WITH STATUS "${status.toUpperCase()}" (Last ${limit}):`);
    console.log('================================');

    let successCount = 0;
    let failCount = 0;

    for (const message of messages) {
      if (message.status === 'sent') successCount++;
      if (message.status === 'failed') failCount++;

      console.log(`\n📨 ${message._id}`);
      console.log(`   To: ${message.contact?.identifier || 'Unknown'}`);
      console.log(`   Channel: ${message.channel}`);
      console.log(`   Account: ${message.channelAccount?.name || 'Unknown'}`);
      console.log(`   Created: ${message.createdAt.toLocaleString()}`);
      
      if (message.metadata?.providerMessageId) {
        console.log(`   Provider ID: ${message.metadata.providerMessageId}`);
      }
      
      if (message.metadata?.error) {
        console.log(`   ❌ Error: ${message.metadata.error}`);
      }
    }

    console.log(`\n📈 Summary: ${successCount} sent, ${failCount} failed`);
    console.log('================================');

    return {
      messages,
      summary: { successCount, failCount, total: messages.length }
    };

  } catch (error) {
    console.error('❌ Error tracking messages by status:', error);
    return { messages: [], summary: { successCount: 0, failCount: 0, total: 0 } };
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  const tenantId = '68e4690e6d9f5392ce895e7e'; // Your tenant ID

  switch (command) {
    case 'track':
      const messageId = process.argv[3];
      if (messageId) {
        trackMessageDelivery(tenantId, messageId);
      } else {
        trackRecentMessages(tenantId, 10);
      }
      break;
    
    case 'status':
      const status = process.argv[3] || 'sent';
      trackMessagesByStatus(tenantId, status, 20);
      break;
    
    case 'failed':
      trackMessagesByStatus(tenantId, 'failed', 20);
      break;
    
    default:
      console.log(`
📱 Message Tracker Commands:
  
  node src/scripts/messageTracker.js track [messageId]
    - Track specific message or show recent messages
  
  node src/scripts/messageTracker.js status [status]
    - Track messages by status (default: sent)
  
  node src/scripts/messageTracker.js failed
    - Track failed messages
  
Examples:
  node src/scripts/messageTracker.js track
  node src/scripts/messageTracker.js track 68ead8dd92cf59e928b026b1
  node src/scripts/messageTracker.js status sent
  node src/scripts/messageTracker.js failed
      `);
      break;
  }
}