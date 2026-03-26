# API Documentation

Complete API reference for Omni Ai Flow.

## Base URL

- **Development**: `http://localhost:3000/api`
- **Production**: `https://api.yourapp.com/api`

## Authentication

All API requests (except auth endpoints) require authentication via JWT.

### Headers

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

### Obtaining Tokens

```bash
# Login
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password"
}

# Response
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": { ... }
}
```

---

## Authentication Endpoints

### POST /api/auth/login
Login and obtain access token.

**Request**:
```json
{
  "email": "user@example.com",
  "password": "password"
}
```

**Response** (200):
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "role": "agent",
    "companyId": "507f1f77bcf86cd799439012"
  }
}
```

**Errors**:
- 401: Invalid credentials
- 400: Missing email or password

---

### POST /api/auth/register
Register a new user.

**Request**:
```json
{
  "email": "user@example.com",
  "password": "password",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response** (201):
```json
{
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "role": "agent"
  }
}
```

---

### POST /api/auth/logout
Logout and invalidate token.

**Response** (200):
```json
{
  "message": "Logged out successfully"
}
```

---

### POST /api/auth/refresh
Refresh access token.

**Request**:
```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Response** (200):
```json
{
  "accessToken": "eyJhbGc..."
}
```

---

### POST /api/auth/forgot-password
Request password reset email.

**Request**:
```json
{
  "email": "user@example.com"
}
```

**Response** (200):
```json
{
  "message": "Password reset email sent"
}
```

---

### POST /api/auth/reset-password
Reset password with token.

**Request**:
```json
{
  "token": "reset-token",
  "password": "new-password"
}
```

**Response** (200):
```json
{
  "message": "Password reset successfully"
}
```

---

## Company Endpoints

### GET /api/companies
List all companies (Super Admin only).

**Query Parameters**:
- `page` (default: 1)
- `limit` (default: 20)
- `status` - Filter by status
- `search` - Search by name or slug

**Response** (200):
```json
{
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "status": "active",
      "subscription": {
        "plan": "professional",
        "status": "active"
      },
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

---

### POST /api/companies
Create a new company (Super Admin only).

**Request**:
```json
{
  "name": "Acme Corp",
  "email": "admin@acme.com",
  "subscription": {
    "plan": "professional",
    "limits": {
      "maxUsers": 50,
      "maxConversations": 5000
    }
  }
}
```

**Response** (201):
```json
{
  "company": {
    "_id": "507f1f77bcf86cd799439012",
    "name": "Acme Corp",
    "slug": "acme-corp"
  }
}
```

---

### GET /api/companies/:id
Get company details.

**Response** (200):
```json
{
  "_id": "507f1f77bcf86cd799439012",
  "name": "Acme Corp",
  "slug": "acme-corp",
  "settings": {
    "timezone": "UTC",
    "language": "en"
  },
  "subscription": {
    "plan": "professional",
    "status": "active"
  }
}
```

---

### PUT /api/companies/:id
Update company.

**Request**:
```json
{
  "name": "Acme Corp Updated",
  "settings": {
    "timezone": "America/New_York"
  }
}
```

**Response** (200):
```json
{
  "company": {
    "_id": "507f1f77bcf86cd799439012",
    "name": "Acme Corp Updated"
  }
}
```

---

### DELETE /api/companies/:id
Delete company (Super Admin only).

**Response** (200):
```json
{
  "message": "Company deleted successfully"
}
```

---

## Conversation Endpoints

### GET /api/conversations
List conversations.

**Query Parameters**:
- `status` - Filter by status
- `channel` - Filter by channel
- `assignedTo` - Filter by assigned user
- `page` - Page number
- `limit` - Items per page

**Response** (200):
```json
{
  "data": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "channel": "whatsapp",
      "contactId": "507f1f77bcf86cd799439014",
      "status": "open",
      "assignedTo": "507f1f77bcf86cd799439015",
      "lastMessageAt": "2024-01-01T00:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

---

### POST /api/conversations
Create a new conversation.

**Request**:
```json
{
  "channel": "whatsapp",
  "contactId": "507f1f77bcf86cd799439014",
  "initialMessage": "Hello!"
}
```

**Response** (201):
```json
{
  "conversation": {
    "_id": "507f1f77bcf86cd799439013",
    "channel": "whatsapp",
    "status": "open"
  }
}
```

---

### GET /api/conversations/:id
Get conversation details.

**Response** (200):
```json
{
  "_id": "507f1f77bcf86cd799439013",
  "channel": "whatsapp",
  "contactId": {
    "_id": "507f1f77bcf86cd799439014",
    "name": "John Doe",
    "phone": "+1234567890"
  },
  "status": "open",
  "assignedTo": {
    "_id": "507f1f77bcf86cd799439015",
    "name": "Agent Name"
  },
  "messages": [...],
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

---

### PUT /api/conversations/:id
Update conversation.

**Request**:
```json
{
  "status": "closed",
  "assignedTo": "507f1f77bcf86cd799439015"
}
```

**Response** (200):
```json
{
  "conversation": {
    "_id": "507f1f77bcf86cd799439013",
    "status": "closed"
  }
}
```

---

### POST /api/conversations/:id/assign
Assign conversation to agent.

**Request**:
```json
{
  "agentId": "507f1f77bcf86cd799439015"
}
```

**Response** (200):
```json
{
  "message": "Conversation assigned successfully"
}
```

---

### DELETE /api/conversations/:id
Delete conversation.

**Response** (200):
```json
{
  "message": "Conversation deleted successfully"
}
```

---

## Message Endpoints

### GET /api/messages
List messages.

**Query Parameters**:
- `conversationId` - Filter by conversation
- `limit` - Items per page
- `before` - Pagination cursor

**Response** (200):
```json
{
  "data": [
    {
      "_id": "507f1f77bcf86cd799439016",
      "conversationId": "507f1f77bcf86cd799439013",
      "type": "text",
      "content": "Hello!",
      "direction": "inbound",
      "status": "delivered",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### POST /api/messages
Send a message.

**Request**:
```json
{
  "conversationId": "507f1f77bcf86cd799439013",
  "type": "text",
  "content": "Hello! How can I help you?"
}
```

**Response** (201):
```json
{
  "message": {
    "_id": "507f1f77bcf86cd799439016",
    "conversationId": "507f1f77bcf86cd799439013",
    "content": "Hello! How can I help you?",
    "status": "queued"
  }
}
```

---

### PUT /api/messages/:id
Update message.

**Request**:
```json
{
  "status": "delivered"
}
```

**Response** (200):
```json
{
  "message": {
    "_id": "507f1f77bcf86cd799439016",
    "status": "delivered"
  }
}
```

---

## Channel Endpoints

### GET /api/channels
List channels.

**Response** (200):
```json
{
  "data": [
    {
      "_id": "507f1f77bcf86cd799439017",
      "channel": "whatsapp",
      "name": "WhatsApp Business",
      "enabled": true,
      "connected": true,
      "connectedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### POST /api/channels
Create/configure a channel.

**Request**:
```json
{
  "channel": "whatsapp",
  "name": "WhatsApp Business",
  "credentials": {
    "apiKey": "xxx",
    "phoneNumberId": "xxx"
  },
  "enabled": true
}
```

**Response** (201):
```json
{
  "channel": {
    "_id": "507f1f77bcf86cd799439017",
    "channel": "whatsapp",
    "name": "WhatsApp Business",
    "enabled": true
  }
}
```

---

### POST /api/channels/:id/connect
Connect channel.

**Response** (200):
```json
{
  "message": "Channel connected successfully",
  "status": "connected"
}
```

---

### POST /api/channels/:id/disconnect
Disconnect channel.

**Response** (200):
```json
{
  "message": "Channel disconnected successfully"
}
```

---

## User Endpoints

### GET /api/users
List users.

**Query Parameters**:
- `role` - Filter by role
- `department` - Filter by department
- `status` - Filter by status

**Response** (200):
```json
{
  "data": [
    {
      "_id": "507f1f77bcf86cd799439015",
      "email": "agent@example.com",
      "role": "agent",
      "profile": {
        "firstName": "John",
        "lastName": "Doe"
      },
      "status": "active",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### POST /api/users
Create user.

**Request**:
```json
{
  "email": "agent@example.com",
  "password": "password",
  "role": "agent",
  "profile": {
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

**Response** (201):
```json
{
  "user": {
    "_id": "507f1f77bcf86cd799439015",
    "email": "agent@example.com",
    "role": "agent"
  }
}
```

---

## Analytics Endpoints

### GET /api/analytics/overview
Get overview analytics.

**Query Parameters**:
- `startDate` - Start date (ISO format)
- `endDate` - End date (ISO format)

**Response** (200):
```json
{
  "conversations": {
    "total": 1000,
    "open": 50,
    "closed": 950
  },
  "messages": {
    "total": 5000,
    "inbound": 3000,
    "outbound": 2000
  },
  "responseTime": {
    "average": 2.5,
    "median": 2.0
  }
}
```

---

### GET /api/analytics/agents
Get agent performance analytics.

**Response** (200):
```json
{
  "data": [
    {
      "agentId": "507f1f77bcf86cd799439015",
      "agentName": "John Doe",
      "conversationsHandled": 100,
      "averageResponseTime": 2.5,
      "satisfaction": 4.5
    }
  ]
}
```

---

## Webhook Endpoints

### POST /api/webhooks/whatsapp
WhatsApp webhook.

**Headers**:
```
X-Hub-Signature-256: sha256=...
```

**Request**: (varies by channel)

**Response** (200):
```json
{
  "success": true
}
```

---

## Health Check Endpoints

### GET /api/health
System health check.

**Response** (200):
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": {
    "database": "up",
    "redis": "up",
    "socket": "up"
  }
}
```

---

### GET /api/health/redis
Redis health check.

**Response** (200):
```json
{
  "status": "healthy",
  "latency": 5,
  "memory": {
    "used": "100MB",
    "max": "512MB"
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `422` - Validation Error
- `500` - Internal Server Error

### Common Error Codes

- `INVALID_CREDENTIALS` - Invalid login credentials
- `UNAUTHORIZED` - Missing or invalid token
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid input data
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `INTERNAL_ERROR` - Server error

---

## Rate Limiting

Rate limits are applied to protect the API:

- Authentication endpoints: 5 requests per minute
- Other endpoints: 100 requests per minute per IP

Headers returned on rate-limited requests:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1234567890
Retry-After: 60
```

---

## Pagination

List endpoints support pagination:

**Query Parameters**:
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)

**Response**:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

---

## Filtering and Sorting

Most list endpoints support filtering and sorting:

**Query Parameters**:
- `filter[field]` - Filter by field value
- `sort` - Sort field (format: `field:asc` or `field:desc`)
- `search` - Full-text search

**Example**:
```
GET /api/conversations?filter[status]=open&sort=createdAt:desc&search=urgent
```

---

## File Uploads

Upload files via multipart form data:

```bash
POST /api/upload
Content-Type: multipart/form-data

file: <binary>
type: image
```

**Response**:
```json
{
  "url": "https://cdn.example.com/file.jpg",
  "filename": "file.jpg",
  "size": 1024
}
```

---

## WebSocket Events

Real-time updates via Socket.IO:

### Client → Server

**Join Room**:
```javascript
socket.emit('join_room', { conversationId: '...' });
```

**Send Message**:
```javascript
socket.emit('send_message', {
  conversationId: '...',
  content: 'Hello',
  type: 'text'
});
```

### Server → Client

**New Message**:
```javascript
socket.on('new_message', (message) => {
  // Handle new message
});
```

**Typing Indicator**:
```javascript
socket.on('typing_indicator', (data) => {
  // Handle typing status
});
```

---

## SDK and Examples

### JavaScript/Node.js

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Get conversations
const conversations = await api.get('/conversations');

// Send message
const message = await api.post('/messages', {
  conversationId: '...',
  content: 'Hello'
});
```

### cURL

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Get conversations
curl -X GET http://localhost:3000/api/conversations \
  -H "Authorization: Bearer TOKEN"
```

---

For more details, see the [main documentation](PROJECT_DOCUMENTATION.md).

