// src/app/api/contacts/[contactId]/custom-fields/route.js
/**
 * Custom Fields API for Contacts
 * POST - Create/Update custom fields for a contact
 * GET - Get custom fields for a contact
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import ContactSchema from '@/models/schemas/Contact';

// POST - Create/Update custom fields
export async function POST(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant context required' },
        { status: 400 }
      );
    }

    const tenantDB = await getTenantDB(context.tenantId);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    const { contactId } = await params;
    const body = await request.json();
    const { customFields, applyToAll, contactType } = body;

    if (!customFields || typeof customFields !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Custom fields are required' },
        { status: 400 }
      );
    }

    // Validate field names for duplicates
    const fieldNames = Object.values(customFields).map(f => f.name?.toLowerCase().trim());
    const uniqueNames = new Set(fieldNames);
    if (uniqueNames.size !== fieldNames.length) {
      return NextResponse.json(
        { success: false, error: 'Duplicate field names are not allowed' },
        { status: 400 }
      );
    }

    // Update the contact's custom fields
    const contact = await Contact.findById(contactId);
    if (!contact) {
      return NextResponse.json(
        { success: false, error: 'Contact not found' },
        { status: 404 }
      );
    }

    // Check for duplicate names against existing fields
    const existingCustomFields = contact.customFields || {};
    for (const [newId, newField] of Object.entries(customFields)) {
      const newName = newField.name?.toLowerCase().trim();
      for (const [existingId, existingField] of Object.entries(existingCustomFields)) {
        if (existingId !== newId && existingField.name?.toLowerCase().trim() === newName) {
          return NextResponse.json(
            { success: false, error: `A field named "${newField.name}" already exists` },
            { status: 400 }
          );
        }
      }
    }

    // Merge with existing custom fields
    const updatedCustomFields = { ...existingCustomFields, ...customFields };
    contact.customFields = updatedCustomFields;
    await contact.save();

    // If applyToAll is true, use bulkWrite for performance
    if (applyToAll && contactType) {
      try {
        // Build bulk operations using $set for each field
        const setOperations = {};
        for (const [fieldId, fieldData] of Object.entries(customFields)) {
          setOperations[`customFields.${fieldId}`] = fieldData;
        }

        await Contact.updateMany(
          {
            Contact_Type: contactType,
            _id: { $ne: contactId },
          },
          { $set: setOperations }
        );
      } catch (updateError) {
        console.error('⚠️ Error applying custom fields to all contacts:', updateError);
        // Don't fail the entire operation - the main contact was already updated
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Custom fields saved successfully',
      data: updatedCustomFields,
    });
  } catch (error) {
    console.error('❌ Save custom fields error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save custom fields' },
      { status: 500 }
    );
  }
}

// GET - Get custom fields for a contact
export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant context required' },
        { status: 400 }
      );
    }

    const tenantDB = await getTenantDB(context.tenantId);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    const { contactId } = await params;
    const contact = await Contact.findById(contactId).select('customFields').lean();

    if (!contact) {
      return NextResponse.json(
        { success: false, error: 'Contact not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: contact.customFields || {},
    });
  } catch (error) {
    console.error('❌ Get custom fields error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get custom fields' },
      { status: 500 }
    );
  }
}
