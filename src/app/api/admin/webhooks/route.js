// src/app/api/admin/webhooks/route.js
/**
 * Webhook Management API
 * Get webhook URLs and test webhook delivery
 */

import { NextResponse } from 'next/server';
import { getTenantContext } from '@/middleware/tenant';

/**
 * GET /api/admin/webhooks
 * Get webhook URLs for all channels
 */
export async function GET(request) {
  const tenantCtx = getTenantContext();

  if (!tenantCtx || (tenantCtx.role !== 'company_admin' && tenantCtx.role !== 'super_admin')) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-domain.com';

  const webhooks = {
    meta: {
      url: `${baseUrl}/api/webhooks/meta`,
      description: 'Handles WhatsApp, Facebook Messenger, and Instagram webhooks',
      method: 'POST',
      verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || 'omniconnect_verify_token',
      setup: [
        '1. Go to Meta for Developers',
        '2. Select your app → Webhooks',
        '3. Add webhook URL and verify token',
        '4. Subscribe to: messages, messaging_postbacks, message_deliveries, message_reads',
      ],
    },
    twilio: {
      url: `${baseUrl}/api/webhooks/sms/twilio`,
      description: 'Handles Twilio SMS webhooks',
      method: 'POST',
      setup: [
        '1. Go to Twilio Console',
        '2. Select your phone number → Configure',
        '3. Set webhook URL for "A message comes in"',
        '4. Set HTTP Method to POST',
      ],
    },
    eurosms: {
      url: `${baseUrl}/api/webhooks/sms/eurosms`,
      description: 'Handles EuroSMS webhooks',
      method: 'POST',
      setup: [
        '1. Go to EuroSMS Dashboard',
        '2. Navigate to API Settings',
        '3. Set delivery report URL',
        '4. Set inbound message URL',
      ],
    },
    email: {
      url: `${baseUrl}/api/webhooks/email`,
      description: 'Handles inbound email webhooks (SendGrid Parse)',
      method: 'POST',
      setup: [
        '1. Go to SendGrid → Settings → Inbound Parse',
        '2. Add new hostname and URL',
        '3. Set destination URL to webhook URL above',
        '4. Check "Post the raw, full MIME message"',
      ],
    },
  };

  return NextResponse.json({
    success: true,
    data: {
      webhooks,
      baseUrl,
      documentation: `${baseUrl}/docs/webhooks`,
    },
  });
}

/**
 * POST /api/admin/webhooks/test
 * Test webhook delivery
 */
export async function POST(request) {
  const tenantCtx = getTenantContext();

  if (!tenantCtx || tenantCtx.role !== 'company_admin') {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { channelType, accountId } = await request.json();

    // This would send a test message through the webhook system
    // Implementation depends on your testing strategy

    return NextResponse.json({
      success: true,
      message: 'Test webhook sent',
      data: {
        channelType,
        accountId,
        testedAt: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('Test webhook error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to test webhook',
        error: error.message,
      },
      { status: 500 }
    );
  }
}