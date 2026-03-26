// src/app/api/admin/webchat/route.js
/**
 * WebChat Widget Configuration API
 * Company Admin can configure and manage their WebChat widget
 */

import { NextResponse } from 'next/server';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import crypto from 'crypto';

/**
 * GET /api/admin/webchat
 * Get WebChat widget configuration
 */
export async function GET(request) {
  const tenantCtx = getTenantContext();

  if (!tenantCtx || tenantCtx.role === 'agent') {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const tenantDB = await getTenantDB(tenantCtx.tenantId);
    const CompanyAccount = tenantDB.model('CompanyAccount');

    // Find WebChat account
    const account = await CompanyAccount.findOne({
      type: 'webchat',
    });

    if (!account) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No WebChat widget configured',
      });
    }

    // Get widget statistics
    const stats = await getWidgetStats(account.credentials.widgetId);

    // Generate embed code
    const embedCode = generateEmbedCode(account.credentials.widgetId);

    return NextResponse.json({
      success: true,
      data: {
        widgetId: account.credentials.widgetId,
        config: {
          position: account.config?.position || 'bottom-right',
          primaryColor: account.config?.primaryColor || '#4f46e5',
          greeting: account.config?.greeting || 'Hi! How can we help?',
          title: account.config?.title || 'Chat with us',
          enabled: account.enabled !== false,
        },
        stats,
        embedCode,
        createdAt: account.createdAt,
      },
    });

  } catch (error) {
    console.error('Get WebChat config error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to retrieve configuration',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/webchat
 * Create or update WebChat widget configuration
 */
export async function POST(request) {
  const tenantCtx = getTenantContext();

  if (!tenantCtx || tenantCtx.role !== 'company_admin') {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    const config = await request.json();
    const tenantDB = await getTenantDB(tenantCtx.tenantId);
    const CompanyAccount = tenantDB.model('CompanyAccount');

    // Check if widget already exists
    let account = await CompanyAccount.findOne({
      type: 'webchat',
    });

    if (account) {
      // Update existing
      account.config = {
        position: config.position || 'bottom-right',
        primaryColor: config.primaryColor || '#4f46e5',
        greeting: config.greeting || 'Hi! How can we help?',
        title: config.title || 'Chat with us',
      };
      account.enabled = config.enabled !== false;
      account.updatedAt = new Date();
      await account.save();

    } else {
      // Create new
      const widgetId = generateWidgetId();
      const secretKey = generateSecretKey();
      const publicKey = generatePublicKey();

      account = await CompanyAccount.create({
        type: 'webchat',
        name: 'WebChat Widget',
        credentials: {
          widgetId,
          secretKey,
          publicKey,
        },
        config: {
          position: config.position || 'bottom-right',
          primaryColor: config.primaryColor || '#4f46e5',
          greeting: config.greeting || 'Hi! How can we help?',
          title: config.title || 'Chat with us',
        },
        enabled: true,
        createdAt: new Date(),
      });

      // Warm up cache
      const { warmUpTenantCache } = await import('@/services/cache/tenantCache');
      await warmUpTenantCache(tenantCtx.tenantId);
    }

    const embedCode = generateEmbedCode(account.credentials.widgetId, account.config);

    return NextResponse.json({
      success: true,
      message: account ? 'Widget updated' : 'Widget created',
      data: {
        widgetId: account.credentials.widgetId,
        config: account.config,
        embedCode,
      },
    });

  } catch (error) {
    console.error('Save WebChat config error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to save configuration',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/webchat
 * Disable WebChat widget
 */
export async function DELETE(request) {
  const tenantCtx = getTenantContext();

  if (!tenantCtx || tenantCtx.role !== 'company_admin') {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    const tenantDB = await getTenantDB(tenantCtx.tenantId);
    const CompanyAccount = tenantDB.model('CompanyAccount');

    await CompanyAccount.updateOne(
      { type: 'webchat' },
      { 
        enabled: false,
        updatedAt: new Date(),
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Widget disabled',
    });

  } catch (error) {
    console.error('Disable WebChat error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to disable widget',
      },
      { status: 500 }
    );
  }
}

/**
 * Generate unique widget ID
 */
function generateWidgetId() {
  return `widget_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Generate secret key for JWT signing
 */
function generateSecretKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate public key
 */
function generatePublicKey() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Generate embed code
 */
function generateEmbedCode(widgetId, config = {}) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-domain.com';
  
  const attributes = [
    `data-widget-id="${widgetId}"`,
    config.position ? `data-position="${config.position}"` : '',
    config.primaryColor ? `data-color="${config.primaryColor}"` : '',
    config.greeting ? `data-greeting="${config.greeting}"` : '',
    config.title ? `data-title="${config.title}"` : '',
  ].filter(Boolean).join('\n         ');

  return `<!-- OmniConnect WebChat Widget -->
<script src="${baseUrl}/webchat/widget.js"
        ${attributes}>
</script>`;
}

/**
 * Get widget statistics
 */
async function getWidgetStats(widgetId) {
  try {
    const tenantDB = await getTenantDB(tenantCtx.tenantId);
    const WebChatSession = tenantDB.model('WebChatSession');

    const [total, active, today] = await Promise.all([
      WebChatSession.countDocuments({ widgetId }),
      WebChatSession.countDocuments({ widgetId, status: 'active' }),
      WebChatSession.countDocuments({
        widgetId,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    ]);

    return {
      totalSessions: total,
      activeSessions: active,
      sessionsToday: today,
    };

  } catch (error) {
    console.error('Failed to get widget stats:', error);
    return {
      totalSessions: 0,
      activeSessions: 0,
      sessionsToday: 0,
    };
  }
}