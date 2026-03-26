// src/services/call-status-tabs/callStatusTabService.js
// Call center backend: CRUD for call status tab records (missed/no-answer, etc.) per tenant.

import { getTenantDB } from '../../config/database.js';
import CallStatusTabSchema from '../../models/schemas/CallStatusTab.js';

/**
 * Get all call status records with pagination and filtering.
 */
export const getAllCallStatus = async (page = 1, limit = 10, sortBy = 'time', sortOrder = 'DESC', filters = {}, companyId) => {
  const tenantDB = await getTenantDB(companyId);
  const CallStatusTab = tenantDB.models.CallStatusTab || tenantDB.model('CallStatusTab', CallStatusTabSchema);

  const skip = (page - 1) * limit;
  const query = {};

  // Apply filters
  if (filters.userId) {
    query.userId = filters.userId;
  }
  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.direction) {
    query.direction = filters.direction;
  }
  if (filters.phoneNumber) {
    query.phoneNumber = filters.phoneNumber;
  }

  // Handle search functionality
  if (filters.search) {
    query.$or = [
      { phoneNumber: { $regex: filters.search, $options: 'i' } },
      { status: { $regex: filters.search, $options: 'i' } },
      { direction: { $regex: filters.search, $options: 'i' } }
    ];
  }

  // Validate sortBy to prevent injection
  const allowedSortFields = ['time', 'phoneNumber', 'status', 'direction', 'duration', 'userId', 'createdAt'];
  const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'time';
  const validSortOrder = sortOrder.toUpperCase() === 'ASC' ? 1 : -1;

  // Build sort object
  const sort = {};
  sort[validSortBy] = validSortOrder;

  const [callStatusRecords, total] = await Promise.all([
    CallStatusTab.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    CallStatusTab.countDocuments(query)
  ]);

  const totalPages = Math.ceil(total / parseInt(limit));

  return {
    callStatusRecords,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalItems: total,
      itemsPerPage: parseInt(limit),
      hasNextPage: parseInt(page) < totalPages,
      hasPrevPage: parseInt(page) > 1
    }
  };
};

/**
 * Get call status record by ID
 */
export const getCallStatusById = async (id, companyId) => {
  const tenantDB = await getTenantDB(companyId);
  const CallStatusTab = tenantDB.models.CallStatusTab || tenantDB.model('CallStatusTab', CallStatusTabSchema);

  const callStatus = await CallStatusTab.findById(id).lean();

  if (!callStatus) {
    throw new Error('Call status record not found');
  }

  return callStatus;
};

/**
 * Create a new call status record
 */
export const createCallStatus = async (callStatusData, userId, companyId) => {
  const tenantDB = await getTenantDB(companyId);
  const CallStatusTab = tenantDB.models.CallStatusTab || tenantDB.model('CallStatusTab', CallStatusTabSchema);

  // Add user_id to the data if provided
  if (userId) {
    callStatusData.userId = userId;
  }

  // Set time to current date if not provided
  if (!callStatusData.time) {
    callStatusData.time = new Date();
  }

  const newCallStatus = await CallStatusTab.create(callStatusData);

  return newCallStatus;
};

/**
 * Update call status record
 */
export const updateCallStatus = async (id, updateData, companyId) => {
  const tenantDB = await getTenantDB(companyId);
  const CallStatusTab = tenantDB.models.CallStatusTab || tenantDB.model('CallStatusTab', CallStatusTabSchema);

  const callStatus = await CallStatusTab.findById(id);

  if (!callStatus) {
    throw new Error('Call status record not found');
  }

  // Update the record
  Object.assign(callStatus, updateData);
  await callStatus.save();

  return callStatus;
};

/**
 * Delete call status record
 */
export const deleteCallStatus = async (id, companyId) => {
  const tenantDB = await getTenantDB(companyId);
  const CallStatusTab = tenantDB.models.CallStatusTab || tenantDB.model('CallStatusTab', CallStatusTabSchema);

  const callStatus = await CallStatusTab.findById(id);

  if (!callStatus) {
    throw new Error('Call status record not found');
  }

  await CallStatusTab.findByIdAndDelete(id);

  return { success: true, message: 'Call status record deleted successfully' };
};
