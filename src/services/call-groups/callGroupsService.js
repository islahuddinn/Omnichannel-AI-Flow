// src/services/call-groups/callGroupsService.js
// Call center backend: CRUD for call groups and sync with PBX (create/update/delete groups and routing).

import { getMasterDB, getTenantDB } from '../../config/database.js';
import CallGroupSchema from '../../models/schemas/CallGroup.js';
import CallGroupUserSchema from '../../models/schemas/CallGroupUser.js';
import UserSchema from '../../models/schemas/User.js';
import CallRouteSchema from '../../models/schemas/CallRoute.js';
import { createGroup, updateGroup, deleteGroup, updateRouting } from '../pbx/PbxService.js';

/**
 * Get company agents (agents)
 */
const getCompanyAgents = async (companyId) => {
  const masterDB = await getMasterDB();
  const User = masterDB.models.User || masterDB.model('User', UserSchema);
  
  const agents = await User.find({
    companyId: companyId,
    role: 'agent'
  }).select('_id firstName lastName email status callCenter chat').lean();
  
  return agents;
};

/**
  * Validate assigned agents exist and are agents
 */
const validateAssignedAgents = async (assignedAgents, companyId) => {
  if (!assignedAgents || !Array.isArray(assignedAgents)) return;
  
  const agents = await getCompanyAgents(companyId);
  const agentIds = agents.map(agent => agent._id.toString());
  const missingAgents = assignedAgents.filter(agentId => !agentIds.includes(agentId));
  
  if (missingAgents.length > 0) {
    throw new Error(`The following agent IDs do not exist or are not agents: ${missingAgents.join(", ")}`);
  }
};

/**
 * Create a new call group
 */
export const createCallGroup = async (groupData, companyId) => {
  const tenantDB = await getTenantDB(companyId);
  const CallGroup = tenantDB.models.CallGroup || tenantDB.model('CallGroup', CallGroupSchema);
  const CallGroupUser = tenantDB.models.CallGroupUser || tenantDB.model('CallGroupUser', CallGroupUserSchema);
  const masterDB = await getMasterDB();
  const User = masterDB.models.User || masterDB.model('User', UserSchema);

  // Validate assigned users
  await validateAssignedAgents(groupData.assignedUsers, companyId);

  // Create call group in tenant DB
  const newCallGroup = await CallGroup.create({
    groupName: groupData.groupName,
    incomingRoutingStrategy: groupData.incomingRoutingStrategy,
    timeToRingOperator: groupData.timeToRingOperator,
    allowCallsWaitingInLine: groupData.allowCallsWaitingInLine || false,
    musicOnHold: groupData.musicOnHold || false,
    incomingCallsWaitingOptions: groupData.incomingCallsWaitingOptions,
    redirectToOccupiedOperators: groupData.redirectToOccupiedOperators || false,
    outboundPhoneNumbers: groupData.outboundPhoneNumbers || [],
    primaryOutboundNumber: groupData.primaryOutboundNumber,
    exceptionOutboundNumbers: groupData.exceptionOutboundNumbers || [],
    musicFileId: groupData.musicFileId,
    musicFileUrl: groupData.musicFileUrl,
    departmentIds: groupData.departments || []
  });

  try {
    // Prepare PBX group data (map camelCase to snake_case for PBX API)
    const pbxGroupData = {
      group_name: groupData.groupName,
      group_id: newCallGroup._id.toString(),
      assigned_operators: groupData.assignedUsers || [],
      exception_outbound_numbers: groupData.exceptionOutboundNumbers || [],
      allow_calls_waiting_in_line: groupData.allowCallsWaitingInLine || false,
      incoming_calls_waiting_options: groupData.incomingCallsWaitingOptions,
      incoming_routing_strategy: groupData.incomingRoutingStrategy,
      music_on_hold: groupData.musicOnHold || false,
      outbound_phone_numbers: groupData.outboundPhoneNumbers || [],
      primary_outbound_number: groupData.primaryOutboundNumber,
      redirect_to_occupied_operators: groupData.redirectToOccupiedOperators || false,
      time_to_ring_operator: groupData.timeToRingOperator,
      music_file_url: groupData.musicFileUrl
    };

    // Create group in PBX
    const pbxResponse = await createGroup(pbxGroupData);

    // Store PBX hash in local database
    if (pbxResponse.hash) {
      await CallGroup.updateOne(
        { _id: newCallGroup._id },
        { $set: { pbxHash: pbxResponse.hash } }
      );
    }

    // Create user associations if provided
    let users = [];
    if (groupData.assignedUsers && Array.isArray(groupData.assignedUsers) && groupData.assignedUsers.length > 0) {
      const callGroupUsers = groupData.assignedUsers.map(userId => ({
        groupId: newCallGroup._id,
        userId: userId
      }));
      
      await CallGroupUser.insertMany(callGroupUsers);

      // Fetch user details
      const userDocs = await User.find({ _id: { $in: groupData.assignedUsers } })
        .select('_id firstName lastName email callCenter chat')
        .lean();
      
      users = userDocs.map(user => ({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        callStatus: user.callCenter?.call_status,
        chatStatus: user.chat?.chat_status
      }));
    }

    return {
      callGroup: {
        ...newCallGroup.toObject(),
        pbxResponse: pbxResponse,
        users: users
      }
    };

  } catch (pbxError) {
    // Rollback: delete the group if PBX creation fails
    await CallGroup.deleteOne({ _id: newCallGroup._id });
    console.error("Error creating PBX group:", pbxError);
    throw pbxError;
  }
};

/**
 * Get all call groups for a company
 */
export const getAllCallGroups = async (companyId, departmentIds = null, search = '') => {
  const tenantDB = await getTenantDB(companyId);
  const CallGroup = tenantDB.models.CallGroup || tenantDB.model('CallGroup', CallGroupSchema);
  const CallGroupUser = tenantDB.models.CallGroupUser || tenantDB.model('CallGroupUser', CallGroupUserSchema);
  const masterDB = await getMasterDB();
  const User = masterDB.models.User || masterDB.model('User', UserSchema);

  // Build query
  const query = {};
  
  // Filter by departmentIds if provided
  if (departmentIds && Array.isArray(departmentIds) && departmentIds.length > 0) {
    const mongoose = (await import('mongoose')).default;
    query.departmentIds = { $in: departmentIds.map(id => new mongoose.Types.ObjectId(id)) };
  }

  // Add search filter if provided
  if (search && search.trim()) {
    // Escape special regex characters and create case-insensitive regex
    const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapedSearch, 'i');
    query.groupName = searchRegex;
  }

  const callGroups = await CallGroup.find(query).sort({ createdAt: -1 }).lean();

  // Get all users for these groups
  const groupIds = callGroups.map(group => group._id);
  const groupUsers = await CallGroupUser.find({ groupId: { $in: groupIds } }).lean();

  // Fetch user details - convert to ObjectIds
  const mongoose = (await import('mongoose')).default;
  const userIds = [...new Set(groupUsers.map(gu => gu.userId))];
  const userDocs = await User.find({ _id: { $in: userIds } })
    .select('_id firstName lastName email callCenter chat')
    .lean();

  const userMap = {};
  userDocs.forEach(user => {
    userMap[user._id.toString()] = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      callStatus: user.callCenter?.call_status,
      chatStatus: user.chat?.chat_status
    };
  });

  // Map groups with their users
  const callGroupsWithUsers = callGroups.map(group => {
    const groupUserIds = groupUsers
      .filter(gu => gu.groupId.toString() === group._id.toString())
      .map(gu => gu.userId.toString());

    const users = groupUserIds.map(userIdStr => userMap[userIdStr]).filter(Boolean);

    return {
      ...group,
      users: users || []
    };
  });

  return callGroupsWithUsers;
};

/**
 * Get call group by ID
 */
export const getCallGroupById = async (groupId, companyId) => {
  const tenantDB = await getTenantDB(companyId);
  const CallGroup = tenantDB.models.CallGroup || tenantDB.model('CallGroup', CallGroupSchema);
  const CallGroupUser = tenantDB.models.CallGroupUser || tenantDB.model('CallGroupUser', CallGroupUserSchema);
  const masterDB = await getMasterDB();
  const User = masterDB.models.User || masterDB.model('User', UserSchema);

  const callGroup = await CallGroup.findById(groupId).lean();

  if (!callGroup) {
    throw new Error("Call Group not found");
  }

  // Find users in the group
  const groupUsers = await CallGroupUser.find({ groupId: groupId }).lean();
  const userIds = groupUsers.map(gu => gu.userId);
  
  const userDocs = await User.find({ _id: { $in: userIds } })
    .select('_id firstName lastName email callCenter chat')
    .lean();

  const users = userDocs.map(user => ({
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    callStatus: user.callCenter?.call_status,
    chatStatus: user.chat?.chat_status
  }));

  return {
    ...callGroup,
    users: users
  };
};

/**
 * Update call group
 */
export const updateCallGroup = async (groupId, updateData, companyId) => {
  const tenantDB = await getTenantDB(companyId);
  const CallGroup = tenantDB.models.CallGroup || tenantDB.model('CallGroup', CallGroupSchema);
  const CallGroupUser = tenantDB.models.CallGroupUser || tenantDB.model('CallGroupUser', CallGroupUserSchema);

  const callGroup = await CallGroup.findById(groupId);

  if (!callGroup) {
    throw new Error("Call Group not found");
  }

  // Validate assigned users
  await validateAssignedAgents(updateData.assignedUsers, companyId);

  // Save original state for rollback
  const originalGroupData = {
    groupName: callGroup.groupName,
    incomingRoutingStrategy: callGroup.incomingRoutingStrategy,
    timeToRingOperator: callGroup.timeToRingOperator,
    allowCallsWaitingInLine: callGroup.allowCallsWaitingInLine,
    musicOnHold: callGroup.musicOnHold,
    incomingCallsWaitingOptions: callGroup.incomingCallsWaitingOptions,
    redirectToOccupiedOperators: callGroup.redirectToOccupiedOperators,
    outboundPhoneNumbers: callGroup.outboundPhoneNumbers,
    primaryOutboundNumber: callGroup.primaryOutboundNumber,
    exceptionOutboundNumbers: callGroup.exceptionOutboundNumbers,
    musicFileId: callGroup.musicFileId,
    musicFileUrl: callGroup.musicFileUrl
  };

  // Get original user associations for rollback
  const originalGroupUsers = await CallGroupUser.find({ groupId: groupId }).lean();
  const originalUserIds = originalGroupUsers.map(gu => gu.userId.toString());

  // Update local database
  const updateFields = {};
  if (updateData.groupName !== undefined) updateFields.groupName = updateData.groupName;
  if (updateData.incomingRoutingStrategy !== undefined) updateFields.incomingRoutingStrategy = updateData.incomingRoutingStrategy;
  if (updateData.timeToRingOperator !== undefined) updateFields.timeToRingOperator = updateData.timeToRingOperator;
  if (updateData.allowCallsWaitingInLine !== undefined) updateFields.allowCallsWaitingInLine = updateData.allowCallsWaitingInLine;
  if (updateData.musicOnHold !== undefined) updateFields.musicOnHold = updateData.musicOnHold;
  if (updateData.incomingCallsWaitingOptions !== undefined) updateFields.incomingCallsWaitingOptions = updateData.incomingCallsWaitingOptions;
  if (updateData.redirectToOccupiedOperators !== undefined) updateFields.redirectToOccupiedOperators = updateData.redirectToOccupiedOperators;
  if (updateData.outboundPhoneNumbers !== undefined) updateFields.outboundPhoneNumbers = updateData.outboundPhoneNumbers;
  if (updateData.primaryOutboundNumber !== undefined) updateFields.primaryOutboundNumber = updateData.primaryOutboundNumber;
  if (updateData.exceptionOutboundNumbers !== undefined) updateFields.exceptionOutboundNumbers = updateData.exceptionOutboundNumbers;
  if (updateData.musicFileId !== undefined) updateFields.musicFileId = updateData.musicFileId;
  if (updateData.musicFileUrl !== undefined) updateFields.musicFileUrl = updateData.musicFileUrl;
  if (updateData.departments !== undefined) updateFields.departmentIds = updateData.departments;

  await CallGroup.updateOne({ _id: groupId }, { $set: updateFields });

  // Update user associations
  let usersUpdated = false;
  if (updateData.assignedUsers && Array.isArray(updateData.assignedUsers)) {
    await CallGroupUser.deleteMany({ groupId: groupId });

    if (updateData.assignedUsers.length > 0) {
      const callGroupUsers = updateData.assignedUsers.map(userId => ({
        groupId: groupId,
        userId: userId
      }));
      await CallGroupUser.insertMany(callGroupUsers);
    }
    usersUpdated = true;
  }

  try {
    // Update PBX if pbxHash exists
    let pbxResponse = null;
    if (callGroup.pbxHash) {
      const pbxUpdateData = {
        group_name: updateData.groupName || callGroup.groupName,
        assigned_operators: updateData.assignedUsers || [],
        exception_outbound_numbers: updateData.exceptionOutboundNumbers || callGroup.exceptionOutboundNumbers || [],
        allow_calls_waiting_in_line: updateData.allowCallsWaitingInLine !== undefined ? updateData.allowCallsWaitingInLine : callGroup.allowCallsWaitingInLine,
        incoming_calls_waiting_options: updateData.incomingCallsWaitingOptions || callGroup.incomingCallsWaitingOptions,
        incoming_routing_strategy: updateData.incomingRoutingStrategy || callGroup.incomingRoutingStrategy,
        music_on_hold: updateData.musicOnHold !== undefined ? updateData.musicOnHold : callGroup.musicOnHold,
        outbound_phone_numbers: updateData.outboundPhoneNumbers || callGroup.outboundPhoneNumbers || [],
        primary_outbound_number: updateData.primaryOutboundNumber || callGroup.primaryOutboundNumber,
        redirect_to_occupied_operators: updateData.redirectToOccupiedOperators !== undefined ? updateData.redirectToOccupiedOperators : callGroup.redirectToOccupiedOperators,
        time_to_ring_operator: updateData.timeToRingOperator || callGroup.timeToRingOperator,
        music_file_url: updateData.musicFileUrl || callGroup.musicFileUrl
      };

      pbxResponse = await updateGroup(callGroup.pbxHash, pbxUpdateData);
    }

    // Get updated data with users
    const updatedGroup = await CallGroup.findById(groupId).lean();
    const groupUsers = await CallGroupUser.find({ groupId: groupId }).lean();

    return {
      ...updatedGroup,
      pbxResponse: pbxResponse,
      users: groupUsers.map(gu => ({ userId: gu.userId }))
    };
  } catch (pbxError) {
    // Rollback: restore original group data
    console.error("Error updating PBX group:", pbxError);
    await CallGroup.updateOne({ _id: groupId }, { $set: originalGroupData });

    // Rollback: restore original user associations
    if (usersUpdated) {
      await CallGroupUser.deleteMany({ groupId: groupId });
      if (originalUserIds.length > 0) {
        const originalCallGroupUsers = originalUserIds.map(userId => ({
          groupId: groupId,
          userId: userId
        }));
        await CallGroupUser.insertMany(originalCallGroupUsers);
      }
    }

    throw pbxError;
  }

  // Get updated data with users
  const updatedGroup = await CallGroup.findById(groupId).lean();
  const groupUsers = await CallGroupUser.find({ groupId: groupId }).lean();

  return {
    ...updatedGroup,
    pbxResponse: pbxResponse,
    users: groupUsers.map(gu => ({ userId: gu.userId }))
  };
};

/**
 * Delete call group with CallRoute cleanup
 */
export const deleteCallGroup = async (groupId, companyId) => {
  const tenantDB = await getTenantDB(companyId);
  const CallGroup = tenantDB.models.CallGroup || tenantDB.model('CallGroup', CallGroupSchema);
  const CallGroupUser = tenantDB.models.CallGroupUser || tenantDB.model('CallGroupUser', CallGroupUserSchema);
  const CallRoute = tenantDB.models.CallRoute || tenantDB.model('CallRoute', CallRouteSchema);

  const callGroup = await CallGroup.findById(groupId).lean();

  if (!callGroup) {
    throw new Error("Call Group not found");
  }

  // Delete from PBX first if pbxHash exists
  let pbxResponse = null;
  if (callGroup.pbxHash) {
    try {
      pbxResponse = await deleteGroup(callGroup.pbxHash);
    } catch (pbxError) {
      console.error("Error deleting PBX group:", pbxError);
      // Continue with local deletion even if PBX deletion fails
    }
  }

  // Delete associated users
  await CallGroupUser.deleteMany({ groupId: groupId });

  // Clean group from all call routes (CallRouting)
  const allCallRoutes = await CallRoute.find().lean();

  for (const route of allCallRoutes) {
    let flowData = route.flowData;

    // Handle string JSON if needed
    if (typeof flowData === 'string') {
      try {
        flowData = JSON.parse(flowData);
      } catch (err) {
        console.error("Invalid JSON in flowData for route:", route._id, err);
        continue;
      }
    }

    if (flowData?.nodes && flowData?.edges) {
      let hasChanges = false;

      // Keep processing until no more nodes with this groupId exist
      while (true) {
        // Find the next node with matching groupId
        const nodeToDelete = flowData.nodes.find(
          (node) => String(node?.data?.groupId) === String(groupId)
        );

        if (!nodeToDelete) {
          break; // No more nodes to delete
        }

        hasChanges = true;

        const nodeIndex = flowData.nodes.findIndex((n) => n.id === nodeToDelete.id);

        // Collect IDs to delete: main node + next 2 terminal nodes
        const idsToDelete = [nodeToDelete.id];
        let terminalCount = 0;

        for (let i = nodeIndex + 1; i < flowData.nodes.length && terminalCount < 2; i++) {
          if (flowData.nodes[i]?.type === "terminalNode") {
            idsToDelete.push(flowData.nodes[i].id);
            terminalCount++;
          } else {
            break;
          }
        }

        // Find the incoming edge to the node being deleted
        const incomingEdge = flowData.edges.find((e) => e.target === nodeToDelete.id);
        const sourceNodeId = incomingEdge?.source;

        // Find the next node after all deleted nodes
        let nextNodeId = null;
        for (let i = nodeIndex + 1; i < flowData.nodes.length; i++) {
          if (!idsToDelete.includes(flowData.nodes[i].id)) {
            nextNodeId = flowData.nodes[i].id;
            break;
          }
        }

        // Filter out deleted nodes
        const remainingNodes = flowData.nodes.filter(
          (node) => !idsToDelete.includes(node.id)
        );

        // Create ID mapping for sequential renumbering
        const idMapping = {};
        remainingNodes.forEach((node, idx) => {
          idMapping[node.id] = String(idx + 1);
        });

        // Update nodes with new sequential IDs and adjust positions
        const updatedNodes = remainingNodes.map((node, idx) => {
          const originalIdx = flowData.nodes.findIndex((n) => n.id === node.id);
          const newId = String(idx + 1);

          let updatedNode = {
            ...node,
            id: newId,
          };

          // Shift position of nodes that come after the deleted nodes
          if (originalIdx > nodeIndex + terminalCount && node.position) {
            updatedNode.position = {
              ...node.position,
              x: node.position.x - 600,
              y: node.position.y - 85,
            };
          }

          return updatedNode;
        });

        // Filter out edges connected to deleted nodes
        const filteredEdges = flowData.edges.filter(
          (edge) =>
            !idsToDelete.includes(edge.source) && !idsToDelete.includes(edge.target)
        );

        // Remap edges to use new sequential IDs
        const remappedEdges = filteredEdges.map((edge) => ({
          ...edge,
          id: `e${idMapping[edge.source]}-${idMapping[edge.target]}`,
          source: idMapping[edge.source],
          target: idMapping[edge.target],
        }));

        // Reconnect the flow: connect source to next node if both exist
        if (sourceNodeId && nextNodeId) {
          const newSourceId = idMapping[sourceNodeId];
          const newTargetId = idMapping[nextNodeId];

          if (newSourceId && newTargetId) {
            // Check if edge already exists
            const edgeExists = remappedEdges.some(
              (e) => e.source === newSourceId && e.target === newTargetId
            );

            if (!edgeExists) {
              remappedEdges.push({
                id: `e${newSourceId}-${newTargetId}`,
                source: newSourceId,
                target: newTargetId,
              });
            }
          }
        }

        // Sort edges by source, then target for consistent ordering
        const sortedEdges = remappedEdges.sort((a, b) => {
          const sourceCompare = parseInt(a.source) - parseInt(b.source);
          if (sourceCompare !== 0) return sourceCompare;
          return parseInt(a.target) - parseInt(b.target);
        });

        // Update flow data for next iteration
        flowData.nodes = updatedNodes;
        flowData.edges = sortedEdges;
      }

      // Only update database if there were changes
      if (hasChanges) {
        // Update database
        await CallRoute.updateOne(
          { _id: route._id },
          { $set: { flowData: flowData } }
        );

        // Update PBX routing with new flow structure
        if (route.pbxRoutingHash) {
          try {
            const pbxRoutingData = {
              ...flowData,
              isLoop: route.isLoop,
              companyId: companyId
            };

            const pbxUpdateResponse = await updateRouting(
              route.pbxRoutingHash,
              pbxRoutingData
            );

            console.log(`Updated PBX routing for route ${route._id}:`, pbxUpdateResponse);
          } catch (pbxError) {
            console.error(`Failed to update PBX routing for route ${route._id}:`, pbxError);
            // Don't throw - continue with other routes
          }
        }
      }
    }
  }

  // Delete the call group from local database
  await CallGroup.deleteOne({ _id: groupId });

  return {
    success: true,
    pbxResponse: pbxResponse,
    message: "Call group deleted and routing flows updated successfully"
  };
};

/**
 * Get call groups for a specific user
 */
export const getUserCallGroups = async (userId, companyId) => {
  const tenantDB = await getTenantDB(companyId);
  const CallGroup = tenantDB.models.CallGroup || tenantDB.model('CallGroup', CallGroupSchema);
  const CallGroupUser = tenantDB.models.CallGroupUser || tenantDB.model('CallGroupUser', CallGroupUserSchema);
  const masterDB = await getMasterDB();
  const User = masterDB.models.User || masterDB.model('User', UserSchema);

  // Find all group IDs that the user belongs to
  const userGroups = await CallGroupUser.find({ userId: userId }).lean();

  const groupIds = userGroups.map(ug => ug.groupId);

  // If user doesn't belong to any groups, return empty array
  if (groupIds.length === 0) {
    return [];
  }

  // Get all call groups that the user belongs to
  const callGroups = await CallGroup.find({ _id: { $in: groupIds } }).lean();

  // Get all users for these groups to show other group members
  const groupUsers = await CallGroupUser.find({ groupId: { $in: groupIds } }).lean();

  // Get unique user IDs from all groups
  const userIds = [...new Set(groupUsers.map(gu => gu.userId))];

  // Fetch all user details in one query
  const userDocs = await User.find({ _id: { $in: userIds } })
    .select('_id firstName lastName email')
    .lean();

  // Create a map of user details for quick lookup
  const userMap = {};
  userDocs.forEach(user => {
    const userIdStr = user._id.toString();
    userMap[userIdStr] = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email
    };
  });

  // Map groups with their users
  const callGroupsWithUsers = callGroups.map(group => {
    const groupUserIds = groupUsers
      .filter(gu => gu.groupId.toString() === group._id.toString())
      .map(gu => gu.userId.toString());

    const users = groupUserIds.map(userIdStr => userMap[userIdStr]).filter(Boolean);

    return {
      ...group,
      users: users || [],
      totalMembers: users.length
    };
  });

  return callGroupsWithUsers;
};
