// src/app/api/contacts/[contactId]/custom-fields/[fieldId]/route.js
/**
 * Custom Field CRUD API
 * PUT - Update a specific custom field
 * DELETE - Delete a specific custom field
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import ContactSchema from '@/models/schemas/Contact';

// PUT - Update a specific custom field
export async function PUT(request, { params }) {
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

    const { contactId, fieldId } = await params;
    const body = await request.json();
    const { fieldData, applyToAll, contactType } = body;

    if (!fieldData) {
      return NextResponse.json(
        { success: false, error: 'Field data is required' },
        { status: 400 }
      );
    }

    const contact = await Contact.findById(contactId);
    if (!contact) {
      return NextResponse.json(
        { success: false, error: 'Contact not found' },
        { status: 404 }
      );
    }

    const customFields = contact.customFields || {};
    if (!customFields[fieldId]) {
      return NextResponse.json(
        { success: false, error: 'Custom field not found' },
        { status: 404 }
      );
    }

    // Check for duplicate field name
    if (fieldData.name) {
      const nameLC = fieldData.name.toLowerCase().trim();
      for (const [existingId, existingField] of Object.entries(customFields)) {
        if (existingId !== fieldId && existingField.name?.toLowerCase().trim() === nameLC) {
          return NextResponse.json(
            { success: false, error: `A field named "${fieldData.name}" already exists` },
            { status: 400 }
          );
        }
      }
    }

    // Update the field
    customFields[fieldId] = { ...customFields[fieldId], ...fieldData };
    contact.customFields = customFields;
    await contact.save();

    // If applyToAll is true, update ALL contacts of that type (not just those that already have the field)
    if (applyToAll && contactType) {
      try {
        // Build $set for the specific field path
        const setOp = {};
        setOp[`customFields.${fieldId}`] = customFields[fieldId];

        await Contact.updateMany(
          {
            Contact_Type: contactType,
            _id: { $ne: contactId },
          },
          { $set: setOp }
        );
      } catch (updateError) {
        console.error('⚠️ Error updating contacts with custom field:', updateError);
        // Don't fail the entire operation - the main contact was already updated
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Custom field updated successfully',
      data: customFields[fieldId],
    });
  } catch (error) {
    console.error('❌ Update custom field error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update custom field' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a specific custom field
export async function DELETE(request, { params }) {
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

    const { contactId, fieldId } = await params;
    const { searchParams } = new URL(request.url);
    const applyToAll = searchParams.get('applyToAll') === 'true';
    const contactType = searchParams.get('contactType') || '';

    const contact = await Contact.findById(contactId);
    if (!contact) {
      return NextResponse.json(
        { success: false, error: 'Contact not found' },
        { status: 404 }
      );
    }

    const customFields = contact.customFields || {};
    if (!customFields[fieldId]) {
      return NextResponse.json(
        { success: false, error: 'Custom field not found' },
        { status: 404 }
      );
    }

    // Delete the field
    delete customFields[fieldId];
    contact.customFields = customFields;
    await contact.save();

    // If applyToAll is true, delete from all contacts with the same Contact_Type using $unset
    if (applyToAll && contactType) {
      try {
        const unsetOp = {};
        unsetOp[`customFields.${fieldId}`] = '';

        await Contact.updateMany(
          {
            Contact_Type: contactType,
            _id: { $ne: contactId },
            [`customFields.${fieldId}`]: { $exists: true },
          },
          { $unset: unsetOp }
        );
      } catch (updateError) {
        console.error('⚠️ Error deleting custom field from other contacts:', updateError);
        // Don't fail the entire operation - the main contact was already updated
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Custom field deleted successfully',
    });
  } catch (error) {
    console.error('❌ Delete custom field error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete custom field' },
      { status: 500 }
    );
  }
}
