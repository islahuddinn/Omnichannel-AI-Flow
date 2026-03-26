// src/config/redis.js
/**
 * ✅ Professional Redis Connection Manager
 * - Connects ONCE on server start
 * - Keeps connection alive at all times
 * - Auto-reconnects instantly if disconnected
 * - NEVER creates new connections on message operations
 * - Singleton pattern with connection reuse
 * - Connection monitoring and limits
 * - Proper cleanup on shutdown
 */

import IORedis from "ioredis";
import { lookup } from 'dns';

// ✅ Singleton Redis client - created once on server start
let redisClient = null;
let isInitialized = false;
let isConnecting = false;
let heartbeatInterval = null;
let reconnectTimeout = null;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 10;

// ✅ Connection tracking for monitoring
let connectionCount = 0;
let duplicateConnections = new Set(); // Track duplicate connections
const MAX_DUPLICATE_CONNECTIONS = 5; // Maximum allowed duplicate connections (for Socket.IO, etc.)
let heartbeatCount = 0; // Counter for periodic logging

// ✅ Connection state tracking
let connectionState = {
  status: 'disconnected',
  lastConnected: null,
  lastError: null,
  reconnectAttempts: 0,
};

/**
 * ✅ Initialize Redis connection ONCE on server start
 * This should be called only once when the server starts
 */
export async function initRedis() {
  // ✅ CRITICAL: Prevent multiple initializations - check FIRST
  if (isInitialized && redisClient && (redisClient.status === 'ready' || redisClient.status === 'connect')) {
    console.log('✅ Redis already initialized and ready, reusing existing connection');
    return redisClient;
  }

  // ✅ CRITICAL: Prevent concurrent initialization
  if (isConnecting) {
    console.log('⏳ Redis initialization already in progress, waiting...');
    let attempts = 0;
    while (isConnecting && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (redisClient && (redisClient.status === 'ready' || redisClient.status === 'connect')) {
      console.log('✅ Redis connection ready after waiting');
      return redisClient;
    }
  }

  // ✅ CRITICAL: Check if already connecting/connected - don't create new
  if (redisClient && (redisClient.status === 'connecting' || redisClient.status === 'ready' || redisClient.status === 'connect')) {
    console.log(`✅ Redis client already exists with status: ${redisClient.status}, reusing`);
    return redisClient;
  }
  
  // ✅ CRITICAL: If client exists but is disconnected, let IORedis handle reconnection automatically
  // Don't manually call connect() - IORedis retryStrategy will handle it
  if (redisClient && (redisClient.status === 'end' || redisClient.status === 'close' || redisClient.status === 'disconnected')) {
    // ✅ IORedis will automatically reconnect via retryStrategy
    // Just return the existing client - IORedis will reconnect it
    if (Math.random() < 0.1) {
      console.log('🔄 Redis client exists but disconnected, IORedis will reconnect automatically...');
    }
    return redisClient;
  }

  try {
    isConnecting = true;

    const redisConfig = {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT),
      username: process.env.REDIS_USERNAME || undefined,
      password: process.env.REDIS_PASSWORD || undefined,

      // ✅ CRITICAL: Keep-alive settings to prevent idle disconnections
      connectTimeout: 30000,
      commandTimeout: 60000,
      keepAlive: 15000, // TCP keep-alive every 15 seconds (more aggressive)
      enableReadyCheck: true,
      lazyConnect: false, // ✅ Connect immediately on creation
      // ✅ Additional TCP keep-alive options for idle connections
      socketKeepalive: true,
      socketKeepaliveInitialDelay: 10000, // Start keep-alive after 10 seconds
      // ✅ Connection pool settings
      // ✅ CRITICAL: Set maxRetriesPerRequest=null for BullMQ compatibility
      // This allows BullMQ to reuse the singleton connection without duplicating
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
      enableAutoPipelining: false, // Disable auto-pipelining to prevent connection issues
      autoResendUnfulfilledCommands: true,
      autoResubscribe: true,
      
      // ✅ Performance optimizations
      showFriendlyErrorStack: process.env.NODE_ENV === 'development',
      family: 4,
      dnsLookup: lookup,

      // ✅ Retry strategy (exponential backoff with max 10 attempts)
      retryStrategy: (times) => {
        if (times > MAX_CONNECTION_ATTEMPTS) {
          console.error(`❌ Max Redis retry attempts (${MAX_CONNECTION_ATTEMPTS}) reached`);
          return null; // Stop retrying
        }
        const delay = Math.min(Math.pow(2, times - 1) * 1000, 30000);
        // ✅ Suppress excessive reconnect logs
        if (times <= 3 && Math.random() < 0.3) {
          console.warn(`🔄 Redis reconnect attempt ${times}/${MAX_CONNECTION_ATTEMPTS}, retrying in ${delay}ms`);
        }
        connectionState.reconnectAttempts = times;
        return delay;
      },

      // ✅ Reconnect on network errors
      reconnectOnError: (err) => {
        const shouldReconnect = 
          err.message.includes("ECONNREFUSED") ||
          err.message.includes("ETIMEDOUT") ||
          err.message.includes("ECONNRESET") ||
          err.message.includes("EAI_AGAIN") ||
          err.message.includes("EPIPE");
        
        // ✅ Suppress excessive reconnect logs
        if (shouldReconnect && Math.random() < 0.1) {
          console.warn("⚠️ Redis will reconnect after error:", err.message);
        }
        return shouldReconnect;
      },
    };


    // ✅ Create Redis client
    redisClient = new IORedis(redisConfig);

    // ===== Event Handlers =====

    redisClient.on("connect", () => {
      connectionAttempts = 0;
      connectionState.status = 'connecting';
    });

    redisClient.on("ready", () => {
      connectionAttempts = 0;
      connectionState.status = 'ready';
      connectionState.lastConnected = new Date();
      connectionState.lastError = null;
      connectionState.reconnectAttempts = 0;
      isInitialized = true;
      isConnecting = false;
      
      // ✅ Start heartbeat to keep connection alive (every 30s)
      startHeartbeat();
      
      // ✅ Clear any reconnect timeout
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
    });

    redisClient.on("error", (err) => {
      // Filter out benign errors
      if (err.message.includes("client|setinfo")) return;

      connectionState.lastError = err.message;
      
      // Suppress timeout errors - they're handled by retry logic
      if (err.message.includes("Command timed out")) {
        if (Math.random() < 0.1) {
          console.warn("⚠️ Redis timeout (handled by retry):", err.message);
        }
        return;
      }

      // ✅ Only log critical errors, suppress network errors (handled by retry)
      if (err.message.includes("WRONGPASS")) {
        console.error("❌ Redis authentication failed — check REDIS_PASSWORD");
      } else if (err.message.includes("max number of clients reached")) {
        // ✅ Suppress excessive "max clients" errors
        if (Math.random() < 0.1) {
          console.error("❌ Redis max clients reached");
        }
      } else if (err.message.includes("ECONNREFUSED")) {
        // ✅ Suppress excessive connection refused errors
        if (Math.random() < 0.1) {
        console.error("❌ Redis connection refused — is Redis running?");
        }
      } else if (err.message.includes("ETIMEDOUT") || err.message.includes("ECONNRESET") || err.message.includes("EPIPE")) {
        // Network errors are handled by retry logic, don't log
        return;
      } else {
        // ✅ Suppress other errors (likely handled by retry)
        if (Math.random() < 0.05) {
        console.error("❌ Redis error:", err.message);
        }
      }
    });

    redisClient.on("close", () => {
      connectionState.status = 'closed';
      isInitialized = false;
      // ✅ Suppress excessive "connection closed" logs
      if (Math.random() < 0.1) {
      console.warn("⚠️ Redis connection closed");
      }
      stopHeartbeat();
      // ✅ Auto-reconnect if not shutting down
      // But don't create new connection - reuse existing client
      if (connectionState.status !== 'shutting_down') {
        scheduleReconnect();
      }
    });

    redisClient.on("reconnecting", (delay) => {
      connectionAttempts++;
      connectionState.status = 'reconnecting';
    });

    redisClient.on("end", () => {
      connectionState.status = 'ended';
      isInitialized = false;
      stopHeartbeat();
      // ✅ Auto-reconnect if not shutting down
      if (connectionState.status !== 'shutting_down') {
        scheduleReconnect();
      }
    });

    // ✅ Wait for connection to be established
    await redisClient.connect();
    
    return redisClient;

  } catch (error) {
    // ✅ Check if error is because Redis is already connecting/connected
    if (error.message.includes("already connecting") || error.message.includes("already connected")) {
      isConnecting = false;
      // Wait a bit and return existing client
      await new Promise(resolve => setTimeout(resolve, 100));
      if (redisClient && (redisClient.status === 'ready' || redisClient.status === 'connect')) {
        return redisClient;
      }
    }
    
    isConnecting = false;
    connectionState.lastError = error.message;
    
    // ✅ Schedule reconnect attempt
    scheduleReconnect();

    return null;
  }
}

/**
 * ✅ Get Redis client - returns existing connection, NEVER creates new one
 * This should be used throughout the codebase for all Redis operations
 */
export async function getRedisClient() {
  // ✅ Return existing ready/connected client immediately
  if (redisClient && (redisClient.status === 'ready' || redisClient.status === 'connect')) {
    return redisClient;
  }

  // ✅ If connecting, wait for it
  if (redisClient && redisClient.status === 'connecting') {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout'));
      }, 15000);

      redisClient.once("ready", () => {
        clearTimeout(timeout);
        resolve(redisClient);
      });

      redisClient.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  // ✅ If not initialized, initialize now (fallback for edge cases)
  if (!isInitialized && !isConnecting) {
    return await initRedis();
  }

  // ✅ If disconnected, return null (don't create new connection)
  return null;
}

/**
 * ✅ Create a duplicate connection (for Socket.IO adapter, etc.)
 * This should ONLY be used when absolutely necessary (e.g., Socket.IO pub/sub)
 * Returns null if connection limit is reached
 */
export async function createDuplicateConnection() {
  // ✅ Check connection limit
  if (duplicateConnections.size >= MAX_DUPLICATE_CONNECTIONS) {
    console.error(`❌ Maximum duplicate connections (${MAX_DUPLICATE_CONNECTIONS}) reached. Cannot create more.`);
    console.error(`❌ Current duplicates: ${duplicateConnections.size}`);
    console.error(`❌ Please close unused duplicate connections before creating new ones.`);
    return null;
  }

  const baseClient = await getRedisClient();
  if (!baseClient) {
    console.error('❌ Cannot create duplicate connection - base client not available');
    return null;
  }

  try {
    const duplicate = baseClient.duplicate();
    duplicateConnections.add(duplicate);
    connectionCount++;
    
    // ✅ Track when duplicate is closed
    duplicate.once('end', () => {
      duplicateConnections.delete(duplicate);
      connectionCount--;
      console.log(`✅ Duplicate connection closed. Remaining: ${duplicateConnections.size}`);
    });
    
    duplicate.once('close', () => {
      duplicateConnections.delete(duplicate);
      connectionCount--;
    });
    
    console.log(`✅ Duplicate connection created. Total duplicates: ${duplicateConnections.size}/${MAX_DUPLICATE_CONNECTIONS}`);
    return duplicate;
  } catch (error) {
    console.error('❌ Failed to create duplicate connection:', error.message);
    return null;
  }
}

/**
 * ✅ Get connection statistics for monitoring
 */
export function getConnectionStats() {
  return {
    mainConnection: redisClient ? {
      status: redisClient.status,
      exists: true
    } : { exists: false },
    duplicateConnections: duplicateConnections.size,
    maxDuplicates: MAX_DUPLICATE_CONNECTIONS,
    totalConnections: 1 + duplicateConnections.size, // 1 main + duplicates
    connectionState
  };
}

/**
 * ✅ Start heartbeat to keep connection alive
 */
function startHeartbeat() {
  // ✅ CRITICAL: Stop existing heartbeat if any to prevent duplicates
  stopHeartbeat();
  
  // ✅ CRITICAL: Don't start heartbeat if client doesn't exist or isn't ready
  if (!redisClient || (redisClient.status !== 'ready' && redisClient.status !== 'connect')) {
    return;
  }
  
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;
  
  heartbeatInterval = setInterval(async () => {
    try {
      // ✅ CRITICAL: Check connection status before ping
      if (!redisClient) {
        stopHeartbeat();
        return;
      }
      
      const status = redisClient.status;
      if (status !== 'ready' && status !== 'connect') {
        // Connection is not ready, stop heartbeat and let reconnect handle it
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          stopHeartbeat();
          // Trigger reconnect if connection is lost
          if (status === 'end' || status === 'close' || status === 'disconnected') {
            scheduleReconnect();
          }
        }
        return;
      }
      
      // ✅ Reset failure count on successful ping
      const pingResult = await Promise.race([
        redisClient.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Ping timeout')), 5000))
      ]);
      
      if (pingResult === 'PONG') {
        consecutiveFailures = 0;
        
        // ✅ Log connection stats periodically (every 30 minutes = 120 heartbeats at 15s interval)
        // Reduced frequency to avoid console spam
        heartbeatCount++;
        if (heartbeatCount % 120 === 0) {
          const stats = getConnectionStats();
          // Only log if there are issues or approaching limits
          if (stats.duplicateConnections >= MAX_DUPLICATE_CONNECTIONS * 0.8 || stats.totalConnections > 1) {
            console.log(`📊 Redis Connection Stats: ${stats.totalConnections} total (${stats.duplicateConnections} duplicates), status: ${status}`);
          }
          
          // ✅ Warn if approaching limit
          if (stats.duplicateConnections >= MAX_DUPLICATE_CONNECTIONS * 0.8) {
            console.warn(`⚠️ Redis connection limit approaching: ${stats.duplicateConnections}/${stats.maxDuplicates}`);
          }
        }
      }
    } catch (err) {
      consecutiveFailures++;
      
      // ✅ Only log warnings after multiple consecutive failures
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        // ✅ Suppress excessive warnings - only log occasionally
        if (Math.random() < 0.1) {
          console.warn(`⚠️ Redis heartbeat failed (${consecutiveFailures} consecutive failures), connection may be lost`);
        }
        
        // ✅ Stop heartbeat and trigger reconnect if connection is truly lost
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES * 2) {
          stopHeartbeat();
          if (redisClient && (redisClient.status === 'end' || redisClient.status === 'close' || redisClient.status === 'disconnected')) {
            scheduleReconnect();
          }
        }
      }
    }
  }, 15000); // ✅ Changed to 15 seconds (more aggressive to prevent idle disconnections)
}

/**
 * ✅ Stop heartbeat
 */
function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    heartbeatCount = 0;
  }
}

/**
 * ✅ Schedule automatic reconnect
 */
function scheduleReconnect() {
  // Clear existing timeout
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  // Don't reconnect if already connecting or shutting down
  if (isConnecting || connectionState.status === 'shutting_down') {
    return;
  }

  // ✅ CRITICAL: Prevent multiple reconnect attempts
  if (reconnectTimeout) {
    return; // Already scheduled
  }
  
  // Schedule reconnect after 2 seconds
  reconnectTimeout = setTimeout(async () => {
    reconnectTimeout = null; // Clear timeout reference
    
    // ✅ CRITICAL: Check if we're already connecting/connected to avoid duplicate reconnects
    if (isConnecting || connectionState.status === 'shutting_down') {
      return; // Already connecting or shutting down, don't reconnect
    }
    
    // ✅ CRITICAL: Double-check connection status before attempting reconnect
    if (redisClient && (redisClient.status === 'ready' || redisClient.status === 'connect')) {
      // Connection is actually ready, restart heartbeat
      if (!heartbeatInterval) {
        startHeartbeat();
      }
      return;
    }
    
    if (!redisClient || (redisClient.status !== 'ready' && redisClient.status !== 'connect')) {
      // ✅ Suppress excessive reconnect logs
      if (Math.random() < 0.1) {
        console.log('🔄 Attempting to reconnect Redis...');
      }
      
      try {
        // ✅ CRITICAL: Don't reset redisClient to null - reuse existing client
        // This prevents creating new connections
        if (redisClient) {
          // Try to reconnect the existing client
          try {
            const currentStatus = redisClient.status;
            if (currentStatus === 'end' || currentStatus === 'close' || currentStatus === 'disconnected' || currentStatus === 'reconnecting') {
              // Client is closed, try to reconnect
              if (!isConnecting) {
                isConnecting = true;
                // ✅ Use IORedis built-in reconnect - don't call connect() manually
                // IORedis will handle reconnection automatically via retryStrategy
                // Just wait for it to reconnect
                await new Promise((resolve) => {
                  const checkInterval = setInterval(() => {
                    if (redisClient.status === 'ready' || redisClient.status === 'connect') {
                      clearInterval(checkInterval);
                      isConnecting = false;
                      startHeartbeat(); // Restart heartbeat on successful reconnect
                      resolve();
                    } else if (redisClient.status === 'end' || redisClient.status === 'close') {
                      clearInterval(checkInterval);
                      isConnecting = false;
                      resolve();
                    }
                  }, 500);
                  
                  // Timeout after 10 seconds
                  setTimeout(() => {
                    clearInterval(checkInterval);
                    isConnecting = false;
                    resolve();
                  }, 10000);
                });
              }
            }
          } catch (reconnectError) {
            // If reconnect fails, don't create new - IORedis will handle it
            if (reconnectError.message.includes('max number of clients reached')) {
              // Don't create new connection if max clients reached
              console.error('❌ Cannot reconnect - max clients reached. Waiting...');
              isConnecting = false;
              // Schedule another attempt with longer delay
              setTimeout(() => scheduleReconnect(), 10000);
              return;
            }
            
            // ✅ Suppress excessive warnings
            if (Math.random() < 0.1) {
              console.warn('⚠️ Reconnecting existing client failed, IORedis will retry automatically');
            }
            isConnecting = false;
            // Don't create new - IORedis retryStrategy will handle it
            return;
          }
        } else {
          // Only create new if client doesn't exist
          if (!isConnecting) {
            isInitialized = false;
            isConnecting = false;
            await initRedis();
          }
        }
      } catch (error) {
        isConnecting = false;
        if (error.message.includes('max number of clients reached')) {
          console.error('❌ Cannot reconnect - max clients reached. Waiting...');
          // Schedule another attempt with longer delay
          setTimeout(() => scheduleReconnect(), 10000);
          return;
        }
        // ✅ Suppress excessive error logs
        if (Math.random() < 0.05) {
          console.error('❌ Redis reconnection failed:', error.message);
        }
        // Don't schedule another attempt immediately - let IORedis retryStrategy handle it
      }
    }
  }, 2000);
}

/**
 * ✅ Wait until Redis is ready (for server startup)
 */
export async function waitForRedis(maxAttempts = 3, delay = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = await getRedisClient();
      if (client && (client.status === "ready" || client.status === "connect")) {
        const ping = await client.ping();
        if (ping === "PONG") {
          return true;
        }
      }
    } catch (err) {
      // Silent retry
    }
    if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, delay));
  }
  return false;
}

/**
 * ✅ Redis health check
 */
export async function checkRedisHealth() {
  try {
    const client = await getRedisClient();
    if (!client) return { healthy: false, error: "No client" };

    const start = Date.now();
    const ping = await client.ping();
    const latency = Date.now() - start;
    
    const connectionStats = getConnectionStats();

    return {
      healthy: ping === "PONG",
      latency,
      status: client.status,
      connectionState,
      host: client.options.host,
      port: client.options.port,
      connections: connectionStats,
      // ✅ Warning if connection limit is approaching
      warnings: connectionStats.duplicateConnections >= MAX_DUPLICATE_CONNECTIONS * 0.8 
        ? [`Connection limit approaching: ${connectionStats.duplicateConnections}/${connectionStats.maxDuplicates}`]
        : []
    };
  } catch (err) {
    return { healthy: false, error: err.message, status: "error", connectionState };
  }
}

/**
 * ✅ Graceful Redis shutdown
 */
export async function shutdownRedis() {
  // Mark as shutting down
  connectionState.status = 'shutting_down';
  
  // Stop heartbeat
  stopHeartbeat();
  
  // Clear reconnect timeout
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  // ✅ Close all duplicate connections first
  console.log(`🛑 Closing ${duplicateConnections.size} duplicate connections...`);
  const duplicateClosePromises = Array.from(duplicateConnections).map(async (dup) => {
    try {
      await dup.quit();
    } catch (error) {
      try {
        dup.disconnect();
      } catch (_) {}
    }
  });
  
  await Promise.all(duplicateClosePromises);
  duplicateConnections.clear();
  connectionCount = 0;
  console.log('✅ All duplicate connections closed');
  
  // Close main connection
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('✅ Main Redis connection closed');
    } catch (error) {
      try {
        redisClient.disconnect();
        console.log('✅ Main Redis connection disconnected');
      } catch (_) {}
    }
    redisClient = null;
  }
  
  isInitialized = false;
  isConnecting = false;
  console.log('✅ Redis shutdown complete');
}

/**
 * ✅ Simple ready check
 */
export function isRedisReady() {
  return redisClient && (redisClient.status === "ready" || redisClient.status === "connect");
}

// Export for direct import (use getRedisClient() instead)
export { redisClient };
export default redisClient;
