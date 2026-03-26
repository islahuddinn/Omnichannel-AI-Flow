// // src/app/api/messages/[messageId]/route.js
// import { NextResponse } from 'next/server';
// import { connectToTenantDB } from '@/lib/db/connection';
// import Message from '@/models/schemas/Message';
// import { verifyAuth } from '@/middleware/auth';
// import { getTenantContext } from '@/middleware/tenant';
// import { getIO } from '@/lib/socket/server';

// export async function GET(request, { params }) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
//     }

//     const { messageId } = await params;
//     const tenantId = getTenantContext();
//     const db = await connectToTenantDB(tenantId);

//     const message = await Message.findById(messageId)
//       .populate('sender', 'firstName lastName avatar')
//       .populate('conversation')
//       .lean();

//     if (!message) {
//       return NextResponse.json(
//         { success: false, error: 'Message not found' },
//         { status: 404 }
//       );
//     }

//     return NextResponse.json({
//       success: true,
//       data: message
//     });
//   } catch (error) {
//     console.error('Get message error:', error);
//     return NextResponse.json(
//       { success: false, error: 'Failed to fetch message' },
//       { status: 500 }
//     );
//   }
// }

// export async function PUT(request, { params }) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
//     }

//     const { messageId } = await params;
//     const { content } = await request.json();

//     if (!content) {
//       return NextResponse.json(
//         { success: false, error: 'Content is required' },
//         { status: 400 }
//       );
//     }

//     const tenantId = getTenantContext();
//     const db = await connectToTenantDB(tenantId);

//     const message = await Message.findById(messageId);
//     if (!message) {
//       return NextResponse.json(
//         { success: false, error: 'Message not found' },
//         { status: 404 }
//       );
//     }

//     // Only sender can edit
//     if (message.sender.toString() !== auth.user.userId) {
//       return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
//     }

//     // Can only edit within 15 minutes
//     const editWindow = 15 * 60 * 1000; // 15 minutes
//     if (Date.now() - new Date(message.createdAt).getTime() > editWindow) {
//       return NextResponse.json(
//         { success: false, error: 'Message can only be edited within 15 minutes' },
//         { status: 400 }
//       );
//     }

//     message.content = content;
//     message.edited = true;
//     message.editedAt = new Date();
//     await message.save();

//     // Emit socket event
//     const io = getIO();
//     io.to(`tenant:${tenantId}`).emit('message:updated', {
//       messageId,
//       content
//     });

//     return NextResponse.json({
//       success: true,
//       data: message
//     });
//   } catch (error) {
//     console.error('Update message error:', error);
//     return NextResponse.json(
//       { success: false, error: 'Failed to update message' },
//       { status: 500 }
//     );
//   }
// }

// export async function DELETE(request, { params }) {
//   try {
//     const auth = await verifyAuth(request);
//     if (!auth.success) {
//       return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
//     }

//     const { messageId } = await params;
//     const tenantId = getTenantContext();
//     const db = await connectToTenantDB(tenantId);

//     const message = await Message.findById(messageId);
//     if (!message) {
//       return NextResponse.json(
//         { success: false, error: 'Message not found' },
//         { status: 404 }
//       );
//     }

//     // Only sender or admin can delete
//     const isAdmin = ['company_admin', 'super_admin'].includes(auth.user.role);
//     if (message.sender.toString() !== auth.user.userId && !isAdmin) {
//       return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
//     }

//     message.deleted = true;
//     message.deletedAt = new Date();
//     message.deletedBy = auth.user.userId;
//     await message.save();

//     // Emit socket event
//     const io = getIO();
//     io.to(`tenant:${tenantId}`).emit('message:deleted', {
//       messageId
//     });

//     return NextResponse.json({
//       success: true,
//       message: 'Message deleted successfully'
//     });
//   } catch (error) {
//     console.error('Delete message error:', error);
//     return NextResponse.json(
//       { success: false, error: 'Failed to delete message' },
//       { status: 500 }
//     );
//   }
// }


import { NextResponse } from 'next/server';
import { connectToTenantDB } from '@/lib/db/connection';
import MessageSchema from '@/models/schemas/Message';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getIO } from '@/lib/socket/server';
import mongoose from 'mongoose'; // Added: For ObjectId validation

export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params; // Fixed: Await params
    const { messageId } = resolvedParams;

    // Fixed: Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid message ID' },
        { status: 400 }
      );
    }

    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
    }
    const tenantId = context.tenantId;
    const db = await connectToTenantDB(tenantId);

    const Message = db.models.Message || db.model('Message', MessageSchema);

    const message = await Message.findById(messageId)
      .populate('sender', 'firstName lastName avatar')
      .populate('conversation')
      .lean();

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('Get message error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch message' },
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

    const resolvedParams = await params; // Fixed: Await params
    const { messageId } = resolvedParams;

    // Fixed: Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid message ID' },
        { status: 400 }
      );
    }

    const { content } = await request.json();

    if (!content) {
      return NextResponse.json(
        { success: false, error: 'Content is required' },
        { status: 400 }
      );
    }

    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
    }
    const tenantId = context.tenantId;
    const db = await connectToTenantDB(tenantId);

    const Message = db.models.Message || db.model('Message', MessageSchema);

    const message = await Message.findById(messageId);
    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    // Only sender can edit
    if (message.sender.toString() !== auth.user.userId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Can only edit within 15 minutes
    const editWindow = 15 * 60 * 1000; // 15 minutes
    if (Date.now() - new Date(message.createdAt).getTime() > editWindow) {
      return NextResponse.json(
        { success: false, error: 'Message can only be edited within 15 minutes' },
        { status: 400 }
      );
    }

    message.content = content;
    message.edited = true;
    message.editedAt = new Date();
    await message.save();

    // Emit socket event
    const io = getIO();
    io.to(`tenant:${tenantId}`).emit('message:edit', {
      messageId,
      conversationId: message.conversation,
      content
    });

    return NextResponse.json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('Update message error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update message' },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const { messageId } = resolvedParams;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid message ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { isStarred } = body;

    if (isStarred === undefined) {
      return NextResponse.json(
        { success: false, error: 'isStarred field is required' },
        { status: 400 }
      );
    }

    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
    }
    const tenantId = context.tenantId;
    const db = await connectToTenantDB(tenantId);

    const Message = db.models.Message || db.model('Message', MessageSchema);

    const message = await Message.findByIdAndUpdate(
      messageId,
      { isStarred },
      { new: true }
    );

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('Star message error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to star message' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const { messageId } = resolvedParams;
    const body = await request.json().catch(() => ({}));
    const deleteFor = body.deleteFor || 'me'; // 'me' or 'everyone'

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid message ID' },
        { status: 400 }
      );
    }

    const context = await getTenantContext(request);
    if (!context.tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });
    }
    const tenantId = context.tenantId;
    const db = await connectToTenantDB(tenantId);

    const Message = db.models.Message || db.model('Message', MessageSchema);

    const message = await Message.findById(messageId);
    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    const io = getIO();

    if (deleteFor === 'everyone') {
      // Only sender or admin can delete for everyone
      const isAdmin = ['company_admin', 'super_admin'].includes(auth.user.role);
      if (message.sender?.toString() !== auth.user.userId && !isAdmin) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }

      // Hard delete for everyone
      message.deleted = true;
      message.deletedAt = new Date();
      message.deletedBy = auth.user.userId;
      message.content = 'This message was deleted';
      await message.save();

      // Emit socket event to all users
      io.to(`tenant:${tenantId}`).emit('message:deleted', {
        messageId,
        conversationId: message.conversation,
        deleteFor: 'everyone'
      });

      return NextResponse.json({
        success: true,
        message: 'Message deleted for everyone'
      });
    } else {
      // Delete for me only - add user to deletedFor array
      if (!message.deletedFor) {
        message.deletedFor = [];
      }
      
      if (!message.deletedFor.includes(auth.user.userId)) {
        message.deletedFor.push(auth.user.userId);
        await message.save();
      }

      // Emit socket event only to this user
      io.to(`user:${auth.user.userId}`).emit('message:deleted', {
        messageId,
        conversationId: message.conversation,
        deleteFor: 'me'
      });

      return NextResponse.json({
        success: true,
        message: 'Message deleted for you'
      });
    }
  } catch (error) {
    console.error('Delete message error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete message' },
      { status: 500 }
    );
  }
}