// src/services/call-routing/callRouteService.js
import { getTenantDB } from '../../config/database.js';
import CompanyAccountSchema from '../../models/schemas/CompanyAccount.js';
import CallRouteSchema from '../../models/schemas/CallRoute.js';
import { createRouting, updateRouting } from '../pbx/PbxService.js';
import { CHANNEL_TYPES } from '../../config/constants.js';
import mongoose from 'mongoose'


const normalizeFlowData = (flowData, isLoop, companyId) => {
  return {
    ...flowData,
    isLoop: isLoop ?? 0,
    companyId
  };
};

export const createOrUpdateCallRouting = async (
  flowData,
  phoneNumberId,
  isLoop,
  companyId
) => {
  const tenantDB = await getTenantDB(companyId);
  const CompanyAccount =
    tenantDB.models.CompanyAccount ||
    tenantDB.model('CompanyAccount', CompanyAccountSchema);
  const CallRoute =
    tenantDB.models.CallRoute ||
    tenantDB.model('CallRoute', CallRouteSchema);

  console.log(isLoop, companyId, 'Updated');

  // Verify phone number exists (CompanyAccount with type 'call')
  const phoneNumber = await CompanyAccount.findOne({
    _id: phoneNumberId,
    type: CHANNEL_TYPES.CALL,
    companyId
  });
  if (!phoneNumber) {
    throw new Error('Phone Number not found');
  }

  // Normalize flow data ONCE
  const normalizedFlowData = normalizeFlowData(flowData, isLoop, companyId);

  // Check if call routing already exists
  let existingCallRouting = await CallRoute.findOne({ phoneNumberId });

  let callRouting;
  let isUpdate = false;

  if (existingCallRouting) {
    // ---------- UPDATE ----------
    isUpdate = true;

    // Save original state for rollback
    const originalFlowData = existingCallRouting.flowData;
    const originalIsLoop = existingCallRouting.isLoop;
    const originalPbxHash = existingCallRouting.pbxRoutingHash;

    // Update DB
    existingCallRouting.flowData = normalizedFlowData;
    existingCallRouting.isLoop = isLoop ?? 0;
    await existingCallRouting.save();

    callRouting = existingCallRouting;

    try {
      // Update PBX routing
      if (existingCallRouting.pbxRoutingHash) {
        await updateRouting(
          existingCallRouting.pbxRoutingHash,
          normalizedFlowData
        );
      } else {
        const pbxResponse = await createRouting(normalizedFlowData);
        if (pbxResponse?.hash) {
          existingCallRouting.pbxRoutingHash = pbxResponse.hash;
          await existingCallRouting.save();
        }
      }
    } catch (pbxError) {
      // Rollback
      console.error('Error updating PBX routing:', pbxError);
      existingCallRouting.flowData = originalFlowData;
      existingCallRouting.isLoop = originalIsLoop;
      existingCallRouting.pbxRoutingHash = originalPbxHash;
      await existingCallRouting.save();
      throw pbxError;
    }
  } else {
    // ---------- CREATE ----------
    callRouting = await CallRoute.create({
      phoneNumberId,
      flowData: normalizedFlowData,
      isLoop: isLoop ?? 0
    });

    try {
      const pbxResponse = await createRouting(normalizedFlowData);
      if (pbxResponse?.hash) {
        callRouting.pbxRoutingHash = pbxResponse.hash;
        await callRouting.save();
      }
    } catch (pbxError) {
      // Rollback
      console.error('Error creating PBX routing:', pbxError);
      await CallRoute.deleteOne({ _id: callRouting._id });
      throw pbxError;
    }
  }

  return {
    callRouting,
    isUpdate
  };
};





export const getCallRoutingByPhoneNumberId = async (phoneNumberId, companyId) => {
  const tenantDB = await getTenantDB(companyId);

  const CompanyAccount =
    tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);

  const CallRoute =
    tenantDB.models.CallRoute || tenantDB.model('CallRoute', CallRouteSchema);

  // 1️⃣ Phone number MUST exist (CompanyAccount with type 'call')
  const phoneNumber = await CompanyAccount.findOne({
    _id: phoneNumberId,
    type: CHANNEL_TYPES.CALL,
    companyId
  }).lean();
  if (!phoneNumber) {
    throw new Error('Phone Number not found');
  }

  // 2️⃣ Routing is OPTIONAL
  const callRouting = await CallRoute.findOne({
    phoneNumberId: new mongoose.Types.ObjectId(phoneNumberId)
  }).lean();

  // 3️⃣ Always return phone number, routing may be null
  // Transform CompanyAccount to match frontend format
  return {
    phoneNumber: {
      _id: phoneNumber._id,
      id: phoneNumber._id.toString(),
      phoneNumber: phoneNumber.identifier,
      internalName: phoneNumber.name,
      departments: phoneNumber.departmentIds || [],
      flowData: phoneNumber.metadata?.flowData || null,
      createdAt: phoneNumber.createdAt,
      updatedAt: phoneNumber.updatedAt
    },
    callRouting: callRouting || null
  };
};
