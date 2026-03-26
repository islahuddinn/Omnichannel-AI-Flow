// // src/workers/messageWorker.js
// import { Worker } from 'bullmq';
// import { redisConnection, QUEUES } from '@/lib/queue/bullmq';
// import { setTenantContext } from '@/lib/tenantContext';
// import { getTenantConnection } from '@/lib/mongodb';
// import SocketManager from '@/services/socket/SocketManager';

// // Import channel adapters
// import { getAdapter } from '@/services/channel/adapters';

// /**
//  * Process outbound message job
//  */
// async function processOutboundMessage(job) {
//   const {
//     messageId,
//     conversationId,
//     contactId,
//     channelType,
//     channelAccountId,
//     content,
//     metadata,
//     tenantId,
//     userId,
//   } = job.data;

//   console.log(`📤 Processing message ${messageId} (${channelType}) for tenant ${tenantId}`);

//   try {
//     // Set tenant context for this job
//     setTenantContext({ tenantId, userId });

//     // Update message status to 'sending'
//     await updateMessageStatus(messageId, 'sending', { jobId: job.id });

//     // Fetch channel credentials from CompanyAccount
//     const credentials = await getChannelCredentials(channelAccountId);
    
//     // Get adapter instance
//     const adapter = getAdapter(channelType, credentials);

//     // Get contact information
//     const contact = await getContact(contactId);
//     if (!contact) {
//       throw new Error(`Contact not found: ${contactId}`);
//     }

//     // Send message via adapter
//     const result = await adapter.sendMessage({
//       to: contact.identifier,
//       content,
//       metadata: {
//         ...metadata,
//         conversationId,
//         messageId,
//       },
//     });

//     // Update message with provider response
//     await updateMessageStatus(messageId, 'sent', {
//       providerMessageId: result.messageId,
//       sentAt: new Date(),
//       providerResponse: result,
//     });

//     // Emit socket event
//     emitMessageStatus(tenantId, conversationId, messageId, 'sent', result);

//     console.log(`✅ Message sent: ${messageId} → ${result.messageId}`);
//     return result;

//   } catch (error) {
//     console.error(`❌ Message send failed: ${messageId}`, error);

//     // Update message status to failed
//     await updateMessageStatus(messageId, 'failed', {
//       error: error.message,
//       failedAt: new Date(),
//     });

//     // Emit socket event
//     emitMessageStatus(tenantId, conversationId, messageId, 'failed', {
//       error: error.message,
//     });

//     throw error; // This will trigger BullMQ retry mechanism
//   }
// }

// /**
//  * Update message status in database
//  */
// async function updateMessageStatus(messageId, status, metadata = {}) {
//   try {
//     const tenantDB = await getTenantConnection();
//     const Message = tenantDB.model('Message');

//     await Message.findByIdAndUpdate(messageId, {
//       status,
//       ...metadata,
//       [`statusHistory.${status}`]: new Date(),
//     });
//   } catch (error) {
//     console.error('Failed to update message status:', error);
//   }
// }

// /**
//  * Emit message status via Socket.IO
//  */
// function emitMessageStatus(tenantId, conversationId, messageId, status, data = {}) {
//   try {
//    const io = SocketManager.getIO();
    
//     // Emit to tenant room
//     io.to(`tenant:${tenantId}`).emit('message:status', {
//       messageId,
//       conversationId,
//       status,
//       timestamp: new Date().toISOString(),
//       ...data,
//     });

//     // Emit to specific conversation room
//     io.to(`conversation:${conversationId}`).emit('message:status', {
//       messageId,
//       status,
//       timestamp: new Date().toISOString(),
//       ...data,
//     });
//   } catch (error) {
//     console.error('Failed to emit socket event:', error);
//   }
// }

// /**
//  * Get channel credentials from CompanyAccount
//  */
// async function getChannelCredentials(accountId) {
//   try {
//     const tenantDB = await getTenantConnection();
//     const CompanyAccount = tenantDB.model('CompanyAccount');

//     const account = await CompanyAccount.findById(accountId);
//     if (!account) {
//       throw new Error(`Channel account not found: ${accountId}`);
//     }

//     return account.credentials;
//   } catch (error) {
//     console.error('Failed to get channel credentials:', error);
//     throw error;
//   }
// }

// /**
//  * Get contact information
//  */
// async function getContact(contactId) {
//   try {
//     const tenantDB = await getTenantConnection();
//     const Contact = tenantDB.model('Contact');

//     return await Contact.findById(contactId);
//   } catch (error) {
//     console.error('Failed to get contact:', error);
//     throw error;
//   }
// }

// /**
//  * Failed job handler
//  */
// async function handleFailedJob(job, error) {
//   console.error(`💥 Job ${job.id} failed permanently:`, error);
  
//   const { messageId, conversationId, tenantId } = job.data;

//   // Set tenant context
//   setTenantContext({ tenantId });

//   // Mark message as permanently failed
//   await updateMessageStatus(messageId, 'failed', {
//     error: error.message,
//     failedAt: new Date(),
//     attempts: job.attemptsMade,
//     permanentlyFailed: true,
//   });

//   // Emit final failure event
//   emitMessageStatus(tenantId, conversationId, messageId, 'failed', {
//     error: error.message,
//     permanentlyFailed: true,
//   });
// }

// /**
//  * Initialize message worker
//  */
// export function startMessageWorker() {
//   const worker = new Worker(
//     QUEUES.MESSAGE_OUTBOUND,
//     processOutboundMessage,
//     {
//       connection: redisConnection,
//       concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5'),
//       limiter: {
//         max: 100, // Max 100 jobs
//         duration: 1000, // Per second
//       },
//     }
//   );

//   // Event handlers
//   worker.on('completed', (job, result) => {
//     console.log(`✅ Job ${job.id} completed:`, result?.messageId);
//   });

//   worker.on('failed', handleFailedJob);

//   worker.on('error', (error) => {
//     console.error('Worker error:', error);
//   });

//   worker.on('stalled', (jobId) => {
//     console.warn(`⚠️ Job ${jobId} stalled`);
//   });

//   console.log('🚀 Message worker started');
//   return worker;
// }

// // Start worker if running as standalone process
// if (require.main === module) {
//   startMessageWorker();
// }









// src/workers/messageWorker.js
import { Worker } from 'bullmq';
import { redisConnection, QUEUES } from '@/lib/queue/bullmq';
import { setTenantContext } from '@/lib/tenantContext';
import { getTenantConnection } from '@/lib/mongodb';
import SocketManager from '@/services/socket/SocketManager';
import MessageSchema from '@/models/schemas/Message';
import ContactSchema from '@/models/schemas/Contact';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';

// Import channel adapters - Make sure this path exists
import { getAdapter } from '@/services/channel/adapters';

/**
 * Process outbound message job
 */
async function processOutboundMessage(job) {
  const {
    messageId,
    conversationId,
    contactId,
    channelType,
    channelAccountId,
    content,
    metadata,
    tenantId,
    userId,
  } = job.data;

  console.log(`📤 Processing message ${messageId} (${channelType}) for tenant ${tenantId}`);

  try {
    // Set tenant context for this job
    setTenantContext({ tenantId, userId });

    // Update message status to 'sending'
    await updateMessageStatus(messageId, 'sending', { jobId: job.id });

    // Fetch channel account and credentials
    const channelAccount = await getChannelAccount(channelAccountId);
    if (!channelAccount) {
      throw new Error(`Channel account not found: ${channelAccountId}`);
    }

    // Get adapter instance
    const adapter = getAdapter(channelType, channelAccount);
    
    // Get contact information
    const contact = await getContact(contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    console.log(`📨 Sending ${channelType} message to ${contact.identifier}`, {
      messageId,
      contentType: content.type || 'text',
      account: channelAccount.name
    });

    // Send message via adapter
    const result = await adapter.sendMessage({
      to: contact.identifier,
      content,
      metadata: {
        ...metadata,
        conversationId,
        messageId,
        tenantId,
        userId
      },
    });

    // Update message with provider response
    await updateMessageStatus(messageId, 'sent', {
      providerMessageId: result.messageId,
      sentAt: new Date(),
      providerResponse: result,
      channelMessageId: result.channelMessageId,
    });

    // Emit socket event
    emitMessageStatus(tenantId, conversationId, messageId, 'sent', result);

    console.log(`✅ Message sent: ${messageId} → ${result.messageId}`);
    return result;

  } catch (error) {
    console.error(`❌ Message send failed: ${messageId}`, error);

    // Update message status to failed
    await updateMessageStatus(messageId, 'failed', {
      error: error.message,
      failedAt: new Date(),
      attempts: job.attemptsMade,
    });

    // Emit socket event
    emitMessageStatus(tenantId, conversationId, messageId, 'failed', {
      error: error.message,
    });

    throw error; // This will trigger BullMQ retry mechanism
  }
}

/**
 * Update message status in database
 */
async function updateMessageStatus(messageId, status, metadata = {}) {
  try {
    const tenantDB = await getTenantConnection();
    
    // Use existing model or create new one
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    const updateData = {
      status,
      updatedAt: new Date(),
      ...metadata,
    };

    // Add to status history
    updateData.$push = {
      statusHistory: {
        status,
        timestamp: new Date(),
        metadata: metadata
      }
    };

    await Message.findByIdAndUpdate(messageId, updateData);
    
    console.log(`📝 Message ${messageId} status updated to: ${status}`);
  } catch (error) {
    console.error('Failed to update message status:', error);
    throw error;
  }
}

/**
 * Emit message status via Socket.IO
 */
function emitMessageStatus(tenantId, conversationId, messageId, status, data = {}) {
  try {
    const io = SocketManager.getIO();
    if (!io) {
      console.warn('Socket.IO not available for emitting status');
      return;
    }
    
    const eventData = {
      messageId,
      conversationId,
      status,
      timestamp: new Date().toISOString(),
      ...data,
    };

    // Emit to tenant room
    io.to(`tenant:${tenantId}`).emit('message:status', eventData);

    // Emit to specific conversation room
    io.to(`conversation:${conversationId}`).emit('message:status', eventData);

    console.log(`📡 Emitted message status: ${messageId} -> ${status}`);
  } catch (error) {
    console.error('Failed to emit socket event:', error);
  }
}

/**
 * Get channel account with credentials
 */
async function getChannelAccount(accountId) {
  try {
    const tenantDB = await getTenantConnection();
    
    // Use existing model or create new one
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);

    const account = await CompanyAccount.findById(accountId);
    if (!account) {
      throw new Error(`Channel account not found: ${accountId}`);
    }

    // Check if account is active
    if (!account.isActive) {
      throw new Error(`Channel account is not active: ${accountId}`);
    }

    return account;
  } catch (error) {
    console.error('Failed to get channel account:', error);
    throw error;
  }
}

/**
 * Get contact information
 */
async function getContact(contactId) {
  try {
    const tenantDB = await getTenantConnection();
    
    // Use existing model or create new one
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    const contact = await Contact.findById(contactId);
    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    return contact;
  } catch (error) {
    console.error('Failed to get contact:', error);
    throw error;
  }
}

/**
 * Process different message types based on content structure
 */
function processMessageContent(content, channelType) {
  // Handle both old and new content structures
  if (content.type) {
    // New structure with type field
    return {
      type: content.type,
      ...content
    };
  } else {
    // Old structure - convert to new structure
    if (content.text) {
      return {
        type: 'text',
        text: content.text
      };
    } else if (content.template) {
      return {
        type: 'template',
        templateName: content.template,
        templateLanguage: content.templateLanguage,
        parameters: content.parameters
      };
    } else if (content.media) {
      return {
        type: content.media.type,
        ...content.media
      };
    }
  }
  
  throw new Error('Unsupported message content format');
}

/**
 * Failed job handler
 */
async function handleFailedJob(job, error) {
  console.error(`💥 Job ${job.id} failed permanently:`, error);
  
  const { messageId, conversationId, tenantId, userId } = job.data;

  try {
    // Set tenant context
    setTenantContext({ tenantId, userId });

    // Mark message as permanently failed
    await updateMessageStatus(messageId, 'failed', {
      error: error.message,
      failedAt: new Date(),
      attempts: job.attemptsMade,
      permanentlyFailed: true,
    });

    // Emit final failure event
    emitMessageStatus(tenantId, conversationId, messageId, 'failed', {
      error: error.message,
      permanentlyFailed: true,
    });

    console.log(`🔴 Message ${messageId} marked as permanently failed`);
  } catch (updateError) {
    console.error('Failed to handle failed job:', updateError);
  }
}

/**
 * Job progress handler
 */
async function handleJobProgress(job, progress) {
  const { messageId, conversationId, tenantId } = job.data;
  
  console.log(`📊 Job ${job.id} progress:`, progress);
  
  // Emit progress event if needed
  emitMessageStatus(tenantId, conversationId, messageId, 'processing', {
    progress,
    jobId: job.id
  });
}

/**
 * Initialize message worker
 */
export function startMessageWorker() {
  const workerOptions = {
    connection: redisConnection,
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5'),
    limiter: {
      max: parseInt(process.env.QUEUE_MAX_JOBS_PER_SECOND || '100'),
      duration: 1000, // Per second
    },
    removeOnComplete: {
      count: 1000, // Keep last 1000 completed jobs
    },
    removeOnFail: {
      count: 5000, // Keep last 5000 failed jobs
    },
  };

  const worker = new Worker(
    QUEUES.MESSAGE_OUTBOUND,
    processOutboundMessage,
    workerOptions
  );

  // Event handlers
  worker.on('completed', (job, result) => {
    console.log(`✅ Job ${job.id} completed:`, result?.messageId || result?.channelMessageId);
  });

  worker.on('failed', handleFailedJob);

  worker.on('error', (error) => {
    console.error('Worker error:', error);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`⚠️ Job ${jobId} stalled`);
  });

  worker.on('progress', handleJobProgress);

  worker.on('active', (job) => {
    console.log(`🎯 Job ${job.id} is now active`);
  });

  console.log('🚀 Message worker started');
  return worker;
}

/**
 * Graceful shutdown handler
 */
export function gracefulShutdown(worker) {
  return async () => {
    console.log('🛑 Shutting down message worker gracefully...');
    
    try {
      await worker.close();
      console.log('✅ Message worker shut down successfully');
    } catch (error) {
      console.error('❌ Error shutting down worker:', error);
    }
  };
}

// Export for testing
export {
  processOutboundMessage,
  updateMessageStatus,
  getChannelAccount,
  getContact,
  emitMessageStatus
};

// Start worker if running as standalone process
if (require.main === module) {
  const worker = startMessageWorker();
  
  // Handle graceful shutdown
  process.on('SIGINT', gracefulShutdown(worker));
  process.on('SIGTERM', gracefulShutdown(worker));
}