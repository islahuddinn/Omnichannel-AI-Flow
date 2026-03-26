// src/app/api/contacts/filter/route.js
import { NextResponse } from 'next/server';
import { getTenantDB } from '@/config/database';
import ContactSchema from '@/models/schemas/Contact';
import DealSchema from '@/models/schemas/Deal';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import mongoose from 'mongoose';

export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const context = await getTenantContext(request);
    const tenantDB = await getTenantDB(context.tenantId);
    
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Deal = tenantDB.models.Deal || tenantDB.model('Deal', DealSchema);
    
    const body = await request.json();
    const { contactType, conditions = [], page = 1, limit = 20 } = body;
    
    console.log('[Filter API] Received request:', { contactType, conditionsCount: conditions.length, conditions });

    if (!conditions || conditions.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          contacts: [],
          deals: [],
          totalContacts: 0,
          totalDeals: 0,
        },
      });
    }

    // Build contact query
    const contactQuery = {};
    const queryParts = [];
    
    // Filter by contact type - add as a query part
    // Make it optional: match contacts with the selected type OR contacts without Contact_Type set
    if (contactType === 'handyman') {
      queryParts.push({ 
        $or: [
          { Contact_Type: 'Handyman' },
          { Contact_Type: { $exists: false } },
          { Contact_Type: null }
        ]
      });
    } else if (contactType === 'customer') {
      queryParts.push({ 
        $or: [
          { Contact_Type: 'Customer' },
          { Contact_Type: { $exists: false } },
          { Contact_Type: null }
        ]
      });
    }
    // If contactType === 'both', don't add any filter

    // Apply conditions
    const contactConditions = conditions.filter((c) => c.entity === 'contact');
    if (contactConditions.length > 0) {
      for (let i = 0; i < contactConditions.length; i++) {
        const cond = contactConditions[i];
        const query = buildConditionQuery(cond);
        
        // Skip empty queries
        if (Object.keys(query).length === 0) {
          continue;
        }
        
        // Check logical operator
        if (i === 0 || cond.logicalOperator === 'AND') {
          // AND: add as separate condition
          queryParts.push(query);
        } else {
          // OR: combine with previous using $or
          const lastPart = queryParts[queryParts.length - 1];
          queryParts[queryParts.length - 1] = {
            $or: [lastPart, query]
          };
        }
      }
    }
    
    // Combine all query parts
    if (queryParts.length > 0) {
      if (queryParts.length === 1) {
        // Single condition - merge directly
        Object.assign(contactQuery, queryParts[0]);
      } else {
        // Multiple conditions - use $and
        contactQuery.$and = queryParts;
      }
    }
    
    console.log('[Filter API] Contact query:', JSON.stringify(contactQuery, null, 2));
    console.log('[Filter API] Query parts:', JSON.stringify(queryParts, null, 2));

    // Build deal query
    const dealQuery = {};
    const dealConditions = conditions.filter((c) => c.entity === 'deal');
    if (dealConditions.length > 0) {
      const andConditions = [];
      let currentGroup = [];
      
      for (let i = 0; i < dealConditions.length; i++) {
        const cond = dealConditions[i];
        const query = buildConditionQuery(cond);
        
        if (i === 0 || cond.logicalOperator === 'AND') {
          currentGroup.push(query);
        } else {
          if (currentGroup.length > 0) {
            andConditions.push({ $and: currentGroup });
          }
          currentGroup = [query];
        }
      }
      
      if (currentGroup.length > 0) {
        andConditions.push({ $and: currentGroup });
      }
      
      if (andConditions.length > 0) {
        Object.assign(dealQuery, { $and: andConditions });
      }
    }

    // Fetch contacts and deals
    const skip = (page - 1) * limit;
    
    // Debug: Test if any contacts match the customFields condition without Contact_Type filter
    if (contactConditions.length > 0) {
      const testQuery = {};
      const testQueryParts = [];
      for (const cond of contactConditions) {
        const query = buildConditionQuery(cond);
        if (Object.keys(query).length > 0) {
          testQueryParts.push(query);
        }
      }
      if (testQueryParts.length > 0) {
        if (testQueryParts.length === 1) {
          Object.assign(testQuery, testQueryParts[0]);
        } else {
          testQuery.$and = testQueryParts;
        }
        const testCount = await Contact.countDocuments(testQuery);
        console.log('[Filter API] Test query (without Contact_Type):', JSON.stringify(testQuery, null, 2));
        console.log('[Filter API] Test query matches:', testCount, 'contacts');
      }
    }
    
    // Also test query without Contact_Type to see if that's the issue
    const queryWithoutContactType = { ...contactQuery };
    delete queryWithoutContactType.Contact_Type;
    if (queryWithoutContactType.$and) {
      queryWithoutContactType.$and = queryWithoutContactType.$and.filter(q => !q.Contact_Type);
      if (queryWithoutContactType.$and.length === 0) {
        delete queryWithoutContactType.$and;
      }
      if (queryWithoutContactType.$and && queryWithoutContactType.$and.length === 1) {
        Object.assign(queryWithoutContactType, queryWithoutContactType.$and[0]);
        delete queryWithoutContactType.$and;
      }
    }
    const countWithoutContactType = await Contact.countDocuments(queryWithoutContactType);
    console.log('[Filter API] Query without Contact_Type matches:', countWithoutContactType, 'contacts');
    console.log('[Filter API] Query without Contact_Type:', JSON.stringify(queryWithoutContactType, null, 2));
    
    const [contacts, totalContacts, deals, totalDeals] = await Promise.all([
      Contact.find(contactQuery).limit(limit).skip(skip).lean(),
      Contact.countDocuments(contactQuery),
      Deal.find(dealQuery).limit(limit).skip(skip).lean(),
      Deal.countDocuments(dealQuery),
    ]);
    
    console.log('[Filter API] Final query matches:', totalContacts, 'contacts');
    if (totalContacts === 0 && countWithoutContactType > 0) {
      console.log('[Filter API] ⚠️ WARNING: Contacts match without Contact_Type filter but not with it. The Contact_Type filter might be excluding contacts.');
    }

    return NextResponse.json({
      success: true,
      data: {
        contacts,
        deals,
        totalContacts,
        totalDeals,
      },
    });
  } catch (error) {
    console.error('Filter contacts/deals error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to filter contacts/deals' },
      { status: 500 }
    );
  }
}

function buildConditionQuery(condition) {
  // Support both selectedValue (single) and selectedValues (array) for backward compatibility
  const { field, selectedValue, selectedValues } = condition;
  
  console.log('[Filter API] Building query for condition:', { field, selectedValue, selectedValues });
  
  // Convert single value to array for processing
  const valuesArray = selectedValue !== undefined && selectedValue !== null && selectedValue !== ''
    ? [selectedValue] 
    : (selectedValues && selectedValues.length > 0 ? selectedValues : []);
  
  if (!field || valuesArray.length === 0) {
    console.log('[Filter API] Empty condition - field:', field, 'valuesArray:', valuesArray);
    return {};
  }

  const fieldPath = field;
  const isBooleanField = fieldPath === 'Is_Active' || fieldPath === 'isActive' || fieldPath === 'blocked' || fieldPath === 'emailVerified';
  
  const processedValues = valuesArray
    .map(value => {
      // Handle null/undefined/empty string
      if (value === null || value === undefined || value === 'null' || value === 'undefined' || value === '') {
        return null;
      }
      
      // Handle boolean fields
      if (isBooleanField) {
        // Convert string to boolean
        if (value === 'true' || value === true || value === 'True' || value === 'TRUE') return true;
        if (value === 'false' || value === false || value === 'False' || value === 'FALSE') return false;
        // If it's already a boolean, return as is
        if (typeof value === 'boolean') return value;
        // Default to null for invalid boolean values
        return null;
      }
      
      // Try to convert to number if it looks like a number
      if (typeof value === 'string' && value !== '' && !isNaN(value) && !isNaN(parseFloat(value))) {
        const numValue = Number(value);
        if (!isNaN(numValue)) {
          return numValue;
        }
      }
      
      return value;
    })
    .filter(v => v !== null && v !== undefined); // Remove null values from array

  // If no valid values after processing, return empty query
  if (processedValues.length === 0) {
    return {};
  }

  // Handle nested fields (customFields.fieldName, details.fieldName)
  if (fieldPath.includes('customFields.')) {
    const customFieldKey = fieldPath.replace('customFields.', '');
    console.log('[Filter API] CustomField query - key:', customFieldKey, 'values:', processedValues);
    
    // Handle both structures: customFields.fieldId.value and customFields.fieldId (direct value)
    // For customFields, we need to match the .value property of the nested object
    // Use $or to match either structure, but prioritize .value structure
    if (processedValues.length === 1) {
      // Single value - use direct match for better performance
      const query = {
        $or: [
          { [`customFields.${customFieldKey}.value`]: processedValues[0] },
          { [`customFields.${customFieldKey}`]: processedValues[0] }
        ]
      };
      console.log('[Filter API] CustomField query result:', JSON.stringify(query, null, 2));
      return query;
    } else {
      // Multiple values - use $in
      const query = {
        $or: [
          { [`customFields.${customFieldKey}.value`]: { $in: processedValues } },
          { [`customFields.${customFieldKey}`]: { $in: processedValues } }
        ]
      };
      console.log('[Filter API] CustomField query result:', JSON.stringify(query, null, 2));
      return query;
    }
  }

  // Handle details fields
  if (fieldPath.includes('details.')) {
    return {
      [fieldPath]: { $in: processedValues }
    };
  }

  // Standard field - use $in operator
  return {
    [fieldPath]: { $in: processedValues }
  };
}
