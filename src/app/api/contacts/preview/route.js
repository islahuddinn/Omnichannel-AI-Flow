// src/app/api/contacts/preview/route.js
/**
 * Preview API for Contacts
 * GET - Get preview of all fields and values for contacts of a specific type
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import ContactSchema from '@/models/schemas/Contact';

export async function GET(request) {
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

    const { searchParams } = new URL(request.url);
    const contactType = searchParams.get('contactType');

    if (!contactType) {
      return NextResponse.json(
        { success: false, error: 'Contact type is required' },
        { status: 400 }
      );
    }

    // Get all contacts of the specified type
    const contacts = await Contact.find({
      Contact_Type: contactType,
    })
      .select('details customFields')
      .lean();

    // Collect all unique field names from details and customFields
    const allFields = new Set();
    const fieldValues = {}; // { fieldName: Set of unique values }

    contacts.forEach(contact => {
      // Process details object
      if (contact.details && typeof contact.details === 'object') {
        Object.keys(contact.details).forEach(fieldName => {
          allFields.add(fieldName);
          if (!fieldValues[fieldName]) {
            fieldValues[fieldName] = new Set();
          }
          const value = contact.details[fieldName];
          if (value !== null && value !== undefined && value !== '') {
            fieldValues[fieldName].add(String(value));
          }
        });
      }

      // Process customFields object
      if (contact.customFields && typeof contact.customFields === 'object') {
        Object.keys(contact.customFields).forEach(fieldName => {
          allFields.add(fieldName);
          if (!fieldValues[fieldName]) {
            fieldValues[fieldName] = new Set();
          }
          const field = contact.customFields[fieldName];
          if (field && field.value !== null && field.value !== undefined && field.value !== '') {
            fieldValues[fieldName].add(String(field.value));
          }
        });
      }
    });

    // Track which fields come from details vs customFields
    const fieldsFromDetails = new Set();
    const fieldsFromCustomFields = new Set();
    
    contacts.forEach(contact => {
      if (contact.details && typeof contact.details === 'object') {
        Object.keys(contact.details).forEach(fieldName => {
          fieldsFromDetails.add(fieldName);
        });
      }
      if (contact.customFields && typeof contact.customFields === 'object') {
        Object.keys(contact.customFields).forEach(fieldName => {
          fieldsFromCustomFields.add(fieldName);
        });
      }
    });

    // Convert Sets to Arrays and sort
    const fieldsData = Array.from(allFields).sort().map(fieldName => ({
      name: fieldName,
      source: fieldsFromDetails.has(fieldName) ? 'details' : 'customFields',
      values: Array.from(fieldValues[fieldName] || []).sort().slice(0, 100), // Limit to 100 values per field
      valueCount: (fieldValues[fieldName] || new Set()).size,
    }));

    return NextResponse.json({
      success: true,
      data: {
        totalContacts: contacts.length,
        fields: fieldsData,
      },
    });
  } catch (error) {
    console.error('❌ Preview contacts error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get preview' },
      { status: 500 }
    );
  }
}

