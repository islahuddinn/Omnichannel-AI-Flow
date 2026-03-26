# Omni Ai Flow - Project Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Installation & Setup](#installation--setup)
5. [Project Structure](#project-structure)
6. [Key Features](#key-features)
7. [Authentication & Authorization](#authentication--authorization)
8. [Database Schema](#database-schema)
9. [API Endpoints](#api-endpoints)
10. [Real-time Features](#real-time-features)
11. [Deployment](#deployment)
12. [Environment Variables](#environment-variables)
13. [Development Guidelines](#development-guidelines)
14. [Testing](#testing)
15. [Troubleshooting](#troubleshooting)

---

## Project Overview

**Omni Ai Flow** is a multi-tenant omnichannel customer support and communication platform. It enables businesses to manage customer interactions across multiple channels (WhatsApp, Email, SMS, Web Chat, etc.) through a unified interface.

### Core Capabilities
- **Multi-tenant Architecture**: Complete isolation between different companies
- **Omnichannel Communication**: Support for multiple communication channels
- **Real-time Messaging**: Socket.IO based real-time communication
- **Role-based Access Control**: Three-tier access (Super Admin, Company Admin, Agent)
- **Advanced Analytics**: Track performance and customer engagement
- **Task Management**: Handle customer conversations efficiently
- **Background Workers**: Process messages and webhooks asynchronously

---

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (Browser)                       │
│              Next.js App Router + React                     │
└────────────┬─────────────────────────────────┬───────────────┘
             │                                 │
             │ HTTP/WebSocket                  │
             │                                 │
┌────────────▼─────────────────────────────────▼───────────────┐
│                      Next.js Server                         │
│  ├─ API Routes (REST)                                       │
│  ├─ Socket.IO Server (WebSocket)                            │
│  └─ Server Components                                       │
└────────────┬─────────────────────────────────┬───────────────┘
             │                                 │
    ┌────────▼────────┐              ┌────────▼─────────┐
    │    MongoDB      │              │      Redis       │
    │  Multi-database │              │   Cache + Queue  │
    └─────────────────┘              └──────────────────┘
             │                                 │
    ┌────────▼─────────────────────────────────▼───────────┐
    │              BullMQ Workers                          │
    │   ├─ Message Outbound Worker                         │
    │   └─ Webhook Worker                                  │
    └──────────────────────────────────────────────────────┘
```

### Directory Structure

```
my-app/
├── docs/                      # Documentation
├── public/                    # Static assets
│   ├── images/               # Image files
│   ├── sounds/               # Audio notifications
│   └── webchat/              # Web chat widget
├── scripts/                   # Utility scripts
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── (superadmin)/    # Super Admin routes
│   │   ├── agent/           # Agent routes
│   │   ├── c/               # Company Admin routes
│   │   ├── api/             # API endpoints
│   │   └── auth/            # Authentication routes
│   ├── components/           # React components
│   │   ├── chat/            # Chat components
│   │   ├── forms/           # Form components
│   │   ├── layouts/         # Layout components
│   │   ├── modals/         # Modal components
│   │   └── ui/             # UI components
│   ├── config/              # Configuration files
│   ├── constants/           # Constants
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utility libraries
│   ├── middleware/          # Middleware
│   ├── models/              # Database models
│   ├── services/            # Business logic
│   ├── store/               # Zustand state management
│   ├── utils/               # Utilities
│   └── workers/             # Background workers
├── tests/                    # Test files
├── docker-compose.yml        # Docker configuration
├── Dockerfile               # Docker image
└── server.js                # Custom server
```

---

## Technology Stack

### Frontend
- **Next.js 15.5.4**: React framework with App Router
- **React 19.1.0**: UI library
- **Zustand**: State management
- **React Query (TanStack Query)**: Data fetching and caching
- **Tailwind CSS**: Styling
- **Radix UI**: Accessible component primitives
- **Framer Motion**: Animations
- **Socket.IO Client**: Real-time communication

### Backend
- **Next.js API Routes**: RESTful API
- **Socket.IO 4.8.1**: Real-time WebSocket server
- **MongoDB 8.19.0**: Primary database (Mongoose)
- **Redis 5.8.1**: Caching and queue management
- **BullMQ 5.60.0**: Job queue for background processing
- **JWT**: Authentication

### Communication Channels
- **WhatsApp**: Business API integration
- **Email**: IMAP/POP3 and SMTP
- **SMS**: SMS gateway integration
- **Web Chat**: Embedded widget

### Other Libraries
- **Express.js**: For custom server
- **Axios**: HTTP client
- **Bcrypt**: Password hashing
- **Multer**: File uploads
- **Nodemailer**: Email sending
- **React Hook Form**: Form handling
- **Zod**: Schema validation
- **date-fns**: Date manipulation

---

## Installation & Setup

### Prerequisites
- **Node.js**: v18 or higher
- **MongoDB**: v6 or higher
- **Redis**: v6 or higher
- **npm** or **yarn** or **pnpm**

### Step 1: Clone Repository
```bash
git clone <repository-url>
cd my-app
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Environment Variables
Create a `.env.local` file in the root directory:

```env
# Server Configuration
NODE_ENV=development
PORT=3000
HOSTNAME=localhost

# MongoDB Configuration
MONGODB_URI=mongodb://127.0.0.1:27017
DATABASE_NAME=omni_master

# Redis Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRY=7d

# Application Configuration
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000

# AWS S3 (Optional - for file storage)
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=your_bucket_name

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM=noreply@yourapp.com

# WhatsApp Business API (Optional)
WHATSAPP_APP_ID=your_app_id
WHATSAPP_APP_SECRET=your_app_secret
WHATSAPP_PHONE_NUMBER_ID=your_phone_id
WHATSAPP_VERIFY_TOKEN=your_verify_token

# Twilio SMS (Optional)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_number

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### Step 4: Start Services

#### Option A: Manual Start
```bash
# Start MongoDB (if not running as service)
mongod

# Start Redis (if not running as service)
redis-server

# Start the application
npm run dev
```

#### Option B: Docker (Recommended)
```bash
# Start all services with Docker
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Step 5: Access Application
- **Application**: http://localhost:3000
- **API**: http://localhost:3000/api
- **Socket.IO**: http://localhost:3000/socket.io

### Step 6: Run Setup Script (First Time)
```bash
node scripts/setup.js
```

This will:
- Create initial super admin user
- Set up database indexes
- Initialize default configurations

---

## Project Structure

### App Router Routes

```
app/
├── (superadmin)/          # Super Admin (Authentication required)
│   ├── companies/         # Manage companies
│   ├── dashboard/         # Super admin dashboard
│   ├── settings/          # System settings
│   └── layout.js          # Super admin layout
├── agent/                 # Agent interface
│   └── agent/             # Agent dashboard and tools
├── c/                     # Company Admin (Authentication required)
│   ├── analytics/         # Analytics dashboard
│   ├── channels/          # Channel management
│   ├── conversations/     # Conversation management
│   ├── departments/       # Department management
│   ├── settings/          # Company settings
│   ├── users/             # User management
│   └── layout.js          # Company admin layout
├── auth/                  # Authentication (Public)
│   ├── login/             # Login page
│   ├── forgot-password/   # Password reset request
│   └── reset-password/    # Password reset
├── api/                   # API Routes
│   ├── admin/             # Admin operations
│   ├── analytics/         # Analytics API
│   ├── auth/              # Authentication API
│   ├── channels/          # Channel API
│   ├── companies/         # Company API
│   ├── contacts/          # Contact API
│   ├── conversations/     # Conversation API
│   ├── departments/      # Department API
│   ├── messages/          # Message API
│   ├── users/             # User API
│   └── webhooks/          # Webhook API
└── setup/                 # Initial setup
```

### Key Components

#### Chat Components (`src/components/chat/`)
- `ChatWindow.jsx`: Main chat interface
- `MessageBubble.jsx`: Individual message display
- `MessageInput.jsx`: Message input field
- `ConversationList.jsx`: List of conversations
- `ContactPanel.jsx`: Contact information panel

#### UI Components (`src/components/ui/`)
- Built with Radix UI primitives
- Consistent design system
- Accessible components
- Includes: Button, Input, Dialog, Select, etc.

#### Forms (`src/components/forms/`)
- `LoginForm.jsx`: User login
- `ChannelConfigForm.jsx`: Channel configuration
- `UserForm.jsx`: User creation/editing
- `SettingsForm.jsx`: Settings management

---

## Key Features

### 1. Multi-Tenant Architecture

**Database Isolation**:
- Each company gets its own database (`tenant_<companyId>`)
- Master database stores company and super admin data
- Automatic tenant resolution from request context

**Code Implementation**:
```javascript
// Get tenant database
const db = await getTenantDB(companyId);
const User = db.model('User', UserSchema);
```

### 2. Authentication & Authorization

**JWT-based Authentication**:
- Access tokens for API requests
- Refresh token mechanism
- Token stored in httpOnly cookies

**Role Hierarchy**:
```
Super Admin → Company Admin → Agent
```

**Role Permissions**:
| Feature | Super Admin | Company Admin | Agent |
|---------|-------------|---------------|-------|
| Manage Companies | ✅ | ❌ | ❌ |
| Manage Users | ✅ | ✅ | ❌ |
| View Analytics | ✅ | ✅ | ✅ |
| Handle Conversations | ✅ | ✅ | ✅ |
| Manage Channels | ✅ | ✅ | ❌ |

### 3. Real-time Communication

**Socket.IO Events**:
- `join_room`: Join conversation room
- `leave_room`: Leave conversation room
- `send_message`: Send a message
- `typing_start`: User starts typing
- `typing_stop`: User stops typing
- `message_read`: Mark message as read
- `conversation_updated`: Conversation state changed
- `notification`: New notification

**Implementation**:
```javascript
// Client side
socket.emit('join_room', { conversationId });
socket.on('new_message', (message) => {
  // Update UI
});
```

### 4. Omnichannel Support

**Supported Channels**:
- **WhatsApp**: Business API integration
- **Email**: IMAP/POP3 for receiving, SMTP for sending
- **SMS**: Twilio integration
- **Web Chat**: Embedded widget
- **Facebook**: Messenger integration
- **Instagram**: Direct messages

**Channel Configuration**:
```javascript
{
  channel: 'whatsapp',
  credentials: {
    apiKey: 'xxx',
    phoneNumberId: 'xxx'
  },
  enabled: true
}
```

### 5. Background Workers

**Message Outbound Worker**:
- Processes outbound messages in queue
- Handles retries on failure
- Updates message status

**Webhook Worker**:
- Processes webhook events
- Updates conversation state
- Triggers notifications

**Starting Workers**:
```bash
# Development
npm run dev:workers

# Production
npm run workers
```

### 6. Analytics & Reporting

**Available Analytics**:
- Conversation volume
- Response time metrics
- Agent performance
- Channel distribution
- Customer satisfaction
- Peak hours analysis

**API Endpoints**:
- `GET /api/analytics/overview`
- `GET /api/analytics/conversations`
- `GET /api/analytics/agents`
- `GET /api/analytics/channels`

---

## Authentication & Authorization

### Middleware

**Authentication Middleware** (`src/middleware/auth.js`):
- Validates JWT tokens
- Extracts user information
- Sets user context for downstream handlers

**RBAC Middleware** (`src/middleware/rbac.js`):
- Checks user permissions
- Validates role-based access
- Protects routes based on roles

**Tenant Middleware** (`src/middleware/tenant.js`):
- Extracts company/tenant ID
- Sets tenant context
- Ensures tenant isolation

### Usage Example

```javascript
// API Route
export async function GET(request) {
  await authenticate(request);
  const user = request.user;
  
  // Check permissions
  if (!hasPermission(user, 'read_conversations')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  // Tenant isolation
  const tenantDb = await getTenantDB(user.companyId);
  const conversations = await Conversation.find({ companyId: user.companyId });
  
  return NextResponse.json(conversations);
}
```

---

## Database Schema

### Master Database Collections

**Companies**:
```javascript
{
  _id: ObjectId,
  name: String,
  slug: String,
  tenantDatabaseName: String,
  ownerId: ObjectId,
  settings: {
    timezone: String,
    language: String
  },
  subscription: {
    plan: String,
    status: String,
    limits: Object
  },
  status: String,
  createdAt: Date,
  updatedAt: Date
}
```

**Users**:
```javascript
{
  _id: ObjectId,
  email: String,
  password: String (hashed),
  role: String,
  companyId: ObjectId,
  departmentId: ObjectId,
  profile: {
    firstName: String,
    lastName: String,
    avatar: String
  },
  status: String,
  createdAt: Date
}
```

### Tenant Database Collections

**Conversations**:
```javascript
{
  _id: ObjectId,
  channel: String,
  contactId: ObjectId,
  assignedTo: ObjectId,
  status: String,
  lastMessageAt: Date,
  metadata: Object,
  createdAt: Date
}
```

**Messages**:
```javascript
{
  _id: ObjectId,
  conversationId: ObjectId,
  channel: String,
  type: String,
  content: String,
  direction: String,
  senderId: ObjectId,
  status: String,
  metadata: Object,
  createdAt: Date
}
```

**Contacts**:
```javascript
{
  _id: ObjectId,
  channel: String,
  channelId: String,
  name: String,
  email: String,
  phone: String,
  tags: Array,
  metadata: Object,
  createdAt: Date
}
```

---

## API Endpoints

### Authentication

```
POST   /api/auth/login              # Login
POST   /api/auth/register           # Register
POST   /api/auth/logout            # Logout
POST   /api/auth/refresh            # Refresh token
POST   /api/auth/forgot-password    # Request password reset
POST   /api/auth/reset-password     # Reset password
```

### Companies

```
GET    /api/companies               # List companies (Super Admin)
POST   /api/companies               # Create company
GET    /api/companies/:id           # Get company details
PUT    /api/companies/:id           # Update company
DELETE /api/companies/:id           # Delete company
```

### Conversations

```
GET    /api/conversations           # List conversations
POST   /api/conversations           # Create conversation
GET    /api/conversations/:id       # Get conversation
PUT    /api/conversations/:id       # Update conversation
DELETE /api/conversations/:id       # Delete conversation
POST   /api/conversations/:id/assign # Assign conversation
```

### Messages

```
GET    /api/messages                # List messages
POST   /api/messages                # Send message
GET    /api/messages/:id             # Get message
PUT    /api/messages/:id             # Update message
DELETE /api/messages/:id             # Delete message
```

### Channels

```
GET    /api/channels                 # List channels
POST   /api/channels                 # Create channel
GET    /api/channels/:id              # Get channel details
PUT    /api/channels/:id              # Update channel
DELETE /api/channels/:id              # Delete channel
POST   /api/channels/:id/connect     # Connect channel
POST   /api/channels/:id/disconnect  # Disconnect channel
```

### Users

```
GET    /api/users                    # List users
POST   /api/users                    # Create user
GET    /api/users/:id                # Get user
PUT    /api/users/:id                # Update user
DELETE /api/users/:id                # Delete user
```

### Analytics

```
GET    /api/analytics/overview       # Overview metrics
GET    /api/analytics/conversations  # Conversation analytics
GET    /api/analytics/agents         # Agent performance
GET    /api/analytics/channels       # Channel analytics
```

### Health Check

```
GET    /api/health                   # System health
GET    /api/health/redis             # Redis health
GET    /api/health/db                # Database health
```

---

## Real-time Features

### Socket.IO Client Setup

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});

socket.on('connect', () => {
  console.log('Connected to Socket.IO');
});

socket.on('new_message', (message) => {
  // Handle new message
});

socket.on('notification', (notification) => {
  // Handle notification
});
```

### Real-time Events

**Client → Server**:
- `join_room`: `{ conversationId }`
- `leave_room`: `{ conversationId }`
- `send_message`: `{ conversationId, content, type }`
- `typing_start`: `{ conversationId }`
- `typing_stop`: `{ conversationId }`
- `mark_read`: `{ messageId }`

**Server → Client**:
- `message_received`: `{ message }`
- `message_status`: `{ messageId, status }`
- `typing_indicator`: `{ user, isTyping }`
- `conversation_updated`: `{ conversation }`
- `notification`: `{ type, data }`

---

## Deployment

### Docker Deployment

**Build Image**:
```bash
docker build -t omni-ai-flow .
```

**Run Container**:
```bash
docker run -d \
  -p 3000:3000 \
  --env-file .env.production \
  omni-ai-flow
```

**Docker Compose**:
```bash
docker-compose up -d
```

### Environment-Specific Configuration

**Development** (`docker-compose.override.yml`):
- Hot reload enabled
- Debug logging
- Local MongoDB and Redis

**Production** (`docker-compose.prod.yml`):
- Optimized build
- Production environment
- External databases
- SSL/TLS enabled

### Environment Variables for Production

```env
NODE_ENV=production
PORT=3000

# MongoDB Atlas
MONGODB_URI=mongodb+srv://...

# Redis Cloud
REDIS_HOST=redis.xxxx.xxxx.cloud.redislabs.com
REDIS_PORT=xxxx
REDIS_PASSWORD=your_password

# JWT Secret (use strong secret in production)
JWT_SECRET=your_very_strong_secret_key

# Application URLs
NEXT_PUBLIC_API_URL=https://api.yourapp.com
NEXT_PUBLIC_SOCKET_URL=https://api.yourapp.com
```

### Production Checklist

- [ ] Environment variables configured
- [ ] MongoDB indexes created
- [ ] Redis persistence enabled
- [ ] SSL/TLS certificates installed
- [ ] Rate limiting configured
- [ ] Logging configured
- [ ] Monitoring setup
- [ ] Backup strategy in place
- [ ] Workers running
- [ ] Health checks passing

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017` |
| `DATABASE_NAME` | Master database name | `omni_master` |
| `REDIS_HOST` | Redis host | `127.0.0.1` |
| `REDIS_PORT` | Redis port | `6379` |
| `JWT_SECRET` | JWT signing secret | `your-secret-key` |
| `JWT_EXPIRY` | JWT expiration | `7d` |

### Optional Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `HOSTNAME` | Server hostname |
| `REDIS_PASSWORD` | Redis password |
| `AWS_ACCESS_KEY_ID` | AWS access key (for S3) |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `SMTP_HOST` | SMTP server |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |

---

## Development Guidelines

### Code Style

**ESLint Configuration**:
- Extended Next.js config
- React and TypeScript rules
- Consistent formatting

**File Naming**:
- Components: `PascalCase.jsx`
- Utilities: `camelCase.js`
- Constants: `SCREAMING_SNAKE_CASE.js`

### State Management

**Zustand Stores**:
- `useAuthStore`: Authentication state
- `useConversationStore`: Conversation data
- `useMessageStore`: Message data
- `useSocketStore`: Socket.IO state
- `useUIStore`: UI state

**Example**:
```javascript
import { useConversationStore } from '@/store/useConversationStore';

function MyComponent() {
  const { conversations, selectConversation } = useConversationStore();
  
  return (
    // Component JSX
  );
}
```

### API Calls

**Using React Query**:
```javascript
import { useQuery, useMutation } from '@tanstack/react-query';
import { getConversations, createConversation } from '@/lib/api/endpoints';

function ConversationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: getConversations
  });
  
  const mutation = useMutation({
    mutationFn: createConversation,
    onSuccess: () => {
      // Invalidate cache
    }
  });
  
  // Use data and mutation
}
```

### Error Handling

**API Error Handling**:
```javascript
try {
  const response = await fetch('/api/conversations');
  if (!response.ok) throw new Error('Failed to fetch');
  const data = await response.json();
} catch (error) {
  console.error('Error:', error);
  // Handle error
}
```

---

## Testing

### Unit Tests

**Location**: `tests/unit/`

**Example**:
```javascript
import { describe, it, expect } from 'vitest';
import { normalizePhoneNumber } from '@/utils/normalizers';

describe('normalizePhoneNumber', () => {
  it('should normalize phone number', () => {
    expect(normalizePhoneNumber('+1234567890')).toBe('1234567890');
  });
});
```

### Integration Tests

**Location**: `tests/integration/`

**Test API endpoints and database operations**:
```javascript
import { describe, it, expect } from 'vitest';

describe('POST /api/conversations', () => {
  it('should create a conversation', async () => {
    const response = await fetch('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({
        channel: 'whatsapp',
        contactId: '123'
      })
    });
    
    expect(response.status).toBe(201);
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

---

## Troubleshooting

### Common Issues

**1. MongoDB Connection Error**
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution**: Ensure MongoDB is running
```bash
# Check MongoDB status
sudo systemctl status mongod

# Start MongoDB
sudo systemctl start mongod
```

**2. Redis Connection Error**
```
Error: Redis client is not connected
```
**Solution**: Ensure Redis is running
```bash
# Check Redis status
redis-cli ping

# Start Redis
redis-server
```

**3. JWT Verification Failed**
```
Error: jwt malformed
```
**Solution**: Check JWT_SECRET in environment variables

**4. Socket.IO Not Connecting**
```
Socket.IO client not connecting
```
**Solution**: 
- Check Redis connection
- Verify Socket.IO URL
- Check authentication token

**5. Workers Not Processing Jobs**
```
Jobs stuck in queue
```
**Solution**: Ensure workers are running
```bash
npm run workers
```

### Logs

**View Application Logs**:
```bash
# Docker logs
docker-compose logs -f

# Direct logs
tail -f logs/app.log
```

**Debug Mode**:
```bash
DEBUG=* npm run dev
```

### Health Checks

**System Health**:
```bash
curl http://localhost:3000/api/health
```

**Redis Health**:
```bash
curl http://localhost:3000/api/health/redis
```

**Database Health**:
```bash
curl http://localhost:3000/api/health/db
```

---

## Additional Resources

### Documentation Files
- [API.md](API.md) - Detailed API documentation
- [ARCHITECTURE.md](ARCHITECTURE.md) - Architecture details
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide
- [SECURITY.md](SECURITY.md) - Security guidelines
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines

### External Links
- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Socket.IO Documentation](https://socket.io/docs)
- [MongoDB Documentation](https://docs.mongodb.com)
- [Redis Documentation](https://redis.io/docs)

---

## Support

For issues, questions, or contributions:
1. Check existing documentation
2. Search for similar issues
3. Create a new issue with detailed information
4. Contact the development team

---

**Documentation Version**: 1.0.0  
**Last Updated**: 2024  
**Project**: Omni Ai Flow - Omnichannel Communication Platform

