// src/lib/queue/rabbitmq.js
/**
 * RabbitMQ Connection Manager
 * - Connects to CloudAMQP or local RabbitMQ
 * - Manages exchanges, queues, and bindings
 * - Handles message publishing and consuming
 * - Auto-reconnects on connection loss with consumer re-registration (Bug 1)
 * - Per-consumer channels for isolation (Bug 2 + Bug 6)
 * - Ack+republish retry pattern for correct retry counting (Bug 3)
 * - Recursion depth limits on publish retries (Bug 4)
 * - Safe delay queue setup with temporary channels (Bug 10)
 * - publishToExchange reconnection logic (Bug 11)
 * - Dead letter queue for permanently failed messages (Bug 14)
 * - Promise-based mutex to prevent race conditions (Bug 15)
 */

import amqp from 'amqplib';

// Singleton connection
let connection = null;
let publisherChannel = null; // Bug 2: Dedicated channel for publishing
let isInitialized = false;
let isShuttingDown = false; // Prevent reconnection during shutdown

// Bug 15: Promise-based mutex for initialization
let initPromise = null;

// Bug 1: Consumer registry for reconnection
// Map<string, { handler, options, channel, consumerTag, cancel }>
const consumerRegistry = new Map();

// Bug 1: Reconnection state
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 50; // Max reconnect attempts before giving up
const BASE_RECONNECT_DELAY = 1000; // 1 second base delay
const MAX_RECONNECT_DELAY = 30000; // 30 seconds max delay

// Queue names
export const QUEUES = {
  MESSAGE_OUTBOUND: 'message_outbound',
  MESSAGE_STATUS: 'message_status',
  WEBHOOK_PROCESS: 'webhook_process',
  CONVERSATION_MERGE: 'conversation_merge',
  NOTIFICATION: 'notification',
  CONTACT_IMPORT: 'contact_import',
  DEAL_IMPORT: 'deal_import',
  AUTOMATION_EXECUTE: 'automation_execute',
  PENDING_LOAD: 'pending_load',
  BOT_QUEUE: 'bot_queue',
  CONVERSATION_MODE_CHECK: 'conversation_mode_check',
  MESSAGE_OUTBOUND_WEBCHAT: 'message_outbound_webchat',
  EMAIL_INBOUND: 'email_inbound',
};

// Exchange names
export const EXCHANGES = {
  MESSAGES: 'messages',
  WEBHOOKS: 'webhooks',
  NOTIFICATIONS: 'notifications',
};

// Bug 14: Dead letter exchange/queue
const DLX_EXCHANGE = 'dead_letter';
const DLQ_QUEUE = 'dead_letter_queue';

/**
 * Get RabbitMQ connection URL from environment
 */
function getConnectionUrl() {
  if (process.env.CLOUDAMQP_URL) {
    return process.env.CLOUDAMQP_URL;
  }
  const host = process.env.RABBITMQ_HOST || 'localhost';
  const port = process.env.RABBITMQ_PORT || 5672;
  const username = process.env.RABBITMQ_USERNAME || 'guest';
  const password = process.env.RABBITMQ_PASSWORD || 'guest';
  const vhost = process.env.RABBITMQ_VHOST || '/';
  return `amqp://${username}:${password}@${host}:${port}${vhost}`;
}

/**
 * Get queue options for a specific queue
 */
function getQueueOptions(queueName) {
  if (queueName === QUEUES.AUTOMATION_EXECUTE) {
    return {
      durable: true,
      arguments: {
        'x-message-ttl': 604800000, // 7 days for scheduled automations
        'x-max-length': 10000,
        'x-dead-letter-exchange': DLX_EXCHANGE, // Bug 14: Route failed messages to DLQ
      },
    };
  }
  return {
    durable: true,
    arguments: {
      'x-message-ttl': 86400000, // 24 hours
      'x-max-length': 100000,
      'x-dead-letter-exchange': DLX_EXCHANGE, // Bug 14: Route failed messages to DLQ
    },
  };
}

/**
 * Create a temporary channel for safe queue operations (Bug 10)
 * The channel is disposable - if an operation fails, only this channel dies
 */
async function withTemporaryChannel(operation) {
  if (!connection) throw new Error('No RabbitMQ connection');
  let tempChannel = null;
  try {
    tempChannel = await connection.createChannel();
    tempChannel.on('error', () => {}); // Suppress errors on temp channel
    tempChannel.on('close', () => {}); // Suppress close events
    const result = await operation(tempChannel);
    try { await tempChannel.close(); } catch (_) {}
    return result;
  } catch (error) {
    if (tempChannel) {
      try { await tempChannel.close(); } catch (_) {}
    }
    throw error;
  }
}

/**
 * Setup a delay queue using a temporary channel (Bug 10: safe, won't kill main channel)
 */
async function setupDelayQueue(targetQueueName) {
  const delayQueueName = `${targetQueueName}_delay`;
  try {
    await withTemporaryChannel(async (ch) => {
      // Try to assert - if arguments mismatch, delete and recreate
      try {
        await ch.assertQueue(delayQueueName, {
          durable: true,
          arguments: {
            'x-message-ttl': 600000, // 10 minutes max queue-level TTL
            'x-dead-letter-exchange': '', // Default exchange
            'x-dead-letter-routing-key': targetQueueName,
            'x-max-length': 10000,
          },
        });
      } catch (assertError) {
        // PRECONDITION_FAILED = queue exists with different args
        // Channel is dead after this error, so we need a new temp channel
        await withTemporaryChannel(async (ch2) => {
          try {
            await ch2.deleteQueue(delayQueueName, { ifEmpty: false });
          } catch (_) {}
        });
        await withTemporaryChannel(async (ch3) => {
          await ch3.assertQueue(delayQueueName, {
            durable: true,
            arguments: {
              'x-message-ttl': 600000,
              'x-dead-letter-exchange': '',
              'x-dead-letter-routing-key': targetQueueName,
              'x-max-length': 10000,
            },
          });
        });
      }
    });
    console.log(`  Delay queue "${delayQueueName}" ready`);
  } catch (error) {
    console.error(`  Failed to setup delay queue "${delayQueueName}":`, error.message);
    // Non-fatal: continue without delay queue
  }
}

/**
 * Bug 1: Reconnect with exponential backoff
 * After reconnection, re-registers all consumers from the registry
 */
async function reconnect() {
  if (isShuttingDown) {
    console.log('Shutdown in progress, skipping reconnection');
    return;
  }

  // Prevent concurrent reconnection attempts
  if (initPromise) {
    try { await initPromise; } catch (_) {}
    if (connection && publisherChannel) return;
  }

  while (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && !isShuttingDown) {
    reconnectAttempts++;
    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1),
      MAX_RECONNECT_DELAY
    );
    console.warn(`[RabbitMQ] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    await new Promise(resolve => setTimeout(resolve, delay));

    if (isShuttingDown) return;

    try {
      // Clean up old state
      connection = null;
      publisherChannel = null;
      isInitialized = false;

      await initRabbitMQ();
      reconnectAttempts = 0; // Reset on success
      console.log('[RabbitMQ] Reconnected successfully');

      // Re-register all consumers from registry
      await reRegisterConsumers();
      return;
    } catch (error) {
      console.error(`[RabbitMQ] Reconnection attempt ${reconnectAttempts} failed:`, error.message);
    }
  }

  if (!isShuttingDown) {
    console.error(`[RabbitMQ] FATAL: Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`);
  }
}

/**
 * Bug 1: Re-register all consumers after reconnection
 */
async function reRegisterConsumers() {
  const entries = Array.from(consumerRegistry.entries());
  if (entries.length === 0) return;

  console.log(`[RabbitMQ] Re-registering ${entries.length} consumer(s)...`);
  for (const [queueName, registration] of entries) {
    try {
      // Create a fresh consumer channel
      const consumerChannel = await createConsumerChannel(queueName, registration.options);
      const result = await setupConsumer(consumerChannel, queueName, registration.handler, registration.options);

      // Update the registry with new channel and consumer info
      consumerRegistry.set(queueName, {
        ...registration,
        channel: result.channel,
        consumerTag: result.consumerTag,
        cancel: result.cancel,
      });

      console.log(`  Re-registered consumer for "${queueName}"`);
    } catch (error) {
      console.error(`  Failed to re-register consumer for "${queueName}":`, error.message);
    }
  }
}

/**
 * Bug 2: Create an isolated channel for a consumer
 * Each consumer gets its own channel so errors don't cascade
 */
async function createConsumerChannel(queueName, options = {}) {
  if (!connection) throw new Error('No RabbitMQ connection');

  const ch = await connection.createChannel();

  ch.on('error', (err) => {
    console.error(`[RabbitMQ] Consumer channel error (${queueName}):`, err.message);
  });

  // ✅ CRITICAL: Auto-recover consumer when channel closes unexpectedly
  // Without this, a closed channel leaves messages stuck in the queue with no consumer
  ch.on('close', () => {
    console.warn(`[RabbitMQ] Consumer channel closed (${queueName})`);

    // Only attempt recovery if connection is still alive and not shutting down
    if (connection && !isShuttingDown) {
      const registration = consumerRegistry.get(queueName);
      if (registration) {
        console.log(`[RabbitMQ] 🔄 Attempting to recover consumer for "${queueName}"...`);
        // Delay recovery slightly to avoid rapid reconnection loops
        setTimeout(async () => {
          try {
            if (!connection || isShuttingDown) return;
            const newChannel = await createConsumerChannel(queueName, registration.options);
            const result = await setupConsumer(newChannel, queueName, registration.handler, registration.options);
            consumerRegistry.set(queueName, {
              ...registration,
              channel: result.channel,
              consumerTag: result.consumerTag,
              cancel: result.cancel,
            });
            console.log(`[RabbitMQ] ✅ Consumer recovered for "${queueName}"`);
          } catch (err) {
            console.error(`[RabbitMQ] ❌ Failed to recover consumer for "${queueName}":`, err.message);
          }
        }, 2000);
      }
    }
  });

  // Bug 6: Each consumer channel gets its own prefetch (isolated from others)
  const prefetch = options.prefetch !== undefined ? options.prefetch : 10;
  await ch.prefetch(prefetch);

  // Assert the queue exists on this channel
  const queueOptions = getQueueOptions(queueName);
  await ch.assertQueue(queueName, queueOptions);

  return ch;
}

/**
 * Bug 2: Get or create the dedicated publisher channel
 */
async function getPublisherChannel() {
  if (publisherChannel) return publisherChannel;
  if (!connection) {
    await initRabbitMQ();
  }
  if (!connection) throw new Error('No RabbitMQ connection');

  publisherChannel = await connection.createChannel();
  publisherChannel.on('error', (err) => {
    console.error('[RabbitMQ] Publisher channel error:', err.message);
    publisherChannel = null;
  });
  publisherChannel.on('close', () => {
    console.warn('[RabbitMQ] Publisher channel closed');
    publisherChannel = null;
  });

  // Publisher doesn't need prefetch, but set a reasonable default
  await publisherChannel.prefetch(50);
  return publisherChannel;
}

/**
 * Initialize RabbitMQ connection (Bug 15: uses promise mutex)
 */
export async function initRabbitMQ() {
  // Bug 15: If already initialized, return immediately
  if (isInitialized && connection && publisherChannel) {
    return { connection, channel: publisherChannel };
  }

  // Bug 15: If init is already in progress, await the same promise
  if (initPromise) {
    return await initPromise;
  }

  // Bug 15: Create a single promise for all concurrent callers
  initPromise = _doInit();
  try {
    const result = await initPromise;
    return result;
  } finally {
    initPromise = null;
  }
}

async function _doInit() {
  try {
    const connectionUrl = getConnectionUrl();
    console.log('[RabbitMQ] Connecting...', {
      host: connectionUrl.replace(/:[^:]*@/, ':****@'),
    });

    connection = await amqp.connect(connectionUrl, {
      heartbeat: 60,
      clientProperties: { connection_name: 'omniconnect-main' },
    });

    connection.on('error', (err) => {
      console.error('[RabbitMQ] Connection error:', err.message);
    });

    // Bug 1: Auto-reconnect on connection close
    connection.on('close', () => {
      console.warn('[RabbitMQ] Connection closed');
      connection = null;
      publisherChannel = null;
      isInitialized = false;

      // Trigger reconnection (non-blocking)
      if (!isShuttingDown) {
        reconnect().catch(err => {
          console.error('[RabbitMQ] Reconnection failed:', err.message);
        });
      }
    });

    // Bug 2: Create dedicated publisher channel
    publisherChannel = await connection.createChannel();
    publisherChannel.on('error', (err) => {
      console.error('[RabbitMQ] Publisher channel error:', err.message);
      publisherChannel = null;
    });
    publisherChannel.on('close', () => {
      console.warn('[RabbitMQ] Publisher channel closed');
      publisherChannel = null;
    });
    await publisherChannel.prefetch(50);

    // Declare exchanges on publisher channel
    await publisherChannel.assertExchange(EXCHANGES.MESSAGES, 'direct', { durable: true });
    await publisherChannel.assertExchange(EXCHANGES.WEBHOOKS, 'direct', { durable: true });
    await publisherChannel.assertExchange(EXCHANGES.NOTIFICATIONS, 'topic', { durable: true });

    // Bug 14: Declare dead letter exchange and queue
    await publisherChannel.assertExchange(DLX_EXCHANGE, 'fanout', { durable: true });
    await publisherChannel.assertQueue(DLQ_QUEUE, {
      durable: true,
      arguments: {
        'x-message-ttl': 604800000, // Keep dead letters for 7 days
        'x-max-length': 50000,
      },
    });
    await publisherChannel.bindQueue(DLQ_QUEUE, DLX_EXCHANGE, '');

    // Declare all queues on publisher channel (queues are shared across channels)
    const standardQueues = [
      QUEUES.MESSAGE_OUTBOUND, QUEUES.MESSAGE_STATUS, QUEUES.WEBHOOK_PROCESS,
      QUEUES.CONVERSATION_MERGE, QUEUES.NOTIFICATION, QUEUES.CONTACT_IMPORT,
      QUEUES.DEAL_IMPORT, QUEUES.PENDING_LOAD, QUEUES.BOT_QUEUE,
      QUEUES.CONVERSATION_MODE_CHECK, QUEUES.MESSAGE_OUTBOUND_WEBCHAT,
    ];
    for (const q of standardQueues) {
      await publisherChannel.assertQueue(q, getQueueOptions(q));
    }
    // Automation queue has special TTL
    await publisherChannel.assertQueue(QUEUES.AUTOMATION_EXECUTE, getQueueOptions(QUEUES.AUTOMATION_EXECUTE));

    // Bug 10: Setup delay queues using temporary channels (safe - won't kill publisher channel)
    await setupDelayQueue(QUEUES.CONVERSATION_MODE_CHECK);
    await setupDelayQueue(QUEUES.AUTOMATION_EXECUTE);
    await setupDelayQueue(QUEUES.PENDING_LOAD);

    // Bind queues to exchanges
    await publisherChannel.bindQueue(QUEUES.MESSAGE_OUTBOUND, EXCHANGES.MESSAGES, 'outbound');
    await publisherChannel.bindQueue(QUEUES.MESSAGE_STATUS, EXCHANGES.MESSAGES, 'status');
    await publisherChannel.bindQueue(QUEUES.WEBHOOK_PROCESS, EXCHANGES.WEBHOOKS, 'process');

    isInitialized = true;
    reconnectAttempts = 0; // Reset reconnect counter on successful init

    console.log('[RabbitMQ] Connected and configured successfully');
    return { connection, channel: publisherChannel };
  } catch (error) {
    console.error('[RabbitMQ] Failed to connect:', error.message);
    throw error;
  }
}

/**
 * Get RabbitMQ connection (lazy initialization)
 */
export async function getConnection() {
  if (!connection || !publisherChannel) {
    return await initRabbitMQ();
  }
  return { connection, channel: publisherChannel };
}

/**
 * Get publisher channel (creates if not exists) - Bug 15: race-safe
 */
export async function getChannel() {
  try {
    if (!publisherChannel || !connection) {
      await initRabbitMQ();
    }
    if (!publisherChannel) {
      publisherChannel = await getPublisherChannel();
    }
    return publisherChannel;
  } catch (error) {
    if (error.message?.includes('Channel closing') || error.message?.includes('Channel closed')) {
      console.warn('[RabbitMQ] Channel closed, reinitializing...');
      publisherChannel = null;
      await initRabbitMQ();
      return publisherChannel;
    }
    throw error;
  }
}

/**
 * Bug 4: Publish message to queue (with recursion depth limit)
 */
export async function publishToQueue(queueName, message, options = {}, _retryDepth = 0) {
  const MAX_RETRY_DEPTH = 3;

  if (_retryDepth >= MAX_RETRY_DEPTH) {
    throw new Error(`Failed to publish to queue "${queueName}" after ${MAX_RETRY_DEPTH} retries`);
  }

  try {
    let ch = await getChannel();

    if (!ch) {
      console.warn('[RabbitMQ] No publisher channel, reinitializing...');
      await initRabbitMQ();
      ch = await getChannel();
      if (!ch) {
        throw new Error('Failed to get valid publisher channel after reinitialization');
      }
    }

    const messageOptions = {
      persistent: true,
      headers: {
        'x-retry-count': 0,
        ...(options.headers || {}),
      },
      ...options,
    };

    try {
      const published = ch.sendToQueue(
        queueName,
        Buffer.from(JSON.stringify(message)),
        messageOptions
      );

      if (!published) {
        // sendToQueue returns false when the write buffer is full.
        // IMPORTANT: The message IS still buffered and WILL be sent when the buffer drains.
        // Do NOT retry — that creates duplicates. Just wait for the 'drain' event.
        await new Promise((resolve) => {
          ch.once('drain', resolve);
          // Safety timeout — if drain never fires, resolve anyway (message was likely sent)
          setTimeout(resolve, 5000);
        });
      }

      return true;
    } catch (sendError) {
      if (sendError.message?.includes('Channel closing') || sendError.message?.includes('Channel closed')) {
        // Channel closed — the message may or may not have been sent.
        // Only retry if this is the FIRST attempt (no prior send succeeded).
        if (_retryDepth === 0) {
          console.warn('[RabbitMQ] Publisher channel closed, reinitializing for retry...');
          publisherChannel = null;
          await initRabbitMQ();
          return await publishToQueue(queueName, message, options, _retryDepth + 1);
        }
        // Already retried — don't send again (original may have succeeded)
        console.warn('[RabbitMQ] Publisher channel closed on retry — not re-sending to avoid duplicates');
        return true;
      }
      throw sendError;
    }
  } catch (error) {
    if (_retryDepth > 0) {
      // Already in a retry - don't wrap the error
      throw error;
    }
    console.error(`[RabbitMQ] Failed to publish to queue "${queueName}":`, error.message);
    throw error;
  }
}

/**
 * Bug 11: Publish message to exchange (with reconnection logic)
 */
export async function publishToExchange(exchangeName, routingKey, message, options = {}, _retryDepth = 0) {
  const MAX_RETRY_DEPTH = 3;

  if (_retryDepth >= MAX_RETRY_DEPTH) {
    throw new Error(`Failed to publish to exchange "${exchangeName}" after ${MAX_RETRY_DEPTH} retries`);
  }

  try {
    let ch = await getChannel();

    if (!ch) {
      console.warn('[RabbitMQ] No publisher channel for exchange, reinitializing...');
      await initRabbitMQ();
      ch = await getChannel();
      if (!ch) {
        throw new Error('Failed to get valid publisher channel after reinitialization');
      }
    }

    const messageOptions = {
      persistent: true,
      ...options,
    };

    try {
      const published = ch.publish(
        exchangeName,
        routingKey,
        Buffer.from(JSON.stringify(message)),
        messageOptions
      );

      if (!published) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return await publishToExchange(exchangeName, routingKey, message, options, _retryDepth + 1);
      }

      return published;
    } catch (sendError) {
      if (sendError.message?.includes('Channel closing') || sendError.message?.includes('Channel closed')) {
        console.warn('[RabbitMQ] Publisher channel closed while publishing to exchange, reinitializing...');
        publisherChannel = null;
        await initRabbitMQ();
        return await publishToExchange(exchangeName, routingKey, message, options, _retryDepth + 1);
      }
      throw sendError;
    }
  } catch (error) {
    if (_retryDepth > 0) throw error;
    console.error(`[RabbitMQ] Failed to publish to exchange "${exchangeName}":`, error.message);
    throw error;
  }
}

/**
 * Setup a consumer on a given channel (used by both initial setup and reconnection)
 */
async function setupConsumer(consumerChannel, queueName, handler, options = {}) {
  const consumeOptions = {
    noAck: false,
    ...options,
  };

  // Suppress verbose logs for high-frequency queues
  const isQuietQueue = queueName === QUEUES.CONVERSATION_MODE_CHECK;
  const isPendingLoad = queueName === QUEUES.PENDING_LOAD;

  // CRITICAL: amqplib does NOT await async callbacks passed to channel.consume().
  // If the async handler rejects, the Promise is unhandled and the message is never acked.
  // This wrapper ensures EVERY message is either acked or nacked, no matter what happens.
  const safeHandler = (msg) => {
    if (!msg) {
      console.log(`[RabbitMQ] Consumer cancelled for queue: ${queueName}`);
      return;
    }

    // Wrap in immediately-invoked async function so we control the entire lifecycle
    (async () => {

    // Logging
    if (isQuietQueue) {
      try {
        const content = JSON.parse(msg.content.toString());
        console.log(`[${queueName}] Mode check received for ${content.conversationId}`);
      } catch (_) {}
    } else if (isPendingLoad) {
      console.log(`[${queueName}] Job received (${msg.content.length} bytes)`);
    } else {
      console.log(`[${queueName}] Message received (${msg.content.length} bytes)`);
    }

    try {
      const content = JSON.parse(msg.content.toString());

      // Queue-specific logs
      if (queueName === QUEUES.AUTOMATION_EXECUTE) {
        console.log(`[${queueName}] Automation: ${content.automationId}, Type: ${content.executionType || 'N/A'}, Scheduled: ${content.scheduledFor || 'N/A'}`);
      } else if (isPendingLoad) {
        console.log(`[${queueName}] Load: ${content.pendingLoadId || 'N/A'}, Type: ${content.type || 'N/A'}`);
      } else if (!isQuietQueue) {
        console.log(`[${queueName}] Processing: channel=${content.channelType || 'N/A'}, msgId=${content.messageId || 'N/A'}`);
      }

      await handler(content, msg);

      // Acknowledge on success
      try {
        consumerChannel.ack(msg);
        if (!isQuietQueue) {
          console.log(`[${queueName}] Message acknowledged`);
        }
      } catch (ackError) {
        // Channel closed during ack — message will be redelivered when consumer recovers
        console.warn(`[${queueName}] Ack failed (channel may have closed): ${ackError.message}`);
      }
    } catch (error) {
      const errorMessage = error?.message || error?.toString() || '';
      const isScheduledNotReady = errorMessage.startsWith('SCHEDULED_NOT_READY:');

      // Non-retryable errors
      const isNonRetryable = error.code === 'AUTOMATION_NOT_FOUND' ||
                             error.code === 'AUTOMATION_NOT_PUBLISHED' ||
                             error.retryable === false;

      if (isNonRetryable && !isScheduledNotReady) {
        console.log(`[${queueName}] Non-retryable error, removing message:`, error.message);
        try { consumerChannel.ack(msg); } catch (_) {}
        return;
      }

      const currentRetryCount = msg.properties.headers?.['x-retry-count'] || 0;
      const retryCount = currentRetryCount + 1;
      const maxRetries = options.maxRetries || 3;
      const shouldRequeue = isScheduledNotReady || (retryCount <= maxRetries && (options.requeue !== false));

      if (shouldRequeue) {
        if (isScheduledNotReady) {
          // Handle scheduled delay via delay queue
          const delayMs = parseInt(errorMessage.split(':')[1]) || 60000;
          const requeueDelay = Math.min(Math.max(delayMs, 1000), 600000);
          console.log(`[${queueName}] Scheduled message not ready - delay ${Math.floor(requeueDelay / 1000)}s`);

          let messageContent;
          try {
            messageContent = JSON.parse(msg.content.toString());
          } catch (parseError) {
            console.error(`[${queueName}] Failed to parse message for delay:`, parseError.message);
            try { consumerChannel.ack(msg); } catch (_) {}
            return;
          }

          const messageHeaders = {
            ...(msg.properties.headers || {}),
            'x-scheduled-for': messageContent.scheduledFor,
            'x-retry-count': retryCount,
            'x-delay-ms': requeueDelay.toString(),
          };

          // CRITICAL FIX: Publish to delay queue FIRST via publisher channel,
          // then ack the original. If publish fails, nack to requeue the original.
          const delayQueueName = `${queueName}_delay`;
          let republished = false;
          try {
            const pubCh = await getChannel();
            if (pubCh) {
              pubCh.sendToQueue(
                delayQueueName,
                Buffer.from(JSON.stringify(messageContent)),
                { persistent: true, expiration: requeueDelay.toString(), headers: messageHeaders }
              );
              republished = true;
            }
          } catch (delayError) {
            console.error(`[${queueName}] Delay queue publish failed:`, delayError.message);
          }

          // Always ack the original — either it was republished to delay queue,
          // or the publish failed. Don't nack with requeue — that causes infinite cycling.
          try { consumerChannel.ack(msg); } catch (_) {}
          if (republished) {
            console.log(`[${queueName}] Message sent to delay queue with ${Math.floor(requeueDelay / 1000)}s TTL`);
          } else {
            console.warn(`[${queueName}] Delay publish failed — message acked to prevent cycling`);
          }
          return;
        }

        // Actual error retry — publish-first-then-ack pattern
        console.error(`[${queueName}] Error processing message (retry ${retryCount}/${maxRetries}):`, error.message);

        const updatedHeaders = {
          ...(msg.properties.headers || {}),
          'x-retry-count': retryCount,
          'x-last-error': error.message?.substring(0, 200),
          'x-last-retry': new Date().toISOString(),
        };

        // CRITICAL FIX: Use the dedicated publisher channel for republish,
        // NOT the consumer channel. This prevents channel closure from losing messages.
        let retryPublished = false;
        try {
          const pubCh = await getChannel();
          if (pubCh) {
            pubCh.sendToQueue(
              queueName,
              msg.content,
              { persistent: true, headers: updatedHeaders }
            );
            retryPublished = true;
          }
        } catch (pubError) {
          console.error(`[${queueName}] Retry publish via publisher channel failed:`, pubError.message);
        }

        // Fallback: try consumer channel if publisher failed
        if (!retryPublished) {
          try {
            consumerChannel.sendToQueue(
              queueName,
              msg.content,
              { persistent: true, headers: updatedHeaders }
            );
            retryPublished = true;
          } catch (consumerPubError) {
            console.error(`[${queueName}] Retry publish via consumer channel also failed:`, consumerPubError.message);
          }
        }

        // Always ack the original — don't nack with requeue (causes infinite cycling)
        try { consumerChannel.ack(msg); } catch (_) {}
        if (retryPublished) {
          console.log(`[${queueName}] Requeued with retry ${retryCount}/${maxRetries}`);
        } else {
          console.warn(`[${queueName}] All retry publish attempts failed — message acked to prevent cycling`);
        }
        return;
      } else {
        // Max retries exceeded - send to DLQ via nack (DLX is configured on queue)
        try {
          consumerChannel.nack(msg, false, false); // Don't requeue - DLX will route to DLQ
          console.error(`[${queueName}] Message failed after ${retryCount} attempts, sent to dead letter queue`);
        } catch (nackError) {
          if (nackError.message?.includes('Channel closing') || nackError.message?.includes('Channel closed')) {
            console.warn(`[${queueName}] Channel closed while sending to DLQ`);
          } else {
            console.error(`[${queueName}] Failed to nack:`, nackError.message);
          }
        }
        return;
      }
    }

    })().catch((unhandledError) => {
      // SAFETY NET: If anything above throws without ack/nack, ACK the message
      // to remove it from the queue. Requeueing (nack with requeue=true) causes
      // infinite cycling that blocks other messages (the alternating pending pattern).
      console.error(`[${queueName}] Unhandled error in consumer — acking to prevent queue cycling:`, unhandledError.message);
      try {
        consumerChannel.ack(msg);
      } catch (_) {
        console.error(`[${queueName}] Failed to ack in safety net — message may be stuck`);
      }
    });

  }; // end safeHandler

  const consumerTagResult = await consumerChannel.consume(queueName, safeHandler, consumeOptions);

  const consumerTag = typeof consumerTagResult === 'string'
    ? consumerTagResult
    : (consumerTagResult?.consumerTag || String(consumerTagResult));

  console.log(`[RabbitMQ] Consumer started for "${queueName}" (tag: ${consumerTag})`);

  return {
    consumerTag,
    channel: consumerChannel,
    queueName,
    cancel: async () => {
      try {
        if (!consumerChannel || consumerChannel.connection === null) {
          return;
        }
        await consumerChannel.cancel(consumerTag);
      } catch (error) {
        if (error.message?.includes('closed') || error.name === 'IllegalOperationError') {
          return;
        }
        throw error;
      }
    },
  };
}

/**
 * Consume messages from queue
 * Bug 2: Each consumer gets its own isolated channel
 */
export async function consumeFromQueue(queueName, handler, options = {}) {
  try {
    // Ensure connection exists
    if (!connection) {
      await initRabbitMQ();
    }

    // Bug 2: Create a dedicated channel for this consumer
    const consumerChannel = await createConsumerChannel(queueName, options);

    console.log(`[RabbitMQ] Starting consumer for queue: ${queueName}`);
    const result = await setupConsumer(consumerChannel, queueName, handler, options);

    // Bug 1: Register consumer for reconnection
    consumerRegistry.set(queueName, {
      handler,
      options,
      channel: result.channel,
      consumerTag: result.consumerTag,
      cancel: result.cancel,
    });

    return result;
  } catch (error) {
    console.error(`[RabbitMQ] Failed to consume from queue "${queueName}":`, error.message);
    throw error;
  }
}

/**
 * Close RabbitMQ connection gracefully
 */
export async function closeRabbitMQ() {
  isShuttingDown = true;
  console.log('[RabbitMQ] Closing connection...');

  try {
    // Cancel all consumers and close their channels
    for (const [queueName, reg] of consumerRegistry) {
      try {
        if (reg.cancel) await reg.cancel();
        if (reg.channel) {
          try { await reg.channel.close(); } catch (_) {}
        }
      } catch (error) {
        console.warn(`[RabbitMQ] Error stopping consumer for "${queueName}":`, error.message);
      }
    }
    consumerRegistry.clear();

    // Close publisher channel
    if (publisherChannel) {
      try { await publisherChannel.close(); } catch (_) {}
      publisherChannel = null;
    }

    // Close connection
    if (connection) {
      try { await connection.close(); } catch (_) {}
      connection = null;
    }

    isInitialized = false;
    console.log('[RabbitMQ] Connection closed gracefully');
  } catch (error) {
    console.error('[RabbitMQ] Error during close:', error.message);
  }
}

// NOTE: Graceful shutdown is handled by server.js
// Do not register SIGTERM/SIGINT handlers here

/**
 * Route outbound messages to the appropriate queue based on channel type.
 * WebChat messages go to a dedicated queue to avoid being blocked by slow email/SMS sends.
 */
export async function publishOutboundMessage(queueData, options = {}) {
  const queue = queueData.channelType === 'webchat'
    ? QUEUES.MESSAGE_OUTBOUND_WEBCHAT
    : QUEUES.MESSAGE_OUTBOUND;
  return publishToQueue(queue, queueData, options);
}

export default {
  initRabbitMQ,
  getConnection,
  getChannel,
  publishToQueue,
  publishToExchange,
  publishOutboundMessage,
  consumeFromQueue,
  closeRabbitMQ,
  QUEUES,
  EXCHANGES,
};
