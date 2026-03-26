// src/app/api/contacts/field-values/route.js
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
    const field = searchParams.get('field');

    if (!entity || !field) {
      return NextResponse.json(
        { success: false, error: 'Entity and field are required' },
        { status: 400 }
      );
    }

    const Model = entity === 'contact'
      ? (tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema))
      : (tenantDB.models.Deal || tenantDB.model('Deal', DealSchema));

    // Get unique values for the field
    const fieldPath = field;
    
    // Check if this is a boolean field
    const isBooleanField = fieldPath === 'Is_Active' || fieldPath === 'isActive' || fieldPath === 'blocked' || fieldPath === 'emailVerified';
    
    let values = [];
    
    if (isBooleanField) {
      // For boolean fields, get distinct values including null
      values = await Model.distinct(fieldPath);
      // Ensure we have both true and false if they exist
      const hasTrue = values.includes(true);
      const hasFalse = values.includes(false);
      if (hasTrue && !values.includes('true')) values.push('true');
      if (hasFalse && !values.includes('false')) values.push('false');
    } else {
      // For other fields, get distinct non-null values
      try {
        if (fieldPath.includes('customFields.')) {
          // For customFields, use aggregation - fetch all values
          // Handle both structures: customFields.fieldId.value and customFields.fieldId (direct value)
          const customFieldKey = fieldPath.replace('customFields.', '');
          
          try {
            // Use aggregation to extract values from both structures
            const aggregation = Model.aggregate([
              { 
                $match: { 
                  [`customFields.${customFieldKey}`]: { $exists: true, $ne: null }
                } 
              },
              { 
                $project: {
                  fieldData: `$customFields.${customFieldKey}`,
                }
              },
              {
                $project: {
                  // Extract value: if fieldData is object with .value, use that, otherwise use fieldData itself
                  value: {
                    $cond: {
                      if: { $eq: [{ $type: '$fieldData' }, 'object'] },
                      then: {
                        $ifNull: ['$fieldData.value', '$fieldData']
                      },
                      else: '$fieldData'
                    }
                  }
                }
              },
              { 
                $match: {
                  value: { $ne: null, $ne: '' }
                }
              },
              { $group: { _id: '$value' } },
            ]);
            const result = await aggregation;
            values = result.map(r => r._id).filter(v => {
              // Filter out null, undefined, empty strings, and empty objects
              if (v === null || v === undefined || v === '') return false;
              if (typeof v === 'object' && Object.keys(v).length === 0) return false;
              return true;
            });
          } catch (error) {
            console.error('Error fetching customField values:', error);
            // Fallback: fetch all contacts and extract manually
            try {
              const contacts = await Model.find({
                [`customFields.${customFieldKey}`]: { $exists: true, $ne: null }
              })
                .select(`customFields.${customFieldKey}`)
                .lean();
              
              const valueSet = new Set();
              contacts.forEach(contact => {
                const fieldData = contact.customFields?.[customFieldKey];
                if (fieldData !== null && fieldData !== undefined && fieldData !== '') {
                  // Handle both structures
                  if (typeof fieldData === 'object' && !Array.isArray(fieldData) && fieldData.value !== undefined) {
                    if (fieldData.value !== null && fieldData.value !== '') {
                      valueSet.add(fieldData.value);
                    }
                  } else if (typeof fieldData !== 'object') {
                    valueSet.add(fieldData);
                  }
                }
              });
              values = Array.from(valueSet);
            } catch (fallbackError) {
              console.error('Fallback error fetching customField values:', fallbackError);
              values = [];
            }
          }
        } else if (fieldPath.includes('details.')) {
          // For details fields, use aggregation - fetch all values
          const aggregation = Model.aggregate([
            { $match: { [fieldPath]: { $exists: true, $ne: null, $ne: '' } } },
            { $group: { _id: `$${fieldPath}` } },
            // Remove limit to get all values
          ]);
          const result = await aggregation;
          values = result.map(r => r._id).filter(v => v !== null && v !== undefined && v !== '');
        } else {
          // Standard field - use distinct (no limit)
          values = await Model.distinct(fieldPath, {
            [fieldPath]: { $exists: true, $ne: null, $ne: '' }
          });
        }
      } catch (error) {
        console.error('Error fetching field values:', error);
        // Fallback: try aggregation - fetch all values
        try {
          const aggregation = Model.aggregate([
            { $match: { [fieldPath]: { $exists: true, $ne: null, $ne: '' } } },
            { $group: { _id: `$${fieldPath}` } },
            // Remove limit to get all values
          ]);
          const result = await aggregation;
          values = result.map(r => r._id).filter(v => v !== null && v !== undefined && v !== '');
        } catch (aggError) {
          console.error('Aggregation also failed:', aggError);
          values = [];
        }
      }
    }

    // Filter and format values
    let uniqueValues = values
      .filter(v => {
        if (v === null || v === undefined) return false;
        if (typeof v === 'string' && v.trim() === '') return false;
        return true;
      })
      .map(v => {
        // Convert boolean to string representation for consistency
        if (typeof v === 'boolean') {
          return v ? 'true' : 'false';
        }
        return v;
      })
      .filter((v, i, arr) => arr.indexOf(v) === i) // Remove duplicates
      // Remove slice limit to return all values
      .sort((a, b) => {
        // Sort: booleans first (true, false), then numbers, then strings
        if (a === 'true' || a === true) return -1;
        if (b === 'true' || b === true) return 1;
        if (a === 'false' || a === false) return -1;
        if (b === 'false' || b === false) return 1;
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        if (typeof a === 'number') return -1;
        if (typeof b === 'number') return 1;
        return String(a).localeCompare(String(b));
      });

    return NextResponse.json({
      success: true,
      data: uniqueValues,
    });
  } catch (error) {
    console.error('Get field values error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get field values' },
      { status: 500 }
    );
  }
}

