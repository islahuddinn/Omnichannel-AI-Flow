// src/services/socket/SocketManager.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";

class SocketManager {
  constructor() {
    this.io = null;
    this.superAdminNamespace = null;
    this.initialized = false;
  }

  async initialize(httpServer) {
    if (this.initialized) {
      console.log("⚠️ Socket.IO already initialized");
      return this.io;
    }

    // ✅ Dynamic CORS origin - allow all origins in development, or use env var
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const corsOrigin = isDevelopment
      ? true // Allow all origins in development (for dynamic ports)
      : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");

    this.io = new Server(httpServer, {
      cors: {
        origin: corsOrigin,
        credentials: true,
        methods: ["GET", "POST"],
      },
      transports: ["websocket", "polling"],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // ✅ No Redis adapter needed - using direct Socket.IO (single instance)
    console.log("✅ Socket.IO initialized (direct mode - no Redis adapter)");

    this.initializeSuperAdminNamespace();
    this.initializeMainNamespace();
    this.initializeWebChatNamespace();

    this.initialized = true;
    console.log("✅ Socket.IO fully initialized and ready");
    return this.io;
  }


  // ✅ Redis adapter and pub/sub removed - using direct Socket.IO

  async shutdown() {
    console.log('🛑 Shutting down Socket.IO...');

    try {
      if (this.io) {
        this.io.close();
        console.log('✅ Socket.IO server closed');
      }

      this.initialized = false;
      console.log('✅ SocketManager shutdown complete');
    } catch (error) {
      console.error('❌ Error during SocketManager shutdown:', error);
    }
  }

  // ✅ Redis methods removed - no longer needed

  getIO() {
    if (!this.io) {
      console.warn("⚠️ Socket.IO not initialized");
      return null;
    }
    return this.io;
  }

  // Safe emit method (still used for direct server emissions)
  safeEmit(room, event, data) {
    try {
      const io = this.getIO();
      if (io) {
        io.to(room).emit(event, data);
        console.log(`📡 Emitted ${event} to ${room}`);
      } else {
        console.log(`📡 [No IO] Would emit ${event} to ${room}`);
      }
    } catch (error) {
      console.error('Failed to emit socket event:', error);
    }
  }

  initializeSuperAdminNamespace() {
    this.superAdminNamespace = this.io.of("/superadmin");

    this.superAdminNamespace.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error("Authentication required"));

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== "super_admin") {
          return next(new Error("Super admin access required"));
        }

        socket.userId = decoded.userId;
        socket.role = decoded.role;
        next();
      } catch (error) {
        console.error("❌ SuperAdmin auth failed:", error.message);
        next(new Error("Authentication failed"));
      }
    });

    this.superAdminNamespace.on("connection", (socket) => {
      console.log("✅ Super admin connected:", socket.userId);

      socket.join("global");

      socket.on("metrics:subscribe", () => {
        socket.join("metrics");
        this.sendMetricsUpdate(socket);
      });

      socket.on("metrics:unsubscribe", () => socket.leave("metrics"));

      socket.on("disconnect", () => {
        console.log("❌ Super admin disconnected:", socket.userId);
      });
    });
  }

  // ✅ Initialize WebChat namespace
  initializeWebChatNamespace() {
    try {
      import('./handlers/webchatHandler.js').then(({ initializeWebChatNamespace }) => {
        initializeWebChatNamespace(this.io);
        console.log('✅ WebChat namespace initialized');
      }).catch(error => {
        console.error('❌ Failed to initialize WebChat namespace:', error);
      });
    } catch (error) {
      console.error('❌ Failed to load WebChat handler:', error);
    }
  }

  initializeMainNamespace() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error("Authentication required"));

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Mobile app tokens (type: 'mobile_access') have sfId, companyId
        if (decoded.sfId || decoded.type === 'mobile_access') {
          if (!decoded.companyId) {
            return next(new Error('Token missing companyId — please re-login'));
          }
          socket.userId = decoded.sfId || decoded.userId;
          socket.companyId = decoded.companyId;
          socket.tenantId = decoded.companyId;
          socket.role = 'handyman';
          socket.departments = [];
          socket.sfId = decoded.sfId;
          next();
          return;
        }

        socket.userId = decoded.userId;
        socket.companyId = decoded.companyId;
        socket.tenantId = decoded.tenantId || decoded.companyId; // ensure tenant room join
        socket.role = decoded.role;
        // ✅ CRITICAL: Extract departments from JWT token for department-based segregation
        socket.departments = decoded.departments || [];
        next();
      } catch (error) {
        console.error("❌ Main namespace auth failed:", error.message);
        next(new Error("Authentication failed"));
      }
    });

    this.io.on("connection", (socket) => {
      console.log("✅ User connected:", socket.userId, {
        tenantId: socket.tenantId,
        companyId: socket.companyId,
        role: socket.role,
        socketId: socket.id
      });

      // ✅ Mobile handyman: join handyman-specific room to receive job:deal_updated (Salesforce sync)
      if (socket.sfId && socket.role === 'handyman') {
        const handymanRoom = `mobile:handyman:${socket.sfId}`;
        socket.join(handymanRoom);
        console.log(`👤 Handyman ${socket.sfId} joined room: ${handymanRoom}`);
      }

      // ✅ CRITICAL: Join company/tenant rooms (support both claims)
      // ✅ Company admins and super admins join tenant room to see all conversations
      if (socket.companyId) {
        socket.join(`company:${socket.companyId}`);
        console.log(`👤 User ${socket.userId} joined company room: company:${socket.companyId}`);
      }
      if (socket.tenantId) {
        // ✅ Only company admins and super admins join tenant room (see all conversations)
        if (socket.role === 'company_admin' || socket.role === 'super_admin') {
          socket.join(`tenant:${socket.tenantId}`);
          console.log(`👤 Admin ${socket.userId} joined tenant room: tenant:${socket.tenantId}`);

          // ✅ Verify room join
          const roomSockets = this.io.sockets.adapter.rooms.get(`tenant:${socket.tenantId}`);
          const roomSize = roomSockets ? roomSockets.size : 0;
          console.log(`✅ Tenant room size after join: ${roomSize} sockets in tenant:${socket.tenantId}`);
        }
      }

      // ✅ CRITICAL: Join department rooms for agents (department-based segregation)
      if (socket.role === 'agent' && socket.departments && socket.departments.length > 0) {
        socket.departments.forEach((deptId) => {
          const departmentRoom = `department:${deptId}`;
          socket.join(departmentRoom);
          console.log(`👤 Agent ${socket.userId} joined department room: ${departmentRoom}`);
        });

        // ✅ Verify department room joins
        socket.departments.forEach((deptId) => {
          const departmentRoom = `department:${deptId}`;
          const roomSockets = this.io.sockets.adapter.rooms.get(departmentRoom);
          const roomSize = roomSockets ? roomSockets.size : 0;
          console.log(`✅ Department room size: ${roomSize} sockets in ${departmentRoom}`);
        });
      } else if (socket.role === 'agent' && (!socket.departments || socket.departments.length === 0)) {
        console.warn(`⚠️ Agent ${socket.userId} has no departments assigned - will not receive any department-based events`);
      }

      // Join conversation rooms
      socket.on('conversation:join', (data, callback) => {
        try {
          const { conversationId } = data;
          if (!conversationId) {
            if (callback) callback({ success: false, error: 'Missing conversationId' });
            return;
          }

          const room = `conversation:${conversationId}`;
          socket.join(room);

          // Verify join
          const roomSockets = this.io.sockets.adapter.rooms.get(room);
          const roomSize = roomSockets ? roomSockets.size : 0;

          console.log(`👤 User ${socket.userId} joined conversation room: ${room}`, {
            socketId: socket.id,
            room,
            conversationId,
            roomSize
          });

          // Send acknowledgment
          if (callback) {
            callback({ success: true, room, roomSize });
          }
        } catch (error) {
          console.error('❌ Error joining conversation room:', error);
          if (callback) {
            callback({ success: false, error: error.message });
          }
        }
      });

      socket.on('conversation:leave', (data) => {
        const { conversationId } = data;
        socket.leave(`conversation:${conversationId}`);
        console.log(`👤 User ${socket.userId} left conversation ${conversationId}`);
      });

      // ✅ Handle conversation actions via socket (NO API CALLS)
      socket.on('conversation:action', async (data) => {
        try {
          const { conversationId, action, actionData } = data;
          const tenantId = socket.tenantId || socket.companyId;

          if (!conversationId || !action) {
            socket.emit('conversation:action:error', { error: 'Missing conversationId or action' });
            return;
          }

          // Import required modules
          const { getTenantDB } = await import('../../config/database.js');
          const ConversationSchema = (await import('../../models/schemas/Conversation.js')).default;
          const MessageSchema = (await import('../../models/schemas/Message.js')).default;

          const tenantDB = await getTenantDB(tenantId);
          const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
          const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

          const conversation = await Conversation.findById(conversationId);
          if (!conversation) {
            socket.emit('conversation:action:error', { error: 'Conversation not found' });
            return;
          }

          let result = {};
          const SocketEmitter = (await import('./SocketEmitter.js')).default;

          switch (action) {
            case 'pin':
              conversation.isPinned = true;
              conversation.pinnedAt = new Date();
              conversation.pinnedBy = socket.userId;
              await conversation.save();
              result = { isPinned: true, pinnedAt: conversation.pinnedAt };
              await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:pinned', {
                conversationId: String(conversationId),
                isPinned: true,
                pinnedAt: conversation.pinnedAt
              });
              break;

            case 'unpin':
              conversation.isPinned = false;
              conversation.pinnedAt = null;
              conversation.pinnedBy = null;
              await conversation.save();
              result = { isPinned: false };
              await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:unpinned', {
                conversationId: String(conversationId),
                isPinned: false
              });
              break;

            case 'markRead':
              // ✅ Update message status to 'read' (not just readAt)
              const readMessages = await Message.find({
                conversation: conversationId,
                direction: 'inbound',
                readAt: { $exists: false }
              });

              await Message.updateMany(
                { conversation: conversationId, direction: 'inbound', readAt: { $exists: false } },
                {
                  $set: {
                    readAt: new Date(),
                    readBy: socket.userId,
                    status: 'read' // ✅ Update status to 'read' for blue ticks
                  }
                }
              );

              const unreadCount = await Message.countDocuments({
                conversation: conversationId,
                direction: 'inbound',
                readAt: { $exists: false }
              });
              conversation.unreadCount = unreadCount;
              await conversation.save();
              result = { unreadCount: conversation.unreadCount };

              // ✅ Emit conversation:read event
              await SocketEmitter.emit(`conversation:${conversationId}`, 'conversation:read', {
                conversationId: String(conversationId),
                unreadCount: conversation.unreadCount
              });
              await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:read', {
                conversationId: String(conversationId),
                unreadCount: conversation.unreadCount
              });

              // ✅ CRITICAL: Emit message:status events to webchat namespace for real-time blue ticks
              // Get contact's webchat identifier to emit to webchat namespace
              const ContactSchema = (await import('../../models/schemas/Contact.js')).default;
              const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
              const contact = await Contact.findById(conversation.contact).select('identifiers').lean();

              if (contact?.identifiers?.webchat) {
                const webchatIdentifier = contact.identifiers.webchat;
                // Emit status updates for each message that was marked as read
                for (const msg of readMessages) {
                  await SocketEmitter.emit(`webchat:${webchatIdentifier}`, 'message:status', {
                    messageId: msg._id.toString(),
                    conversationId: String(conversationId),
                    status: 'read',
                    timestamp: new Date().toISOString(),
                  });
                }
              }

              // ✅ Also emit message:status events to conversation room (for agents)
              for (const msg of readMessages) {
                await SocketEmitter.emit(`conversation:${conversationId}`, 'message:status', {
                  messageId: msg._id.toString(),
                  conversationId: String(conversationId),
                  status: 'read',
                  timestamp: new Date().toISOString(),
                });
              }

              break;

            case 'markUnread':
              conversation.unreadCount = actionData?.count || 1;
              await conversation.save();
              result = { unreadCount: conversation.unreadCount };
              await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:unread', {
                conversationId: String(conversationId),
                unreadCount: conversation.unreadCount
              });
              break;

            case 'archive':
              conversation.status = 'archived';
              conversation.archivedAt = new Date();
              conversation.archivedBy = socket.userId;
              await conversation.save();
              result = { status: 'archived', archivedAt: conversation.archivedAt };
              await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:archived', {
                conversationId: String(conversationId),
                status: 'archived'
              });
              break;

            case 'unarchive':
              conversation.status = 'active';
              conversation.archivedAt = null;
              conversation.archivedBy = null;
              await conversation.save();
              result = { status: 'active' };
              await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:unarchived', {
                conversationId: String(conversationId),
                status: 'active'
              });
              break;

            case 'mute':
              conversation.isMuted = true;
              conversation.mutedAt = new Date();
              conversation.mutedBy = socket.userId;
              conversation.mutedUntil = actionData?.until || null;
              await conversation.save();
              result = { isMuted: true, mutedAt: conversation.mutedAt, mutedUntil: conversation.mutedUntil };
              await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:muted', {
                conversationId: String(conversationId),
                isMuted: true
              });
              break;

            case 'unmute':
              conversation.isMuted = false;
              conversation.mutedAt = null;
              conversation.mutedBy = null;
              conversation.mutedUntil = null;
              await conversation.save();
              result = { isMuted: false };
              await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:unmuted', {
                conversationId: String(conversationId),
                isMuted: false
              });
              break;

            case 'snooze':
              const snoozeUntil = actionData?.until || new Date(Date.now() + 3600000);
              conversation.isSnoozed = true;
              conversation.snoozedAt = new Date();
              conversation.snoozedBy = socket.userId;
              conversation.snoozedUntil = snoozeUntil;
              await conversation.save();
              result = { isSnoozed: true, snoozedUntil: conversation.snoozedUntil };
              await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:snoozed', {
                conversationId: String(conversationId),
                isSnoozed: true,
                snoozedUntil
              });
              break;

            case 'unsnooze':
              conversation.isSnoozed = false;
              conversation.snoozedAt = null;
              conversation.snoozedBy = null;
              conversation.snoozedUntil = null;
              await conversation.save();
              result = { isSnoozed: false };
              await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:unsnoozed', {
                conversationId: String(conversationId),
                isSnoozed: false
              });
              break;

            case 'star':
              conversation.isStarred = true;
              conversation.starredAt = new Date();
              conversation.starredBy = socket.userId;
              await conversation.save();
              result = { isStarred: true, starredAt: conversation.starredAt };
              await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:starred', {
                conversationId: String(conversationId),
                isStarred: true
              });
              break;

            case 'unstar':
              conversation.isStarred = false;
              conversation.starredAt = null;
              conversation.starredBy = null;
              await conversation.save();
              result = { isStarred: false };
              await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:unstarred', {
                conversationId: String(conversationId),
                isStarred: false
              });
              break;

            case 'delete':
              conversation.status = 'deleted';
              conversation.deletedAt = new Date();
              conversation.deletedBy = socket.userId;
              await conversation.save();
              result = { status: 'deleted', deletedAt: conversation.deletedAt };
              await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:deleted', {
                conversationId: String(conversationId),
                status: 'deleted'
              });
              break;

            case 'deletePermanent':
              await Message.deleteMany({ conversation: conversationId });
              await Conversation.deleteOne({ _id: conversationId });
              result = { status: 'removed', removedAt: new Date() };
              await SocketEmitter.emit(`tenant:${tenantId}`, 'conversation:deleted', {
                conversationId: String(conversationId),
                status: 'removed'
              });
              await SocketEmitter.emit(`tenant:${tenantId}`, 'messages:cleared', {
                conversationId: String(conversationId)
              });
              break;

            default:
              socket.emit('conversation:action:error', { error: `Unknown action: ${action}` });
              return;
          }

          // Emit success to sender
          socket.emit('conversation:action:success', {
            conversationId: String(conversationId),
            action,
            result
          });

        } catch (error) {
          console.error('Conversation action error:', error);
          socket.emit('conversation:action:error', {
            error: error.message || 'Failed to perform action'
          });
        }
      });

      // Typing indicators
      socket.on('typing:start', (data) => {
        const { conversationId } = data;
        if (!conversationId) return;

        // ✅ Emit to conversation room (for other agents)
        socket.to(`conversation:${conversationId}`).emit('typing:start', {
          userId: socket.userId,
          conversationId: conversationId
        });

        // ✅ CRITICAL: Also emit to WebChat namespace for visitor
        const webchatNamespace = this.io.of('/webchat');
        if (webchatNamespace) {
          webchatNamespace.to(`conversation:${conversationId}`).emit('agent:typing', {
            userId: socket.userId,
            conversationId: conversationId,
            isTyping: true,
            timestamp: new Date()
          });
        }
      });

      socket.on('typing:stop', (data) => {
        const { conversationId } = data;
        if (!conversationId) return;

        // ✅ Emit to conversation room (for other agents)
        socket.to(`conversation:${conversationId}`).emit('typing:stop', {
          userId: socket.userId,
          conversationId: conversationId
        });

        // ✅ CRITICAL: Also emit to WebChat namespace for visitor
        const webchatNamespace = this.io.of('/webchat');
        if (webchatNamespace) {
          webchatNamespace.to(`conversation:${conversationId}`).emit('agent:typing', {
            userId: socket.userId,
            conversationId: conversationId,
            isTyping: false,
            timestamp: new Date()
          });
        }
      });

      // Online presence
      socket.on('presence:online', () => {
        if (socket.companyId) {
          this.io.to(`company:${socket.companyId}`).emit('presence:update', {
            userId: socket.userId,
            status: 'online'
          });
        }
      });

      // Mark messages as read
      socket.on('message:read', async (data) => {
        try {
          this.io.to(`conversation:${data.conversationId}`).emit('message:read', {
            messageId: data.messageId,
            conversationId: data.conversationId,
            userId: socket.userId,
            readAt: new Date().toISOString()
          });
        } catch (error) {
          console.error('Error handling message read:', error);
        }
      });

      // ✅ Mobile handyman: send message via socket (no webchat token needed)
      socket.on('mobile:message:send', async (data, callback) => {
        if (socket.role !== 'handyman') {
          if (callback) callback({ success: false, error: 'Only handyman role can use this event' });
          return;
        }

        try {
          let { conversationId, content, attachments = [], replyToId } = data;

          const tenantId = socket.companyId || socket.tenantId;
          if (!tenantId) {
            if (callback) callback({ success: false, error: 'Tenant context missing' });
            return;
          }

          const { getTenantDB } = await import('../../config/database.js');
          const ConversationSchema = (await import('../../models/schemas/Conversation.js')).default;
          const MessageSchema = (await import('../../models/schemas/Message.js')).default;
          const ContactSchema = (await import('../../models/schemas/Contact.js')).default;
          const CompanyAccountSchema = (await import('../../models/schemas/CompanyAccount.js')).default;
          const DepartmentSchema = (await import('../../models/schemas/Department.js')).default;

          const tenantDB = await getTenantDB(tenantId);
          const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
          const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
          const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
          const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);
          const Department = tenantDB.models.Department || tenantDB.model('Department', DepartmentSchema);

          // Find contact by sfId
          const contact = await Contact.findOne({ SF_id: socket.sfId });
          if (!contact) {
            if (callback) callback({ success: false, error: 'Handyman contact not found' });
            return;
          }

          // Ensure webchat identifier exists
          if (!contact.identifiers?.webchat) {
            contact.identifiers = contact.identifiers || {};
            contact.identifiers.webchat = `mobile_${socket.sfId}_${Date.now()}`;
            await contact.save();
          }

          let conversation = null;
          let isNewConversation = false;

          if (conversationId) {
            conversation = await Conversation.findById(conversationId);
          }

          // Auto-create conversation if none exists (first message)
          if (!conversation) {
            // Find existing webchat conversation for this contact
            conversation = await Conversation.findOne({
              contact: contact._id,
              channel: 'webchat',
              status: { $in: ['active', 'pending'] },
            }).sort({ lastMessageAt: -1 });

            if (!conversation) {
              // Create new conversation
              const webchatAccount = await CompanyAccount.findOne({
                type: 'webchat', status: { $ne: 'deleted' },
              }).lean();
              let departmentId = webchatAccount?.departmentId || null;
              if (!departmentId) {
                const defaultDept = await Department.findOne({ isDefault: true }).lean();
                departmentId = defaultDept?._id || (await Department.findOne().lean())?._id || null;
              }

              conversation = await Conversation.create({
                contact: contact._id,
                channel: 'webchat',
                channelAccount: webchatAccount?._id || null,
                department: departmentId,
                status: 'active',
                mode: 'auto',
                messageCount: 0,
                unreadCount: 0,
              });
              isNewConversation = true;
              console.log(`✅ [Mobile] Auto-created webchat conversation ${conversation._id} for handyman ${socket.sfId}`);
            }

            conversationId = conversation._id;
            // Join the room
            socket.join(`conversation:${conversationId}`);
          }

          const messageContent = typeof content === 'string'
            ? content
            : (content?.text || content?.type || '[Media]');

          // Fetch replyTo message if provided
          let replyToMessage = null;
          if (replyToId) {
            replyToMessage = await Message.findById(replyToId).select('content type attachments').lean();
          }

          const message = await Message.create({
            conversation: conversationId,
            contact: contact._id,
            channel: 'webchat',
            channelAccount: conversation.channelAccount || null,
            departmentId: conversation.department || null,
            type: content?.type || (attachments.length > 0 ? 'document' : 'text'),
            content: messageContent,
            attachments: attachments || [],
            direction: 'inbound',
            status: 'sent',
            replyTo: replyToId || null,
            createdAt: new Date(),
          });

          // Update conversation
          await Conversation.findByIdAndUpdate(conversationId, {
            lastMessage: message._id,
            lastMessageAt: new Date(),
            lastMessageContent: messageContent || (attachments.length > 0 ? '[Media]' : '[Message]'),
            lastMessageType: content?.type || (attachments.length > 0 ? 'document' : 'text'),
            lastMessageDirection: 'inbound',
            $inc: { messageCount: 1, unreadCount: 1 },
            status: 'active',
          });

          const replyToData = replyToMessage ? {
            _id: replyToId,
            content: replyToMessage.content,
            type: replyToMessage.type,
            attachments: replyToMessage.attachments || [],
          } : null;

          const messagePayload = {
            _id: message._id,
            conversationId,
            contactId: contact._id,
            channel: 'webchat',
            content: messageContent,
            type: message.type,
            attachments: message.attachments || [],
            direction: 'inbound',
            status: 'sent',
            createdAt: message.createdAt,
            replyTo: replyToData,
          };

          // Emit to conversation room (admin panel sees it)
          const SocketEmitter = (await import('./SocketEmitter.js')).default;

          await SocketEmitter.emit(`conversation:${conversationId}`, 'message:new', {
            conversationId,
            message: messagePayload,
            contact: {
              _id: contact._id,
              name: contact.name,
              email: contact.email,
            },
          });

          // Emit conversation update for sidebar
          const updatedConversation = await Conversation.findById(conversationId)
            .populate('contact', 'name displayName phone email avatar identifiers')
            .populate('channelAccount', 'type name')
            .populate('department', 'name')
            .lean();

          const actualUnreadCount = await Message.countDocuments({
            conversation: conversationId,
            direction: 'inbound',
            readAt: { $exists: false },
          });

          await SocketEmitter.emitConversationUpdate(conversationId, {
            lastMessage: message._id,
            lastMessageAt: new Date(),
            lastMessageContent: messageContent || (attachments.length > 0 ? '[Media]' : '[Message]'),
            lastMessageType: message.type,
            lastMessageDirection: 'inbound',
            unreadCount: actualUnreadCount,
            messageCount: (updatedConversation?.messageCount || 0),
          }, tenantId, conversation.department, null);

          // Emit to department and tenant for new conversations
          if (isNewConversation) {
            await SocketEmitter.emitNewConversation(tenantId, updatedConversation, messagePayload, contact, conversation.department);
          }

          // Emit to tenant room
          await SocketEmitter.emit(`tenant:${tenantId}`, 'message:new', {
            conversationId,
            message: messagePayload,
            contact: { _id: contact._id, name: contact.name },
          });

          // Acknowledge to sender (include conversationId for first-message auto-creation)
          if (callback) {
            callback({
              success: true,
              conversationId: String(conversationId),
              isNewConversation,
              message: messagePayload,
            });
          }

          // Also emit message:sent back to the sender socket (for non-callback listeners)
          socket.emit('mobile:message:sent', {
            messageId: message._id,
            message: messagePayload,
            timestamp: message.createdAt,
            status: 'sent',
          });

          console.log(`✅ [Mobile] Message sent: ${message._id} from handyman ${socket.sfId}`);

          // AI Bot integration — check if auto mode
          try {
            const BotService = (await import('../../services/bot/BotService.js')).default;
            const botSettings = await BotService.getCompanyBotSettings(tenantId);
            const convMode = conversation.mode || 'auto';

            if (botSettings.enabled && convMode === 'auto' && messageContent && typeof messageContent === 'string' && messageContent.trim().length > 0) {
              const recentBotMessages = await Message.find({
                conversation: conversationId,
                'metadata.isBotResponse': true,
                createdAt: { $gte: new Date(Date.now() - 30000) },
              }).select('_id').lean();

              if (recentBotMessages.length === 0) {
                const contactName = contact.name || contact.displayName || contact.email || 'User';
                const botResponse = await BotService.generateResponse({
                  tenantId,
                  conversationId: conversationId.toString(),
                  contactId: contact._id.toString(),
                  message: messageContent,
                  platform: 'webchat',
                  contactName,
                  messageType: message.type,
                  departmentId: conversation.department?.toString() || null,
                });

                if (botResponse && botResponse.response && !botResponse.queued) {
                  await BotService.sendBotResponse({
                    tenantId,
                    conversationId: conversationId.toString(),
                    contactId: contact._id.toString(),
                    channelType: 'webchat',
                    channelAccountId: conversation.channelAccount?.toString(),
                    botResponse: botResponse.response,
                    tenantDB,
                  });
                }
              }
            }
          } catch (botError) {
            console.error('⚠️ [Mobile] Bot integration error (non-blocking):', botError.message);
          }

        } catch (error) {
          console.error('❌ [Mobile] message:send error:', error);
          if (callback) callback({ success: false, error: error.message || 'Failed to send message' });
          socket.emit('mobile:message:error', { error: error.message || 'Failed to send message' });
        }
      });

      // ✅ Mobile handyman: typing indicators
      socket.on('mobile:typing:start', (data) => {
        const { conversationId } = data || {};
        if (!conversationId) return;

        socket.to(`conversation:${conversationId}`).emit('typing:start', {
          userId: socket.userId || socket.sfId,
          conversationId,
        });

        // Also emit to webchat namespace for agents
        const webchatNamespace = this.io.of('/webchat');
        if (webchatNamespace) {
          webchatNamespace.to(`conversation:${conversationId}`).emit('agent:typing', {
            userId: socket.userId || socket.sfId,
            conversationId,
            isTyping: true,
            timestamp: new Date(),
          });
        }
      });

      socket.on('mobile:typing:stop', (data) => {
        const { conversationId } = data || {};
        if (!conversationId) return;

        socket.to(`conversation:${conversationId}`).emit('typing:stop', {
          userId: socket.userId || socket.sfId,
          conversationId,
        });

        const webchatNamespace = this.io.of('/webchat');
        if (webchatNamespace) {
          webchatNamespace.to(`conversation:${conversationId}`).emit('agent:typing', {
            userId: socket.userId || socket.sfId,
            conversationId,
            isTyping: false,
            timestamp: new Date(),
          });
        }
      });

      // ── Mobile handyman: initialize chat (find contact, conversation, load messages) ──
      socket.on('mobile:chat:init', async (data, callback) => {
        if (socket.role !== 'handyman') {
          if (callback) callback({ success: false, error: 'Only handyman role can use this event' });
          return;
        }

        try {
          const tenantId = socket.companyId || socket.tenantId;
          if (!tenantId) {
            if (callback) callback({ success: false, error: 'Tenant context missing' });
            return;
          }

          const { getTenantDB } = await import('../../config/database.js');
          const ConversationSchema = (await import('../../models/schemas/Conversation.js')).default;
          const MessageSchema = (await import('../../models/schemas/Message.js')).default;
          const ContactSchema = (await import('../../models/schemas/Contact.js')).default;

          const tenantDB = await getTenantDB(tenantId);
          const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
          const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
          const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

          // Find contact by Salesforce ID from the mobile JWT
          const contact = await Contact.findOne({ SF_id: socket.sfId }).lean();
          if (!contact) {
            if (callback) callback({
              success: true,
              data: {
                conversationId: null,
                contact: null,
                messages: [],
                hasMore: false,
                conversation: null,
              }
            });
            return;
          }

          // Find the most recent active/pending webchat conversation for this contact
          const conversation = await Conversation.findOne({
            contact: contact._id,
            channel: 'webchat',
            status: { $in: ['active', 'pending'] },
          })
            .sort({ lastMessageAt: -1 })
            .populate('department', 'name')
            .populate('assignedTo', 'firstName lastName email')
            .lean();

          let messages = [];
          let hasMore = false;

          if (conversation) {
            // Load the 50 most recent messages with full population
            messages = await Message.find({
              conversation: conversation._id,
              channel: 'webchat',
            })
              .select('-__v')
              .sort({ createdAt: -1 })
              .limit(50)
              .populate({ path: 'contact', select: 'name displayName identifier avatar', options: { lean: true } })
              .populate({ path: 'channelAccount', select: 'name identifier type', options: { lean: true } })
              .populate({
                path: 'replyTo',
                select: 'content type createdAt sender contact attachments',
                options: { lean: true },
              })
              .lean();

            // Determine if more messages exist beyond these 50
            if (messages.length === 50) {
              const oldestLoaded = messages[messages.length - 1];
              const olderExists = await Message.findOne({
                conversation: conversation._id,
                channel: 'webchat',
                createdAt: { $lt: new Date(oldestLoaded.createdAt) },
              }).select('_id').lean();
              hasMore = !!olderExists;
            }

            // Reverse to oldest-first order for the mobile app's inverted FlatList
            messages.reverse();

            // Join the conversation room for real-time updates
            socket.join(`conversation:${conversation._id}`);
          }

          if (callback) callback({
            success: true,
            data: {
              conversationId: conversation ? String(conversation._id) : null,
              contact: {
                _id: contact._id,
                name: contact.name || contact.displayName,
                email: contact.email,
                phone: contact.phone,
                identifiers: contact.identifiers || {},
              },
              messages,
              hasMore,
              conversation: conversation ? {
                _id: conversation._id,
                status: conversation.status,
                channel: conversation.channel,
                department: conversation.department,
                assignedTo: conversation.assignedTo,
                channelAccount: conversation.channelAccount,
              } : null,
            }
          });

          console.log(`✅ [Mobile] chat:init for handyman ${socket.sfId} — conv: ${conversation?._id || 'none'}, msgs: ${messages.length}`);
        } catch (error) {
          console.error('❌ [Mobile] chat:init error:', error);
          if (callback) callback({ success: false, error: error.message || 'Failed to initialize chat' });
        }
      });

      // ── Mobile handyman: load older messages (cursor-based pagination) ──
      socket.on('mobile:chat:history', async (data, callback) => {
        if (socket.role !== 'handyman') {
          if (callback) callback({ success: false, error: 'Only handyman role can use this event' });
          return;
        }

        try {
          const { conversationId, before, limit: requestedLimit } = data || {};
          const limit = Math.min(Math.max(requestedLimit || 50, 1), 100);

          if (!conversationId) {
            if (callback) callback({ success: false, error: 'conversationId is required' });
            return;
          }

          const tenantId = socket.companyId || socket.tenantId;
          if (!tenantId) {
            if (callback) callback({ success: false, error: 'Tenant context missing' });
            return;
          }

          const { getTenantDB } = await import('../../config/database.js');
          const MessageSchema = (await import('../../models/schemas/Message.js')).default;

          const tenantDB = await getTenantDB(tenantId);
          const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

          const query = {
            conversation: conversationId,
            channel: 'webchat',
          };

          if (before) {
            query.createdAt = { $lt: new Date(before) };
          }

          // Fetch limit+1 to check hasMore without an extra count query
          const messages = await Message.find(query)
            .select('-__v')
            .sort({ createdAt: -1 })
            .limit(limit + 1)
            .populate({ path: 'contact', select: 'name displayName identifier avatar', options: { lean: true } })
            .populate({ path: 'channelAccount', select: 'name identifier type', options: { lean: true } })
            .populate({
              path: 'replyTo',
              select: 'content type createdAt sender contact attachments',
              options: { lean: true },
            })
            .lean();

          const hasMore = messages.length > limit;
          if (hasMore) {
            messages.pop();
          }

          // Reverse to oldest-first order
          messages.reverse();

          if (callback) callback({
            success: true,
            data: {
              messages,
              hasMore,
            }
          });
        } catch (error) {
          console.error('❌ [Mobile] chat:history error:', error);
          if (callback) callback({ success: false, error: error.message || 'Failed to load message history' });
        }
      });

      // ── Mobile handyman: send emoji reaction on a message ──
      socket.on('mobile:chat:react', async (data, callback) => {
        if (socket.role !== 'handyman') {
          if (callback) callback({ success: false, error: 'Only handyman role can use this event' });
          return;
        }

        try {
          const { conversationId, messageId, emoji } = data || {};
          if (!conversationId || !messageId || !emoji) {
            if (callback) callback({ success: false, error: 'conversationId, messageId, and emoji are required' });
            return;
          }

          const tenantId = socket.companyId || socket.tenantId;
          if (!tenantId) {
            if (callback) callback({ success: false, error: 'Tenant context missing' });
            return;
          }

          const { getTenantDB } = await import('../../config/database.js');
          const MessageSchema = (await import('../../models/schemas/Message.js')).default;
          const ContactSchema = (await import('../../models/schemas/Contact.js')).default;

          const tenantDB = await getTenantDB(tenantId);
          const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
          const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

          const contact = await Contact.findOne({ SF_id: socket.sfId }).select('_id name displayName').lean();
          if (!contact) {
            if (callback) callback({ success: false, error: 'Contact not found' });
            return;
          }

          const message = await Message.findById(messageId);
          if (!message) {
            if (callback) callback({ success: false, error: 'Message not found' });
            return;
          }

          // Check for existing reaction from this contact with same emoji — toggle off
          const existingIdx = (message.reactions || []).findIndex(
            (r) => r.contact && String(r.contact) === String(contact._id) && r.emoji === emoji
          );

          if (existingIdx !== -1) {
            message.reactions.splice(existingIdx, 1);
          } else {
            message.reactions = message.reactions || [];
            message.reactions.push({
              emoji,
              contact: contact._id,
              createdAt: new Date(),
            });
          }

          await message.save();

          // Emit to conversation room so agents and other listeners see the reaction
          const SocketEmitter = (await import('./SocketEmitter.js')).default;
          await SocketEmitter.emit(`conversation:${conversationId}`, 'message:reacted', {
            conversationId,
            messageId: String(messageId),
            reactions: message.reactions,
            reactedBy: {
              _id: contact._id,
              name: contact.name || contact.displayName,
              type: 'contact',
            },
          });

          if (callback) callback({
            success: true,
            data: {
              messageId: String(messageId),
              reactions: message.reactions,
            }
          });
        } catch (error) {
          console.error('❌ [Mobile] chat:react error:', error);
          if (callback) callback({ success: false, error: error.message || 'Failed to send reaction' });
        }
      });

      socket.on("disconnect", () => {
        console.log("❌ User disconnected:", socket.userId);

        // Update presence
        if (socket.companyId) {
          this.io.to(`company:${socket.companyId}`).emit('presence:update', {
            userId: socket.userId,
            status: 'offline',
            lastSeen: new Date().toISOString()
          });
        }
      });
    });
  }

  // Enhanced message status emission
  emitMessageStatus(conversationId, messageId, status, tenantId, data = {}) {
    const eventData = {
      messageId,
      conversationId,
      status,
      timestamp: new Date().toISOString(),
      ...data
    };

    this.safeEmit(`conversation:${conversationId}`, 'message:status', eventData);

    if (tenantId) {
      this.safeEmit(`tenant:${tenantId}`, 'message:status', eventData);
    }
  }

  // Emit new message
  emitNewMessage(conversationId, message, tenantId) {
    const eventData = {
      message,
      conversationId,
      timestamp: new Date().toISOString()
    };

    this.safeEmit(`conversation:${conversationId}`, 'message:new', eventData);

    if (tenantId) {
      this.safeEmit(`tenant:${tenantId}`, 'message:new', eventData);
    }
  }

  // Emit reaction events
  emitReactionAdded(conversationId, messageId, reaction, tenantId) {
    const eventData = {
      messageId,
      conversationId,
      reaction,
      timestamp: new Date().toISOString()
    };

    this.safeEmit(`conversation:${conversationId}`, 'message:reaction:added', eventData);

    if (tenantId) {
      this.safeEmit(`tenant:${tenantId}`, 'message:reaction:added', eventData);
    }
  }

  emitReactionRemoved(conversationId, messageId, userId, emoji, tenantId) {
    const eventData = {
      messageId,
      conversationId,
      userId,
      emoji,
      timestamp: new Date().toISOString()
    };

    this.safeEmit(`conversation:${conversationId}`, 'message:reaction:removed', eventData);

    if (tenantId) {
      this.safeEmit(`tenant:${tenantId}`, 'message:reaction:removed', eventData);
    }
  }

  // Emit conversation updates
  emitConversationUpdate(conversationId, update, tenantId) {
    const eventData = {
      conversationId,
      update,
      timestamp: new Date().toISOString()
    };

    this.safeEmit(`conversation:${conversationId}`, 'conversation:update', eventData);

    if (tenantId) {
      this.safeEmit(`tenant:${tenantId}`, 'conversation:update', eventData);
    }
  }

  emitCompanyCreated(company) {
    if (!this.superAdminNamespace) return;
    this.superAdminNamespace.to("global").emit("company:created", {
      id: company._id,
      name: company.name,
      status: company.status,
      createdAt: company.createdAt,
    });
  }

  emitCompanyUpdated(company) {
    if (!this.superAdminNamespace) return;
    this.superAdminNamespace.to("global").emit("company:updated", {
      id: company._id,
      name: company.name,
      status: company.status,
    });
  }

  emitMetricsUpdate(metrics) {
    if (!this.superAdminNamespace) return;
    this.superAdminNamespace.to("metrics").emit("metrics:update", metrics);
  }

  async sendMetricsUpdate(socket) {
    const interval = setInterval(async () => {
      try {
        const metrics = await this.getRealtimeMetrics();
        socket.emit("metrics:update", metrics);
      } catch (error) {
        console.error("Failed to send metrics:", error);
      }
    }, 5000);

    socket.on("disconnect", () => clearInterval(interval));
  }

  async getRealtimeMetrics() {
    try {
      // ✅ Direct Socket.IO metrics (no Redis needed)
      const activeSessions = this.io ? this.io.sockets.sockets.size : 0;
      const rooms = this.io ? this.io.sockets.adapter.rooms.size : 0;

      return {
        activeSessions,
        messageRate: 0, // Can be tracked separately if needed
        activeConversations: rooms,
        timestamp: new Date(),
        mode: 'direct-socket-io'
      };
    } catch (error) {
      console.error("Failed to get metrics:", error.message);
      return {
        activeSessions: 0,
        messageRate: 0,
        activeConversations: 0,
        timestamp: new Date(),
        mode: 'error'
      };
    }
  }
}

const globalWithSocket = globalThis;
if (!globalWithSocket.socketManagerInstance) {
  globalWithSocket.socketManagerInstance = new SocketManager();
}
const socketManager = globalWithSocket.socketManagerInstance;
export default socketManager;