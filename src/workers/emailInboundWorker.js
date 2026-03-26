// src/workers/emailInboundWorker.js
/**
 * Email Inbound Worker
 *
 * Processes incoming emails from RabbitMQ queue (decoupled from IMAP IDLE).
 * IMAP fetches emails and pushes them to the queue instantly, then returns to IDLE.
 * This worker processes them in parallel (prefetch: 5) for fast throughput.
 *
 * Each email is processed independently — OWM matching, AI follow-ups,
 * and auto-mode bot responses all happen here.
 */

import { consumeFromQueue, QUEUES } from '../lib/queue/rabbitmq.js';

let consumer = null;
let isInitialized = false;

async function processInboundEmail(jobData) {
  const { tenantId, channelAccountId } = jobData;

  if (!tenantId || !channelAccountId) {
    console.error('[EmailInbound] Missing tenantId or channelAccountId');
    const err = new Error('Missing required fields');
    err.retryable = false;
    throw err;
  }

  // Reconstruct attachment buffers from base64
  if (jobData.attachments && Array.isArray(jobData.attachments)) {
    for (const att of jobData.attachments) {
      if (att.content && typeof att.content === 'string') {
        att.content = Buffer.from(att.content, 'base64');
      }
    }
  }

  // Process via IMAPEmailService (same function, different caller)
  const IMAPEmailService = (await import('../services/email/IMAPEmailService.js')).default;
  const result = await IMAPEmailService.processIncomingEmail(jobData, tenantId, channelAccountId);

  if (result.created) {
    console.log(`[EmailInbound] Processed: ${jobData.subject || 'No Subject'} from ${jobData.fromEmail}`);
  }

  return result;
}

export async function startEmailInboundWorker() {
  if (isInitialized && consumer) {
    return consumer;
  }

  try {
    const { initRabbitMQ } = await import('../lib/queue/rabbitmq.js');
    await initRabbitMQ();

    consumer = await consumeFromQueue(
      QUEUES.EMAIL_INBOUND,
      processInboundEmail,
      {
        requeue: true,
        maxRetries: 3,
        prefetch: 5, // Process 5 emails concurrently
      }
    );

    isInitialized = true;
    console.log(`✅ Email inbound worker started (queue: ${QUEUES.EMAIL_INBOUND}, prefetch: 5)`);
    return consumer;
  } catch (error) {
    console.error('❌ Failed to start email inbound worker:', error.message);
    isInitialized = false;
    consumer = null;
    throw error;
  }
}

export async function stopEmailInboundWorker() {
  if (consumer) {
    await consumer.cancel();
    consumer = null;
    isInitialized = false;
    console.log('🛑 Email inbound worker stopped');
  }
}
