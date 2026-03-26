// src/app/api/users/route.js
import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getMasterDB, getTenantDB } from '../../../config/database.js'
import UserSchema from '../../../models/schemas/User.js';
import DepartmentSchema from '../../../models/schemas/Department.js';
import PbxExtensionSchema from '../../../models/schemas/PbxExtension.js';
import StatusHistorySchema from '../../../models/schemas/StatusHistory.js';
import { verifyAuth } from '../../../middleware/auth.js';
import { getTenantContext } from '../../../middleware/tenant.js';
import { createExtension, updateExtension } from '../../../services/pbx/PbxService.js';
import { generateSipCredentials, normalizeCallSetting, determineCallStatus } from '../../../utils/pbxHelpers.js';

export async function GET(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getTenantContext(request);
    const tenantId = context.tenantId;
    const masterDB = await getMasterDB();
    
    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const role = searchParams.get('role');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const skip = (page - 1) * limit;

    // Build query - only show users from this company (super_admin can see all or filter by companyId)
    const query = {};
    if (tenantId) {
      query.companyId = tenantId;
    } else if (context.role === 'super_admin') {
      // Super admin can optionally filter by companyId
      const companyId = searchParams.get('companyId');
      if (companyId) {
        query.companyId = companyId;
      }
      // Otherwise, super_admin sees all users
    } else {
      return NextResponse.json(
        { success: false, error: 'Tenant context required' },
        { status: 400 }
      );
    }
    if (role) query.role = role;
    if (status) query.status = status;

    // ✅ Company admins should not see other company_admin/super_admin users in the list
    if (auth.user.role === 'company_admin') {
      query.role = { $nin: ['company_admin', 'super_admin'] };
    }
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Determine tenantId to use for departments (for super_admin, can filter by companyId query param)
    let tenantIdForDept = tenantId || query.companyId;
    
    // ✅ Get tenant DB to access Department model (only if we have a tenantId)
    let tenantDB = null;
    let Department = null;
    if (tenantIdForDept) {
      tenantDB = await getTenantDB(tenantIdForDept);
      const DepartmentSchema = (await import('@/models/schemas/Department.js')).default;
      Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    }
    
    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -refreshToken')
        .skip(skip)
        .limit(limit)
        .sort('-createdAt')
        .lean(),
      User.countDocuments(query)
    ]);

    // ✅ Manually populate departments (since User is in masterDB and Department is in tenantDB)
    // Group users by companyId to fetch departments from correct tenant DBs
    if (Department && users.length > 0) {
      const departmentIds = [...new Set(users.flatMap(user => user.departments || []).filter(Boolean))];
      const departmentsMap = {};
      
      if (departmentIds.length > 0) {
        const departments = await Department.find({ _id: { $in: departmentIds } })
          .select('name _id')
          .lean();
        
        departments.forEach(dept => {
          departmentsMap[dept._id.toString()] = dept.name;
        });
      }
      
      // ✅ Attach department names to users
      users.forEach(user => {
        if (user.departments && user.departments.length > 0) {
          user.departments = user.departments
            .map(deptId => {
              const deptIdStr = typeof deptId === 'object' ? deptId._id?.toString() || deptId.toString() : deptId.toString();
              return {
                _id: deptIdStr,
                name: departmentsMap[deptIdStr] || 'Unknown Department'
              };
            })
            .filter(Boolean);
        } else {
          user.departments = [];
        }
      });
    } else {
      // If no Department access (super_admin viewing all), just ensure departments array exists
      users.forEach(user => {
        if (!user.departments) {
          user.departments = [];
        }
      });
    }

    // ✅ Get user statistics - based on lastLogin or status (only if we have a tenantId)
    let activeUsers = 0;
    let inactiveUsers = 0;
    
    const tenantIdForStats = tenantId || query.companyId;
    if (tenantIdForStats) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      activeUsers = await User.countDocuments({ 
        ...query,
        $or: [
          { lastLogin: { $gte: thirtyDaysAgo } },
          { status: 'active', lastLogin: { $exists: false } },
          { status: 'active' }
        ]
      });
      
      inactiveUsers = await User.countDocuments({ 
        ...query,
        $or: [
          { status: 'inactive' },
          { lastLogin: { $lt: thirtyDaysAgo } },
          { lastLogin: { $exists: false }, status: { $ne: 'active' } }
        ]
      });
    }

    return NextResponse.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      statistics: {
        total,
        active: activeUsers,
        inactive: inactiveUsers
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success || !['company_admin', 'super_admin'].includes(auth.user.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    // Get tenant context - handle errors gracefully for super_admin
    let context = null;
    let tenantId = null;
    try {
      context = await getTenantContext(request);
      tenantId = context.tenantId;
    } catch (contextError) {
      // For super_admin, tenant context might not be available, which is okay
      if (auth.user.role === 'super_admin') {
        context = {
          tenantId: null,
          tenantDatabaseName: null,
          userId: auth.user.userId,
          role: auth.user.role
        };
        tenantId = null;
      } else {
        // For non-super_admin, tenant context is required
        console.error('Tenant context error:', contextError);
        return NextResponse.json(
          { success: false, error: 'Tenant context required' },
          { status: 400 }
        );
      }
    }
    
    if (!tenantId && context.role !== 'super_admin') {
      return NextResponse.json(
        { success: false, error: 'Tenant context required' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    
    // For super_admin creating users, require companyId in body
    const companyId = body.companyId || tenantId;
    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'Company ID is required' },
        { status: 400 }
      );
    }
    
    const masterDB = await getMasterDB();
    const tenantDB = await getTenantDB(companyId);
    
    const User = masterDB.models.User || masterDB.model('User', UserSchema);
    const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);
    const { 
      email, 
      password, 
      firstName, 
      lastName, 
      departments, 
      permissions, 
      phone, 
      preferences,
      callCenter: callCenterData,
      chat: chatData
    } = body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // ✅ Check if at least one department is selected
    if (!departments || departments.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one department must be selected' },
        { status: 400 }
      );
    }

    // Verify departments exist
    const deptCount = await Department.countDocuments({ 
      _id: { $in: departments } 
    });
    
    if (deptCount !== departments.length) {
      return NextResponse.json(
        { success: false, error: 'One or more departments not found' },
        { status: 404 }
      );
    }

    // Check if user already exists
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Build preferences
    const userPreferences = preferences || {};
    const defaultPreferences = {
      theme: 'system',
      language: 'en',
      notifications: {
        email: true,
        desktop: true,
        sound: true
      }
    };
    
    const finalPreferences = {
      ...defaultPreferences,
      ...userPreferences,
      notifications: {
        ...defaultPreferences.notifications,
        ...(userPreferences.notifications || {})
      }
    };

    // Handle callCenter data (nested) - normalize types to strings
    const callCenter = callCenterData || {};
    if (callCenter.call_center && Object.keys(callCenter).length > 0) {
      // Normalize boolean/number values to strings
      if (callCenter.inbound_calls !== undefined) {
        callCenter.inbound_calls = normalizeCallSetting(callCenter.inbound_calls);
      }
      if (callCenter.outbound_calls !== undefined) {
        callCenter.outbound_calls = normalizeCallSetting(callCenter.outbound_calls);
      }
      if (callCenter.recording_downloads !== undefined) {
        callCenter.recording_downloads = normalizeCallSetting(callCenter.recording_downloads);
      }
      // waiting_in_line is a number (1, 2, 3, 4, 5, etc.) - convert to string
      if (callCenter.waiting_in_line !== undefined) {
        callCenter.waiting_in_line = typeof callCenter.waiting_in_line === 'number' 
          ? String(callCenter.waiting_in_line) 
          : normalizeCallSetting(callCenter.waiting_in_line);
      }
      // playback_during_paused and playback - normalize to string
      if (callCenter.playback_during_paused !== undefined) {
        callCenter.playback_during_paused = normalizeCallSetting(callCenter.playback_during_paused);
      }
      if (callCenter.playback !== undefined) {
        callCenter.playback = normalizeCallSetting(callCenter.playback);
      }
      // Handle role_in_call_center if provided
      if (callCenter.role_in_call_center !== undefined) {
        callCenter.role_in_call_center = callCenter.role_in_call_center;
      }
      
      // Determine call_status
      const callStatus = determineCallStatus(
        callCenter.inbound_calls,
        callCenter.outbound_calls,
        callCenter.call_center
      );
      callCenter.call_status = callStatus;
    }

    // Handle chat data (nested)
    const chat = chatData || {};
    if (chat.chat_feature) {
      if (chat.chat_feature === 'view-only') {
        chat.chat_status = 'viewonly';
      } else if (chat.chat_feature === 'on') {
        chat.chat_status = 'available';
      } else {
        chat.chat_status = 'available';
      }
    }
    // Handle role_in_chat_feature if provided
    if (chat.role_in_chat_feature !== undefined) {
      chat.role_in_chat_feature = chat.role_in_chat_feature;
    }

    // ✅ Start transaction session for atomic operations
    let session = null;
    let supportsTransactions = false;
    
    try {
      // Check if MongoDB supports transactions (replica set or sharded cluster)
      const serverStatus = await masterDB.db.admin().serverStatus();
      if (serverStatus.repl || serverStatus.process === 'mongos') {
        supportsTransactions = true;
        session = await mongoose.startSession();
        session.startTransaction();
      }
    } catch (sessionError) {
      console.warn('Transaction not supported, proceeding without transaction:', sessionError.message);
      supportsTransactions = false;
    }

    // Store created user ID for cleanup if needed
    let createdUserId = null;
    let departmentsUpdated = false;

    try {
      // Create user in masterDB with session (not yet committed - transaction pending)
      const user = await User.create([{
        email: email.toLowerCase(),
        password, // Will be hashed by pre-save hook
        firstName,
        lastName,
        phone: phone || '',
        role: 'agent', // ✅ Always agent - cannot be changed
        companyId: companyId,
        tenantDatabaseName: context.tenantDatabaseName || `tenant_${companyId}`,
        departments,
        permissions: permissions || {},
        preferences: finalPreferences,
        chat: Object.keys(chat).length > 0 ? chat : undefined,
        callCenter: Object.keys(callCenter).length > 0 ? callCenter : undefined,
        status: 'active',
        emailVerified: true,
        createdBy: context.userId
      }], supportsTransactions ? { session } : undefined);

      const createdUser = user[0];
      createdUserId = createdUser._id;

      // Handle PBX extension creation if call center is enabled (using actual user._id from DB)
      let pbxExtension = null;
      if (callCenter.call_center === 'on') {
        const { sip_username, sip_password } = generateSipCredentials(email, password);
        const fullName = `${firstName} ${lastName}`;
        
        try {
          // ✅ Create PBX extension using actual user._id (external API call - if fails, transaction will abort)
          // Skip DB save in PbxService since we'll save to tenantDB in transaction
          const pbxResponse = await createExtension({
            name: fullName,
            userId: createdUser._id.toString(), // Use actual user ID from database
            sip_username,
            sip_password,
            internal_extension: 100 + parseInt(createdUser._id.toString().slice(-6), 16) % 10000,
            outbound_calls: normalizeCallSetting(callCenter.outbound_calls),
            inbound_calls: normalizeCallSetting(callCenter.inbound_calls),
            recording_downloads: normalizeCallSetting(callCenter.recording_downloads),
            waiting_in_line: typeof callCenter.waiting_in_line === 'number' 
              ? String(callCenter.waiting_in_line) 
              : normalizeCallSetting(callCenter.waiting_in_line),
            playback_during_paused: normalizeCallSetting(callCenter.playback_during_paused),
            playback: normalizeCallSetting(callCenter.playback)
          }, true); // Skip DB save in PbxService
          
          // Save to tenant DB with session (will be rolled back if transaction fails)
          const PbxExtension = tenantDB.models.PbxExtension || tenantDB.model('PbxExtension', PbxExtensionSchema);
          const pbxDocs = await PbxExtension.create([{
            userId: createdUser._id,
            extension_hash: pbxResponse.hash,
            internal_extension: pbxResponse.internal_extension,
            sip_username,
            sip_password,
            extension_plan: "Hodinovy Manzel",
            outgoing_calls: normalizeCallSetting(callCenter.outbound_calls) === 'yes' ? 'allowed' : 'disallowed',
            inbound_calls: normalizeCallSetting(callCenter.inbound_calls),
            outroute: "OUT",
            codec_priority: "8",
            nat: 1,
            webrtc: 1,
            waiting_in_line: typeof callCenter.waiting_in_line === 'number' 
              ? String(callCenter.waiting_in_line) 
              : normalizeCallSetting(callCenter.waiting_in_line),
            playback_during_paused: normalizeCallSetting(callCenter.playback_during_paused),
            playback: normalizeCallSetting(callCenter.playback)
          }], supportsTransactions ? { session } : undefined);
          
          pbxExtension = pbxDocs[0];
        } catch (pbxError) {
          // ✅ If PBX creation fails, throw error to trigger transaction rollback
          console.error('PBX extension creation failed:', pbxError);
          const errorMessage = pbxError.response?.data?.message || pbxError.message || 'Failed to create PBX extension';
          throw new Error(`PBX Extension Creation Failed: ${errorMessage}`);
        }
      }

      // Create StatusHistory entries in tenant DB with session
      const StatusHistory = tenantDB.models.StatusHistory || tenantDB.model('StatusHistory', StatusHistorySchema);
      
      if (callCenter.call_center === 'on' && callCenter.call_status) {
        await StatusHistory.create([{
          userId: createdUser._id,
          statusType: 'call',
          previousStatus: callCenter.call_status,
          newStatus: callCenter.call_status,
          timestamp: new Date()
        }], supportsTransactions ? { session } : undefined);
      }

      if (chat.chat_feature === 'on' && chat.chat_status) {
        await StatusHistory.create([{
          userId: createdUser._id,
          statusType: 'chat',
          previousStatus: chat.chat_status,
          newStatus: chat.chat_status,
          timestamp: new Date()
        }], supportsTransactions ? { session } : undefined);
      }

      // Update departments with new agent (with session)
      await Department.updateMany(
        { _id: { $in: departments } },
        { $addToSet: { agents: createdUser._id } },
        supportsTransactions ? { session } : undefined
      );
      departmentsUpdated = true;

      // ✅ Commit transaction if using sessions
      if (supportsTransactions && session) {
        await session.commitTransaction();
        session.endSession();
      }

      // ✅ Manually populate departments (since User is in masterDB and Department is in tenantDB)
      const userObj = await User.findById(createdUser._id)
        .select('-password -refreshToken')
        .lean();
      
      // Fetch departments from tenantDB
      if (departments && departments.length > 0) {
        const departmentDocs = await Department.find({ _id: { $in: departments } })
          .select('name description')
          .lean();
        userObj.departments = departmentDocs;
      } else {
        userObj.departments = [];
      }

      // Include PBX extension if it exists
      if (pbxExtension) {
        userObj.pbxExtension = pbxExtension.toObject ? pbxExtension.toObject() : pbxExtension;
      }

      return NextResponse.json({
        success: true,
        data: userObj,
        // ✅ Include updated statistics in response
        statistics: {
          total: await User.countDocuments({ companyId: companyId }),
          active: await User.countDocuments({ 
            companyId: companyId,
            status: 'active'
          }),
          inactive: await User.countDocuments({ 
            companyId: companyId,
            status: 'inactive'
          })
        }
      }, { status: 201 });
    } catch (error) {
      // ✅ Rollback transaction on any error
      if (supportsTransactions && session) {
        try {
          await session.abortTransaction();
        } catch (abortError) {
          console.error('Error aborting transaction:', abortError);
        }
        try {
          session.endSession();
        } catch (endError) {
          console.error('Error ending session:', endError);
        }
      }
      
      // ✅ Manual cleanup: Delete user if it was created (safety measure in case transaction rollback didn't work)
      if (createdUserId) {
        try {
          // Delete user from masterDB
          await User.deleteOne({ _id: createdUserId });
          console.log(`✅ Cleaned up user ${createdUserId} after error`);
          
          // Also remove user from departments if they were updated
          if (departmentsUpdated && departments && departments.length > 0) {
            await Department.updateMany(
              { _id: { $in: departments } },
              { $pull: { agents: createdUserId } }
            );
            console.log(`✅ Cleaned up user ${createdUserId} from departments`);
          }
        } catch (cleanupError) {
          console.error('Error during manual cleanup:', cleanupError);
          // Don't throw - we still want to return the original error
        }
      }
      
      console.error('Create user error:', error);
      
      // Return appropriate error message
      const errorMessage = error.response?.data?.message || error.message || 'Failed to create user';
      
      return NextResponse.json(
        { 
          success: false, 
          error: errorMessage,
          details: error.response?.data || undefined
        },
        { status: error.response?.status || 500 }
      );
    }
  } catch (error) {
    console.error('Create user error (outer):', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}