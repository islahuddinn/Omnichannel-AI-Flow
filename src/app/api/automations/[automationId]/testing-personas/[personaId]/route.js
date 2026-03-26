// src/app/api/automations/[automationId]/testing-personas/[personaId]/route.js
import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import TestingPersonaSchema from '@/models/schemas/TestingPersona';

// GET - Get single testing persona
export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { automationId, personaId } = await params;
    const context = await getTenantContext(request);
    
    const tenantDB = await getTenantDB(context.tenantId);
    const TestingPersona = tenantDB.models.TestingPersona || tenantDB.model('TestingPersona', TestingPersonaSchema);
    
    const persona = await TestingPersona.findOne({
      _id: personaId,
      automationId,
      tenantId: context.tenantId
    })
    .populate('contactId', 'name email phone')
    .populate('statistics.outcomesMatched.outcomeId', 'outcomeName possibleOutcome')
    .lean();
    
    if (!persona) {
      return NextResponse.json(
        { success: false, error: 'Testing persona not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: persona
    });
  } catch (error) {
    console.error('[TestingPersonas] GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch testing persona' },
      { status: 500 }
    );
  }
}

// PUT - Update testing persona
export async function PUT(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { automationId, personaId } = await params;
    const context = await getTenantContext(request);
    const body = await request.json();
    const { name, email, phone, customFields } = body;
    
    const tenantDB = await getTenantDB(context.tenantId);
    const TestingPersona = tenantDB.models.TestingPersona || tenantDB.model('TestingPersona', TestingPersonaSchema);
    
    const persona = await TestingPersona.findOne({
      _id: personaId,
      automationId,
      tenantId: context.tenantId
    });
    
    if (!persona) {
      return NextResponse.json(
        { success: false, error: 'Testing persona not found' },
        { status: 404 }
      );
    }
    
    // ✅ Validate required fields
    if (name !== undefined && (!name || !name.trim())) {
      return NextResponse.json(
        { success: false, error: 'Name is required' },
        { status: 400 }
      );
    }

    // ✅ Validate email format if provided
    if (email !== undefined && email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return NextResponse.json(
          { success: false, error: 'Please enter a valid email address' },
          { status: 400 }
        );
      }
    }

    // ✅ Check for duplicate email or phone within the same automation (excluding this persona)
    const duplicateConditions = [];
    const effectiveEmail = email !== undefined ? email : persona.email;
    const effectivePhone = phone !== undefined ? phone : persona.phone;

    if (effectiveEmail && effectiveEmail.trim()) {
      duplicateConditions.push({ email: effectiveEmail.trim().toLowerCase() });
    }
    if (effectivePhone && effectivePhone.trim()) {
      duplicateConditions.push({ phone: effectivePhone.trim() });
    }

    if (duplicateConditions.length > 0) {
      const existingDuplicate = await TestingPersona.findOne({
        tenantId: context.tenantId,
        automationId,
        _id: { $ne: personaId }, // Exclude current persona
        $or: duplicateConditions
      });

      if (existingDuplicate) {
        const matchField = existingDuplicate.email === (effectiveEmail?.trim().toLowerCase())
          ? 'email address'
          : 'phone number';
        return NextResponse.json(
          { success: false, error: `A testing persona with this ${matchField} already exists in this automation.` },
          { status: 409 }
        );
      }
    }

    // Update fields
    if (name !== undefined) persona.name = name.trim();
    if (email !== undefined) persona.email = email;
    if (phone !== undefined) persona.phone = phone;
    if (customFields !== undefined) persona.customFields = customFields;

    await persona.save();
    
    const updatedPersona = await TestingPersona.findById(persona._id)
      .populate('contactId', 'name email phone')
      .lean();
    
    return NextResponse.json({
      success: true,
      data: updatedPersona
    });
  } catch (error) {
    console.error('[TestingPersonas] PUT error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update testing persona' },
      { status: 500 }
    );
  }
}

// DELETE - Delete testing persona
export async function DELETE(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { automationId, personaId } = await params;
    const context = await getTenantContext(request);
    
    const tenantDB = await getTenantDB(context.tenantId);
    const TestingPersona = tenantDB.models.TestingPersona || tenantDB.model('TestingPersona', TestingPersonaSchema);
    
    const persona = await TestingPersona.findOneAndDelete({
      _id: personaId,
      automationId,
      tenantId: context.tenantId
    });
    
    if (!persona) {
      return NextResponse.json(
        { success: false, error: 'Testing persona not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Testing persona deleted successfully'
    });
  } catch (error) {
    console.error('[TestingPersonas] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete testing persona' },
      { status: 500 }
    );
  }
}

