# Architecture Documentation

## System Architecture Overview

Omni Ai Flow follows a modern, scalable architecture pattern with multi-tenant isolation, real-time communication, and asynchronous processing.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Layer                             │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │
│  │ Web Browser   │  │ Mobile App    │  │  Third-party │   │
│  │  (Next.js)    │  │  (React)      │  │  Integration │   │
│  └──────┬────────┘  └───────┬───────┘  └──────┬────────┘   │
└─────────┼────────────────────┼─────────────────┼──────────┘
          │                    │                 │
          │ HTTP/REST          │ HTTP/REST       │ Webhooks
          │ WebSocket          │ Push Notif      │
          │                    │                 │
┌─────────▼────────────────────▼─────────────────▼──────────┐
│                   Application Layer                         │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Next.js Server (HTTP + WebSocket)                   │   │
│  │                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐                │   │
│  │  │  API Routes  │  │ Socket.IO    │                │   │
│  │  │  (REST)      │  │  (Real-time) │                │   │
│  │  └──────────────┘  └──────────────┘                │   │
│  │                                                      │   │
│  │  ┌────────────────────────────────────────────┐    │   │
│  │  │         Middleware Layer                    │    │   │
│  │  │  • Authentication                           │    │   │
│  │  │  • Authorization (RBAC)                     │    │   │
│  │  │  • Tenant Isolation                         │    │   │
│  │  │  • Rate Limiting                            │    │   │
│  │  │  • Request Validation                        │    │   │
│  │  └────────────────────────────────────────────┘    │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────┬───────────────────────────────┬─────────────┘
               │                               │
    ┌──────────▼──────────┐        ┌───────────▼──────────┐
    │   Service Layer     │        │  Background Workers  │
    │                     │        │                      │
    │  • Business Logic   │        │  • Message Queue     │
    │  • Channel Handlers │        │  • Webhook Processor │
    │  • Data Processing  │        │  • Email Sender      │
    └──────────┬──────────┘        └────────────────────┘
               │
               │
┌──────────────▼───────────────────────────────────────────┐
│                  Data & Caching Layer                     │
│                                                           │
│  ┌─────────────────────────┐  ┌────────────────────────┐│
│  │    MongoDB              │  │        Redis           ││
│  │                         │  │                        ││
│  │  Master Database        │  │  • Session Store       ││
│  │  • Companies            │  │  • Cache Layer         ││
│  │  • Users (Master)       │  │  • Pub/Sub (Events)   ││
│  │  • System Config        │  │  • Rate Limit Store   ││
│  │                         │  │  • Queue Backend      ││
│  │  Tenant Databases       │  │                        ││
│  │  • Conversations        │  └────────────────────────┘│
│  │  • Messages             │                            │
│  │  • Contacts             │                            │
│  │  • Channels (Config)    │                            │
│  └─────────────────────────┘                            │
└───────────────────────────────────────────────────────────┘
```

## Multi-Tenant Architecture

### Database Isolation

Each company (tenant) has its own database:

```
Master Database (omni_master)
├── companies collection
├── users (super admin + company admins)
└── system configuration

Tenant Database (tenant_<companyId>)
├── conversations
├── messages
├── contacts
├── channels (tenant-specific config)
├── departments
├── users (agents, company-specific)
└── analytics data
```

### Implementation

```javascript
// Get tenant database
async function getTenantDB(companyId) {
  const dbName = `tenant_${companyId}`;
  return mongoose.connection.useDb(dbName, { useCache: true });
}

// Example: Fetch conversations
const db = await getTenantDB(companyId);
const Conversation = db.model('Conversation', ConversationSchema);
const conversations = await Conversation.find({ status: 'open' });
```

### Tenant Resolution

```javascript
// Middleware automatically resolves tenant
async function tenantMiddleware(request) {
  const user = request.user; // From auth middleware
  request.tenant = {
    companyId: user.companyId,
    db: await getTenantDB(user.companyId)
  };
}
```

## Request Flow

### HTTP Request Flow

```
1. Client Request
   ↓
2. Next.js API Route Handler
   ↓
3. Middleware Chain
   ├─ Request Logger
   ├─ CORS Handler
   ├─ Rate Limiter
   ├─ Authentication
   ├─ Authorization (RBAC)
   └─ Tenant Resolver
   ↓
4. Business Logic (Service Layer)
   ├─ Validation
   ├─ Database Operations
   ├─ External API Calls
   └─ Response Formatting
   ↓
5. HTTP Response
```

### WebSocket Connection Flow

```
1. Client Connects to Socket.IO
   ↓
2. Socket.IO Handshake
   ↓
3. Authentication (JWT token verification)
   ↓
4. Join Tenant Room
   ↓
5. Subscribe to Events
   ├─ conversation:*
   ├─ message:*
   └─ notification:*
   ↓
6. Real-time Event Distribution
   (via Redis Pub/Sub in cluster mode)
```

## Component Architecture

### Frontend Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Layout Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Super Admin  │  │ Company      │  │ Agent       │   │
│  │   Layout     │  │ Admin Layout │  │ Layout      │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└────────────┬─────────────────────────────┬───────────────┘
             │                             │
┌────────────▼─────────────────────────────▼───────────────┐
│                  Feature Components                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Conversations│  │  Channels    │  │  Analytics   │  │
│  │   Panel      │  │   Manager    │  │  Dashboard   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────┬─────────────────────────────┬───────────────┘
             │                             │
┌────────────▼─────────────────────────────▼───────────────┐
│                  UI Components                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Buttons    │  │  Forms       │  │  Modals      │  │
│  │   Inputs     │  │  Cards       │  │  Dialogs     │  │
│  │   Tables     │  │  Lists       │  │  Toasts      │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### State Management

**Zustand Stores**:
- `useAuthStore` - Authentication state, user info
- `useConversationStore` - Conversation list and active conversation
- `useMessageStore` - Messages for current conversation
- `useSocketStore` - Socket.IO connection state
- `useUIStore` - UI state (sidebar, modals, theme)
- `useNotificationStore` - In-app notifications

**React Query**:
- Server state management
- Caching and synchronization
- Background updates

```javascript
// Example: Using Zustand store
import { useConversationStore } from '@/store/useConversationStore';

function ConversationList() {
  const { conversations, selectedConversation, selectConversation } = 
    useConversationStore();
  
  // Update UI based on state
}
```

## Data Flow

### Creating a Conversation

```
1. User submits conversation form
   ↓
2. Frontend validates data
   ↓
3. POST /api/conversations
   ↓
4. Middleware: Auth → RBAC → Tenant
   ↓
5. Service Layer:
   ├─ Validate contact exists
   ├─ Check channel is active
   ├─ Create conversation in tenant DB
   ├─ Initialize conversation state
   └─ Trigger Socket.IO event
   ↓
6. Background Worker:
   ├─ Queue outbound message
   └─ Process webhooks
   ↓
7. Response to client
   ↓
8. Socket.IO broadcasts to connected agents
   ↓
9. UI updates in real-time
```

### Sending a Message

```
1. Agent types message
   ↓
2. Real-time validation (optional)
   ↓
3. POST /api/messages
   ├─ Create message in database
   └─ Queue message for delivery
   ↓
4. Socket.IO: Emit 'new_message' to room
   ↓
5. All connected agents receive update
   ↓
6. Worker processes message queue
   ├─ Connect to channel API
   ├─ Send message
   └─ Update status
   ↓
7. Channel webhook callback
   ↓
8. Update message status
   └─ Broadcast to clients
```

## Background Workers

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  BullMQ Queue System                    │
│                                                         │
│  ┌────────────────┐           ┌────────────────┐      │
│  │ Message Queue  │           │ Webhook Queue  │      │
│  │                │           │                │      │
│  │ • outbound     │           │ • whatsapp     │      │
│  │ • email        │           │ • email        │      │
│  │ • sms          │           │ • custom       │      │
│  └────────────────┘           └────────────────┘      │
└────────────────┬──────────────────┬───────────────────┘
                 │                  │
        ┌────────▼────────┐ ┌──────▼───────────┐
        │ Message Worker  │ │ Webhook Worker    │
        │                 │ │                   │
        │ • Process jobs  │ │ • Process events  │
        │ • Retry failed  │ │ • Update state    │
        │ • Update status   │ │ • Notify users   │
        └─────────────────┘ └──────────────────┘
```

### Worker Implementation

```javascript
// Message Worker
import { Worker, Queue } from 'bullmq';

const messageQueue = new Queue('messages', {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

const messageWorker = new Worker('messages', async (job) => {
  const { channel, conversationId, content } = job.data;
  
  // Route to appropriate channel handler
  const handler = getChannelHandler(channel);
  const result = await handler.sendMessage({
    conversationId,
    content,
  });
  
  return result;
}, {
  connection: redisClient,
  concurrency: 5, // Process 5 jobs concurrently
});
```

## Security Architecture

### Authentication Flow

```
1. User submits credentials
   ↓
2. Verify against database
   ↓
3. Generate JWT tokens
   ├─ Access token (short-lived)
   └─ Refresh token (long-lived)
   ↓
4. Store in httpOnly cookie
   ↓
5. Return user data
```

### Authorization (RBAC)

**Permission Model**:
```javascript
// Define permissions
const PERMISSIONS = {
  // Companies
  'companies:read': ['super_admin'],
  'companies:write': ['super_admin'],
  
  // Conversations
  'conversations:read': ['super_admin', 'company_admin', 'agent'],
  'conversations:write': ['super_admin', 'company_admin', 'agent'],
  'conversations:assign': ['super_admin', 'company_admin'],
  
  // Channels
  'channels:read': ['super_admin', 'company_admin'],
  'channels:write': ['super_admin', 'company_admin'],
};

// Check permission
function hasPermission(user, permission) {
  const allowedRoles = PERMISSIONS[permission];
  return allowedRoles.includes(user.role);
}
```

### Tenant Isolation

```javascript
// Middleware ensures tenant isolation
async function conversationHandler(request) {
  const user = request.user;
  const tenantDb = await getTenantDB(user.companyId);
  
  // Query only within tenant database
  const conversations = await tenantDb
    .model('Conversation')
    .find({ companyId: user.companyId });
  
  // Additional security: verify user belongs to tenant
  if (user.companyId !== conversation.companyId) {
    throw new Error('Access denied');
  }
}
```

## Scalability Considerations

### Horizontal Scaling

```
Load Balancer
     │
     ├─── Server Instance 1
     │    ├─ API Server
     │    └─ Socket.IO
     │
     ├─── Server Instance 2
     │    ├─ API Server
     │    └─ Socket.IO
     │
     └─── Server Instance N
          ├─ API Server
          └─ Socket.IO
          
          ⬇️
          
Shared Redis Cluster
├─ Session Store (Socket.IO)
├─ Message Queue (BullMQ)
└─ Pub/Sub (Multi-instance Socket.IO)
```

### Database Scaling

```
Read Replicas
├─ Master DB (Writes)
└─ Replicas (Reads)

Sharding (Future)
├─ Tenant DB Shard 1
├─ Tenant DB Shard 2
└─ Tenant DB Shard N
```

## Caching Strategy

### Redis Cache Layers

1. **Session Cache**: User sessions and Socket.IO connections
2. **Data Cache**: Frequently accessed data
3. **Rate Limit Cache**: Request rate limiting
4. **Queue Cache**: BullMQ job metadata

```javascript
// Cache conversation list
async function getConversations(userId, filters) {
  const cacheKey = `conversations:${userId}:${JSON.stringify(filters)}`;
  
  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);
  
  // Fetch from database
  const conversations = await fetchConversationsFromDB(filters);
  
  // Store in cache (TTL: 60 seconds)
  await redis.setex(cacheKey, 60, JSON.stringify(conversations));
  
  return conversations;
}
```

## Monitoring & Observability

### Health Checks

- Database connectivity
- Redis connectivity
- Queue status
- Socket.IO status
- Worker status

### Logging Strategy

```javascript
// Structured logging
logger.info('Conversation created', {
  conversationId,
  channel,
  agentId,
  timestamp
});

// Error logging
logger.error('Failed to send message', {
  error: error.message,
  stack: error.stack,
  context: { messageId, channel }
});
```

### Metrics Collection

- Request rate and latency
- Database query performance
- Redis operation latency
- Worker job processing time
- Socket.IO connection count
- Active conversation count

## External Integrations

### Channel Integrations

```
┌─────────────────────────────────────────┐
│        Channel Service Layer           │
│                                         │
│  ┌──────────┐  ┌──────────┐  ┌───────┐│
│  │ WhatsApp │  │  Email   │  │  SMS  ││
│  │  Handler │  │  Handler │  │Handler││
│  └──────────┘  └──────────┘  └───────┘│
│                                         │
│  • Unified Interface                   │
│  • Retry Logic                         │
│  • Error Handling                      │
└─────────────────────────────────────────┘
```

## Technology Stack Details

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS
- **Backend**: Node.js, Express (via Next.js API Routes)
- **Real-time**: Socket.IO with Redis Adapter
- **Database**: MongoDB with Mongoose
- **Cache/Queue**: Redis with BullMQ
- **Auth**: JWT with httpOnly cookies
- **File Storage**: AWS S3 (optional)
- **Containerization**: Docker & Docker Compose

For more information, see the [main documentation](PROJECT_DOCUMENTATION.md).

