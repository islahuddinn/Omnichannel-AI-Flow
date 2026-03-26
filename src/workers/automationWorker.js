// src/workers/automationWorker.js
/**
 * Automation Worker
 * Processes scheduled/delayed automation executions from RabbitMQ
 */

import { consumeFromQueue, QUEUES } from '../lib/queue/rabbitmq.js';
import { AutomationService } from '../services/automation/AutomationService.js';

let consumer = null;

/**
 * Process automation execution job
 */
async function processAutomationExecution(jobData, msg) {
  const { automationId, tenantId, executionType, scheduledFor, triggeredBy } = jobData;
  
  console.log(`\n[AutomationWorker] ==========================================`);
  console.log(`[AutomationWorker] 📥 Received automation execution job:`, {
    automationId,
    tenantId,
    executionType,
    scheduledFor,
    receivedAt: new Date().toISOString(),
  });
  console.log(`[AutomationWorker] ==========================================\n`);

  try {
    // Check if it's time to execute (for delayed/scheduled automations)
    if (scheduledFor && executionType !== 'immediate') {
      const scheduledTime = new Date(scheduledFor);
      const now = new Date();
      const timeUntilExecution = scheduledTime.getTime() - now.getTime();
      
      console.log(`[AutomationWorker] ⏰ Checking execution time for automation ${automationId}:`, {
        scheduledTime: scheduledTime.toISOString(),
        scheduledTimeLocal: scheduledTime.toLocaleString(),
        now: now.toISOString(),
        nowLocal: now.toLocaleString(),
        timeUntilExecution: timeUntilExecution,
        timeUntilExecutionMs: timeUntilExecution,
        timeUntilExecutionSeconds: Math.floor(timeUntilExecution / 1000),
        timeUntilExecutionMinutes: Math.floor(timeUntilExecution / 1000 / 60),
        executionType
      });
      
      // If scheduled time hasn't arrived yet, requeue the message with delay
      if (timeUntilExecution > 0) {
        const minutesRemaining = Math.floor(timeUntilExecution / 1000 / 60);
        const secondsRemaining = Math.floor((timeUntilExecution % 60000) / 1000);
        
        // Use the FULL remaining time as delay - RabbitMQ will handle it via TTL
        // Cap at 10 minutes (600000ms) as that's the RabbitMQ TTL limit for delay queue
        // If delay is longer than 10 minutes, we'll requeue multiple times
        const delayMs = Math.min(timeUntilExecution, 600000);
        
        console.log(`[AutomationWorker] ⏳ Automation ${automationId} is scheduled for ${scheduledTime.toISOString()}`);
        console.log(`[AutomationWorker] 📅 Current time: ${new Date().toISOString()}`);
        console.log(`[AutomationWorker] ⏰ Time until execution: ${minutesRemaining}m ${secondsRemaining}s (${Math.floor(delayMs / 1000)}s)`);
        console.log(`[AutomationWorker] 🔄 Sending to delay queue - will execute automatically when ready`);
        
        // Throw error with delay - handler will use RabbitMQ delay queue with TTL
        // This is NOT an actual error - it's the mechanism to delay execution
        throw new Error(`SCHEDULED_NOT_READY:${delayMs}`);
      }
      
      console.log(`[AutomationWorker] ✅ Automation ${automationId} is ready to execute (scheduled time has arrived)`);
    } else if (executionType === 'immediate') {
      console.log(`[AutomationWorker] ⚡ Immediate execution requested for automation ${automationId}`);
    }
    
    // Execute the automation with execution metadata for audit trail
    console.log(`[AutomationWorker] 🚀 Starting execution of automation ${automationId}...`);
    const startTime = Date.now();
    const result = await AutomationService.executeAutomation(automationId, tenantId, {
      executionType: executionType || 'immediate',
      scheduledFor: scheduledFor || null,
      triggeredBy: triggeredBy || null,
    });
    const executionTime = Date.now() - startTime;
    
    console.log(`\n[AutomationWorker] ==========================================`);
    console.log(`[AutomationWorker] ✅ Automation ${automationId} executed successfully:`, {
      ...result,
      executionTimeMs: executionTime,
      executionTimeSeconds: (executionTime / 1000).toFixed(2),
      completedAt: new Date().toISOString(),
    });
    console.log(`[AutomationWorker] ==========================================\n`);
    return result;
  } catch (error) {
    // Handle scheduled not ready error - requeue with delay
    if (error.message && error.message.startsWith('SCHEDULED_NOT_READY:')) {
      const delayMs = parseInt(error.message.split(':')[1]);
      // Requeue after a delay (minimum 1 minute, or actual delay if less than 1 hour)
      const requeueDelay = Math.min(Math.max(delayMs, 60000), 3600000); // 1 min to 1 hour
      
      console.log(`[AutomationWorker] 🔄 Requeuing automation ${automationId} with ${requeueDelay}ms delay (${Math.floor(requeueDelay / 1000)}s)`);
      
      // Requeue the message by nacking it
      // The message will be redelivered after the requeue delay
      throw error; // This will trigger nack and requeue
    }
    
    // Handle non-retryable errors (automation not found or not published)
    if (error.code === 'AUTOMATION_NOT_FOUND' || error.code === 'AUTOMATION_NOT_PUBLISHED') {
      console.log(`\n[AutomationWorker] ==========================================`);
      console.log(`[AutomationWorker] ⚠️ Skipping automation ${automationId} (non-retryable error):`, {
        error: error.message,
        errorCode: error.code,
        automationId,
        tenantId,
        executionType,
        scheduledFor,
        skippedAt: new Date().toISOString(),
      });
      console.log(`[AutomationWorker] ℹ️ This automation will not be retried.`);
      console.log(`[AutomationWorker] ℹ️ If automation was unpublished, it will run when published again.`);
      console.log(`[AutomationWorker] ==========================================\n`);
      
      // Return success to acknowledge the message (don't requeue)
      return { sent: 0, failed: 0, skipped: true, reason: error.message };
    }
    
    // Bug 12: Only mark specific permanent errors as non-retryable
    // Transient errors (DB timeout, network glitch) should be retried
    const permanentErrorCodes = ['AUTOMATION_NOT_FOUND', 'AUTOMATION_NOT_PUBLISHED', 'VALIDATION_ERROR'];
    const isPermanent = permanentErrorCodes.includes(error.code);

    console.error(`\n[AutomationWorker] ==========================================`);
    console.error(`[AutomationWorker] ❌ Failed to execute automation ${automationId}:`, {
      error: error.message,
      errorCode: error.code || 'UNKNOWN',
      automationId,
      tenantId,
      executionType,
      scheduledFor,
      failedAt: new Date().toISOString(),
      willRetry: !isPermanent,
    });
    console.error(`[AutomationWorker] ==========================================\n`);

    if (isPermanent) {
      error.retryable = false;
    }
    // Transient errors: don't set retryable=false, let RabbitMQ retry them
    throw error;
  }
}

/**
 * Start automation worker
 */
export async function startAutomationWorker() {
  if (consumer) {
    console.log('⚠️ Automation worker already started');
    return consumer;
  }

  try {
    console.log('\n🤖 ==========================================');
    console.log('🤖 Starting Automation Worker...');
    console.log('🤖 ==========================================\n');
    
    // ✅ Ensure RabbitMQ is initialized
    const { initRabbitMQ } = await import('../lib/queue/rabbitmq.js');
    await initRabbitMQ();
    console.log('✅ RabbitMQ initialized for automation worker');
    
    console.log(`📋 Queue name: ${QUEUES.AUTOMATION_EXECUTE}`);
    console.log(`📋 Handler: processAutomationExecution`);
    
    consumer = await consumeFromQueue(
      QUEUES.AUTOMATION_EXECUTE,
      processAutomationExecution,
      {
        maxRetries: 3,
        requeue: true,
      }
    );

    console.log('\n✅ ==========================================');
    console.log('✅ Automation worker started successfully!');
    console.log('✅ ==========================================');
    console.log(`   - Queue: ${QUEUES.AUTOMATION_EXECUTE}`);
    console.log(`   - Consumer tag: ${consumer?.consumerTag || 'N/A'}`);
    console.log(`   - Status: LISTENING FOR MESSAGES`);
    console.log('✅ ==========================================\n');
    
    return consumer;
  } catch (error) {
    console.error('\n❌ ==========================================');
    console.error('❌ Failed to start automation worker:');
    console.error('❌ ==========================================');
    console.error('   Error:', error.message);
    console.error('   Stack:', error.stack);
    console.error('❌ ==========================================\n');
    throw error;
  }
}

/**
 * Stop automation worker
 */
export async function stopAutomationWorker() {
  if (consumer) {
    try {
      await consumer.cancel();
      consumer = null;
      console.log('✅ Automation worker stopped');
    } catch (error) {
      console.error('❌ Failed to stop automation worker:', error);
      throw error;
    }
  }
}

