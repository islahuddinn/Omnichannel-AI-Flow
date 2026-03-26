// src/app/api/automations/[automationId]/suggest-outcomes/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import { getMasterDB } from '@/config/database';
import AutomationSchema from '@/models/schemas/Automation';
import CompanySchema from '@/models/schemas/Company';

/**
 * POST /api/automations/[automationId]/suggest-outcomes
 * AI-powered outcome suggestions based on the automation's message content.
 * Returns 3-5 suggested outcomes with names, descriptions, and follow-up prompts.
 */
export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { automationId } = await params;
    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);

    const Automation = tenantDB.models.Automation || tenantDB.model('Automation', AutomationSchema);

    // Get automation with channel config (message content)
    const automation = await Automation.findById(automationId).lean();
    if (!automation) {
      return NextResponse.json({ success: false, error: 'Automation not found' }, { status: 404 });
    }

    // Extract message content from channels config
    let messageContent = '';
    for (const ch of (automation.channels || [])) {
      if (ch.customContent?.body) {
        messageContent = ch.customContent.body;
        break;
      }
    }

    // Also accept message content from request body (for preview before saving)
    const body = await request.json().catch(() => ({}));
    if (body.messageContent) {
      messageContent = body.messageContent;
    }

    if (!messageContent) {
      return NextResponse.json({
        success: false,
        error: 'No message content found. Please configure the automation message first.'
      }, { status: 400 });
    }

    // Get AI config from company settings
    const masterDB = await getMasterDB();
    const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
    let company = await Company.findOne({ tenantDatabaseName: context.tenantId }).lean();
    if (!company) {
      try { company = await Company.findById(context.tenantId).lean(); } catch (_) {}
    }

    const aiBot = company?.features?.aiBot || {};
    if (!aiBot.enabled || !aiBot.provider || !aiBot.model || !aiBot.apiKey) {
      return NextResponse.json({
        success: false,
        error: 'AI Bot is not configured. Please enable it in Settings first.'
      }, { status: 400 });
    }

    const { createModelInstance } = await import('@/services/bot/AIProviderRegistry.js');
    const { generateObject } = await import('ai');
    const { z } = await import('zod');

    const model = createModelInstance(aiBot.provider, aiBot.model, aiBot.apiKey);

    // Define schema for suggestions
    const suggestionsSchema = z.object({
      suggestions: z.array(z.object({
        outcomeName: z.string().describe('Short, clear name for the outcome (3-5 words max)'),
        possibleOutcome: z.string().describe('Description of what customer response qualifies as this outcome (1-2 sentences)'),
        followUpAction: z.string().describe('AI prompt instruction for what to do when this outcome matches (2-3 sentences)'),
      })).min(3).max(6).describe('3-6 suggested outcomes based on likely customer responses'),
    });

    const contactType = automation.triggerConditions?.contactType || 'both';

    const { object: result } = await generateObject({
      model,
      schema: suggestionsSchema,
      prompt: `Analyze this automated message and suggest 4-5 likely customer response outcomes.

AUTOMATED MESSAGE:
"${messageContent}"

AUTOMATION NAME: "${automation.name || 'Unnamed'}"
TARGET AUDIENCE: ${contactType === 'both' ? 'Customers and Handymen' : contactType === 'handyman' ? 'Handymen/Technicians' : 'Customers'}

Generate outcomes that cover the most common ways a customer/recipient would respond to this message. Include:
1. A positive/interested response
2. A negative/not interested response
3. A request for more information or clarification
4. A specific action response (like providing a date, confirming, etc.)
5. Optionally: an ambiguous or "maybe later" response

For each outcome:
- outcomeName: Keep it short and descriptive (e.g., "Interested", "Not Interested", "Asks for Details", "Provides Date", "Maybe Later")
- possibleOutcome: Describe the types of messages that qualify (e.g., "Customer shows interest, says yes, wants to proceed, asks how to sign up")
- followUpAction: Write a clear AI prompt instruction (e.g., "Thank the customer for their interest and ask them to schedule a call. Be warm and professional.")

Make the follow-up actions professional, warm, and action-oriented.`,
      temperature: 0.7,
      maxTokens: 1500,
      abortSignal: AbortSignal.timeout(30000),
    });

    return NextResponse.json({
      success: true,
      data: {
        suggestions: result.suggestions,
        messageContent: messageContent.substring(0, 200),
        automationName: automation.name,
      }
    });
  } catch (error) {
    console.error('[SuggestOutcomes] Error:', error?.message || error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate suggestions. Please try again.' },
      { status: 500 }
    );
  }
}
