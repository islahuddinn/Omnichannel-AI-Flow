// src/services/phone-numbers/phoneNumberService.js
import { getTenantDB } from '../../config/database.js';
import CompanyAccountSchema from '../../models/schemas/CompanyAccount.js';
import CallRouteSchema from '../../models/schemas/CallRoute.js';
import { CHANNEL_TYPES } from '../../config/constants.js';
import { updateRouting } from '../pbx/PbxService.js';

/**
 * Create a new phone number (stored in CompanyAccount with type 'call')
 */
export const createPhoneNumber = async (phoneNumber, internalName, companyId, departmentIds = []) => {
  const tenantDB = await getTenantDB(companyId);
  const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);

  // Check if phone number already exists (using identifier and type='call')
  const existing = await CompanyAccount.findOne({ 
    identifier: phoneNumber,
    type: CHANNEL_TYPES.CALL 
  });
  if (existing) {
    throw new Error('Phone number already exists');
  }

  // Validate departments
  if (!Array.isArray(departmentIds) || departmentIds.length === 0) {
    throw new Error('At least one department is required');
  }

  const newPhoneNumber = await CompanyAccount.create({
    companyId,
    type: CHANNEL_TYPES.CALL,
    name: internalName || phoneNumber,
    identifier: phoneNumber,
    departmentIds: departmentIds,
    credentials: { phoneNumber }, // Minimal credentials object (required field)
    status: 'active',
    isActive: true
  });

  // Get flowData from CallRoute if it exists
  const CallRoute = tenantDB.models.CallRoute || tenantDB.model('CallRoute', CallRouteSchema);
  const callRoute = await CallRoute.findOne({ phoneNumberId: newPhoneNumber._id }).lean();

  // Transform to match frontend format
  return {
    _id: newPhoneNumber._id,
    id: newPhoneNumber._id.toString(),
    phoneNumber: newPhoneNumber.identifier,
    internalName: newPhoneNumber.name,
    departments: newPhoneNumber.departmentIds || [],
    flowData: callRoute?.flowData || null,
    createdAt: newPhoneNumber.createdAt,
    updatedAt: newPhoneNumber.updatedAt
  };
};

/**
 * Get all phone numbers with pagination and search (from CompanyAccount with type 'call')
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 10)
 * @param {string} search - Search term (default: '')
 * @param {string} companyId - Company ID
 * @param {string[]} departmentIds - Optional array of department IDs to filter by
 */
export const getAllPhoneNumbers = async (page = 1, limit = 10, search = '', companyId, departmentIds = null) => {
  const tenantDB = await getTenantDB(companyId);
  const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);

  const skip = (page - 1) * limit;
  const query = {
    type: CHANNEL_TYPES.CALL, // Only get call center phone numbers
    companyId
  };

  // Filter by departmentIds if provided
  if (departmentIds && Array.isArray(departmentIds) && departmentIds.length > 0) {
    query.departmentIds = { $in: departmentIds };
  }

  if (search) {

    const digitsOnly = search.replace(/[^\d]/g, '');
    
    if (digitsOnly.length > 0) {
      const flexiblePattern = digitsOnly.split('').join('.*'); 
      const escapedOriginal = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const combinedPattern = `(${flexiblePattern}|${escapedOriginal})`;
      query.$or = [
        { identifier: { $regex: combinedPattern, $options: 'i' } },
        { name: { $regex: combinedPattern, $options: 'i' } }
      ];
    } else {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { identifier: { $regex: escapedSearch, $options: 'i' } },
        { name: { $regex: escapedSearch, $options: 'i' } }
      ];
    }
  }

  const [accounts, total] = await Promise.all([
    CompanyAccount.find(query)
      .populate('departmentIds', 'name description')
      .skip(skip)
      .limit(limit)
      .sort('-createdAt')
      .lean(),
    CompanyAccount.countDocuments(query)
  ]);

  // Get all CallRoutes for these phone numbers to fetch flowData
  const CallRoute = tenantDB.models.CallRoute || tenantDB.model('CallRoute', CallRouteSchema);
  const phoneNumberIds = accounts.map(account => account._id);
  const callRoutes = await CallRoute.find({
    phoneNumberId: { $in: phoneNumberIds }
  }).lean();

  // Create a map of phoneNumberId -> callRoute for quick lookup
  const callRouteMap = new Map();
  callRoutes.forEach(route => {
    callRouteMap.set(route.phoneNumberId.toString(), route);
  });

  // Transform CompanyAccount to match PhoneNumber format for frontend compatibility
  const phoneNumbers = accounts.map(account => {
    const callRoute = callRouteMap.get(account._id.toString());
    return {
      _id: account._id,
      id: account._id.toString(),
      phoneNumber: account.identifier,
      internalName: account.name,
      departments: account.departmentIds || [],
      flowData: callRoute?.flowData || null,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    };
  });

  return {
    phoneNumbers,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

/**
 * Edit/Update a phone number (stored in CompanyAccount with type 'call')
 */
export const editPhoneNumber = async (id, phoneNumber, internalName, companyId, departmentIds = null) => {
  const tenantDB = await getTenantDB(companyId);
  const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);

  const existing = await CompanyAccount.findOne({ 
    _id: id,
    type: CHANNEL_TYPES.CALL 
  });
  if (!existing) {
    throw new Error('Phone number not found');
  }

  // Check if new phone number already exists (excluding current one)
  if (phoneNumber && phoneNumber !== existing.identifier) {
    const duplicate = await CompanyAccount.findOne({ 
      identifier: phoneNumber, 
      type: CHANNEL_TYPES.CALL,
      _id: { $ne: id } 
    });
    if (duplicate) {
      throw new Error('Phone number already exists');
    }
  }

  // Update phone number
  const updateData = {};
  
  if (phoneNumber) {
    updateData.identifier = phoneNumber;
    updateData.credentials = { phoneNumber };
  }
  
  if (internalName !== undefined) {
    updateData.name = internalName;
  }
  


  if (departmentIds !== null) {
    if (!Array.isArray(departmentIds) || departmentIds.length === 0) {
      throw new Error('At least one department is required');
    }
    updateData.departmentIds = departmentIds;
  }

  const updated = await CompanyAccount.findByIdAndUpdate(
    id,
    updateData,
    { new: true, runValidators: true }
  );

  // Get CallRoute if it exists to update flowData
  const CallRoute = tenantDB.models.CallRoute || tenantDB.model('CallRoute', CallRouteSchema);
  const callRoute = await CallRoute.findOne({ phoneNumberId: updated._id });

  // Update flowData in CallRoute if it exists and internalName or phoneNumber was updated
  if (callRoute && callRoute.flowData) {
    let flowDataUpdated = false;
    const flowData = { ...callRoute.flowData };

    // Update label in first node if internalName was updated
    if (internalName !== undefined && flowData.nodes && flowData.nodes.length > 0) {
      const firstNode = flowData.nodes[0];
      if (firstNode && firstNode.data) {
        if (firstNode.data.label !== internalName) {
          firstNode.data.label = internalName;
          flowDataUpdated = true;
        }
      }
    }

    // Update phoneNumber in first node if phoneNumber was updated
    if (phoneNumber && flowData.nodes && flowData.nodes.length > 0) {
      const firstNode = flowData.nodes[0];
      if (firstNode && firstNode.data) {
        if (firstNode.data.phoneNumber !== phoneNumber) {
          firstNode.data.phoneNumber = phoneNumber;
          flowDataUpdated = true;
        }
      }
    }

    // Save updated flowData if changes were made
    if (flowDataUpdated) {
      callRoute.flowData = flowData;
      await callRoute.save();

      // Update PBX routing if pbxRoutingHash exists
      if (callRoute.pbxRoutingHash) {
        try {
          // Normalize flowData with isLoop and companyId for PBX update
          const normalizedFlowData = {
            ...flowData,
            isLoop: callRoute.isLoop ?? 0,
            companyId: companyId
          };
          await updateRouting(callRoute.pbxRoutingHash, normalizedFlowData);
          console.log('PBX routing updated successfully for phone number:', updated.identifier);
        } catch (pbxError) {
          console.error('Error updating PBX routing:', pbxError);
          // Don't throw error - phone number update succeeded, PBX update is secondary
        }
      }
    }
  }

  // Get the latest callRoute data (after potential updates)
  const latestCallRoute = await CallRoute.findOne({ phoneNumberId: updated._id }).lean();

  // Transform to match frontend format
  return {
    _id: updated._id,
    id: updated._id.toString(),
    phoneNumber: updated.identifier,
    internalName: updated.name,
    departments: updated.departmentIds || [],
    flowData: latestCallRoute?.flowData || null,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt
  };
};
