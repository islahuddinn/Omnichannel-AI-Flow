// src/services/users/userProfileService.js
import { getMasterDB, getTenantDB } from '../../config/database.js';
import UserSchema from '../../models/schemas/User.js';
import PbxExtensionSchema from '../../models/schemas/PbxExtension.js';
import DepartmentSchema from '../../models/schemas/Department.js';
import CompanyAccountSchema from '../../models/schemas/CompanyAccount.js';
import StatusHistorySchema from '../../models/schemas/StatusHistory.js';
import { getUserCallGroups } from '../call-groups/callGroupsService.js';

/**
 * Helper function to safely parse JSON only if needed
 */
const safeJsonParse = (data, fieldName) => {
  if (!data) return [];

  // If already an array, return as is
  if (Array.isArray(data)) {
    return data;
  }

  // If string, try to parse
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error(`Error parsing ${fieldName}:`, error);
      return [];
    }
  }

  // For any other type, return empty array
  console.warn(`Unexpected data type for ${fieldName}:`, typeof data);
  return [];
};

/**
 * Get user outbound numbers with call group logic
 */
export const getUserOutboundNumbers = async (user, companyId) => {
  try {
    const userId = user._id; // Keep as ObjectId for database queries
    const userIdString = user._id.toString(); // For string comparisons

    // Get user's call groups
    const userCallGroups = await getUserCallGroups(userId, companyId);

    // Parse user's outbound numbers (only if needed)
    const userOutboundNumbers = safeJsonParse(
      user.callCenter?.outbound_phone_number || user.outbound_phone_number,
      'user outbound_phone_number'
    );

    // Early return if no groups and no user numbers
    const isUserInGroups = userCallGroups && userCallGroups.length > 0;
    if (!isUserInGroups && userOutboundNumbers.length === 0) {
      return {
        outbound_phone_numbers: [],
        primary_outbound_phone_number: user.callCenter?.primary_outbound_phone_number || user.primary_outbound_phone_number || null,
        isInException: false
      };
    }

    // Check if user is in exception list (only if in groups)
    let isInException = false;
    if (isUserInGroups) {
      isInException = userCallGroups.some(group => {
        const exceptions = safeJsonParse(
          group.exceptionOutboundNumbers || group.exception_outbound_numbers,
          `group ${group._id} exception_outbound_numbers`
        );
        return exceptions.length > 0 && exceptions.some(exceptId => 
          exceptId.toString() === userIdString || exceptId === userIdString
        );
      });
    }

    // Use Set for efficient duplicate checking
    const processedNumbers = new Set();
    const finalOutboundNumbers = [];

    // Helper function to add number if not duplicate
    const addUniqueNumber = (number, isPrimary, source, groupId = null, groupName = null) => {
      if (!number || processedNumbers.has(number)) return;

      processedNumbers.add(number);
      finalOutboundNumbers.push({
        number,
        isPrimary,
        source,
        groupId,
        groupName
      });
    };

    if (isUserInGroups) {
      // Rule 2 & 3: User is in groups - combine user and group numbers

      // Add group numbers first (they have priority)
      userCallGroups.forEach(group => {
        const groupNumbers = safeJsonParse(
          group.outboundPhoneNumbers || group.outbound_phone_numbers,
          `group ${group._id} outbound_phone_numbers`
        );
        const groupPrimary = group.primaryOutboundNumber || group.primary_outbound_number;

        groupNumbers.forEach(number => {
          addUniqueNumber(
            number,
            number === groupPrimary,
            'group',
            group._id?.toString(),
            group.groupName || group.group_name
          );
        });
      });

      // Add user numbers (after group numbers)
      const userPrimary = user.callCenter?.primary_outbound_phone_number || user.primary_outbound_phone_number;
      userOutboundNumbers.forEach(number => {
        addUniqueNumber(number, number === userPrimary, 'user');
      });
    } else {
      // Rule 1: User not in groups - use only user numbers
      const userPrimary = user.callCenter?.primary_outbound_phone_number || user.primary_outbound_phone_number;
      userOutboundNumbers.forEach(number => {
        addUniqueNumber(number, number === userPrimary, 'user');
      });
    }

    // Sort numbers by priority: group primary -> user primary -> others
    finalOutboundNumbers.sort((a, b) => {
      // Group primary has highest priority
      if (a.source === 'group' && a.isPrimary) return -1;
      if (b.source === 'group' && b.isPrimary) return 1;

      // Then user primary
      if (a.source === 'user' && a.isPrimary && !(b.source === 'group' && b.isPrimary)) return -1;
      if (b.source === 'user' && b.isPrimary && !(a.source === 'group' && a.isPrimary)) return 1;

      // Group numbers before user numbers (for non-primary)
      if (a.source === 'group' && b.source === 'user') return -1;
      if (a.source === 'user' && b.source === 'group') return 1;

      return 0;
    });

    // Determine the correct primary number based on priority
    let finalPrimaryNumber = user.callCenter?.primary_outbound_phone_number || user.primary_outbound_phone_number; // Default fallback

    if (finalOutboundNumbers.length > 0) {
      // Find primary in order of preference
      const groupPrimary = finalOutboundNumbers.find(item => item.source === 'group' && item.isPrimary);
      const userPrimary = finalOutboundNumbers.find(item => item.source === 'user' && item.isPrimary);

      if (groupPrimary) {
        finalPrimaryNumber = groupPrimary.number;
      } else if (userPrimary) {
        finalPrimaryNumber = userPrimary.number;
      } else {
        // If no explicit primary found, use first number (highest priority)
        finalPrimaryNumber = finalOutboundNumbers[0].number;
      }
    }

    const result = {
      outbound_phone_numbers: finalOutboundNumbers.map(item => item.number),
      primary_outbound_phone_number: finalPrimaryNumber,
      isInException: isInException
    };

    // Log for debugging (can be removed in production)
    console.log(`User ${userIdString} outbound numbers processed:`, {
      isInGroups: isUserInGroups,
      isException: isInException,
      totalNumbers: result.outbound_phone_numbers.length,
      primary: result.primary_outbound_phone_number
    });

    return result;
  } catch (error) {
    console.error('Error processing outbound numbers:', error);

    // Robust fallback handling
    const fallbackNumbers = safeJsonParse(
      user.callCenter?.outbound_phone_number || user.outbound_phone_number,
      'fallback user outbound_phone_number'
    );

    return {
      outbound_phone_numbers: fallbackNumbers,
      primary_outbound_phone_number: user.callCenter?.primary_outbound_phone_number || user.primary_outbound_phone_number || (fallbackNumbers.length > 0 ? fallbackNumbers[0] : null),
      isInException: false
    };
  }
};

/**
 * Get user profile with departments, channel accounts, PBX extension, and outbound numbers
 */
export const getUserProfile = async (userId, companyId) => {
  try {
    const masterDB = await getMasterDB();
    const tenantDB = await getTenantDB(companyId);
    
    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    const PbxExtension = tenantDB.models.PbxExtension || tenantDB.model('PbxExtension', PbxExtensionSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);

    // Fetch user details
    const user = await User.findById(userId).lean();

    if (!user || user.role !== 'agent') {
      throw new Error('Agent not found or user is not an agent');
    }

    if (!user.companyId || user.companyId.toString() !== companyId.toString()) {
      throw new Error('Agent does not belong to this company');
    }

    // Get PBX extension if call center is enabled
    let pbxExtension = null;
    if (user.callCenter?.call_center === 'on') {
      pbxExtension = await PbxExtension.findOne({ userId: user._id })
        .select('internal_extension sip_username extension_plan outroute sip_password')
        .lean();
    }

    // Get user departments
    const departmentIds = user.departments || [];
    const departments = await Department.find({ _id: { $in: departmentIds } })
      .select('name description')
      .lean();

    // Get channel accounts for these departments
    const channelAccounts = await CompanyAccount.find({
      $or: [
        { departmentId: { $in: departmentIds } },
        { departmentIds: { $in: departmentIds } }
      ],
      status: 'active',
      isActive: true
    })
      .select('_id type name identifier departmentId departmentIds status')
      .lean();

    // Group channel accounts by department
    const formattedDepartments = departments.map(dept => {
      const deptChannelAccounts = channelAccounts.filter(account => {
        const accountDeptIds = account.departmentIds || (account.departmentId ? [account.departmentId] : []);
        return accountDeptIds.some(deptId => deptId.toString() === dept._id.toString());
      });

      // Group by channel type
      const whatsappNumbers = deptChannelAccounts
        .filter(acc => acc.type === 'whatsapp')
        .map(acc => ({
          id: acc._id.toString(),
          whatsapp_number_id: acc.identifier,
          phone: acc.identifier
        }));

      const smsNumbers = deptChannelAccounts
        .filter(acc => acc.type === 'sms')
        .map(acc => ({
          id: acc._id.toString(),
          phone: acc.identifier
        }));

      const facebookPages = deptChannelAccounts
        .filter(acc => acc.type === 'facebook')
        .map(acc => ({
          id: acc._id.toString(),
          facebook_account_id: acc.identifier
        }));

      const emailAccounts = deptChannelAccounts
        .filter(acc => acc.type === 'email')
        .map(acc => ({
          id: acc._id.toString(),
          email_account_id: acc.identifier,
          email: acc.identifier
        }));

      const instagramAccounts = deptChannelAccounts
        .filter(acc => acc.type === 'instagram')
        .map(acc => ({
          id: acc._id.toString(),
          department_id: dept._id.toString(),
          company_instagram_id: acc.identifier,
          company_facebook_page_id: acc.metadata?.facebookPageId || null
        }));

      return {
        department_id: dept._id.toString(),
        name: dept.name,
        description: dept.description,
        whatsapp_numbers: whatsappNumbers,
        sms_numbers: smsNumbers,
        facebook_pages: facebookPages,
        email_accounts: emailAccounts,
        instagram_accounts: instagramAccounts
      };
    });

    // Get outbound numbers
    const outboundNumbersData = await getUserOutboundNumbers(user, companyId);

    // Apply call logic
    let callStatus = user.callCenter?.call_status || 'available';
    let callCenterStatus = user.callCenter?.call_center || 'off';
    const finalOutboundNumbers = outboundNumbersData.outbound_phone_numbers;

    const inboundCalls = user.callCenter?.inbound_calls || 'no';
    const outboundCalls = user.callCenter?.outbound_calls || 'no';

    if (inboundCalls === 'no' && outboundCalls === 'no') {
      callCenterStatus = 'off';
    }

    // Restore status from offline if user is currently offline
    // Only restore if call center is on and status is offline
    // IMPORTANT: Do this BEFORE applying permission-based defaults to preserve statuses like 'notavailable'
    if (callCenterStatus === 'on' && callStatus === 'offline') {
      try {
        const StatusHistory = tenantDB.models.StatusHistory || tenantDB.model('StatusHistory', StatusHistorySchema);
        
        // Get the last non-offline call status from history
        const lastStatusHistory = await StatusHistory.findOne({
          userId: user._id,
          statusType: 'call',
          newStatus: { $ne: 'offline' }
        })
          .sort({ timestamp: -1 })
          .lean();

        if (lastStatusHistory && lastStatusHistory.newStatus) {
          const previousStatus = lastStatusHistory.newStatus;

          // Validate previous status against current permissions
          let restoredStatus = previousStatus;

          // Check if previous status is still valid with current permissions
          const isInboundNoOutboundYes = inboundCalls === 'no' && outboundCalls === 'yes';
          const isInboundYesOutboundNo = inboundCalls === 'yes' && outboundCalls === 'no';

          // 'notavailable' should always be restored if it was the previous status
          // Permission rules only apply to 'available' vs 'outbound'
          if (previousStatus === 'notavailable') {
            // Always restore 'notavailable' - it's valid regardless of permissions
            restoredStatus = 'notavailable';
          } else if (previousStatus === 'available' || previousStatus === 'outbound') {
            // Apply permission rules for 'available' and 'outbound' (same logic as EmployeeAvailability.jsx)
            if (isInboundNoOutboundYes && previousStatus === 'available') {
              // Can't be 'available' if only outbound allowed
              restoredStatus = 'outbound';
            } else if (isInboundYesOutboundNo && previousStatus === 'outbound') {
              // Can't be 'outbound' if only inbound allowed
              restoredStatus = 'available';
            } else {
              // Status is valid for current permissions, use it
              restoredStatus = previousStatus;
            }
          } else {
            // If previous status is 'occupied' or invalid, don't restore it
            // Apply default based on permissions
            if (isInboundNoOutboundYes) {
              restoredStatus = 'outbound';
            } else if (isInboundYesOutboundNo) {
              restoredStatus = 'available';
            } else {
              // Both allowed - use available as default
              restoredStatus = 'available';
            }
          }

          // Only restore if status changed from offline
          if (restoredStatus !== 'offline') {
            callStatus = restoredStatus;
            console.log(`Restored call status from offline to: ${restoredStatus} (previous: ${previousStatus})`);
          }
        } else {
          // No previous status found - apply default based on permissions
          if (inboundCalls === 'no' && outboundCalls === 'yes') {
            callStatus = 'outbound';
          } else if (inboundCalls === 'yes' && outboundCalls === 'no') {
            callStatus = 'available';
          } else if (inboundCalls === 'yes' && outboundCalls === 'yes') {
            callStatus = 'available';
          }
          console.log(`No previous status found, set to default: ${callStatus}`);
        }
      } catch (error) {
        console.error('Error restoring status from offline:', error);
        // On error, apply default based on permissions
        if (inboundCalls === 'no' && outboundCalls === 'yes') {
          callStatus = 'outbound';
        } else if (inboundCalls === 'yes' && outboundCalls === 'no') {
          callStatus = 'available';
        } else if (inboundCalls === 'yes' && outboundCalls === 'yes') {
          callStatus = 'available';
        }
      }
    }

    // Apply chat logic
    let chatStatus = user.chat?.chat_status || 'available';
    const chatFeature = user.chat?.chat_feature || 'off';

    if (chatFeature === 'view-only') {
      chatStatus = 'viewonly';
    } else if (chatFeature === 'on') {
      chatStatus = 'available';
    }

    // Sync DB if needed
    const updates = {};
    const previousCallStatus = user.callCenter?.call_status;
    const previousChatStatus = user.chat?.chat_status;
    
    if (callCenterStatus !== user.callCenter?.call_center) {
      if (!user.callCenter) user.callCenter = {};
      updates['callCenter.call_center'] = callCenterStatus;
    }
    if (callStatus !== user.callCenter?.call_status) {
      if (!user.callCenter) user.callCenter = {};
      updates['callCenter.call_status'] = callStatus;
    }
    if (chatStatus !== user.chat?.chat_status) {
      if (!user.chat) user.chat = {};
      updates['chat.chat_status'] = chatStatus;
    }

    if (Object.keys(updates).length > 0) {
      await User.updateOne({ _id: user._id }, { $set: updates });
      
      // Create StatusHistory entry if call status changed (including restoration from offline)
      if (callStatus !== previousCallStatus && callCenterStatus === 'on') {
        try {
          const StatusHistory = tenantDB.models.StatusHistory || tenantDB.model('StatusHistory', StatusHistorySchema);
          await StatusHistory.create({
            userId: user._id,
            statusType: 'call',
            previousStatus: previousCallStatus || 'available',
            newStatus: callStatus,
            timestamp: new Date()
          });
        } catch (statusError) {
          console.error('Error creating call status history:', statusError);
        }
      }
    }

    // Prepare the final response
    const userProfile = {
      user_id: user._id.toString(),
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      user_name: user.email,
      phone: user.phone,
      email: user.email,
      image_url: user.avatar,
      status: user.status,
      departments: formattedDepartments,
      role: 'agent',
      chat_feature: chatFeature,
      role_in_chat_feature: user.chat?.role_in_chat_feature || null,
      call_center: callCenterStatus,
      inbound_calls: inboundCalls,
      outbound_calls: outboundCalls,
      outbound_phone_number: finalOutboundNumbers,
      primary_outbound_phone_number: outboundNumbersData.primary_outbound_phone_number,
      role_in_call_center: user.callCenter?.role_in_call_center || null,
      call_access: user.callCenter?.call_access || null,
      recording_downloads: user.callCenter?.recording_downloads || null,
      waiting_in_line: user.callCenter?.waiting_in_line || null,
      call_status: callStatus,
      chat_status: chatStatus,
      ...(callCenterStatus === 'on' && {
        isInException: outboundNumbersData.isInException,
        pbx_extension: pbxExtension ? {
          internal_extension: pbxExtension.internal_extension,
          sip_username: pbxExtension.sip_username,
          extension_plan: pbxExtension.extension_plan,
          outroute: pbxExtension.outroute,
          sip_password: pbxExtension.sip_password
        } : null
      })
    };

    return userProfile;
  } catch (error) {
    console.error('Error in getUserProfile service:', error);
    throw error;
  }
};
