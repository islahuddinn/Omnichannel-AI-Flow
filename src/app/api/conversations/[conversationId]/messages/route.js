// // src/app/api/conversations/[conversationId]/messages/route.js
// import { NextResponse } from 'next/server';
// import { connectToTenantDB } from '@/lib/db/connection';
// import Message from '@/models/schemas/Message';
// import Conversation from '@/models/schemas/Conversation';
// import { verifyAuth } from '@/middleware/auth';
// import { getTenantContext } from '@/middleware/tenant';

// export async function GET(request, { params }) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
//     }

//     const { conversationId } = await params;
//     const tenantId = getTenantContext();
//     const db = await connectToTenantDB(tenantId);
    
//     const { searchParams } = new URL(request.url);
//     const page = parseInt(searchParams.get('page') || '1');
//     const limit = parseInt(searchParams.get('limit') || '50');
//     const before = searchParams.get('before'); // cursor for pagination
//     const skip = (page - 1) * limit;

//     // Verify conversation exists and user has access
//     const conversation = await Conversation.findById(conversationId);
//     if (!conversation) {
//       return NextResponse.json(
//         { success: false, error: 'Conversation not found' },
//         { status: 404 }
//       );
//     }

//     if (auth.user.role === 'agent' && conversation.assignedTo?.toString() !== auth.user.userId) {
//       return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
//     }

//     const query = { conversation: conversationId };
//     if (before) {
//       query.createdAt = { $lt: new Date(before) };
//     }

//     const messages = await Message.find(query)
//       .populate('sender', 'firstName lastName avatar')
//       .sort('-createdAt')
//       .skip(skip)
//       .limit(limit)
//       .lean();

//     const total = await Message.countDocuments({ conversation: conversationId });

//     return NextResponse.json({
//       success: true,
//       data: messages.reverse(), // Return oldest first
//       pagination: {
//         page,
//         limit,
//         total,
//         pages: Math.ceil(total / limit),
//         hasMore: skip + messages.length < total
//       }
//     });
//   } catch (error) {
//     console.error('Get messages error:', error);
//     return NextResponse.json(
//       { success: false, error: 'Failed to fetch messages' },
//       { status: 500 }
//     );
//   }
// }






// src/app/api/conversations/[conversationId]/messages/route.js
import { NextResponse } from 'next/server';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import MessageSchema from '@/models/schemas/Message';
import ConversationSchema from '@/models/schemas/Conversation';
import UserSchema from '@/models/schemas/User';
import ContactSchema from '@/models/schemas/Contact';
import { verifyAuth } from '@/middleware/auth';
import mongoose from 'mongoose';

export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const { conversationId } = resolvedParams;

    // Validate conversation ID
    if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid conversation ID' },
        { status: 400 }
      );
    }

    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
    }

    const tenantDB = await getTenantDB(context.tenantId);
    
    // Register all required models
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    const User = tenantDB.models.User || tenantDB.model('User', UserSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

    // Verify conversation exists and user has access
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Check access
    const isAdmin = ['company_admin', 'super_admin'].includes(auth.user.role);
    const isAssigned = conversation.assignedTo?.toString() === auth.user.userId;
    const userDepartments = (auth.user.departments || []).map(d => d.toString());
    const isInSameDepartment = userDepartments.includes(conversation.department?.toString());

    if (auth.user.role === 'agent' && !isAssigned && !isInSameDepartment) {
      return NextResponse.json({ 
        success: false, 
        error: 'You do not have access to this conversation' 
      }, { status: 403 });
    }

    // Get pagination parameters (with validation)
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));
    const skip = (page - 1) * limit;

    // Get messages for this conversation
    const messages = await Message.find({ conversation: conversationId })
      .populate('contact', 'name identifier avatar')
      .populate('sender', 'firstName lastName avatar')
      .sort({ createdAt: 1 }) // Oldest first
      .skip(skip)
      .limit(limit)
      .lean();


    // Get total count
    const total = await Message.countDocuments({ conversation: conversationId });

    return NextResponse.json({
      success: true,
      data: messages,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + messages.length < total
      }
    });

  } catch (error) {
    console.error('Get messages error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}