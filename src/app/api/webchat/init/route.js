// src/app/api/webchat/init/route.js
/**
 * WebChat Initialization API
 * Creates a new visitor session and returns JWT token
 */

import { NextResponse } from 'next/server';
import { WebChatAdapter } from '@/services/channel/adapters/WebChatAdapter';
import { resolveTenant } from '@/services/cache/tenantCache';

/**
 * POST /api/webchat/init
 * Initialize WebChat session for visitor
 */
export async function POST(request) {
  try {
    const { widgetId, metadata } = await request.json();

    if (!widgetId) {
      return NextResponse.json(
        { success: false, message: 'Widget ID required' },
        { status: 400 }
      );
    }

    // Resolve tenant from widget ID
    const tenantData = await resolveTenant('webchat', widgetId);

    if (!tenantData) {
      return NextResponse.json(
        { success: false, message: 'Invalid widget ID' },
        { status: 404 }
      );
    }

    // Get WebChat credentials
    const { getMasterDB } = await import('@/config/database');
    const masterDB = await getMasterDB();
    const CompanyAccount = masterDB.model('CompanyAccount');

    const account = await CompanyAccount.findById(tenantData.accountId);
    if (!account) {
      return NextResponse.json(
        { success: false, message: 'Widget configuration not found' },
        { status: 404 }
      );
    }

    // Create adapter instance
    const adapter = new WebChatAdapter(account.credentials);

    // Create visitor session
    const visitorData = {
      visitorId: generateVisitorId(),
      widgetId,
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: metadata.userAgent,
      referrer: metadata.referrer,
      page: metadata.page,
      language: metadata.language,
      timezone: metadata.timezone,
    };

    const { session, token } = await adapter.createSession(visitorData);

    // Store session in database for tracking
    const { getTenantDB } = await import('@/config/database');
    const tenantDB = await getTenantDB(tenantData.tenantId);
    const WebChatSession = tenantDB.model('WebChatSession');

    await WebChatSession.create({
      sessionId: session.sessionId,
      visitorId: session.visitorId,
      widgetId,
      channelAccountId: account._id,
      metadata: session.metadata,
      status: 'active',
      createdAt: new Date(),
    });

    console.log(`✅ WebChat session created: ${session.sessionId}`);

    return NextResponse.json({
      success: true,
      data: {
        session: {
          sessionId: session.sessionId,
          token,
          createdAt: session.createdAt,
        },
      },
    });

  } catch (error) {
    console.error('WebChat init error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to initialize chat session',
      },
      { status: 500 }
    );
  }
}

/**
 * Generate unique visitor ID
 */
function generateVisitorId() {
  return `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}