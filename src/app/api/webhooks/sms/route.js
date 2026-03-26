// src/app/api/webhooks/sms/route.js
/**
 * SMS Webhook Handler - Supports EuroSMS and Twilio
 */

import { NextResponse } from 'next/server';
import { publishToQueue, QUEUES } from '@/lib/queue/rabbitmq';
import crypto from 'crypto';

/**
 * POST - Receive SMS Webhook (EuroSMS or Twilio)
 */
export async function POST(request) {
  try {
    const url = new URL(request.url);
    const provider = url.searchParams.get('provider') || 'eurosms';

    const body = await request.text();

    if (!body || body.length === 0) {
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }

    // Limit payload size (1MB)
    if (body.length > 1024 * 1024) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    let payload;

    try {
      payload = JSON.parse(body);
    } catch (e) {
      // Try form-encoded (Twilio)
      const formData = new URLSearchParams(body);
      payload = Object.fromEntries(formData);
    }

    console.log('📥 SMS webhook received:', { provider, type: payload.type || payload.MessageStatus || 'unknown' });

    if (provider === 'eurosms') {
      return await handleEuroSMSWebhook(request, payload, body);
    } else if (provider === 'twilio') {
      return await handleTwilioWebhook(request, payload, body);
    }

    return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });

  } catch (error) {
    console.error('❌ SMS webhook error:', error);
    // Return 500 for infrastructure failures so provider retries
    return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Handle EuroSMS webhook
 * Searches across ALL tenant databases to find the message by UUID
 */
async function handleEuroSMSWebhook(request, payload, body) {
  try {
    // Extract UUID from payload
    const smsUuid = payload.sms_uuid || payload.uuid;

    if (!smsUuid) {
      console.log('⚠️ No UUID found in EuroSMS webhook');
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    // ✅ CRITICAL FIX: Search tenant databases, NOT master DB
    // Messages are stored in tenant databases, not the master database
    const { connectToMaster } = await import('@/lib/db/connection.js');
    const { getTenantDB } = await import('@/config/database.js');
    const masterDB = await connectToMaster();

    const CompanySchema = (await import('@/models/schemas/Company.js')).default;
    const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);

    // Get all active companies to search their tenant DBs
    const companies = await Company.find({ status: { $ne: 'inactive' } }).select('_id tenantDatabaseName').lean();

    let foundMessage = null;
    let foundTenantId = null;

    for (const company of companies) {
      const tenantId = company.tenantDatabaseName
        ? company.tenantDatabaseName.replace('tenant_', '')
        : company._id.toString();
      if (!tenantId) continue;

      try {
        const tenantDB = await getTenantDB(tenantId);
        const MessageSchema = (await import('@/models/schemas/Message.js')).default;
        const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

        const message = await Message.findOne({
          $or: [
            { 'metadata.eurosmsUuid': smsUuid },
            { 'metadata.providerMessageId': smsUuid },
            { providerMessageId: smsUuid },
            // Also check allUuids for multi-part messages
            { 'metadata.allUuids': smsUuid }
          ]
        }).populate('channelAccount').lean();

        if (message && message.channelAccount) {
          foundMessage = message;
          foundTenantId = tenantId;
          break;
        }
      } catch (dbError) {
        // Skip tenant if DB connection fails, continue searching
        continue;
      }
    }

    if (!foundMessage || !foundMessage.channelAccount) {
      console.log('⚠️ Message not found for UUID across all tenant DBs:', smsUuid);
      // Still acknowledge webhook to prevent retries
      return NextResponse.json({
        sms_uuid: smsUuid,
        status: 'ok'
      }, { status: 200 });
    }

    // Determine event type
    const isDeliveryReport = payload.delivery_result || payload.sent_result;
    const eventType = isDeliveryReport ? 'status' : 'message';

    // ✅ Enqueue to RabbitMQ with correct tenant ID
    await publishToQueue(QUEUES.WEBHOOK_PROCESS, {
      channelType: 'sms',
      provider: 'eurosms',
      channelAccountId: foundMessage.channelAccount._id.toString(),
      tenantId: foundTenantId,
      messageId: foundMessage._id.toString(),
      smsUuid: smsUuid,
      rawPayload: payload,
      eventType,
      receivedAt: new Date().toISOString(),
    });

    console.log('✅ EuroSMS webhook queued for processing', { tenantId: foundTenantId, smsUuid });

    // Return acknowledgment as per EuroSMS spec
    return NextResponse.json({
      sms_uuid: smsUuid,
      status: 'ok'
    }, { status: 200 });

  } catch (error) {
    console.error('❌ EuroSMS webhook processing error:', error);
    // Return 500 for infrastructure failures (RabbitMQ down, DB connection failed)
    // so the provider retries the webhook
    if (error.message?.includes('RabbitMQ') || error.message?.includes('ECONNREFUSED') || error.message?.includes('MongoError')) {
      return NextResponse.json({ status: 'error' }, { status: 500 });
    }
    // Non-retryable errors (bad data, etc.) - acknowledge to prevent infinite retries
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }
}

/**
 * Handle Twilio webhook
 * Validates webhook signature and searches tenant databases
 */
async function handleTwilioWebhook(request, payload, body) {
  try {
    const signature = request.headers.get('x-twilio-signature');
    const messageSid = payload.MessageSid || payload.SmsSid;

    if (!messageSid) {
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    // ✅ CRITICAL FIX: Search tenant databases, NOT master DB
    const { connectToMaster } = await import('@/lib/db/connection.js');
    const { getTenantDB } = await import('@/config/database.js');
    const masterDB = await connectToMaster();

    const CompanySchema = (await import('@/models/schemas/Company.js')).default;
    const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);

    const companies = await Company.find({ status: { $ne: 'inactive' } }).select('_id tenantDatabaseName').lean();

    let foundMessage = null;
    let foundTenantId = null;

    for (const company of companies) {
      const tenantId = company.tenantDatabaseName
        ? company.tenantDatabaseName.replace('tenant_', '')
        : company._id.toString();
      if (!tenantId) continue;

      try {
        const tenantDB = await getTenantDB(tenantId);
        const MessageSchema = (await import('@/models/schemas/Message.js')).default;
        const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

        const message = await Message.findOne({
          $or: [
            { 'metadata.twilioSid': messageSid },
            { 'metadata.providerMessageId': messageSid },
            { providerMessageId: messageSid }
          ]
        }).populate('channelAccount').lean();

        if (message && message.channelAccount) {
          foundMessage = message;
          foundTenantId = tenantId;
          break;
        }
      } catch (dbError) {
        continue;
      }
    }

    if (!foundMessage || !foundMessage.channelAccount) {
      console.log('⚠️ Message not found for Twilio SID across all tenant DBs:', messageSid);
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    // ✅ Validate Twilio webhook signature if auth token available
    if (signature && foundMessage.channelAccount.credentials?.authToken) {
      const authToken = foundMessage.channelAccount.credentials.authToken;
      const webhookUrl = request.url;

      // Build sorted parameter string for Twilio signature verification
      const sortedParams = Object.keys(payload)
        .sort()
        .reduce((acc, key) => acc + key + payload[key], webhookUrl);

      const expectedSignature = crypto
        .createHmac('sha1', authToken)
        .update(Buffer.from(sortedParams, 'utf-8'))
        .digest('base64');

      if (signature !== expectedSignature) {
        console.warn('⚠️ Twilio webhook signature validation failed');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
      }
    }

    const isStatusUpdate = payload.MessageStatus || payload.SmsStatus;
    const eventType = isStatusUpdate ? 'status' : 'message';

    // ✅ Enqueue to RabbitMQ with correct tenant ID
    await publishToQueue(QUEUES.WEBHOOK_PROCESS, {
      channelType: 'sms',
      provider: 'twilio',
      channelAccountId: foundMessage.channelAccount._id.toString(),
      tenantId: foundTenantId,
      messageId: foundMessage._id.toString(),
      messageSid: messageSid,
      rawPayload: payload,
      eventType,
      receivedAt: new Date().toISOString(),
    });

    return NextResponse.json({ status: 'ok' }, { status: 200 });

  } catch (error) {
    console.error('❌ Twilio webhook error:', error);
    // Return 500 for infrastructure failures so Twilio retries
    if (error.message?.includes('RabbitMQ') || error.message?.includes('ECONNREFUSED') || error.message?.includes('MongoError')) {
      return NextResponse.json({ status: 'error' }, { status: 500 });
    }
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  }
}
