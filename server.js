


// server.js - AUTO-START WORKERS WITH SERVER
// ✅ Load environment variables from .env.local first (highest priority)
import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local first (highest priority), then .env
// override: true ensures .env.local values overwrite any PM2/system cached env vars
dotenv.config({ path: resolve(__dirname, ".env.local"), override: true });
dotenv.config({ path: resolve(__dirname, ".env") });

import { createServer } from "http";
import next from "next";
import SocketManager from "./src/services/socket/SocketManager.js";
import { 
  getRedisClient, 
  waitForRedis, 
  shutdownRedis, 
  checkRedisHealth 
} from "./src/config/redis.js";
import {
  startMessageOutboundWorker
} from "./src/workers/messageOutboundWorker.js";
import {
  startWebhookWorker
} from "./src/workers/webhookWorker.js";
import {
  startEmailInboundWorker
} from "./src/workers/emailInboundWorker.js";
import { closeRabbitMQ } from "./src/lib/queue/rabbitmq.js"; // ✅ RabbitMQ shutdown

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

// ✅ Log the port being used for debugging
console.log(`🔧 Environment Configuration:`);
console.log(`   - NODE_ENV: ${process.env.NODE_ENV || "development"}`);
console.log(`   - PORT: ${port} (from ${process.env.PORT ? "environment" : "default"})`);
console.log(`   - HOSTNAME: ${hostname}`);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let server = null;
let isShuttingDown = false;
let messageWorker = null;
let webhookWorker = null;
let imapWorker = null; // IMAP email IDLE worker (real-time)
let queueWorker = null; // Queue worker for bot-generated tasks
let healthCheckInterval = null; // Bug 5: Worker health monitoring interval

async function startServer() {
  try {
    console.log("⏳ Preparing Next.js and initializing services...");
    await app.prepare();
    console.log("✅ Next.js app prepared");

    // ✅ Redis removed - no longer needed for messaging or sessions
    // Sessions are now stateless (JWT-only)
    // Messaging uses RabbitMQ + Socket.IO directly
    console.log("✅ Skipping Redis initialization (not needed)");
    
    // ✅ Initialize RabbitMQ
    console.log("🔧 Initializing RabbitMQ connection...");
    try {
      const { initRabbitMQ } = await import('./src/lib/queue/rabbitmq.js');
      await initRabbitMQ();
      console.log("✅ RabbitMQ initialized successfully");
    } catch (rabbitmqError) {
      console.error("❌ Failed to initialize RabbitMQ:", rabbitmqError);
      console.error("⚠️ Workers will NOT start without RabbitMQ!");
      console.error("Please check:");
      console.error("  1. CLOUDAMQP_URL environment variable (or RABBITMQ_HOST, RABBITMQ_PORT, etc.)");
      console.error("  2. RabbitMQ server is running and accessible");
      console.error("  3. Network/firewall allows connection to RabbitMQ");
    }

    // ✅ Redis removed - no longer needed
    console.log("✅ Redis removed - using RabbitMQ + Socket.IO directly");

    server = createServer(async (req, res) => {
      // ✅ Intercept large file uploads before Next.js processes them
      // This bypasses Next.js body size limits by processing the raw stream
      if (req.method === 'POST' && req.url === '/api/deals/upload') {
        try {
          const { handleRawUpload } = await import('./src/lib/upload/rawUploadHandler.js');
          await handleRawUpload(req, res);
          return; // Don't pass to Next.js handler
        } catch (error) {
          console.error("Error handling raw upload:", error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
          return;
        }
      }

      // ✅ Intercept contact import uploads before Next.js processes them
      if (req.method === 'POST' && req.url === '/api/contacts/import') {
        try {
          const { handleRawContactUpload } = await import('./src/lib/upload/rawContactUploadHandler.js');
          await handleRawContactUpload(req, res);
          return; // Don't pass to Next.js handler
        } catch (error) {
          console.error("Error handling raw contact upload:", error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
          return;
        }
      }
      
      // For all other routes, use Next.js handler
      handle(req, res).catch((err) => {
        console.error("Error handling request:", err);
        res.statusCode = 500;
        res.end("Internal Server Error");
      });
    });
    
    console.log("✅ HTTP server created");

    try {
      await SocketManager.initialize(server);
      console.log("✅ Socket.IO initialized successfully");
    } catch (socketError) {
      console.error("❌ Socket.IO initialization failed:", socketError);
    }

    await new Promise((resolve, reject) => {
      server.listen(port, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`🚀 Server ready on http://${hostname}:${port}`);
    console.log(`📥 Webhook endpoint: http://${hostname}:${port}/api/webhooks/whatsapp`);

    // ✅ AUTO-START WORKERS
    console.log("\n" + "=".repeat(60));
    console.log("🔧 WORKER STARTUP CHECK");
    console.log("=".repeat(60));
    console.log(`   - Redis: ✅ Removed (not needed)`);
    console.log(`   - RabbitMQ: ✅ Connected`);
    console.log(`   - Socket.IO: ✅ Initialized (direct mode)`);
    
    console.log("\n🔧 Starting background workers...");
    
    // ✅ Workers use RabbitMQ + Socket.IO directly (no Redis needed)
      
      // Start message outbound worker
      try {
        console.log("\n📤 [1/2] Starting message outbound worker...");
        messageWorker = await startMessageOutboundWorker();
        if (messageWorker) {
          console.log("✅ [1/2] Message outbound worker started successfully");
        } else {
          console.error("❌ [1/2] Message outbound worker returned null/undefined");
        }
      } catch (error) {
        console.error("❌ [1/2] Failed to start message worker:", {
          error: error.message,
          stack: error.stack
        });
      }

      // Start email inbound worker (processes incoming emails from IMAP queue)
      try {
        console.log("\n📧 Starting email inbound worker...");
        await startEmailInboundWorker();
        console.log("✅ Email inbound worker started (parallel email processing)");
      } catch (error) {
        console.error("❌ Failed to start email inbound worker:", error.message);
      }

      // Start webhook processing worker
      try {
        console.log("\n📥 [2/3] Starting webhook processing worker...");
        webhookWorker = await startWebhookWorker();
        if (webhookWorker) {
          console.log("✅ [2/3] Webhook worker started successfully");
          console.log(`   - Worker status: ${webhookWorker.name || 'active'}`);
          console.log(`   - Worker queue: webhook_process`);
          console.log(`   - Worker concurrency: ${process.env.WEBHOOK_WORKER_CONCURRENCY || '3'}`);
        } else {
          console.error("❌ [2/3] Webhook worker returned null/undefined");
          console.error("❌ CRITICAL: Webhook processing will NOT work!");
        }
      } catch (error) {
        console.error("❌ [2/3] Failed to start webhook worker:", {
          error: error.message,
          stack: error.stack
        });
        console.error("❌ CRITICAL: Webhook processing will NOT work!");
      }

      // ✅ Start IMAP email IDLE worker (real-time)
      try {
        console.log("\n📧 [3/4] Starting IMAP email IDLE worker (real-time)...");
        const { startIMAPEmailWorker } = await import('./src/workers/imapEmailWorker.js');
        imapWorker = await startIMAPEmailWorker();
        if (imapWorker) {
          console.log("✅ [3/4] IMAP email IDLE worker started successfully..");
          console.log(`   - Real-time email fetching via IMAP IDLE`);
          console.log(`   - No polling - emails processed immediately`);
          console.log(`   - Fetches today's emails only`);
        } else {
          console.error("❌ [3/4] IMAP worker returned null/undefined");
        }
      } catch (error) {
        console.error("❌ [3/4] Failed to start IMAP email IDLE worker:", {
          error: error.message,
          stack: error.stack
        });
        // Don't crash server if IMAP worker fails (email accounts might not be configured)
      }

      // ✅ Start Automation Worker
      try {
        console.log("\n🤖 [4/5] Starting automation worker...");
        const { startAutomationWorker } = await import('./src/workers/automationWorker.js');
        const automationWorker = await startAutomationWorker();
        if (automationWorker) {
          console.log("✅ [4/5] Automation worker started successfully");
          console.log(`   - Processing scheduled/delayed automation executions`);
          console.log(`   - Queue: automation_execute`);
        } else {
          console.error("❌ [4/5] Automation worker returned null/undefined");
          console.error("❌ CRITICAL: Automation executions will NOT work!");
        }
      } catch (error) {
        console.error("❌ [4/5] Failed to start automation worker:", {
          error: error.message,
          stack: error.stack
        });
        console.error("❌ CRITICAL: Automation executions will NOT work!");
      }

      // ✅ Start Conversation Mode Worker (auto-switch manual to auto after 2min inactivity)
      try {
        console.log("\n🔄 [5/6] Starting conversation mode worker...");
        const { startConversationModeWorker } = await import('./src/workers/conversationModeWorker.js');
        await startConversationModeWorker();
        console.log("✅ [5/6] Conversation mode worker started successfully");
        console.log(`   - Processing delayed mode checks via RabbitMQ`);
        console.log(`   - Auto-switching to auto mode after 2 minutes of inactivity`);
      } catch (error) {
        console.error("❌ [5/6] Failed to start conversation mode worker:", {
          error: error.message,
          stack: error.stack
        });
      }

      // ✅ Contact and Deal Import Workers are now lazy-loaded
      // They will be automatically created when a job is queued to their respective queues
      // This prevents unnecessary resource usage and Redis connection overhead
      console.log("\n📥 [5/6] Contact and Deal import workers configured for lazy loading");
      console.log("   - Workers will start automatically when import jobs are queued");
      console.log("   - No resources consumed until actually needed");
      
      // ✅ Start Pending Load Worker automatically (processes contacts/deals from API)
      try {
        console.log("\n📦 [6/8] Starting pending load worker...");
        const { createPendingLoadWorker } = await import('./src/workers/pendingLoadWorker.js');
        const pendingLoadWorker = await createPendingLoadWorker();
        if (pendingLoadWorker) {
          console.log("✅ [6/8] Pending load worker started successfully");
          console.log("   - Processing pending loads (contacts/deals) from API");
          console.log("   - Queue: pending_load");
        } else {
          console.error("❌ [6/8] Pending load worker returned null/undefined");
        }
      } catch (error) {
        console.error("❌ [6/8] Failed to start pending load worker:", {
          error: error.message,
          stack: error.stack
        });
      }

      // ✅ Start Queue Worker (RabbitMQ consumer for bot tasks)
      try {
        console.log("\n⚡ [7/8] Starting queue worker (bot tasks)...");
        const { createQueueWorker } = await import('./src/workers/queueWorker.js');
        queueWorker = await createQueueWorker();
        console.log("✅ [7/8] Queue worker started successfully");
        console.log("   - Processing bot-generated queue items via RabbitMQ");
        console.log("   - Queue: bot_queue");
        console.log("   - Zero server load (background processing)");
      } catch (error) {
        console.error("❌ [7/8] Failed to start queue worker:", {
          error: error.message,
          stack: error.stack
        });
      }

      // ✅ Start Queue Monitor (publishes pending items to RabbitMQ)
      try {
        console.log("\n👁️ [8/8] Starting queue monitor...");
        const { startQueueMonitor } = await import('./src/workers/queueWorker.js');
        await startQueueMonitor();
        console.log("✅ [8/8] Queue monitor started successfully");
        console.log("   - Monitors pending queue items every 2 seconds");
        console.log("   - Publishes to RabbitMQ for processing");
      } catch (error) {
        console.error("❌ [8/8] Failed to start queue monitor:", {
          error: error.message,
          stack: error.stack
        });
      }
      
      console.log("\n" + "=".repeat(60));
      console.log("✅ WORKER STARTUP COMPLETE");
      console.log("=".repeat(60));

    // Bug 5: Start worker health monitoring
    startWorkerHealthCheck();
    console.log("✅ Worker health check started (60s interval)");

    setupShutdownHandlers();

  } catch (error) {
    console.error("❌ Server startup failed:", error);
    await cleanup();
    process.exit(1);
  }
}

/**
 * Bug 5: Worker health monitoring
 * Checks every 60 seconds if critical workers are still alive.
 * If a worker's consumer channel is dead, attempts to restart it.
 */
function startWorkerHealthCheck() {
  healthCheckInterval = setInterval(async () => {
    if (isShuttingDown) return;

    try {
      // Check message outbound worker
      if (messageWorker && messageWorker.channel && messageWorker.channel.connection === null) {
        console.warn("[HealthCheck] Message outbound worker is dead, restarting...");
        try {
          const { stopMessageOutboundWorker, startMessageOutboundWorker: restartMsgWorker } = await import('./src/workers/messageOutboundWorker.js');
          try { await stopMessageOutboundWorker(); } catch (_) {}
          messageWorker = await restartMsgWorker();
          console.log("[HealthCheck] Message outbound worker restarted");
        } catch (err) {
          console.error("[HealthCheck] Failed to restart message worker:", err.message);
        }
      }

      // Check webhook worker
      if (webhookWorker && webhookWorker.channel && webhookWorker.channel.connection === null) {
        console.warn("[HealthCheck] Webhook worker is dead, restarting...");
        try {
          const { stopWebhookWorker: stopWh, startWebhookWorker: restartWh } = await import('./src/workers/webhookWorker.js');
          try { await stopWh(); } catch (_) {}
          webhookWorker = await restartWh();
          console.log("[HealthCheck] Webhook worker restarted");
        } catch (err) {
          console.error("[HealthCheck] Failed to restart webhook worker:", err.message);
        }
      }

      // Check queue worker
      if (queueWorker && queueWorker.channel && queueWorker.channel.connection === null) {
        console.warn("[HealthCheck] Queue worker is dead, restarting...");
        try {
          const { createQueueWorker } = await import('./src/workers/queueWorker.js');
          queueWorker = await createQueueWorker();
          console.log("[HealthCheck] Queue worker restarted");
        } catch (err) {
          console.error("[HealthCheck] Failed to restart queue worker:", err.message);
        }
      }
    } catch (error) {
      console.error("[HealthCheck] Error during health check:", error.message);
    }
  }, 60000); // Check every 60 seconds
}

function setupShutdownHandlers() {
  process.on("SIGTERM", async () => {
    console.log("\n📥 SIGTERM signal received");
    await gracefulShutdown("SIGTERM");
  });

  process.on("SIGINT", async () => {
    console.log("\n📥 SIGINT signal received (Ctrl+C)");
    await gracefulShutdown("SIGINT");
  });

  console.log("✅ Shutdown handlers registered");
}

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`🛑 Graceful shutdown initiated (${signal})`);

  // Bug 5: Stop health check
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }

  const forceShutdownTimer = setTimeout(() => {
    console.error("\n⚠️ Forced shutdown after timeout");
    process.exit(1);
  }, 30000);

  try {
    // ✅ Stop RabbitMQ workers first
    if (messageWorker) {
      console.log("Stopping message worker...");
      const { stopMessageOutboundWorker } = await import('./src/workers/messageOutboundWorker.js');
      await stopMessageOutboundWorker();
    }
    if (webhookWorker) {
      console.log("Stopping webhook worker...");
      const { stopWebhookWorker } = await import('./src/workers/webhookWorker.js');
      await stopWebhookWorker();
    }
    // Stop email inbound worker
    try {
      const { stopEmailInboundWorker } = await import('./src/workers/emailInboundWorker.js');
      await stopEmailInboundWorker();
    } catch (e) { /* ignore if not started */ }
    // Stop IMAP worker if it exists
    if (typeof imapWorker?.stop === 'function') {
        console.log("Stopping IMAP email IDLE worker...");
      await imapWorker.stop();
    }
    // ✅ Stop Automation worker
    try {
      console.log("Stopping automation worker...");
      const { stopAutomationWorker } = await import('./src/workers/automationWorker.js');
      await stopAutomationWorker();
    } catch (error) {
      console.error("❌ Error stopping automation worker:", error);
    }

    // ✅ Stop Queue Worker and Monitor
    try {
      console.log("Stopping queue worker and monitor...");
      const { stopQueueMonitor } = await import('./src/workers/queueWorker.js');
      await stopQueueMonitor();
      
      if (queueWorker && typeof queueWorker.close === 'function') {
        await queueWorker.close();
      }
    } catch (error) {
      console.error("❌ Error stopping queue worker:", error);
    }

    // ✅ Stop Conversation Mode Worker
    try {
      console.log("Stopping conversation mode worker...");
      const { stopConversationModeWorker } = await import('./src/workers/conversationModeWorker.js');
      await stopConversationModeWorker();
    } catch (error) {
      console.error("❌ Error stopping conversation mode worker:", error);
    }

    // ✅ Close all BullMQ queues (fixes lingering Redis clients)
    await closeRabbitMQ();

    if (server) {
      await new Promise((resolve) => {
        server.close(() => resolve());
      });
    }

    await SocketManager.shutdown();
    // ✅ Redis removed - no shutdown needed

    clearTimeout(forceShutdownTimer);
    console.log("✅ Graceful shutdown complete");
    process.exit(0);

  } catch (error) {
    console.error("❌ Error during shutdown:", error);
    clearTimeout(forceShutdownTimer);
    process.exit(1);
  }
}

async function cleanup() {
  console.log("\n🧹 Cleaning up...");
  try {
    // ✅ Stop RabbitMQ workers
    if (messageWorker) {
      const { stopMessageOutboundWorker } = await import('./src/workers/messageOutboundWorker.js');
      await stopMessageOutboundWorker();
    }
    if (webhookWorker) {
      const { stopWebhookWorker } = await import('./src/workers/webhookWorker.js');
      await stopWebhookWorker();
    }
    if (server) await new Promise((resolve) => server.close(() => resolve()));
    await SocketManager.shutdown();
    await closeRabbitMQ(); // ✅ Added for cleanup consistency
    // ✅ Redis removed - no shutdown needed
    console.log("✅ Cleanup complete");
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
  }
}

startServer();

export { server, gracefulShutdown };

