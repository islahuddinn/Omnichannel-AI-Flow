// src/app/api/users/[userId]/route.js
import { NextResponse } from 'next/server';
import { getMasterDB, getTenantDB } from '@/config/database';
import UserSchema from '@/models/schemas/User';
import DepartmentSchema from '@/models/schemas/Department';
import PbxExtensionSchema from '@/models/schemas/PbxExtension';
import StatusHistorySchema from '@/models/schemas/StatusHistory';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { createExtension, updateExtension } from '@/services/pbx/PbxService.js';
import { generateSipCredentials, normalizeCallSetting, determineCallStatus } from '@/utils/pbxHelpers.js';
import SocketManager from '@/services/socket/SocketManager.js';

export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { userId } = await params;
    const context = await getTenantContext(request);
    const masterDB = await getMasterDB();
    const tenantDB = await getTenantDB(context.tenantId);

    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);

    const user = await User.findById(userId)
      .select('-password -refreshToken')
      .lean();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Check tenant access
    if (user.companyId.toString() !== context.tenantId && auth.user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // ✅ Populate departments manually since they're in different DB
    if (user.departments && user.departments.length > 0) {
      const departments = await Department.find({ _id: { $in: user.departments } })
        .select('name _id')
        .lean();
      
      // ✅ Create a map for quick lookup
      const departmentsMap = {};
      departments.forEach(dept => {
        departmentsMap[dept._id.toString()] = dept.name;
      });
      
      // ✅ Replace department IDs with department objects containing name
      user.departments = user.departments
        .map(deptId => {
          const deptIdStr = typeof deptId === 'object' ? deptId._id?.toString() || deptId.toString() : deptId.toString();
          return {
            _id: deptIdStr,
            name: departmentsMap[deptIdStr] || 'Unknown Department'
          };
        })
        .filter(Boolean);
      
      // ✅ Also keep departmentDetails for backward compatibility
      user.departmentDetails = departments;
    } else {
      user.departments = [];
      user.departmentDetails = [];
    }

    // Populate PBX extension if call center is enabled (from tenant DB)
    if (user.callCenter && user.callCenter.call_center === 'on') {
      try {
        const PbxExtension = tenantDB.models.PbxExtension || tenantDB.model('PbxExtension', PbxExtensionSchema);
        const pbxExtension = await PbxExtension.findOne({ userId: user._id }).lean();
        if (pbxExtension) {
          user.pbxExtension = pbxExtension;
        }
      } catch (pbxError) {
        console.error('Error fetching PBX extension:', pbxError);
      }
    }

    return NextResponse.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { userId } = await params;
    const context = await getTenantContext(request);
    const masterDB = await getMasterDB();
    const tenantDB = await getTenantDB(context.tenantId);
    
    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    
    const body = await request.json();
    const { 
      firstName, 
      lastName, 
      email, 
      password, 
      status, 
      permissions, 
      departments, 
      phone, 
      preferences,
      callCenter: callCenterData,
      chat: chatData
    } = body;

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Authorization check
    const isAdmin = ['company_admin', 'super_admin'].includes(auth.user.role);
    const isSelf = auth.user.userId === userId;

    if (!isAdmin && !isSelf) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (user.companyId.toString() !== context.tenantId && auth.user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Update fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    
    if (email && email !== user.email) {
      const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: userId } });
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'Email already in use' },
          { status: 409 }
        );
      }
      user.email = email.toLowerCase();
    }
    
    if (password && isSelf) {
      user.password = password; // Will be hashed by pre-save hook
    }
    
    if (status && isAdmin) user.status = status;
    if (permissions && isAdmin) user.permissions = { ...user.permissions, ...permissions };
    if (preferences && isAdmin) {
      // Deep merge preferences to preserve nested objects like notifications
      // Get existing preferences or use defaults
      const existingPreferences = user.preferences || {};
      
      // Ensure we always have a complete preferences object with all required fields
      const defaultPreferences = {
        theme: 'system',
        language: 'en',
        notifications: {
          email: true,
          desktop: true,
          sound: true
        }
      };
      
      // Start with defaults, then merge existing, then merge new preferences
      const mergedPreferences = {
        ...defaultPreferences,
        ...existingPreferences,
        // Preserve existing notifications if they exist
        notifications: {
          ...defaultPreferences.notifications,
          ...(existingPreferences.notifications || {}),
          // Only merge new notifications if provided and not undefined/null
          ...(preferences.notifications && typeof preferences.notifications === 'object' 
            ? preferences.notifications 
            : {})
        }
      };
      
      // Update other preference fields if provided
      if (preferences.theme !== undefined) {
        mergedPreferences.theme = preferences.theme;
      }
      if (preferences.language !== undefined) {
        mergedPreferences.language = preferences.language;
      }
      
      user.preferences = mergedPreferences;
    }

    // Update callCenter fields (nested) - normalize types to strings
    if (isAdmin && callCenterData) {
      const currentCallCenter = user.callCenter || {};
      const updatedCallCenter = { ...currentCallCenter, ...callCenterData };
      
      // Normalize boolean/number values to strings
      if (updatedCallCenter.inbound_calls !== undefined) {
        updatedCallCenter.inbound_calls = normalizeCallSetting(updatedCallCenter.inbound_calls);
      }
      if (updatedCallCenter.outbound_calls !== undefined) {
        updatedCallCenter.outbound_calls = normalizeCallSetting(updatedCallCenter.outbound_calls);
      }
      if (updatedCallCenter.recording_downloads !== undefined) {
        updatedCallCenter.recording_downloads = normalizeCallSetting(updatedCallCenter.recording_downloads);
      }
      // waiting_in_line is a number (1, 2, 3, 4, 5, etc.) - convert to string
      if (updatedCallCenter.waiting_in_line !== undefined) {
        updatedCallCenter.waiting_in_line = typeof updatedCallCenter.waiting_in_line === 'number' 
          ? String(updatedCallCenter.waiting_in_line) 
          : normalizeCallSetting(updatedCallCenter.waiting_in_line);
      }
      // playback_during_paused and playback - normalize to string
      if (updatedCallCenter.playback_during_paused !== undefined) {
        updatedCallCenter.playback_during_paused = normalizeCallSetting(updatedCallCenter.playback_during_paused);
      }
      if (updatedCallCenter.playback !== undefined) {
        updatedCallCenter.playback = normalizeCallSetting(updatedCallCenter.playback);
      }
      // Handle role_in_call_center if provided
      if (updatedCallCenter.role_in_call_center !== undefined) {
        updatedCallCenter.role_in_call_center = updatedCallCenter.role_in_call_center;
      }
      
      // Determine call_status if not explicitly provided
      if (!updatedCallCenter.call_status) {
        updatedCallCenter.call_status = determineCallStatus(
          updatedCallCenter.inbound_calls,
          updatedCallCenter.outbound_calls,
          updatedCallCenter.call_center
        );
      }

      user.callCenter = updatedCallCenter;

      // Handle PBX extension based on call_center status (tenant DB)
      const PbxExtension = tenantDB.models.PbxExtension || tenantDB.model('PbxExtension', PbxExtensionSchema);
      const existingPbxExtension = await PbxExtension.findOne({ userId: user._id });

      if (updatedCallCenter.call_center === 'on' && !existingPbxExtension) {
        // Create new PBX extension
        try {
          const { sip_username, sip_password } = generateSipCredentials(user.email, password);
          const fullName = `${firstName || user.firstName} ${lastName || user.lastName}`;
          
          const pbxResponse = await createExtension({
            name: fullName,
            userId: user._id.toString(),
            sip_username,
            sip_password,
            internal_extension: 100 + parseInt(user._id.toString().slice(-6), 16) % 10000,
            outbound_calls: normalizeCallSetting(updatedCallCenter.outbound_calls),
            inbound_calls: normalizeCallSetting(updatedCallCenter.inbound_calls),
            recording_downloads: normalizeCallSetting(updatedCallCenter.recording_downloads),
            waiting_in_line: typeof updatedCallCenter.waiting_in_line === 'number' 
              ? String(updatedCallCenter.waiting_in_line) 
              : normalizeCallSetting(updatedCallCenter.waiting_in_line),
            playback_during_paused: normalizeCallSetting(updatedCallCenter.playback_during_paused),
            playback: normalizeCallSetting(updatedCallCenter.playback)
          });
          
          // Save to tenant DB
          await PbxExtension.create({
            userId: user._id,
            extension_hash: pbxResponse.hash,
            internal_extension: pbxResponse.internal_extension,
            sip_username,
            sip_password,
            extension_plan: "Hodinovy Manzel",
            outgoing_calls: normalizeCallSetting(updatedCallCenter.outbound_calls) === 'yes' ? 'allowed' : 'disallowed',
            inbound_calls: normalizeCallSetting(updatedCallCenter.inbound_calls),
            outroute: "OUT",
            codec_priority: "8",
            nat: 1,
            webrtc: 1,
            waiting_in_line: typeof updatedCallCenter.waiting_in_line === 'number' 
              ? String(updatedCallCenter.waiting_in_line) 
              : normalizeCallSetting(updatedCallCenter.waiting_in_line),
            playback_during_paused: normalizeCallSetting(updatedCallCenter.playback_during_paused),
            playback: normalizeCallSetting(updatedCallCenter.playback)
          });
        } catch (pbxError) {
          console.error('Error creating PBX extension:', pbxError);
        }
      } else if (updatedCallCenter.call_center === 'on' && existingPbxExtension) {
        // Update existing PBX extension
        try {
          const updates = {};
          const fullName = `${firstName || user.firstName} ${lastName || user.lastName}`;
          updates.name = fullName;
          
          if (updatedCallCenter.outbound_calls !== undefined && updatedCallCenter.outbound_calls !== currentCallCenter.outbound_calls) {
            updates.outgoing_calls = normalizeCallSetting(updatedCallCenter.outbound_calls) === 'yes' ? 'allowed' : 'disallowed';
          }
          if (updatedCallCenter.recording_downloads !== undefined && updatedCallCenter.recording_downloads !== currentCallCenter.recording_downloads) {
            updates.monitor_enable = normalizeCallSetting(updatedCallCenter.recording_downloads) === 'yes' ? 'both' : 'off';
          }
          if (updatedCallCenter.waiting_in_line !== undefined && updatedCallCenter.waiting_in_line !== currentCallCenter.waiting_in_line) {
            updates.waiting_in_line = normalizeCallSetting(updatedCallCenter.waiting_in_line);
          }
          if (updatedCallCenter.inbound_calls !== undefined && updatedCallCenter.inbound_calls !== currentCallCenter.inbound_calls) {
            updates.inbound_calls = normalizeCallSetting(updatedCallCenter.inbound_calls);
          }
          // Always include playback fields if they are provided, even if unchanged
          if (updatedCallCenter.playback_during_paused !== undefined) {
            updates.playback_during_paused = normalizeCallSetting(updatedCallCenter.playback_during_paused);
          }
          if (updatedCallCenter.playback !== undefined) {
            updates.playback = normalizeCallSetting(updatedCallCenter.playback);
          }

          if (Object.keys(updates).length > 0) {
            // Update PBX API and both masterDB and tenantDB
            await updateExtension(existingPbxExtension.extension_hash, updates, { db: tenantDB });
            
            // Also ensure tenant DB is updated with all fields (including playback fields)
            const tenantUpdateFields = {
              ...updates
            };
            
            await PbxExtension.updateOne(
              { userId: user._id },
              { $set: tenantUpdateFields }
            );
          }
        } catch (pbxError) {
          console.error('Error updating PBX extension:', pbxError);
        }
      }

      // Create StatusHistory entry if call status changed
      if (updatedCallCenter.call_status !== currentCallCenter.call_status) {
        try {
          const StatusHistory = tenantDB.models.StatusHistory || tenantDB.model('StatusHistory', StatusHistorySchema);
          await StatusHistory.create({
            userId: user._id,
            statusType: 'call',
            previousStatus: currentCallCenter.call_status || 'available',
            newStatus: updatedCallCenter.call_status,
            timestamp: new Date()
          });
        } catch (statusError) {
          console.error('Error creating call status history:', statusError);
        }
      }
    }

    // Update chat fields (nested)
    if (isAdmin && chatData) {
      const currentChat = user.chat || {};
      const updatedChat = { ...currentChat, ...chatData };
      
      // Determine chat_status if not explicitly provided
      if (!updatedChat.chat_status && updatedChat.chat_feature) {
        if (updatedChat.chat_feature === 'view-only') {
          updatedChat.chat_status = 'viewonly';
        } else if (updatedChat.chat_feature === 'on') {
          updatedChat.chat_status = 'available';
        } else {
          updatedChat.chat_status = 'available';
        }
      }
      // Handle role_in_chat_feature if provided
      if (updatedChat.role_in_chat_feature !== undefined) {
        updatedChat.role_in_chat_feature = updatedChat.role_in_chat_feature;
      }

      user.chat = updatedChat;

      // Create StatusHistory entry if chat status changed
      if (updatedChat.chat_status !== currentChat.chat_status) {
        try {
          const StatusHistory = tenantDB.models.StatusHistory || tenantDB.model('StatusHistory', StatusHistorySchema);
          await StatusHistory.create({
            userId: user._id,
            statusType: 'chat',
            previousStatus: currentChat.chat_status || 'available',
            newStatus: updatedChat.chat_status,
            timestamp: new Date()
          });
        } catch (statusError) {
          console.error('Error creating chat status history:', statusError);
        }
      }

      // ✅ Emit socket event for real-time chat feature updates
      if (updatedChat.chat_feature !== currentChat.chat_feature || updatedChat.role_in_chat_feature !== currentChat.role_in_chat_feature) {
        try {
          const io = SocketManager.getIO();
          if (io) {
            // Emit to user's personal room
            io.to(`user:${user._id.toString()}`).emit('user:chatFeatureUpdated', {
              userId: user._id.toString(),
              chat_feature: updatedChat.chat_feature,
              role_in_chat_feature: updatedChat.role_in_chat_feature,
              chat_status: updatedChat.chat_status,
              timestamp: new Date().toISOString()
            });

            // Also emit to tenant room for real-time updates
            io.to(`tenant:${context.tenantId}`).emit('user:chatFeatureUpdated', {
              userId: user._id.toString(),
              chat_feature: updatedChat.chat_feature,
              role_in_chat_feature: updatedChat.role_in_chat_feature,
              chat_status: updatedChat.chat_status,
              timestamp: new Date().toISOString()
            });

            console.log(`✅ Socket event emitted: user:chatFeatureUpdated for user ${userId}`);
          }
        } catch (socketError) {
          console.error('Error emitting chat feature update socket event:', socketError);
          // Don't fail the request if socket emission fails
        }
      }
    }
    
    // Update departments
    if (departments && isAdmin) {
      // Verify all departments exist
      const deptCount = await Department.countDocuments({ _id: { $in: departments } });
      if (deptCount !== departments.length) {
        return NextResponse.json(
          { success: false, error: 'One or more departments not found' },
          { status: 404 }
        );
      }

      // Remove user from old departments
      await Department.updateMany(
        { agents: userId },
        { $pull: { agents: userId } }
      );

      // Add user to new departments
      await Department.updateMany(
        { _id: { $in: departments } },
        { $addToSet: { agents: userId } }
      );

      user.departments = departments;
    }

    await user.save();

    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.refreshToken;

    return NextResponse.json({
      success: true,
      data: userObj
    });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { userId } = await params;

    // ✅ Prevent users from deleting their own account
    if (auth.user.userId === userId) {
      return NextResponse.json(
        { success: false, error: 'You cannot delete your own account' },
        { status: 403 }
      );
    }

    const context = await getTenantContext(request);
    const masterDB = await getMasterDB();
    const tenantDB = await getTenantDB(context.tenantId);

    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // ✅ Company admins cannot delete other company admins
    if (auth.user.role === 'company_admin' && user.role === 'company_admin') {
      return NextResponse.json(
        { success: false, error: 'Company admins cannot delete other company admin accounts' },
        { status: 403 }
      );
    }

    if (user.companyId.toString() !== context.tenantId && auth.user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Remove user from all departments
    if (user.departments && user.departments.length > 0) {
      await Department.updateMany(
        { _id: { $in: user.departments } },
        { $pull: { agents: userId } }
      );
    }

    // ✅ Force logout: emit socket event BEFORE deleting so the user's session receives it
    try {
      const io = SocketManager.getIO();
      if (io) {
        io.to(`user:${userId}`).emit('user:forceLogout', {
          reason: 'Your account has been deleted by an administrator.',
          timestamp: new Date().toISOString()
        });

        // Disconnect all sockets in the user's room after a short delay
        // so the forceLogout event has time to be received
        setTimeout(async () => {
          try {
            const sockets = await io.in(`user:${userId}`).fetchSockets();
            for (const s of sockets) {
              s.disconnect(true);
            }
          } catch (err) {
            // Non-critical
          }
        }, 500);
      }
    } catch (socketError) {
      console.error('Error emitting force logout:', socketError);
    }

    await user.deleteOne();

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}