// // src/lib/socket/server.js
// import { Server } from 'socket.io';
// import { createAdapter } from '@socket.io/redis-adapter';
// import { createClient } from 'redis';

// let io;

// export function initSocketServer(httpServer) {
//   if (io) {
//     return io;
//   }

//   io = new Server(httpServer, {
//     path: '/socket.io',
//     cors: {
//       origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
//       credentials: true,
//     },
//     transports: ['websocket', 'polling'],
//     allowEIO3: true,
//   });

//   // Redis adapter for multi-instance support (if Redis is configured)
//   if (process.env.REDIS_URL) {
//     const pubClient = createClient({ url: process.env.REDIS_URL });
//     const subClient = pubClient.duplicate();

//     Promise.all([pubClient.connect(), subClient.connect()])
//       .then(() => {
//         io.adapter(createAdapter(pubClient, subClient));
//         console.log('✅ Socket.IO Redis adapter connected');
//       })
//       .catch((err) => {
//         console.error('❌ Redis adapter error:', err);
//       });
//   }

//   // Middleware: JWT Authentication
//   io.use(async (socket, next) => {
//     try {
//       const token = socket.handshake.auth.token;
      
//       if (!token) {
//         return next(new Error('Authentication required'));
//       }

//       // Verify JWT token here
//       // const decoded = verifyJWT(token);
//       // socket.data.userId = decoded.userId;
//       // socket.data.tenantId = decoded.tenantId;
//       // socket.data.role = decoded.role;

//       // Temporary placeholder
//       socket.data.userId = 'temp-user';
//       socket.data.tenantId = 'temp-tenant';
      
//       next();
//     } catch (error) {
//       next(new Error('Authentication failed'));
//     }
//   });

//   // Connection handler
//   io.on('connection', (socket) => {
//     const { userId, tenantId, role } = socket.data;
    
//     console.log(`✅ Socket connected: ${socket.id} | User: ${userId} | Tenant: ${tenantId}`);

//     // Join tenant room
//     socket.join(`tenant:${tenantId}`);
//     socket.join(`user:${userId}`);

//     // Handle Super Admin socket
//     if (role === 'superadmin') {
//       socket.join('superadmin');
//       handleSuperAdminSocket(socket);
//     }

//     // Handle regular events
//     handleMessageEvents(socket);
//     handleConversationEvents(socket);
//     handlePresenceEvents(socket);
//     handleTypingEvents(socket);

//     // Disconnect handler
//     socket.on('disconnect', (reason) => {
//       console.log(`❌ Socket disconnected: ${socket.id} | Reason: ${reason}`);
//     });
//   });

//   console.log('✅ Socket.IO server initialized');
//   return io;
// }

// function handleSuperAdminSocket(socket) {
//   socket.on('metrics:subscribe', () => {
//     console.log('Super admin subscribed to metrics');
    
//     // Send initial metrics
//     socket.emit('metrics:update', {
//       activeSessions: Math.floor(Math.random() * 1000),
//       messageRate: Math.floor(Math.random() * 500),
//       activeConversations: Math.floor(Math.random() * 5000),
//     });

//     // Send updates every 5 seconds
//     const interval = setInterval(() => {
//       socket.emit('metrics:update', {
//         activeSessions: Math.floor(Math.random() * 1000),
//         messageRate: Math.floor(Math.random() * 500),
//         activeConversations: Math.floor(Math.random() * 5000),
//       });
//     }, 5000);

//     socket.on('metrics:unsubscribe', () => {
//       clearInterval(interval);
//     });

//     socket.on('disconnect', () => {
//       clearInterval(interval);
//     });
//   });
// }

// function handleMessageEvents(socket) {
//   socket.on('message:send', async (data) => {
//     const { tenantId, userId } = socket.data;
    
//     // Validate and process message
//     // Enqueue to BullMQ
    
//     // Emit to tenant room
//     io.to(`tenant:${tenantId}`).emit('message:new', {
//       ...data,
//       status: 'sent',
//       timestamp: new Date(),
//     });
//   });

//   socket.on('message:read', async (data) => {
//     const { tenantId } = socket.data;
    
//     io.to(`tenant:${tenantId}`).emit('message:status', {
//       messageId: data.messageId,
//       status: 'read',
//       timestamp: new Date(),
//     });
//   });
// }

// function handleConversationEvents(socket) {
//   socket.on('conversation:join', (conversationId) => {
//     socket.join(`conversation:${conversationId}`);
//   });

//   socket.on('conversation:leave', (conversationId) => {
//     socket.leave(`conversation:${conversationId}`);
//   });
// }

// function handlePresenceEvents(socket) {
//   const { userId, tenantId } = socket.data;

//   // Broadcast user online status
//   socket.broadcast.to(`tenant:${tenantId}`).emit('presence:update', {
//     userId,
//     status: 'online',
//     timestamp: new Date(),
//   });

//   socket.on('disconnect', () => {
//     socket.broadcast.to(`tenant:${tenantId}`).emit('presence:update', {
//       userId,
//       status: 'offline',
//       timestamp: new Date(),
//     });
//   });
// }

// function handleTypingEvents(socket) {
//   socket.on('typing:start', (data) => {
//     const { userId } = socket.data;
//     socket.to(`conversation:${data.conversationId}`).emit('typing:start', {
//       userId,
//       conversationId: data.conversationId,
//     });
//   });

//   socket.on('typing:stop', (data) => {
//     const { userId } = socket.data;
//     socket.to(`conversation:${data.conversationId}`).emit('typing:stop', {
//       userId,
//       conversationId: data.conversationId,
//     });
//   });
// }

// export function getIO() {
//   if (!io) {
//     throw new Error('Socket.IO not initialized');
//   }
//   return io;
// }





// src/lib/socket/server.js
import { Server } from 'socket.io';
// ✅ Redis adapter removed - using direct Socket.IO (single instance)

let io;

export function initSocketServer(httpServer) {
  if (io) return io;

  // ✅ Dynamic CORS origin - allow all origins in development, or use env var
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const corsOrigin = isDevelopment 
    ? true // Allow all origins in development (for dynamic ports)
    : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

  io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: corsOrigin,
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
  });

  // ✅ Redis adapter removed - using direct Socket.IO (single instance)
  // No Redis adapter needed since we're not using Redis for messaging

  // Middleware: Authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));

      // Verify JWT token
      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
      
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Handle different field names (companyId vs tenantId)
      const userId = decoded.userId || decoded.user_id || decoded.id;
      const tenantId = decoded.tenantId || decoded.companyId || decoded.company_id || decoded.tenant_id;
      const role = decoded.role;

      socket.data.userId = userId;
      socket.data.tenantId = tenantId;
      socket.data.role = role;

      console.log(`🔐 Socket authenticated: User=${userId}, Tenant=${tenantId}, Role=${role}`);
      next();
    } catch (error) {
      console.error('❌ Socket authentication failed:', error.message);
      next(new Error('Authentication failed'));
    }
  });

  // --- Root namespace connections ---
  io.on('connection', (socket) => {
    const { userId, tenantId, role } = socket.data;
    console.log(`✅ Socket connected: ${socket.id} | User: ${userId} | Tenant: ${tenantId}`);

    socket.join(`tenant:${tenantId}`);
    socket.join(`user:${userId}`);

    handleMessageEvents(socket);
    handleConversationEvents(socket);
    handlePresenceEvents(socket);
    handleTypingEvents(socket);

    socket.on('disconnect', (reason) => {
      console.log(`❌ Socket disconnected: ${socket.id} | Reason: ${reason}`);
    });
  });

  // --- SuperAdmin namespace ---
  const superAdminNamespace = io.of('/superadmin');

  superAdminNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));

      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
      
      const decoded = jwt.verify(token, JWT_SECRET);
      
      if (decoded.role !== 'super_admin') {
        return next(new Error('Super admin access required'));
      }

      const userId = decoded.userId || decoded.user_id || decoded.id;
      const tenantId = decoded.tenantId || decoded.companyId || decoded.company_id || 'global';

      socket.data.role = decoded.role;
      socket.data.userId = userId;
      socket.data.tenantId = tenantId;
      
      console.log(`🔐 SuperAdmin socket authenticated: User=${userId}`);
      next();
    } catch (err) {
      console.error('❌ SuperAdmin socket authentication failed:', err.message);
      next(new Error('Auth failed'));
    }
  });

  superAdminNamespace.on('connection', (socket) => {
    console.log(`✅ SuperAdmin socket connected: ${socket.id}`);
    handleSuperAdminSocket(socket);

    socket.on('disconnect', (reason) => {
      console.log(`❌ SuperAdmin socket disconnected: ${reason}`);
    });
  });

  // --- Mobile App namespace ---
  const mobileNamespace = io.of('/mobile');

  mobileNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));

      // Verify mobile JWT token
      const MobileAuthService = (await import('@/services/mobile/MobileAuthService.js')).default;
      const decoded = MobileAuthService.verifyToken(token);
      
      if (!decoded || !decoded.sfId) {
        return next(new Error('Invalid token'));
      }

      // Get companyId from query or decoded token
      const companyId = socket.handshake.query.companyId || decoded.companyId;
      if (!companyId) {
        return next(new Error('Company ID required'));
      }

      socket.data.sfId = decoded.sfId;
      socket.data.companyId = companyId;
      socket.data.role = 'handyman';
      
      console.log(`🔐 Mobile socket authenticated: SF_ID=${decoded.sfId} | Company=${companyId}`);
      next();
    } catch (err) {
      console.error('❌ Mobile socket authentication failed:', err.message);
      next(new Error('Auth failed'));
    }
  });

  mobileNamespace.on('connection', (socket) => {
    const { sfId, companyId } = socket.data;
    console.log(`✅ Mobile socket connected: ${socket.id} | SF_ID: ${sfId} | Company: ${companyId}`);

    // Join handyman-specific room (using SF_id)
    socket.join(`mobile:handyman:${sfId}`);
    socket.join(`company:${companyId}`);

    handleMobileEvents(socket);

    socket.on('disconnect', (reason) => {
      console.log(`❌ Mobile socket disconnected: ${socket.id} | Reason: ${reason}`);
    });
  });

  console.log('✅ Socket.IO server initialized');
  return io;
}

// --- Event Handlers ---
function handleSuperAdminSocket(socket) {
  socket.on('metrics:subscribe', () => {
    console.log('Super admin subscribed to metrics');

    socket.emit('metrics:update', {
      activeSessions: Math.floor(Math.random() * 1000),
      messageRate: Math.floor(Math.random() * 500),
      activeConversations: Math.floor(Math.random() * 5000),
    });

    const interval = setInterval(() => {
      socket.emit('metrics:update', {
        activeSessions: Math.floor(Math.random() * 1000),
        messageRate: Math.floor(Math.random() * 500),
        activeConversations: Math.floor(Math.random() * 5000),
      });
    }, 5000);

    socket.on('metrics:unsubscribe', () => clearInterval(interval));
    socket.on('disconnect', () => clearInterval(interval));
  });
}

function handleMessageEvents(socket) {
  socket.on('message:send', (data) => {
    const { tenantId } = socket.data;
    io.to(`tenant:${tenantId}`).emit('message:new', {
      ...data,
      status: 'sent',
      timestamp: new Date(),
    });
  });

  socket.on('message:read', (data) => {
    const { tenantId } = socket.data;
    io.to(`tenant:${tenantId}`).emit('message:status', {
      messageId: data.messageId,
      status: 'read',
      timestamp: new Date(),
    });
  });
}

function handleConversationEvents(socket) {
  socket.on('conversation:join', (data) => {
    const conversationId = data?.conversationId || data;
    if (conversationId) {
      socket.join(`conversation:${conversationId}`);
      console.log(`📍 Socket ${socket.id} joined conversation:${conversationId}`);
    }
  });
  
  socket.on('conversation:leave', (data) => {
    const conversationId = data?.conversationId || data;
    if (conversationId) {
      socket.leave(`conversation:${conversationId}`);
      console.log(`📍 Socket ${socket.id} left conversation:${conversationId}`);
    }
  });
}

function handlePresenceEvents(socket) {
  const { userId, tenantId } = socket.data;

  socket.broadcast.to(`tenant:${tenantId}`).emit('presence:update', {
    userId,
    status: 'online',
    timestamp: new Date(),
  });

  socket.on('disconnect', () => {
    socket.broadcast.to(`tenant:${tenantId}`).emit('presence:update', {
      userId,
      status: 'offline',
      timestamp: new Date(),
    });
  });
}

function handleTypingEvents(socket) {
  socket.on('typing:start', (data) => {
    const { userId } = socket.data;
    socket.to(`conversation:${data.conversationId}`).emit('typing:start', {
      userId,
      conversationId: data.conversationId,
    });
  });

  socket.on('typing:stop', (data) => {
    const { userId } = socket.data;
    socket.to(`conversation:${data.conversationId}`).emit('typing:stop', {
      userId,
      conversationId: data.conversationId,
    });
  });
}

function handleMobileEvents(socket) {
  const { contactId, companyId } = socket.data;

  // Subscribe to job updates
  socket.on('mobile:job:subscribe', (data) => {
    const dealId = data?.dealId;
    if (dealId) {
      socket.join(`mobile:job:${dealId}`);
      console.log(`📍 Mobile socket ${socket.id} subscribed to job:${dealId}`);
    }
  });

  socket.on('mobile:job:unsubscribe', (data) => {
    const dealId = data?.dealId;
    if (dealId) {
      socket.leave(`mobile:job:${dealId}`);
      console.log(`📍 Mobile socket ${socket.id} unsubscribed from job:${dealId}`);
    }
  });

  // Location tracking (optional - for real-time location sharing)
  socket.on('mobile:location:update', (data) => {
    // Broadcast location to company room (for office tracking)
    socket.to(`company:${companyId}`).emit('mobile:location:update', {
      contactId,
      location: data.location,
      timestamp: new Date()
    });
  });

  // Presence updates
  socket.broadcast.to(`company:${companyId}`).emit('mobile:presence:update', {
    contactId,
    status: 'online',
    timestamp: new Date()
  });

  socket.on('disconnect', () => {
    socket.broadcast.to(`company:${companyId}`).emit('mobile:presence:update', {
      contactId,
      status: 'offline',
      timestamp: new Date()
    });
  });
}

export function getIO() {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}
