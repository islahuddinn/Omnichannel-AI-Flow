// src/lib/db/connection.js
import { getMasterDB, getTenantDB } from '../../config/database.js';

export const connectToMasterDB = async () => {
  return await getMasterDB();
};

export const connectToTenantDB = async (tenantId) => {
  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }
  return await getTenantDB(tenantId);
};