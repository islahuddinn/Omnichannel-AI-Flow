// src/api-services/call-status-tabs/callTabs.js
// Call center frontend: API client for call status tabs (list, create, update, delete, get by id).

import apiClient from '@/lib/api/client';

/**
 * Fetch all call status records
 */
export const fetchAllCallStatus = async (params = {}) => {
  try {
    const { page = 1, limit = 10, sortBy = 'time', sortOrder = 'DESC', ...filters } = params;
    
    // Build query string while skipping undefined/null filters.
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      sortBy,
      sortOrder,
      ...Object.fromEntries(
        Object.entries(filters).filter(([_, value]) => value !== undefined && value !== null)
      )
    });
    
    const response = await apiClient.get(`/call-status-tabs?${queryParams.toString()}`);
    return response;
  } catch (error) {
    console.error('Error fetching call status records:', error);
    throw error;
  }
};

/**
 * Create a new call status record
 */
export const createCallStatus = async (callStatusData) => {
  try {
    // Persists missed/no-answer tab records displayed in frontend call tabs.
    const response = await apiClient.post('/call-status-tabs', callStatusData);
    return response;
  } catch (error) {
    console.error('Error creating call status record:', error);
    throw error;
  }
};

/**
 * Update a call status record
 */
export const updateCallStatus = async (statusId, updateData) => {
  try {
    const response = await apiClient.put(`/call-status-tabs/${statusId}`, updateData);
    return response;
  } catch (error) {
    console.error('Error updating call status record:', error);
    throw error;
  }
};

/**
 * Delete a call status record
 */
export const deleteCallStatus = async (statusId) => {
  try {
    const response = await apiClient.delete(`/call-status-tabs/${statusId}`);
    return response;
  } catch (error) {
    console.error('Error deleting call status record:', error);
    throw error;
  }
};

/**
 * Get a call status record by ID
 */
export const getCallStatusById = async (statusId) => {
  try {
    const response = await apiClient.get(`/call-status-tabs/${statusId}`);
    return response;
  } catch (error) {
    console.error('Error fetching call status record:', error);
    throw error;
  }
};
