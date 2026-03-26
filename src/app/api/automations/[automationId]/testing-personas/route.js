// src/app/api/automations/[automationId]/testing-personas/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import TestingPersonaSchema from '@/models/schemas/TestingPersona';
import ContactSchema from '@/models/schemas/Contact';

// GET - Fetch all testing personas for an automation
export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { automationId } = await params;
    const context = await getTenantContext(request);
    const tenantId = context.tenantId;
    
    if (!automationId) {
      return NextResponse.json(
        { success: false, error: 'Automation ID is required' },
        { status: 400 }
      );
    }
    
    const tenantDB = await getTenantDB(context.tenantId);
    const TestingPersona = tenantDB.models.TestingPersona || tenantDB.model('TestingPersona', TestingPersonaSchema);
    
    const personas = await TestingPersona.find({
      tenantId: context.tenantId,
      automationId
    })
    .populate('contactId', 'name email phone')
    .populate('statistics.outcomesMatched.outcomeId', 'outcomeName possibleOutcome')
    .sort({ createdAt: -1 })
    .lean();
    
    return NextResponse.json({
      success: true,
      data: personas
    });
  } catch (error) {
    console.error('[TestingPersonas] GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch testing personas' },
      { status: 500 }
    );
  }
}

// POST - Create a new testing persona
export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { automationId } = await params;
    const context = await getTenantContext(request);
    const userId = auth.user.userId;
    
    const body = await request.json();
    const { name, email, phone, contactId, customFields } = body;
    
    if (!automationId) {
      return NextResponse.json(
        { success: false, error: 'Automation ID is required' },
        { status: 400 }
      );
    }
    
    // Check if automation exists and get tenantId
    const tenantDB = await getTenantDB(context.tenantId);
    const AutomationSchema = (await import('@/models/schemas/Automation.js')).default;
    const Automation = tenantDB.models.Automation || tenantDB.model('Automation', AutomationSchema);
    
    const automation = await Automation.findOne({
      _id: automationId,
      tenantId: context.tenantId
    });
    
    if (!automation) {
      return NextResponse.json(
        { success: false, error: 'Automation not found' },
        { status: 404 }
      );
    }
    
    // Check if max 5 personas limit
    const TestingPersona = tenantDB.models.TestingPersona || tenantDB.model('TestingPersona', TestingPersonaSchema);
    const existingCount = await TestingPersona.countDocuments({
      tenantId: context.tenantId,
      automationId
    });
    
    if (existingCount >= 5) {
      return NextResponse.json(
        { success: false, error: 'Maximum 5 testing personas allowed per automation' },
        { status: 400 }
      );
    }
    
    // If contactId is provided, fetch contact details
    let personaName = name;
    let personaEmail = email;
    let personaPhone = phone;
    
    if (contactId) {
      const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
      const mongoose = (await import('mongoose')).default;
      
      // Convert contactId to ObjectId if it's a string
      let contactObjectId = contactId;
      if (typeof contactId === 'string') {
        // Handle both string IDs and ObjectId strings
        if (!mongoose.Types.ObjectId.isValid(contactId)) {
          return NextResponse.json(
            { success: false, error: 'Invalid contact ID format' },
            { status: 400 }
          );
        }
        try {
          contactObjectId = new mongoose.Types.ObjectId(contactId);
        } catch (error) {
          console.error('[TestingPersonas] Contact ID conversion error:', error);
          return NextResponse.json(
            { success: false, error: 'Invalid contact ID format' },
            { status: 400 }
          );
        }
      }
      
      // Try to find contact with multiple query strategies
      let contact = await Contact.findOne({
        _id: contactObjectId,
        tenantId: context.tenantId
      });
      
      // If not found, try with string ID
      if (!contact && typeof contactId === 'string') {
        contact = await Contact.findOne({
          _id: contactId,
          tenantId: context.tenantId
        });
      }
      
      // If still not found, try without tenantId check (fallback)
      if (!contact) {
        contact = await Contact.findById(contactObjectId);
      }
      
      if (!contact) {
        console.error('[TestingPersonas] Contact not found:', {
          contactId,
          contactObjectId: contactObjectId.toString(),
          tenantId: context.tenantId
        });
        return NextResponse.json(
          { success: false, error: `Contact not found. Please ensure the contact exists and try again, or use manual entry.` },
          { status: 404 }
        );
      }
      
      // Use contact details if not provided, but prioritize provided values
      personaName = name || contact.name || contact.displayName || 'Unknown';
      personaEmail = email || contact.email || null;
      personaPhone = phone || contact.phone || null;
      
      // Log for debugging
      console.log('[TestingPersonas] Contact found:', {
        contactId: contact._id.toString(),
        name: personaName,
        hasEmail: !!personaEmail,
        hasPhone: !!personaPhone
      });
    }
    
    // Validate required fields
    if (!personaName || !personaName.trim()) {
      return NextResponse.json(
        { success: false, error: 'Name is required' },
        { status: 400 }
      );
    }
    
    // If adding from existing contact (contactId provided), email and phone are optional
    // If manual entry, email and phone are required
    if (!contactId) {
      // Manual entry - require email and phone
      if (!personaEmail || !personaEmail.trim()) {
        return NextResponse.json(
          { success: false, error: 'Email is required' },
          { status: 400 }
        );
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(personaEmail.trim())) {
        return NextResponse.json(
          { success: false, error: 'Please enter a valid email address' },
          { status: 400 }
        );
      }
      
      if (!personaPhone || !personaPhone.trim()) {
        return NextResponse.json(
          { success: false, error: 'Phone number is required' },
          { status: 400 }
        );
      }
    } else {
      // From existing contact - email and phone are optional, but validate format if provided
      if (personaEmail && personaEmail.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(personaEmail.trim())) {
          return NextResponse.json(
            { success: false, error: 'Please enter a valid email address' },
            { status: 400 }
          );
        }
      }
    }
    
    // Check if persona with same contactId already exists for this automation
    if (contactId) {
      const existingPersona = await TestingPersona.findOne({
        tenantId: context.tenantId,
        automationId,
        contactId
      });

      if (existingPersona) {
        return NextResponse.json(
          { success: false, error: 'This contact is already added as a testing persona' },
          { status: 400 }
        );
      }
    }

    // ✅ Check for duplicate email or phone within the same automation
    // Prevents creating multiple personas with identical contact details
    if (personaEmail || personaPhone) {
      const duplicateConditions = [];
      if (personaEmail && personaEmail.trim()) {
        duplicateConditions.push({ email: personaEmail.trim().toLowerCase() });
      }
      if (personaPhone && personaPhone.trim()) {
        duplicateConditions.push({ phone: personaPhone.trim() });
      }

      if (duplicateConditions.length > 0) {
        const existingDuplicate = await TestingPersona.findOne({
          tenantId: context.tenantId,
          automationId,
          $or: duplicateConditions
        });

        if (existingDuplicate) {
          const matchField = existingDuplicate.email === (personaEmail?.trim().toLowerCase())
            ? 'email address'
            : 'phone number';
          return NextResponse.json(
            { success: false, error: `A testing persona with this ${matchField} already exists in this automation.` },
            { status: 409 }
          );
        }
      }
    }

    const persona = await TestingPersona.create({
      automationId,
      contactId: contactId || null,
      name: personaName.trim(),
      email: personaEmail,
      phone: personaPhone,
      customFields: customFields || {},
      tenantId: context.tenantId,
      createdBy: userId,
      statistics: {
        messagesSent: 0,
        messagesDelivered: 0,
        messagesRead: 0,
        messagesFailed: 0,
        outcomesMatched: []
      }
    });
    
    const populatedPersona = await TestingPersona.findById(persona._id)
      .populate('contactId', 'name email phone')
      .lean();
    
    return NextResponse.json({
      success: true,
      data: populatedPersona
    }, { status: 201 });
  } catch (error) {
    console.error('[TestingPersonas] POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create testing persona' },
      { status: 500 }
    );
  }
}

