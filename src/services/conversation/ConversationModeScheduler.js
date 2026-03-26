// src/services/conversation/ConversationModeScheduler.js
/**
 * Conversation Mode Scheduler
 * Schedules delayed checks to switch conversations from manual to auto mode
 * after 2 minutes of inactivity
 * 
 * Uses RabbitMQ delay queue (TTL + dead-letter exchange) for reliable delayed processing
 */

import { publishToQueue, QUEUES, getConnection } from '../../lib/queue/rabbitmq.js';

const DELAY_QUEUE_NAME = `${QUEUES.CONVERSATION_MODE_CHECK}_delay`;

/**
 * Schedule a conversation mode check after 2 minutes
 * This is called whenever a message is sent or received in a manual mode conversation
 * 
 * @param {string} conversationId - Conversation ID
 * @param {string} tenantId - Tenant ID
 * @param {number} delayMs - Optional delay in milliseconds (default: 2 minutes). Use 0 for immediate check.
 */
export async function scheduleConversationModeCheck(conversationId, tenantId, delayMs = null) {
  if (!conversationId || !tenantId) {
    return;
  }

  try {
    const messageData = {
      conversationId: String(conversationId),
      tenantId: String(tenantId),
      scheduledAt: new Date().toISOString(),
    };

    // Default to 2 minutes, but allow immediate checks (0 delay) for existing conversations
    const delay = delayMs !== null ? delayMs : (2 * 60 * 1000); // Default: 2 minutes

    // For immediate checks, publish directly to main queue
    if (delay === 0 || delay < 1000) {
      await publishToQueue(QUEUES.CONVERSATION_MODE_CHECK, messageData);
      return; // Silent for immediate checks
    }

    // For delayed checks, use delay queue with per-message TTL
    // When message expires in delay queue, RabbitMQ automatically routes it to main queue via dead-letter
    // Bug 7: Use a temporary disposable channel instead of the publisher channel
    // This prevents assertQueue/deleteQueue errors from closing the shared publisher channel
    const { connection: conn } = await getConnection();
    const tempChannel = await conn.createChannel();

    try {
      // Ensure delay queue exists
      try {
        await tempChannel.assertQueue(DELAY_QUEUE_NAME, {
          durable: true,
          arguments: {
            'x-message-ttl': 600000, // Max 10 minutes queue-level TTL (fallback)
            'x-dead-letter-exchange': '', // Default exchange (direct)
            'x-dead-letter-routing-key': QUEUES.CONVERSATION_MODE_CHECK, // Route expired messages to main queue
            'x-max-length': 10000, // Max 10k delayed messages
          },
        });
      } catch (assertError) {
        // If queue exists with different arguments, try to delete and recreate
        if (assertError.code === 406 || assertError.message?.includes('PRECONDITION_FAILED')) {
          // The temp channel is likely closed after PRECONDITION_FAILED, create a new one
          let retryChannel;
          try {
            retryChannel = await conn.createChannel(); // conn is already destructured as the raw connection
            await retryChannel.deleteQueue(DELAY_QUEUE_NAME, { ifEmpty: false });
            await new Promise(resolve => setTimeout(resolve, 200));
            await retryChannel.assertQueue(DELAY_QUEUE_NAME, {
              durable: true,
              arguments: {
                'x-message-ttl': 600000,
                'x-dead-letter-exchange': '',
                'x-dead-letter-routing-key': QUEUES.CONVERSATION_MODE_CHECK,
                'x-max-length': 10000,
              },
            });
            // Use retryChannel for sending since tempChannel is dead
            const cappedDelay = Math.min(Math.max(delay, 1000), 600000);
            retryChannel.sendToQueue(
              DELAY_QUEUE_NAME,
              Buffer.from(JSON.stringify(messageData)),
              { persistent: true, expiration: cappedDelay.toString() }
            );
            try { await retryChannel.close(); } catch (e) { /* ignore */ }
            if (delay === 2 * 60 * 1000) {
              console.log(`📅 Scheduled conversation mode check for ${conversationId} (in 2 minutes via delay queue, recreated)`);
            }
            return;
          } catch (recreateError) {
            try { if (retryChannel) await retryChannel.close(); } catch (e) { /* ignore */ }
            console.error(`❌ Failed to recreate delay queue:`, recreateError);
            // Fallback to direct queue with expiration
            await publishToQueue(QUEUES.CONVERSATION_MODE_CHECK, messageData, {
              expiration: delay.toString(),
            });
            if (delay === 2 * 60 * 1000) {
              console.log(`📅 Scheduled conversation mode check for ${conversationId} (in 2 minutes, using expiration fallback)`);
            }
            return;
          }
        } else {
          throw assertError;
        }
      }

      // Cap delay between 1 second and 10 minutes (RabbitMQ TTL limit)
      const cappedDelay = Math.min(Math.max(delay, 1000), 600000);

      // Publish to delay queue with per-message expiration (TTL)
      // When message expires, RabbitMQ automatically routes it to main queue via dead-letter
      const published = tempChannel.sendToQueue(
        DELAY_QUEUE_NAME,
        Buffer.from(JSON.stringify(messageData)),
        {
          persistent: true,
          expiration: cappedDelay.toString(), // Per-message TTL in milliseconds
        }
      );

      if (!published) {
        // Channel buffer is full, wait a bit and retry
        await new Promise(resolve => setTimeout(resolve, 100));
        const retryPublished = tempChannel.sendToQueue(
          DELAY_QUEUE_NAME,
          Buffer.from(JSON.stringify(messageData)),
          { persistent: true, expiration: cappedDelay.toString() }
        );
        if (!retryPublished) {
          console.warn(`⚠️ Delay queue buffer full for ${conversationId}, falling back to direct queue with expiration`);
          await publishToQueue(QUEUES.CONVERSATION_MODE_CHECK, messageData, {
            expiration: cappedDelay.toString(),
          });
          if (delay === 2 * 60 * 1000) {
            console.log(`📅 Scheduled conversation mode check for ${conversationId} (in 2 minutes, using expiration fallback)`);
          }
          return;
        }
      }

      // Only log for initial scheduling (2 minutes) to avoid log spam from reschedules
      if (delay === 2 * 60 * 1000) {
        console.log(`📅 Scheduled conversation mode check for ${conversationId} (in 2 minutes via delay queue)`);
      }
    } catch (sendError) {
      // If sendToQueue fails, fallback to direct queue with expiration
      console.warn(`⚠️ Failed to send to delay queue for ${conversationId}, using fallback:`, sendError.message);
      const cappedDelay = Math.min(Math.max(delay, 1000), 600000);
      await publishToQueue(QUEUES.CONVERSATION_MODE_CHECK, messageData, {
        expiration: cappedDelay.toString(),
      });
      if (delay === 2 * 60 * 1000) {
        console.log(`📅 Scheduled conversation mode check for ${conversationId} (in 2 minutes, using expiration fallback)`);
      }
    } finally {
      // Bug 7: Always close temporary channel to prevent resource leaks
      try { await tempChannel.close(); } catch (e) { /* ignore - channel may already be closed */ }
    }
  } catch (error) {
    console.error(`❌ Error scheduling conversation mode check for ${conversationId}:`, error);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Cancel any pending mode checks for a conversation
 * This is called when a new message arrives, canceling the previous check
 * 
 * Note: RabbitMQ doesn't support canceling individual messages easily,
 * so we rely on the worker to check if the conversation still needs switching
 */
export async function cancelConversationModeCheck(conversationId, tenantId) {
  // RabbitMQ doesn't easily support canceling specific messages
  // The worker will check if conversation still needs switching
  // This function is kept for future use or alternative implementations
  console.log(`ℹ️ Mode check cancellation requested for ${conversationId} (handled by worker logic)`);
}

