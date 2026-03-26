// src/app/api/users/[userId]/status/route.js
import { NextResponse } from 'next/server';
import { getMasterDB, getTenantDB } from '@/config/database';
import UserSchema from '@/models/schemas/User';
import PbxExtensionSchema from '@/models/schemas/PbxExtension';
import StatusHistorySchema from '@/models/schemas/StatusHistory';
import DepartmentSchema from '@/models/schemas/Department';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { updateExtension } from '@/services/pbx/PbxService.js';
import SocketManager from '@/services/socket/SocketManager.js';

// Valid statuses
const VALID_CALL_STATUSES = ['available', 'outbound', 'occupied', 'notavailable', 'offline'];
const VALID_CHAT_STATUSES = ['available', 'occupied', 'notavailable', 'viewonly', 'offline'];

export async function PUT(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { userId } = await params;
    const body = await request.json();
    const { status, type } = body; // type: 'call' or 'chat'

    if (!status || !type) {
      return NextResponse.json(
        { success: false, error: 'Status and type are required' },
        { status: 400 }
      );
    }

    const context = await getTenantContext(request);
    const masterDB = await getMasterDB();
    const tenantDB = await getTenantDB(context.tenantId);

    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    const user = await User.findById(userId);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Authorization: user can only update their own status
    if (auth.user.userId.toString() !== userId && !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Validate status
    const normalizedStatus = status.toLowerCase();
    const validStatuses = type === 'call' ? VALID_CALL_STATUSES : VALID_CHAT_STATUSES;
    if (!validStatuses.includes(normalizedStatus)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status value' },
        { status: 400 }
      );
    }

    if (type === 'call') {
      // Update call status
      const previousCallStatus = user.callCenter?.call_status || 'available';
      
      if (previousCallStatus !== normalizedStatus) {
        // Update user call status
        if (!user.callCenter) user.callCenter = {};
        user.callCenter.call_status = normalizedStatus;
        await user.save();

        // Create status history
        const StatusHistory = tenantDB.models.StatusHistory || tenantDB.model('StatusHistory', StatusHistorySchema);
        await StatusHistory.create({
          userId: user._id,
          statusType: 'call',
          previousStatus: previousCallStatus,
          newStatus: normalizedStatus,
          timestamp: new Date()
        });

        // Update PBX if needed
        const PbxExtension = tenantDB.models.PbxExtension || tenantDB.model('PbxExtension', PbxExtensionSchema);
        const pbxExtension = await PbxExtension.findOne({ userId: user._id });

        if (pbxExtension && pbxExtension.extension_hash) {
          let incomingCallsSetting = null;
          if (normalizedStatus === 'available') {
            incomingCallsSetting = 'yes';
          } else if (normalizedStatus === 'outbound') {
            incomingCallsSetting = 'no';
          }

          if (incomingCallsSetting && pbxExtension.inbound_calls !== incomingCallsSetting) {
            try {
              await updateExtension(pbxExtension.extension_hash, {
                task: 'changestatus',
                inbound_calls: incomingCallsSetting
              });
              
              // Update in tenant DB
              await PbxExtension.updateOne(
                { userId: user._id },
                { $set: { inbound_calls: incomingCallsSetting } }
              );
            } catch (pbxError) {
              console.error(`PBX update failed for user ${userId}:`, pbxError);
            }
          }
        }

        // Populate departments for response
        const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
        const departments = await Department.find({ agents: user._id })
          .select('name description')
          .lean();

        // Populate PBX extension for response
        const pbxExt = await PbxExtension.findOne({ userId: user._id }).lean();

        // Emit socket event using SocketManager
        try {
          const io = SocketManager.getIO();
          if (io) {
            io.emit('statusChange', {
              user_id: user._id.toString(),
              name: `${user.firstName} ${user.lastName}`,
              user_name: user.email,
              call_status: normalizedStatus,
              pbxExtension: pbxExt || null,
              departments: departments || []
            });

            // Also emit to tenant room for real-time updates
            io.to(`tenant:${context.tenantId}`).emit('statusChange', {
              user_id: user._id.toString(),
              name: `${user.firstName} ${user.lastName}`,
              user_name: user.email,
              call_status: normalizedStatus,
              pbxExtension: pbxExt || null,
              departments: departments || []
            });

            console.log(`✅ Socket event emitted: statusChange for user ${userId}`);
          }
        } catch (socketError) {
          console.error('Error emitting socket event:', socketError);
          // Don't fail the request if socket emission fails
        }

        return NextResponse.json({
          success: true,
          message: 'Call status updated successfully',
          data: {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            callCenter: user.callCenter,
            pbxExtension: pbxExt || null,
            departments: departments || []
          }
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Call status unchanged',
        data: user.toObject()
      });

    } else if (type === 'chat') {
      // Update chat status
      const previousChatStatus = user.chat?.chat_status || 'available';
      
      if (previousChatStatus !== normalizedStatus) {
        // Update user chat status
        if (!user.chat) user.chat = {};
        user.chat.chat_status = normalizedStatus;
        await user.save();

        // Create status history
        const StatusHistory = tenantDB.models.StatusHistory || tenantDB.model('StatusHistory', StatusHistorySchema);
        await StatusHistory.create({
          userId: user._id,
          statusType: 'chat',
          previousStatus: previousChatStatus,
          newStatus: normalizedStatus,
          timestamp: new Date()
        });

        return NextResponse.json({
          success: true,
          message: 'Chat status updated successfully',
          data: {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            chat: user.chat
          }
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Chat status unchanged',
        data: user.toObject()
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid type. Use "call" or "chat"' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Error updating status:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
