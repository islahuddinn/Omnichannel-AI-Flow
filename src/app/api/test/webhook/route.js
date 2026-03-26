// src/app/api/test/webhook/route.js
/**
 * Test endpoint to simulate incoming WhatsApp webhooks
 * This allows testing the full flow without needing Meta's webhooks
 */

import { NextResponse } from 'next/server';
import { getWebhookProcessQueue } from '@/lib/queue/bullmq.js';

export async function POST(request) {
  try {
    console.log('\n🧪' + '='.repeat(60));
    console.log('🧪 TEST WEBHOOK ENDPOINT CALLED');
    console.log('🧪' + '='.repeat(60));
    console.log('🧪 This simulates an incoming WhatsApp webhook');
    console.log('🧪' + '='.repeat(60));
    console.log('\n');

    const body = await request.json();
    const {
      phoneNumberId = '587614997776033', // Default phone number ID
      from = '923001234567', // Default sender phone
      message = 'Test message from API',
      tenantId,
      channelAccountId
    } = body;

    // Construct a realistic WhatsApp webhook payload
    const webhookPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '1234567890',
              phone_number_id: phoneNumberId
            },
            contacts: [{
              profile: {
                name: 'Test Contact'
              },
              wa_id: from
            }],
            messages: [{
              from: from,
              id: `wamid.test_${Date.now()}`,
              timestamp: Math.floor(Date.now() / 1000).toString(),
              type: 'text',
              text: {
                body: message
              }
            }]
          },
          field: 'messages'
        }]
      }]
    };

    console.log('🧪 Simulated webhook payload:', {
      phoneNumberId,
      from,
      message,
      hasTenantId: !!tenantId,
      hasChannelAccountId: !!channelAccountId
    });

    // Enqueue webhook for processing
    const webhookQueue = await getWebhookProcessQueue();
    
    const jobData = {
      channelType: 'whatsapp',
      channelAccountId: channelAccountId || null,
      tenantId: tenantId || null,
      identifier: phoneNumberId,
      rawPayload: webhookPayload,
      receivedAt: new Date().toISOString(),
      isTest: true // Mark as test so worker can handle it differently if needed
    };

    console.log('🧪 Enqueuing test webhook job...');
    const job = await webhookQueue.add('webhook_process', jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      jobId: `test_whatsapp_${Date.now()}_${Math.random().toString(36).substring(7)}`
    });

    if (!job || !job.id) {
      console.error('❌ Failed to create test job');
      return NextResponse.json({ success: false, message: 'Failed to enqueue test webhook' }, { status: 500 });
    }

    console.log('✅ Test webhook job enqueued:', {
      jobId: job.id,
      queue: webhookQueue.name,
      tenantId: tenantId || 'WILL BE RESOLVED BY WORKER',
      channelAccountId: channelAccountId || 'WILL BE RESOLVED BY WORKER'
    });

    return NextResponse.json({
      success: true,
      message: 'Test webhook enqueued successfully',
      jobId: job.id,
      payload: webhookPayload
    });

  } catch (error) {
    console.error('❌ Test webhook error:', error);
    return NextResponse.json({
      success: false,
      message: error.message,
      error: error.stack
    }, { status: 500 });
  }
}

