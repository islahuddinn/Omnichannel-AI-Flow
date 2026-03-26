// // src/lib/queue/bullmq.js
// import { Queue, Worker } from 'bullmq';
// import { getRedisClient, redisClient } from '../../config/redis.js';

// // Use the singleton Redis connection from config/redis.js
// async function getConnection() {
//   console.log('🔌 Getting Redis connection for BullMQ from singleton...');
//   const connection = await getRedisClient();
//   if (!connection) {
//     throw new Error('Redis connection unavailable for BullMQ');
//   }
  
//   // Test the connection
//   try {
//     const pingResult = await connection.ping();
//     console.log('✅ BullMQ Redis connection verified:', pingResult);
//   } catch (error) {
//     console.error('❌ BullMQ Redis connection test failed:', error);
//     throw error;
//   }
  
//   return connection;
// }

// // Queue names
// export const QUEUES = {
//   MESSAGE_OUTBOUND: 'message_outbound',
//   MESSAGE_STATUS: 'message_status', 
//   WEBHOOK_PROCESS: 'webhook_process',
//   CONVERSATION_MERGE: 'conversation_merge',
//   NOTIFICATION: 'notification',
// };

// // Create queues with Docker-optimized options
// const createQueue = async (name) => {
//   const connection = await getConnection();
  
//   console.log(`🔧 Creating queue ${name} with Redis:`, {
//     host: connection.options.host,
//     port: connection.options.port,
//     status: connection.status
//   });
  
//   return new Queue(name, {
//     connection,
//     defaultJobOptions: {
//       attempts: 3,
//       backoff: {
//         type: 'exponential',
//         delay: 2000,
//       },
//       removeOnComplete: {
//         count: 1000,
//         age: 24 * 3600, // 24 hours
//       },
//       removeOnFail: {
//         count: 5000,
//         age: 7 * 24 * 3600, // 7 days
//       },
//     },
//   });
// };

// // Lazy initialization with connection validation
// let messageOutboundQueue = null;
// let messageStatusQueue = null;
// let webhookProcessQueue = null;
// let conversationMergeQueue = null;
// let notificationQueue = null;

// export async function getMessageOutboundQueue() {
//   if (!messageOutboundQueue) {
//     console.log('📤 Initializing message outbound queue...');
//     messageOutboundQueue = await createQueue(QUEUES.MESSAGE_OUTBOUND);
//     console.log('✅ Message outbound queue connected');
//   }
//   return messageOutboundQueue;
// }

// export async function getMessageStatusQueue() {
//   if (!messageStatusQueue) {
//     messageStatusQueue = await createQueue(QUEUES.MESSAGE_STATUS);
//   }
//   return messageStatusQueue;
// }

// export async function getWebhookProcessQueue() {
//   if (!webhookProcessQueue) {
//     console.log('📥 Initializing webhook process queue...');
//     webhookProcessQueue = await createQueue(QUEUES.WEBHOOK_PROCESS);
//     console.log('✅ Webhook process queue connected');
//   }
//   return webhookProcessQueue;
// }

// export async function getConversationMergeQueue() {
//   if (!conversationMergeQueue) {
//     conversationMergeQueue = await createQueue(QUEUES.CONVERSATION_MERGE);
//   }
//   return conversationMergeQueue;
// }

// export async function getNotificationQueue() {
//   if (!notificationQueue) {
//     notificationQueue = await createQueue(QUEUES.NOTIFICATION);
//   }
//   return notificationQueue;
// }

// // Export connection - use the singleton
// export { getConnection };

// // Graceful shutdown
// process.on('SIGTERM', async () => {
//   console.log('SIGTERM received, closing queues...');
//   try {
//     const queues = await Promise.all([
//       getMessageOutboundQueue(),
//       getMessageStatusQueue(),
//       getWebhookProcessQueue(),
//       getConversationMergeQueue(),
//       getNotificationQueue(),
//     ]);
//     await Promise.all(queues.map(q => q.close()));
//     console.log('✅ Queues closed gracefully');
//     process.exit(0);
//   } catch (error) {
//     console.error('Error during shutdown:', error);
//     process.exit(1);
//   }
// });

















import { Queue } from 'bullmq';
import { getRedisClient } from '../../config/redis.js';

// ======================================================
// Use the singleton Redis connection pattern but
// create a *duplicate connection per queue* to isolate
// timeouts and prevent shared connection locks.
// ======================================================

let bullConnection = null;
async function getConnection() {
  // ✅ Reuse a single BullMQ connection
  if (globalThis.__bullConnection && globalThis.__bullConnection.status === 'ready') {
    return globalThis.__bullConnection;
  }

  // ✅ Use singleton Redis client directly - NO DUPLICATE to save connections
  // BullMQ can work with a single connection, we just need to ensure maxRetriesPerRequest is set
  const baseClient = await getRedisClient();
  if (!baseClient) {
    throw new Error('Redis connection unavailable for BullMQ');
  }

  // Wait for connection to be ready
  if (baseClient.status !== 'ready' && baseClient.status !== 'connect') {
    // Wait a bit for connection to establish
    await new Promise((resolve) => {
      if (baseClient.status === 'ready' || baseClient.status === 'connect') {
        resolve();
      } else {
        const checkInterval = setInterval(() => {
          if (baseClient.status === 'ready' || baseClient.status === 'connect') {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 5000);
      }
    });
  }

  if (baseClient.status !== 'ready' && baseClient.status !== 'connect') {
    throw new Error('Redis connection unavailable for BullMQ');
  }

  // ✅ CRITICAL: Reuse singleton connection directly - NO DUPLICATE
  // The singleton already has maxRetriesPerRequest=null set, so BullMQ can use it directly
  // This saves one connection per queue/worker
  bullConnection = baseClient;
  globalThis.__bullConnection = bullConnection;

  try {
    const pingResult = await bullConnection.ping();
    // Only log on first connection
    if (!globalThis.__bullConnectionLogged) {
      console.log('✅ BullMQ reusing singleton Redis connection (saving one connection)');
      console.log('✅ BullMQ Redis connection verified:', pingResult);
      globalThis.__bullConnectionLogged = true;
    }
  } catch (e) {
    console.warn('⚠️ BullMQ ping failed');
  }
  return bullConnection;
}

// ======================================================
// Queue Names
// ======================================================
export const QUEUES = {
  MESSAGE_OUTBOUND: 'message_outbound',
  MESSAGE_STATUS: 'message_status', 
  WEBHOOK_PROCESS: 'webhook_process',
  CONVERSATION_MERGE: 'conversation_merge',
  NOTIFICATION: 'notification',
  CONTACT_IMPORT: 'contact_import',
  DEAL_IMPORT: 'deal_import',
};

// ======================================================
// Queue Factory
// Creates each queue with its own connection
// ======================================================
const createQueue = async (name) => {
  const connection = await getConnection();

  console.log(`🔧 Creating queue ${name} with Redis:`, {
    host: connection.options.host,
    port: connection.options.port,
    status: connection.status,
  });

  return new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        count: 1000,
        age: 24 * 3600, // 24 hours
      },
      removeOnFail: {
        count: 5000,
        age: 7 * 24 * 3600, // 7 days
      },
    },
  });
};

// ======================================================
// Lazy Initialization for Each Queue
// ======================================================
let messageOutboundQueue = null;
let messageStatusQueue = null;
let webhookProcessQueue = null;
let conversationMergeQueue = null;
let notificationQueue = null;
let contactImportQueue = null;
let dealImportQueue = null;

export async function getMessageOutboundQueue() {
  if (!messageOutboundQueue) {
    console.log('📤 Initializing message outbound queue...');
    messageOutboundQueue = await createQueue(QUEUES.MESSAGE_OUTBOUND);
    console.log('✅ Message outbound queue connected');
  }
  return messageOutboundQueue;
}

export async function getMessageStatusQueue() {
  if (!messageStatusQueue) {
    console.log('📡 Initializing message status queue...');
    messageStatusQueue = await createQueue(QUEUES.MESSAGE_STATUS);
    console.log('✅ Message status queue connected');
  }
  return messageStatusQueue;
}

export async function getWebhookProcessQueue() {
  if (!webhookProcessQueue) {
    console.log('📥 Initializing webhook process queue...');
    webhookProcessQueue = await createQueue(QUEUES.WEBHOOK_PROCESS);
    console.log('✅ Webhook process queue connected');
  }
  return webhookProcessQueue;
}

export async function getConversationMergeQueue() {
  if (!conversationMergeQueue) {
    console.log('🤝 Initializing conversation merge queue...');
    conversationMergeQueue = await createQueue(QUEUES.CONVERSATION_MERGE);
    console.log('✅ Conversation merge queue connected');
  }
  return conversationMergeQueue;
}

export async function getNotificationQueue() {
  if (!notificationQueue) {
    console.log('🔔 Initializing notification queue...');
    notificationQueue = await createQueue(QUEUES.NOTIFICATION);
    console.log('✅ Notification queue connected');
  }
  return notificationQueue;
}

export async function getContactImportQueue() {
  if (!contactImportQueue) {
    console.log('📥 Initializing contact import queue...');
    contactImportQueue = await createQueue(QUEUES.CONTACT_IMPORT);
    console.log('✅ Contact import queue connected');
  }
  return contactImportQueue;
}

export async function getDealImportQueue() {
  if (!dealImportQueue) {
    console.log('📥 Initializing deal import queue...');
    dealImportQueue = await createQueue(QUEUES.DEAL_IMPORT);
    console.log('✅ Deal import queue connected');
  }
  return dealImportQueue;
}

// ======================================================
// Graceful Shutdown for All Queues
// ======================================================
async function closeAllQueues() {
  console.log('🛑 Closing all BullMQ queues...');
  const queues = [
    messageOutboundQueue,
    messageStatusQueue,
    webhookProcessQueue,
    conversationMergeQueue,
    notificationQueue,
    contactImportQueue,
    dealImportQueue,
  ].filter(Boolean);

  for (const q of queues) {
    try {
      await q.close();
      console.log(`✅ Closed queue: ${q.name}`);
    } catch (error) {
      console.error(`❌ Failed to close queue ${q.name}:`, error.message);
    }
  }
  console.log('✅ All queues closed gracefully');
}

// ======================================================
// Signal Handlers for Graceful Shutdown
// ======================================================
process.on('SIGTERM', async () => {
  console.log('📥 SIGTERM received, closing queues...');
  await closeAllQueues();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📥 SIGINT (Ctrl+C) received, closing queues...');
  await closeAllQueues();
  process.exit(0);
});

// ======================================================
// Export
// ======================================================
export { getConnection, closeAllQueues };
