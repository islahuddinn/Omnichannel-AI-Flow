// src/app/api/contacts/fields/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import ContactSchema from '@/models/schemas/Contact';
import DealSchema from '@/models/schemas/Deal';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';

export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const { searchParams } = new URL(request.url);
    const entity = searchParams.get('entity'); // 'contact' or 'deal'
    const contactType = searchParams.get('contactType'); // 'handyman', 'customer', or 'both'

    if (!entity) {
      return NextResponse.json(
        { success: false, error: 'Entity is required' },
        { status: 400 }
      );
    }

    const Model = entity === 'contact'
      ? (tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema))
      : (tenantDB.models.Deal || tenantDB.model('Deal', DealSchema));

    const fields = new Set();
    // Map to store field names: fieldKey -> displayName
    const fieldNamesMap = new Map();

    if (entity === 'contact') {
      // Build query to filter by contact type if specified
      let contactQuery = { 
        customFields: { $exists: true, $ne: null }
      };
      
      if (contactType === 'handyman') {
        // Combine customFields requirement with contact type filter
        contactQuery = {
          $and: [
            { customFields: { $exists: true, $ne: null } },
            {
              $or: [
                { Contact_Type: 'Handyman' },
                { Contact_Type: { $exists: false } },
                { Contact_Type: null }
              ]
            }
          ]
        };
      } else if (contactType === 'customer') {
        // Combine customFields requirement with contact type filter
        contactQuery = {
          $and: [
            { customFields: { $exists: true, $ne: null } },
            {
              $or: [
                { Contact_Type: 'Customer' },
                { Contact_Type: { $exists: false } },
                { Contact_Type: null }
              ]
            }
          ]
        };
      }
      // If contactType === 'both' or not specified, don't filter by Contact_Type
      
      // Process in batches using cursor to avoid memory issues
      const batchSize = 100;
      let processedCount = 0;
      const maxToProcess = 500; // Limit total documents processed
      
      try {
        // Use cursor to process in batches
        // Check for customFields that exist and are not null, filtered by contact type
        const customFieldsCursor = Model.find(contactQuery)
          .select('customFields Contact_Type')
          .lean()
          .cursor({ batchSize });
        
        let contactsWithCustomFields = 0;
        for await (const contact of customFieldsCursor) {
          if (processedCount >= maxToProcess) break;
          
          if (contact.customFields && typeof contact.customFields === 'object') {
            const customFieldsKeys = Object.keys(contact.customFields);
            // Only process if customFields is not empty
            if (customFieldsKeys.length > 0) {
              contactsWithCustomFields++;
              customFieldsKeys.forEach(key => {
                const fieldData = contact.customFields[key];
                // Only add if fieldData exists and is not null/undefined
                if (fieldData !== null && fieldData !== undefined) {
                  const fieldPath = `customFields.${key}`;
                  fields.add(fieldPath);
                  // Store the name if available (use the first one we encounter)
                  if (typeof fieldData === 'object' && fieldData.name && !fieldNamesMap.has(fieldPath)) {
                    fieldNamesMap.set(fieldPath, fieldData.name);
                  }
                }
              });
            }
          }
          processedCount++;
        }
        console.log(`[Fields API] Processed ${contactsWithCustomFields} contacts with customFields, found ${fields.size} unique customFields`);

        // Reset for details - also filter by contact type
        processedCount = 0;
        let detailsQuery = { 
          details: { $exists: true, $ne: null } 
        };
        
        if (contactType === 'handyman') {
          detailsQuery = {
            $and: [
              { details: { $exists: true, $ne: null } },
              {
                $or: [
                  { Contact_Type: 'Handyman' },
                  { Contact_Type: { $exists: false } },
                  { Contact_Type: null }
                ]
              }
            ]
          };
        } else if (contactType === 'customer') {
          detailsQuery = {
            $and: [
              { details: { $exists: true, $ne: null } },
              {
                $or: [
                  { Contact_Type: 'Customer' },
                  { Contact_Type: { $exists: false } },
                  { Contact_Type: null }
                ]
              }
            ]
          };
        }
        
        const detailsCursor = Model.find(detailsQuery)
          .select('details Contact_Type')
          .lean()
          .cursor({ batchSize });
        
        for await (const contact of detailsCursor) {
          if (processedCount >= maxToProcess) break;
          
          if (contact.details && typeof contact.details === 'object') {
            Object.keys(contact.details).forEach(key => {
              fields.add(`details.${key}`);
            });
          }
          processedCount++;
        }
      } catch (error) {
        console.error('Cursor processing error, using limited fallback:', error);
        // Fallback: fetch very limited sample
        const sampleContacts = await Model.find({})
          .select('customFields details')
          .limit(100)
          .lean();
        
        sampleContacts.forEach(contact => {
          if (contact.customFields && typeof contact.customFields === 'object') {
            const customFieldsKeys = Object.keys(contact.customFields);
            if (customFieldsKeys.length > 0) {
              customFieldsKeys.forEach(key => {
                const fieldData = contact.customFields[key];
                if (fieldData !== null && fieldData !== undefined) {
                  const fieldPath = `customFields.${key}`;
                  fields.add(fieldPath);
                  // Store the name if available
                  if (typeof fieldData === 'object' && fieldData.name && !fieldNamesMap.has(fieldPath)) {
                    fieldNamesMap.set(fieldPath, fieldData.name);
                  }
                }
              });
            }
          }
          if (contact.details && typeof contact.details === 'object') {
            const detailsKeys = Object.keys(contact.details);
            if (detailsKeys.length > 0) {
              detailsKeys.forEach(key => {
                fields.add(`details.${key}`);
              });
            }
          }
        });
      }
    } else {
      // For deals, only get details fields
      const batchSize = 100;
      let processedCount = 0;
      const maxToProcess = 500;
      
      try {
        const detailsCursor = Model.find({ 
          details: { $exists: true, $ne: null } 
        })
          .select('details')
          .lean()
          .cursor({ batchSize });
        
        for await (const deal of detailsCursor) {
          if (processedCount >= maxToProcess) break;
          
          if (deal.details && typeof deal.details === 'object') {
            Object.keys(deal.details).forEach(key => {
              fields.add(`details.${key}`);
            });
          }
          processedCount++;
        }
      } catch (error) {
        console.error('Deal cursor error, using limited fallback:', error);
        // Fallback: fetch very limited sample
        const sampleDeals = await Model.find({})
          .select('details')
          .limit(100)
          .lean();
        
        sampleDeals.forEach(deal => {
          if (deal.details && typeof deal.details === 'object') {
            Object.keys(deal.details).forEach(key => {
              fields.add(`details.${key}`);
            });
          }
        });
      }
    }

    // Build sorted fields array with display names
    const fieldsArray = Array.from(fields).map(fieldName => {
      const displayName = fieldName.startsWith('customFields.') && fieldNamesMap.has(fieldName)
        ? fieldNamesMap.get(fieldName) // Use stored name for customFields
        : fieldName.replace(/^(customFields|details)\./, ''); // Use key for details or if name not found
      
      return {
        name: fieldName,
        displayName: displayName,
        source: fieldName.startsWith('customFields.') ? 'customFields' : 'details',
      };
    });
    
    // ✅ Remove duplicates by displayName - keep only the first occurrence
    // This ensures each field name appears only once, even if it exists in multiple contacts or both customFields/details
    const uniqueFieldsMap = new Map();
    fieldsArray.forEach(field => {
      const displayName = field.displayName.toLowerCase().trim();
      if (!uniqueFieldsMap.has(displayName)) {
        // Prefer customFields over details if both exist with same displayName
        uniqueFieldsMap.set(displayName, field);
      } else {
        // If field already exists, prefer customFields source
        const existingField = uniqueFieldsMap.get(displayName);
        if (field.source === 'customFields' && existingField.source === 'details') {
          uniqueFieldsMap.set(displayName, field);
        }
      }
    });
    
    // Convert back to array and sort by displayName
    const sortedFields = Array.from(uniqueFieldsMap.values());
    sortedFields.sort((a, b) => a.displayName.localeCompare(b.displayName));

    console.log(`[Fields API] Returning ${sortedFields.length} fields for ${entity}:`, 
      sortedFields.filter(f => f.source === 'customFields').length, 'customFields,',
      sortedFields.filter(f => f.source === 'details').length, 'details'
    );

    return NextResponse.json({
      success: true,
      data: sortedFields,
    });
  } catch (error) {
    console.error('Get fields error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get fields' },
      { status: 500 }
    );
  }
}

