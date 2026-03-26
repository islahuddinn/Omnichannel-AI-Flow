// src/app/api/automations/[automationId]/testing-personas/send-message/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import TestingPersonaSchema from '@/models/schemas/TestingPersona';
import ContactSchema from '@/models/schemas/Contact';
import ConversationSchema from '@/models/schemas/Conversation';
import MessageSchema from '@/models/schemas/Message';
import MessageLogSchema from '@/models/schemas/MessageLog';
import TemplateSchema from '@/models/schemas/Template';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount';
import { AutomationService } from '@/services/automation/AutomationService';
import { findContactByPhoneOrEmail, createOrUpdateContactForPersona } from '@/services/contact/ContactLookupService';

// POST - Send message to testing personas
export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { automationId } = await params;
    const context = await getTenantContext(request);
    const body = await request.json();
    const { personaIds } = body; // Array of persona IDs to send to, or empty for all
    
    if (!automationId) {
      return NextResponse.json(
        { success: false, error: 'Automation ID is required' },
        { status: 400 }
      );
    }
    
    const tenantDB = await getTenantDB(context.tenantId);
    
    // Get automation
    const AutomationSchema = (await import('@/models/schemas/Automation.js')).default;
    const Automation = tenantDB.models.Automation || tenantDB.model('Automation', AutomationSchema);
    
    const automation = await Automation.findOne({
      _id: automationId,
      tenantId: context.tenantId
    })
      .populate('channels.channelAccountId')
      .populate('channels.templateId')
      .lean();
    
    if (!automation) {
      return NextResponse.json(
        { success: false, error: 'Automation not found' },
        { status: 404 }
      );
    }
    
    // Check if automation has channels configured
    if (!automation.channels || automation.channels.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Automation must have at least one channel configured' },
        { status: 400 }
      );
    }
    
    // Get testing personas
    const TestingPersona = tenantDB.models.TestingPersona || tenantDB.model('TestingPersona', TestingPersonaSchema);
    const query = {
      tenantId: context.tenantId,
      automationId
    };
    
    if (personaIds && personaIds.length > 0) {
      query._id = { $in: personaIds };
    }
    
    const personas = await TestingPersona.find(query)
      .populate('contactId')
      .lean();
    
    if (personas.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No testing personas found to send messages to' },
        { status: 400 }
      );
    }
    
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const MessageLog = tenantDB.models.MessageLog || tenantDB.model('MessageLog', MessageLogSchema);
    const Template = tenantDB.models.Template || tenantDB.model('Template', TemplateSchema);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
    
    const results = [];
    const errors = [];
    
    // Send message to each persona
    for (let i = 0; i < personas.length; i++) {
      const persona = personas[i];

      // ✅ CRITICAL: Add delay between sends to prevent RabbitMQ consumer channel issues
      // The worker processes messages sequentially (prefetch=1), so spacing them out
      // ensures the consumer has time to process each one without channel pressure
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      try {
        // ✅ Get or create contact using the EXACT same logic as webhook handlers
        // This ensures consistency and prevents duplicate contacts
        let contact = null;

        // ✅ ALWAYS search for existing contact first using comprehensive lookup (same as webhooks)
        // This finds contacts created from any source (normal messages, webhooks, etc.)
        contact = await findContactByPhoneOrEmail({
          tenantDB,
          phone: persona.phone,
          email: persona.email
        });
        
        // ✅ If persona.contactId exists and we didn't find a contact, try to use it
        if (!contact && persona.contactId) {
          contact = await Contact.findById(persona.contactId)
            .select('name displayName email phone normalizedPhone identifiers isTestingPersona testingPersonaId');
          if (contact) {
            console.log(`[TestingPersonas] Found contact via persona.contactId:`, contact._id);
          }
        }
          
        // ✅ Create or update contact using the same service function
        // This ensures testing persona fields are set correctly and identifiers are populated
        contact = await createOrUpdateContactForPersona({
          tenantDB,
          contact: contact, // Pass found contact or null
          persona: {
            ...persona,
            tenantId: context.tenantId // Ensure tenantId is set
          }
        });

        // ✅ Ensure contact was created/found successfully
        if (!contact || !contact._id) {
          throw new Error(`Failed to find or create contact for persona "${persona.name}" (email: ${persona.email || 'N/A'}, phone: ${persona.phone || 'N/A'})`);
        }

        // ✅ Ensure contact has all necessary fields loaded before sending
        // Reload if needed to get fresh data with all identifiers
        if (contact && (!contact.identifiers || (!contact.identifiers.email && contact.email))) {
          contact = await Contact.findById(contact._id)
            .select('name displayName email phone normalizedPhone identifiers isTestingPersona testingPersonaId');
          
          // ✅ If contact has email but not in identifiers, update it
          if (contact.email && !contact.identifiers?.email) {
            await Contact.findByIdAndUpdate(contact._id, {
              $set: {
                'identifiers.email': contact.email
              }
            });
            contact.identifiers = contact.identifiers || {};
            contact.identifiers.email = contact.email;
            console.log(`✅ [TestingPersonas] Updated contact ${contact._id} with email identifier:`, contact.email);
          }
        }
        
        // ✅ Update persona.contactId if it's not set or different
        if (!persona.contactId || persona.contactId.toString() !== contact._id.toString()) {
          await TestingPersona.findByIdAndUpdate(persona._id, {
            $set: { contactId: contact._id }
          });
        }
        
        // Send message using AutomationService logic
        // Use the same method as OWM automation - it handles conversation creation internally
        const messageResult = await AutomationService.sendMessageToContact(
          contact,
          automation,
          context.tenantId,
          tenantDB,
          Conversation,
          Message,
          MessageLog,
          { isTestingPersona: true }
        );
        
        // Update persona statistics
        await TestingPersona.findByIdAndUpdate(persona._id, {
          $inc: {
            'statistics.messagesSent': 1
          },
          $set: {
            'statistics.lastMessageSentAt': new Date()
          }
        });
        
        results.push({
          personaId: persona._id,
          personaName: persona.name,
          success: true,
          messageId: messageResult?.messageId || null
        });
      } catch (error) {
        console.error(`[TestingPersonas] Error sending to persona ${persona._id}:`, error);
        errors.push({
          personaId: persona._id,
          personaName: persona.name,
          error: error.message || 'Failed to send message'
        });
        
        // Update persona statistics for failed message
        await TestingPersona.findByIdAndUpdate(persona._id, {
          $inc: {
            'statistics.messagesFailed': 1
          }
        });
      }
    }
    
    // ✅ CRITICAL: Post-send verification - re-queue any messages that might be stuck
    // This handles the case where the RabbitMQ consumer channel closed between messages
    // Messages are queued to RabbitMQ via AutomationService.sendMessageToContact.
    // The outbound worker processes them. No re-queuing needed here — the sweep
    // in messageOutboundWorker handles truly stuck messages after 5 minutes.

    return NextResponse.json({
      success: true,
      data: {
        sent: results.length,
        failed: errors.length,
        results,
        errors
      }
    });
  } catch (error) {
    console.error('[TestingPersonas] Send message error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to send messages to testing personas' },
      { status: 500 }
    );
  }
}

