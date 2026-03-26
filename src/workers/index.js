// // src/workers/index.js
// /**
//  * Master Worker Process
//  */

// // ✅ Load environment variables from .env.local (supports ESM)
// import dotenv from 'dotenv';
// import path from 'path';
// import { fileURLToPath } from 'url';

// // Fix __dirname in ESM
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Load .env.local manually (change to .env if you prefer)
// dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

// import { startMessageOutboundWorker } from './messageOutboundWorker.js';
// import { startWebhookWorker } from './webhookWorker.js';
// import { connectDB } from '../config/database.js';
// import { waitForRedis } from '../config/redis.js';

// const workers = [];

// /**
//  * Initialize database connection for workers
//  */
// async function initializeDatabase() {
//   try {
//     console.log('🗄️ Initializing database connection for workers...');
//     await connectDB();
//     console.log('✅ Database connected for workers');
//   } catch (error) {
//     console.error('❌ Failed to connect to database:', error);
//     throw error;
//   }
// }

// /**
//  * Initialize Redis connection for workers
//  */
// async function initializeRedis() {
//   try {
//     console.log('🔌 Initializing Redis connection for workers...');
//     const redisReady = await waitForRedis(5, 2000); // 5 attempts, 2-second delay

//     if (!redisReady) {
//       console.warn('⚠️ Redis not available, workers will start but may not function properly');
//       return false;
//     }

//     console.log('✅ Redis connected for workers');
//     return true;
//   } catch (error) {
//     console.error('❌ Failed to initialize Redis:', error);
//     return false;
//   }
// }

// /**
//  * Start all workers
//  */
// async function startAllWorkers() {
//   console.log('🚀 Starting OmniConnect Workers...\n');

//   try {
//     // Initialize database first
//     await initializeDatabase();

//     // Initialize Redis
//     await initializeRedis();

//     // Start Message Outbound Worker
//     const messageWorker = await startMessageOutboundWorker();
//     workers.push(messageWorker);

//     // Start Webhook Processing Worker
//     const webhookWorker = await startWebhookWorker();
//     workers.push(webhookWorker);

//     console.log('\n✅ All workers started successfully!\n');
//     console.log('Workers running:');
//     console.log('  - Message Outbound (concurrency: 5)');
//     console.log('  - Webhook Processing (concurrency: 10)');
//     console.log('\nPress Ctrl+C to stop\n');

//   } catch (error) {
//     console.error('❌ Failed to start workers:', error);
//     process.exit(1);
//   }
// }

// /**
//  * Graceful shutdown
//  */
// async function shutdown() {
//   console.log('\n🛑 Shutting down workers...');

//   try {
//     await Promise.all(workers.map(worker => worker?.close?.()));
//     console.log('✅ All workers stopped gracefully');
//     process.exit(0);
//   } catch (error) {
//     console.error('❌ Error during shutdown:', error);
//     process.exit(1);
//   }
// }

// // Handle shutdown signals
// process.on('SIGTERM', shutdown);
// process.on('SIGINT', shutdown);

// // Handle uncaught errors
// process.on('uncaughtException', (error) => {
//   console.error('💥 Uncaught Exception:', error);
//   shutdown();
// });

// process.on('unhandledRejection', (reason, promise) => {
//   console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
// });

// // Start workers
// startAllWorkers();




// src/workers/index.js
/**
 * Central worker initialization
 * Start all background workers for the application
 */

import { startMessageOutboundWorker } from './messageOutboundWorker.js';
import { startWebhookWorker } from './webhookWorker.js';
import { startIMAPEmailWorker } from './imapEmailWorker.js';
import { getEuroSMSStatusService } from '../services/channel/eurosms/EuroSMSStatusService.js';
import { createContactImportWorker } from './contactImportWorker.js';
import { createDealImportWorker } from './dealImportWorker.js';
import { startAutomationWorker, stopAutomationWorker } from './automationWorker.js';
import { createPendingLoadWorker, stopPendingLoadWorker } from './pendingLoadWorker.js';
import queueProcessor from './queueProcessor.js';

let workers = [];

/**
 * Start all workers
 */
export async function startWorkers() {
  try {
    console.log('🚀 Starting all workers...');

    // Start outbound message worker
    const outboundWorker = await startMessageOutboundWorker();
    workers.push(outboundWorker);
    console.log('✅ Outbound message worker started');

    // Start webhook processing worker
    const webhookWorker = await startWebhookWorker();
    workers.push(webhookWorker);
    console.log('✅ Webhook worker started');

    // ✅ Start IMAP email polling worker
    const imapWorker = await startIMAPEmailWorker();
    workers.push(imapWorker);
    console.log('✅ IMAP email polling worker started');

    // ✅ Start EuroSMS Status Checking Service
    const eurosmsStatusService = getEuroSMSStatusService();
    eurosmsStatusService.start();
    console.log('✅ EuroSMS Status Checking Service started');

    // ✅ Start Automation Worker
    const automationWorker = await startAutomationWorker();
    workers.push(automationWorker);
    console.log('✅ Automation worker started');

    // ✅ Start Queue Processor (monitors bot-generated tasks)
    await queueProcessor.start();
    console.log('✅ Queue processor started (monitoring bot tasks)');

    // ✅ Contact and Deal Import Workers are now lazy-loaded (only started when needed)
    // They will be created automatically when a job is queued
    // This prevents unnecessary resource usage when not in use
    console.log('ℹ️ Contact and Deal import workers will be started automatically when needed');
    
    // ✅ Pending Load Worker is lazy-loaded (only started when needed)
    console.log('ℹ️ Pending load worker will be started automatically when needed');

    console.log('🎉 All workers started successfully');
    return workers;
  } catch (error) {
    console.error('❌ Failed to start workers:', error);
    throw error;
  }
}

/**
 * Stop all workers gracefully
 */
export async function stopWorkers() {
  console.log('🛑 Stopping all workers...');
  
  // Stop Queue Processor
  try {
    await queueProcessor.stop();
    console.log('✅ Queue processor stopped');
  } catch (error) {
    console.error('❌ Failed to stop queue processor:', error);
  }
  
  // Stop EuroSMS Status Service
  try {
    const eurosmsStatusService = getEuroSMSStatusService();
    eurosmsStatusService.stop();
    console.log('✅ EuroSMS Status Service stopped');
  } catch (error) {
    console.error('❌ Failed to stop EuroSMS Status Service:', error);
  }
  
  // Stop Automation Worker
  try {
    await stopAutomationWorker();
  } catch (error) {
    console.error('❌ Failed to stop automation worker:', error);
  }
  
  // Stop Pending Load Worker
  try {
    await stopPendingLoadWorker();
  } catch (error) {
    console.error('❌ Failed to stop pending load worker:', error);
  }
  
  for (const worker of workers) {
    try {
      await worker.close();
      console.log('✅ Worker stopped');
    } catch (error) {
      console.error('❌ Failed to stop worker:', error);
    }
  }
  
  workers = [];
  console.log('🛑 All workers stopped');
}

/**
 * Handle graceful shutdown
 */
export function setupGracefulShutdown() {
  process.on('SIGTERM', async () => {
    console.log('📥 SIGTERM received, shutting down gracefully...');
    await stopWorkers();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('📥 SIGINT received, shutting down gracefully...');
    await stopWorkers();
    process.exit(0);
  });
}