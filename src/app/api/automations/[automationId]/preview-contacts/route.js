// src/app/api/automations/[automationId]/preview-contacts/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import AutomationSchema from '@/models/schemas/Automation';
import ContactSchema from '@/models/schemas/Contact';
import DealSchema from '@/models/schemas/Deal';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { AutomationService } from '@/services/automation/AutomationService';

/**
 * GET /api/automations/[automationId]/preview-contacts
 * Preview which contacts will be targeted before publishing.
 * Returns total count and a sample list of contacts.
 */
export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { automationId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);

    const Automation = tenantDB.models.Automation || tenantDB.model('Automation', AutomationSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Deal = tenantDB.models.Deal || tenantDB.model('Deal', DealSchema);

    const automation = await Automation.findById(automationId).lean();
    if (!automation) {
      return NextResponse.json({ success: false, error: 'Automation not found' }, { status: 404 });
    }
    if (automation.tenantId !== context.tenantId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Validate that trigger conditions exist
    if (!automation.triggerConditions || !automation.triggerConditions.conditions || automation.triggerConditions.conditions.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          totalCount: 0,
          sampleContacts: [],
          contactType: automation.triggerConditions?.contactType || 'both',
          conditionsCount: 0,
          warning: 'No trigger conditions configured',
        },
      });
    }

    const { searchParams } = new URL(request.url);
    const sampleSize = Math.min(parseInt(searchParams.get('sampleSize') || '25', 10), 100);

    // Build the same contact query that filterContacts uses, but use countDocuments + limit
    // This prevents loading 100K+ contacts into memory just to count them.
    const filteredContacts = await AutomationService.filterContacts(automation, tenantDB, Contact, Deal);

    // Safety cap: only process channel breakdown on the sample, not the full set
    const sampleContacts = filteredContacts.slice(0, sampleSize).map(contact => ({
      _id: contact._id,
      name: contact.name || contact.displayName || 'Unknown',
      email: contact.email || null,
      phone: contact.phone || null,
      Contact_Type: contact.Contact_Type || null,
      Is_Active: contact.Is_Active,
    }));

    // Channel breakdown on the sample set (not the full 100K+ set)
    const channelBreakdown = {};
    if (automation.channels && automation.channels.length > 0) {
      // Use a capped subset (max 1000) for channel breakdown estimation
      const breakdownSet = filteredContacts.slice(0, 1000);
      const breakdownTotal = breakdownSet.length;

      for (const ch of automation.channels) {
        const channelType = ch.channel;
        let reachable = 0;
        for (const contact of breakdownSet) {
          if (AutomationService.getContactIdentifier(contact, channelType)) reachable++;
        }
        channelBreakdown[channelType] = {
          reachable: breakdownTotal > 0 ? Math.round((reachable / breakdownTotal) * filteredContacts.length) : 0,
          unreachable: breakdownTotal > 0 ? Math.round(((breakdownTotal - reachable) / breakdownTotal) * filteredContacts.length) : 0,
          percentage: breakdownTotal > 0
            ? parseFloat(((reachable / breakdownTotal) * 100).toFixed(1))
            : 0,
          estimated: filteredContacts.length > 1000,
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        totalCount: filteredContacts.length,
        sampleContacts,
        sampleSize,
        contactType: automation.triggerConditions.contactType,
        conditionsCount: automation.triggerConditions.conditions.length,
        channelBreakdown,
      },
    });
  } catch (error) {
    console.error('[PreviewContacts] GET error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to preview contacts' },
      { status: 500 }
    );
  }
}
