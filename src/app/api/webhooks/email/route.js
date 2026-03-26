// src/app/api/webhooks/email/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import { publishToQueue, QUEUES } from '@/lib/queue/rabbitmq';
import redisClient from '@/config/redis';

// ✅ Payload size limit (1MB)
const MAX_PAYLOAD_SIZE = 1 * 1024 * 1024;

/**
 * POST /api/webhooks/email
 * Receives incoming email webhooks (e.g., from SendGrid, Mailgun, etc.)
 */
export async function POST(request) {
  try {
    console.log('📧 Email webhook received:', new Date().toISOString());

    // ✅ Validate content length
    const contentLength = parseInt(request.headers.get('content-length') || '0');
    if (contentLength > MAX_PAYLOAD_SIZE) {
      console.warn('⚠️ Email webhook payload too large:', contentLength);
      return new Response('PAYLOAD_TOO_LARGE', { status: 413 });
    }

    const payload = await request.json();

    // ✅ Detect event type for bounce/delivery/open events
    const eventType = payload.event || payload.type || payload.RecordType || null;
    const isBounceEvent = ['bounce', 'dropped', 'failed', 'permanent_fail', 'temporary_fail', 'HardBounce', 'SoftBounce'].includes(eventType);
    const isDeliveryEvent = ['delivered', 'Delivery'].includes(eventType);
    const isOpenEvent = ['open', 'opened', 'Open'].includes(eventType);
    const isStatusEvent = isBounceEvent || isDeliveryEvent || isOpenEvent;

    console.log('📨 Email Webhook:', {
      eventType: eventType || 'incoming',
      isStatus: isStatusEvent,
      from: payload.from || payload.sender || 'unknown',
      to: payload.to || payload.recipient || 'unknown',
      subject: payload.subject?.substring(0, 50) || 'N/A',
    });

    // ✅ Extract recipient email — handle different webhook provider formats
    const recipientEmail = payload.email || payload.to || payload.recipient || payload.Recipient;

    if (!recipientEmail) {
      console.warn('⚠️ No recipient email found in webhook payload');
      return new Response('EVENT_RECEIVED', { status: 200 });
    }

    // Try to find channel account by email identifier in cache or DB
    let tenantId = null;
    let channelAccountId = null;

    // ✅ Check Redis cache first
    const cacheKey = `email_channel:${recipientEmail}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        const cachedData = JSON.parse(cached);
        tenantId = cachedData.tenantId;
        channelAccountId = cachedData.channelAccountId;
        console.log('✅ Found email channel mapping in cache:', { tenantId, channelAccountId });
      }
    } catch (cacheError) {
      console.warn('⚠️ Cache lookup failed:', cacheError.message);
    }

    // ✅ FIX: Actually search tenant databases when cache misses
    if (!tenantId || !channelAccountId) {
      try {
        const { connectToMaster } = await import('@/lib/db/connection');
        const masterDB = await connectToMaster();
        const CompanySchema = (await import('@/models/schemas/Company')).default;
        const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
        const companies = await Company.find({ isActive: true }).select('tenantId').lean();

        for (const company of companies) {
          if (!company.tenantId) continue;
          try {
            const tDB = await getTenantDB(company.tenantId);
            const CA = tDB.models.CompanyAccount || tDB.model('CompanyAccount', CompanyAccountSchema);

            // Search for email channel account matching this recipient email
            const account = await CA.findOne({
              type: 'email',
              $and: [
                {
                  $or: [
                    { 'credentials.email': recipientEmail },
                    { 'credentials.imapUser': recipientEmail },
                    { 'credentials.smtpUser': recipientEmail },
                    { 'credentials.fromEmail': recipientEmail },
                  ],
                },
                {
                  $or: [{ isActive: true }, { status: 'active' }],
                },
              ],
            }).lean();

            if (account) {
              tenantId = company.tenantId;
              channelAccountId = account._id.toString();
              console.log('✅ Found email channel via DB search:', { tenantId, channelAccountId });

              // ✅ Cache the mapping for next time (24 hours)
              try {
                await redisClient.set(cacheKey, JSON.stringify({ tenantId, channelAccountId }), 'EX', 86400);
              } catch (cacheSetErr) {
                // Non-critical
              }
              break;
            }
          } catch (tenantErr) {
            // Skip this tenant
          }
        }

        if (!tenantId) {
          console.warn('⚠️ No matching email channel account found for:', recipientEmail);
        }
      } catch (dbError) {
        console.error('❌ Database lookup for email channel failed:', dbError.message);
      }
    }

    // ✅ Don't enqueue if we can't resolve the tenant (worker will fail anyway)
    if (!tenantId) {
      console.warn('⚠️ Cannot resolve tenant for email webhook, skipping:', recipientEmail);
      return new Response('EVENT_RECEIVED', { status: 200 });
    }

    // ✅ Enqueue webhook to RabbitMQ
    const jobData = {
      channelType: 'email',
      channelAccountId,
      tenantId,
      identifier: recipientEmail,
      rawPayload: payload,
      receivedAt: new Date().toISOString(),
      // ✅ Include event type so worker knows if this is a status update or incoming message
      eventType: isStatusEvent ? 'status' : 'message',
    };

    await publishToQueue(QUEUES.WEBHOOK_PROCESS, jobData);

    console.log('✅ Email webhook queued:', {
      tenantId,
      eventType: jobData.eventType,
      recipient: recipientEmail,
    });

    return new Response('EVENT_RECEIVED', { status: 200 });

  } catch (error) {
    console.error('❌ Email webhook error:', error.message);

    // Still return 200 to prevent webhook provider from retrying
    return new Response('EVENT_RECEIVED', { status: 200 });
  }
}

/**
 * GET /api/webhooks/email
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Email webhook endpoint is active',
    timestamp: new Date().toISOString()
  });
}
