# Call Center Technical Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Backend APIs](#backend-apis)
   - [User Management APIs](#user-management-apis)
   - [User Status APIs](#user-status-apis)
   - [Call Groups APIs](#call-groups-apis)
   - [Call Status Tabs APIs](#call-status-tabs-apis)
   - [Call Logs APIs](#call-logs-apis)
   - [PBX Service Integration](#pbx-service-integration)
   - [Sentiment Analysis APIs](#sentiment-analysis-apis)
4. [Frontend Implementation](#frontend-implementation)
   - [SIP.js Integration](#sipjs-integration)
   - [useCallCenter Hook](#usecallcenter-hook)
   - [Call Operations](#call-operations)
   - [State Management](#state-management)
5. [Features and Functionality](#features-and-functionality)
   - [Call Management](#call-management)
   - [Call Transfer](#call-transfer)
   - [Hold/Unhold](#holdunhold)
   - [Mute/Unmute](#muteunmute)
   - [Status Management](#status-management)
   - [Call Logs and Sentiment Analysis](#call-logs-and-sentiment-analysis)
6. [Data Flow](#data-flow)
7. [Configuration](#configuration)

---

## Overview

The Call Center system is a comprehensive VoIP solution built with Next.js, SIP.js for WebRTC, and MongoDB for data persistence. It provides real-time call management, agent status tracking, call routing through groups, sentiment analysis, and comprehensive call logging.

### Key Technologies
- **Frontend**: Next.js (React), SIP.js, Zustand (State Management)
- **Backend**: Next.js API Routes, MongoDB (Multi-tenant)
- **VoIP**: SIP.js WebRTC Client
- **Real-time**: WebSocket connections for SIP signaling
- **Audio**: WebRTC MediaStream API

---

## Architecture

### High-Level Architecture

```
┌─────────────────┐
│   Web Browser   │
│  (React/Next.js)│
└────────┬────────┘
         │
         │ SIP.js WebSocket
         │ WebRTC Media
         ▼
┌─────────────────┐
│   PBX Server    │
│  (Asterisk/VoIP)│
└────────┬────────┘
         │
         │ CDR Webhooks
         │ Status Updates
         ▼
┌─────────────────┐
│  Next.js API    │
│   (Backend)     │
└────────┬────────┘
         │
         ├──► MongoDB (Tenant DB)
         ├──► MongoDB (Master DB)
         ├──► Sentiment Analysis API
         └──► S3 (Recordings)
```

### Component Structure

- **Frontend Hook**: `src/hooks/useCallCenter.js` - Main call center logic
- **State Store**: `src/store/useCallCenterStore.js` - Zustand state management
- **Backend APIs**: `src/app/api/` - REST API endpoints
- **Services**: `src/services/` - Business logic layer
- **Models**: `src/models/schemas/` - Database schemas

---

## Backend APIs

### User Management APIs

#### Create User
**Endpoint**: `POST /api/users`

Create a new user (agent) with optional call center extension.

**Authorization**: Requires `company_admin` or `super_admin` role

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "departments": ["deptId1", "deptId2"],
  "permissions": {},
  "preferences": {
    "theme": "system",
    "language": "en",
    "notifications": {
      "email": true,
      "desktop": true,
      "sound": true
    }
  },
  "callCenter": {
    "call_center": "on",
    "inbound_calls": "yes",
    "outbound_calls": "yes",
    "recording_downloads": "yes",
    "waiting_in_line": "5",
    "playback_during_paused": "yes",
    "playback": "yes"
  },
  "chat": {
    "chat_feature": "on"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "_id": "userId",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "agent",
    "companyId": "companyId",
    "departments": [...],
    "callCenter": {
      "call_center": "on",
      "call_status": "available",
      ...
    },
    "pbxExtension": {
      "_id": "...",
      "extension_hash": "hash",
      "internal_extension": 1234,
      "sip_username": "...",
      ...
    }
  },
  "statistics": {
    "total": 10,
    "active": 9,
    "inactive": 1
  }
}
```

**User Creation Flow**:

1. **Validation**:
   - Validates required fields (email, password, firstName, lastName)
   - Validates at least one department is selected
   - Checks if user already exists
   - Verifies departments exist

2. **Database Transaction** (if MongoDB supports transactions):
   - Starts MongoDB transaction session
   - All operations are atomic (rollback on failure)

3. **User Creation**:
   - Creates user in Master DB with hashed password
   - Sets role to `agent` (fixed)
   - Stores user preferences and settings
   - Links user to departments

4. **PBX Extension Creation** (if `call_center.call_center === 'on'`):
   - Generates SIP credentials (username/password) from email/password
   - Calculates internal extension number
   - Calls PBX API to create extension
   - Saves extension to Tenant DB
   - If PBX creation fails, transaction is rolled back

5. **Status History**:
   - Creates initial status history records for call/chat status

6. **Department Update**:
   - Adds user to selected departments

7. **Transaction Commit**:
   - Commits transaction if all operations succeed
   - Rolls back on any error

**PBX Extension Creation Details**:
- **SIP Credentials**: Generated from email and password
- **Internal Extension**: Calculated as `100 + (userId last 6 hex digits) % 10000`
- **Extension Plan**: Fixed to "Hodinovy Manzel"
- **Settings Synced**: Inbound/outbound calls, recording, waiting in line, playback settings

**Error Handling**:
- Transaction rollback on any failure
- Manual cleanup if transaction rollback fails
- PBX errors trigger transaction rollback
- Detailed error messages returned

---

#### Update User
**Endpoint**: `PUT /api/users/[userId]`

Update an existing user.

**Authorization**: Requires `company_admin`, `super_admin`, or user updating their own profile

**Request Body**: Same structure as Create User (all fields optional)

**Behavior**:
- Updates user fields
- Updates departments (adds/removes user from departments)
- Handles PBX extension updates if call center settings change
- Creates new PBX extension if call center enabled but extension doesn't exist
- Updates PBX extension settings if call center settings changed

---

#### Get User
**Endpoint**: `GET /api/users/[userId]`

Retrieve a specific user by ID.

**Response**: User object with departments and PBX extension

---

#### Get All Users
**Endpoint**: `GET /api/users`

Retrieve all users with filtering and pagination.

**Query Parameters**:
- `page`: Page number
- `limit`: Items per page
- `search`: Search query
- `role`: Filter by role
- `status`: Filter by status
- `departmentId`: Filter by department

**Response**: Paginated list of users

---

### User Status APIs

#### Update User Status
**Endpoint**: `PUT /api/users/[userId]/status`

Update the call or chat status for a user.

**Request Body**:
```json
{
  "status": "available" | "outbound" | "occupied" | "notavailable" | "offline",
  "type": "call" | "chat"
}
```

**Valid Statuses**:
- **Call Statuses**: `available`, `outbound`, `occupied`, `notavailable`, `offline`
- **Chat Statuses**: `available`, `occupied`, `notavailable`, `viewonly`, `offline`

**Response**:
```json
{
  "success": true,
  "message": "Status updated successfully",
  "data": {
    "userId": "...",
    "call_status": "available",
    "chat_status": "available"
  }
}
```

**Behavior**:
- Updates user status in Master DB
- Creates status history record in Tenant DB
- Updates PBX extension settings if status affects incoming calls
- Emits socket events for real-time updates
- For `available` status: Sets PBX `inbound_calls` to "yes"
- For `outbound` status: Sets PBX `inbound_calls` to "no"

**Authorization**: Users can only update their own status (unless admin)

---

#### Get Users with Call Feature
**Endpoint**: `GET /api/users/with-call-feature`

Get all users with call center enabled.

**Query Parameters**:
- `status` (optional): Filter by call status
- `departmentIds` (optional): Comma-separated department IDs

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "callCenter": {
        "call_center": "on",
        "call_status": "available"
      },
      "departments": [...],
      "pbxExtension": {...}
    }
  ]
}
```

---

### Call Groups APIs

#### Get All Call Groups
**Endpoint**: `GET /api/call-groups`

Retrieve all call groups for the company.

**Query Parameters**:
- `departmentIds` (optional): Comma-separated department IDs to filter
- `search` (optional): Search query for group names

**Response**:
```json
{
  "success": true,
  "message": "Call Groups retrieved successfully",
  "data": [
    {
      "_id": "...",
      "groupName": "Sales Team",
      "assignedUsers": ["userId1", "userId2"],
      "incomingRoutingStrategy": "round-robin",
      "timeToRingOperator": 30,
      "allowCallsWaitingInLine": true,
      "musicOnHold": true,
      "incomingCallsWaitingOptions": "queue",
      "redirectToOccupiedOperators": false,
      "outboundPhoneNumbers": ["+1234567890"],
      "primaryOutboundNumber": "+1234567890",
      "exceptionOutboundNumbers": [],
      "departmentIds": ["deptId1"]
    }
  ]
}
```

---

#### Create Call Group
**Endpoint**: `POST /api/call-groups`

Create a new call group.

**Request Body**:
```json
{
  "groupName": "Support Team",
  "assignedUsers": ["userId1", "userId2"],
  "incomingRoutingStrategy": "round-robin" | "ring-all" | "least-recent" | "random" | "rr-memory",
  "timeToRingOperator": 30,
  "allowCallsWaitingInLine": true,
  "musicOnHold": true,
  "incomingCallsWaitingOptions": "queue" | "hold",
  "redirectToOccupiedOperators": false,
  "outboundPhoneNumbers": ["+1234567890"],
  "primaryOutboundNumber": "+1234567890",
  "exceptionOutboundNumbers": ["userId3"],
  "musicFileId": "audioFileId",
  "musicFileUrl": "https://example.com/music.mp3",
  "departments": ["deptId1"]
}
```

**Response**:
```json
{
  "success": true,
  "message": "Call Group created successfully",
  "data": {
    "_id": "...",
    "groupName": "Support Team",
    ...
  }
}
```

**Behavior**:
- Creates call group in Tenant DB
- Creates corresponding group in PBX system
- Links users to the group
- Validates assigned users are agents

---

#### Get Call Group by ID
**Endpoint**: `GET /api/call-groups/[groupId]`

Retrieve a specific call group by ID.

**Response**: Same structure as Get All Call Groups (single object)

---

#### Update Call Group
**Endpoint**: `PUT /api/call-groups/[groupId]`

Update an existing call group.

**Request Body**: Same structure as Create Call Group (all fields optional)

**Response**: Updated call group object

**Behavior**:
- Updates call group in Tenant DB
- Updates corresponding group in PBX system
- Validates assigned users are agents

---

#### Delete Call Group
**Endpoint**: `DELETE /api/call-groups/[groupId]`

Delete a call group.

**Response**:
```json
{
  "success": true,
  "message": "Call Group deleted successfully",
  "pbxResponse": {...}
}
```

**Behavior**:
- Deletes call group from Tenant DB
- Deletes corresponding group from PBX system
- Removes user-group associations

---

#### Get Call Groups for User
**Endpoint**: `GET /api/call-groups/user`

Get all call groups that a user belongs to.

**Response**: Array of call group objects

---

### Call Status Tabs APIs

#### Get Call Status Records
**Endpoint**: `GET /api/call-status-tabs`

Retrieve call status records with pagination and filtering.

**Query Parameters**:
- `page` (default: 1): Page number
- `limit` (default: 10): Items per page
- `sortBy` (default: "time"): Sort field
- `sortOrder` (default: "DESC"): Sort direction
- `status`: Filter by status
- `direction`: Filter by direction (incoming/outgoing)
- `phoneNumber`: Filter by phone number
- `search`: Search query
- `userId`: Filter by user ID (admins only)

**Response**:
```json
{
  "success": true,
  "data": {
    "callStatusRecords": [
      {
        "_id": "...",
        "userId": "...",
        "phoneNumber": "+1234567890",
        "status": "answered",
        "direction": "incoming",
        "time": "2024-01-15T10:30:00Z",
        "duration": 120
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 100,
      "totalPages": 10
    }
  }
}
```

**Authorization**: Agents can only see their own records

---

#### Create Call Status Record
**Endpoint**: `POST /api/call-status-tabs`

Create a new call status record.

**Request Body**:
```json
{
  "phoneNumber": "+1234567890",
  "status": "answered",
  "direction": "incoming",
  "time": "2024-01-15T10:30:00Z",
  "duration": 120,
  "userId": "..." // Optional, auto-set for agents
}
```

**Response**: Created call status record object

---

#### Get Call Status Record by ID
**Endpoint**: `GET /api/call-status-tabs/[statusId]`

Retrieve a specific call status record.

**Response**: Call status record object

---

#### Update Call Status Record
**Endpoint**: `PUT /api/call-status-tabs/[statusId]`

Update a call status record.

**Request Body**: Same structure as Create (all fields optional)

**Response**: Updated call status record

---

#### Delete Call Status Record
**Endpoint**: `DELETE /api/call-status-tabs/[statusId]`

Delete a call status record.

**Response**: Success message

---

### Call Logs APIs

#### Get Call Logs with Sentiment Analysis
**Endpoint**: `GET /api/call-logs/sentiment`

Retrieve call logs with sentiment analysis data.

**Query Parameters**:
- `page`: Page number
- `limit`: Items per page
- `operator_id`: Comma-separated operator IDs
- `caller_number`: Comma-separated caller numbers
- `reciever_number`: Comma-separated receiver numbers
- `group_id`: Group ID
- `start_date`: Start date (ISO string)
- `end_date`: End date (ISO string)
- `operator_name`: Comma-separated operator names
- `query`: Search query
- `filter`: Call direction filter (incoming/outgoing/allcalls)
- `country`: Country filter (CZ/SK/All)
- `time_period`: Time period in days (1, 3, 7, 30)
- `calllogId`: Specific call log ID

**Response**:
```json
{
  "success": true,
  "message": "Call logs with sentiment analysis retrieved successfully",
  "data": [...], // Array of call logs
  "agents": [...], // Agent statistics
  "stats": {
    "totalCalls": 100,
    "totalLengthOfCalls": 3600,
    "averageLengthOfCalls": 36,
    "maxLengthOfCalls": 120,
    "inboundCalls": 60,
    "outboundCalls": 40,
    "shortOutboundCalls": 5,
    "answeredInboundCalls": 55,
    "missedInboundCalls": 5,
    "resolvedMissedCalls": 3,
    "unresolvedMissedCalls": 2,
    "avgAnswerTime": 5,
    "maxAnswerTime": 15,
    "outboundCallAttempts": 40,
    "outboundCallsAnswered": 35,
    "avgWaitingTime": 5,
    "maxWaitingTime": 15
  },
  "operatorStats": [...],
  "groupStats": [...],
  "pagination": {...}
}
```

**Behavior**:
- If `calllogId` is provided, returns that specific log with complete details
- If no `operator_id`, returns stats and agents (no call logs)
- Filters by date range, country, direction, operators, etc.
- Calculates comprehensive statistics
- Includes sentiment analysis data if available

---

#### Create or Update Call Log
**Endpoint**: `POST /api/call-logs/create-log`

Create or update a call log. This endpoint is called by both the PBX (Marian) and the Voice Bot (Michal).

**Authentication**: API Key authentication (`X-API-Key` header must match `X_API_KEY_CREATE_LOG`)

Create or update a call log.

**Request Body**:
```json
{
  "type": "human" | "voicebot",
  "callId": "call-12345",
  "userId": "userId",
  "transcript": "Call transcript text",
  "summary": "Call summary",
  "cdrData": {
    "call_id": "call-12345",
    "sourcenum": "+1234567890",
    "destinationnum": "+0987654321",
    "direction": "in",
    "disposition": "ANSWERED",
    "duration": 120,
    "calldate": "2024-01-15T10:30:00Z",
    "operator_id": "userId",
    "group_id": "groupId",
    "mfile": "/var/spool/asterisk/recording.mp3"
  }
}
```

**Response**: Call log object

**Behavior**:
- If type is `human`: Processes recording, creates/updates call log, calls sentiment analysis API
- If type is `voicebot`: Updates existing call log with transcript/summary
- Downloads recording from PBX if `mfile` exists
- Uploads recording to S3
- Creates/updates conversation
- Triggers sentiment analysis for new calls

---

### PBX Service Integration

The PBX Service (`src/services/pbx/PbxService.js`) is responsible for synchronizing data between the application database and the external PBX (Marian) system.

#### PBX Service Overview

**Location**: `src/services/pbx/PbxService.js`

**Purpose**: Manage extensions, groups, routing, and audio files on the PBX system

**Authentication**: Uses Basic Authentication with credentials from environment variables

**Configuration**:
```javascript
const apiUrl = process.env.PBX_API_URL;
const username = process.env.PBX_API_USERNAME;
const password = process.env.PBX_API_PASSWORD;
```

#### PBX Extension Services

##### Create Extension
**Function**: `createExtension(userData, skipDBSave = false)`

**Flow**:
1. Builds payload with extension settings
2. Sends POST request to PBX API: `/extensions`
3. If `skipDBSave === false`: Saves extension data to Master DB
4. Returns PBX response with hash and extension details

**Payload Structure**:
```javascript
{
  name: "User Full Name",
  username: "sip_username",
  password: "sip_password",
  user_id: "userId",
  extensionplan: "Hodinovy Manzel",
  outroute: "OUT",
  internal_extension: 1234,
  codecspriority: "8",
  nat: 1,
  webrtc: 1,
  max_contacts: 5,
  outgoing_calls: "allowed" | "disallowed",
  inbound_calls: "yes" | "no",
  monitor_enable: "both" | "off",
  limit_outgoing_calls: "5" | null,
  limit_incoming_calls: "5" | null,
  waiting_in_line: "5" | null,
  playback_during_paused: "yes" | null,
  playback: "yes" | null
}
```

**Sync Behavior**:
- When creating user: `skipDBSave = true` (saved to Tenant DB in transaction)
- Extension data is saved to Master DB (if not skipped) AND Tenant DB (during user creation)
- PBX hash is stored for future updates

##### Update Extension
**Function**: `updateExtension(hash, updates, options = {})`

**Flow**:
1. Builds update payload
2. Sends PUT request to PBX API: `/extensions/{hash}`
3. Updates extension in Master DB
4. Optionally updates in Tenant DB (if `options.db` provided)

**Sync Behavior**:
- Updates PBX extension settings
- Updates Master DB extension record
- Optionally updates Tenant DB (for status changes)
- Both databases stay in sync

##### Delete Extension
**Function**: `deleteExtension(hash)`

**Flow**:
1. Sends DELETE request to PBX API: `/extensions/{hash}`
2. Deletes extension from Master DB
3. Extension should also be deleted from Tenant DB (handled by user deletion)

##### Get Extension
**Function**: `getExtension(hash)`

**Flow**:
1. Sends GET request to PBX API: `/extensions/{hash}`
2. Fetches extension from Master DB
3. Returns combined data

#### PBX Group Services

##### Create Group
**Function**: `createGroup(groupData)`

**Flow**:
1. Formats group data (arrays to comma-separated strings, boolean formatting)
2. Sends POST request to PBX API: `/groups`
3. Returns PBX response

**Data Formatting**:
- Arrays (assigned_operators, outbound_phone_numbers) → comma-separated strings
- Booleans → formatted as true/false
- Empty values → handled gracefully

##### Update Group
**Function**: `updateGroup(hash, updates)`

**Flow**:
1. Formats update data
2. Sends PUT request to PBX API: `/groups/{hash}`
3. Returns PBX response

##### Delete Group
**Function**: `deleteGroup(hash)`

**Flow**:
1. Sends DELETE request to PBX API: `/groups/{hash}`
2. Returns PBX response

#### PBX Data Synchronization

**Sync Strategy**:
- **Create Operations**: Data sent to PBX first, then saved to database
- **Update Operations**: Data sent to PBX, then database updated
- **Delete Operations**: PBX deletion first, then database cleanup
- **Read Operations**: Can fetch from PBX and/or database

**Transaction Handling**:
- User creation uses MongoDB transactions
- PBX operations within transactions can trigger rollback on failure
- `skipDBSave` flag allows transaction-aware DB operations

**Error Handling**:
- PBX API errors are caught and rethrown
- Transaction rollback triggered on PBX errors
- Detailed error messages for debugging

**Database Structure**:
- **Master DB**: Stores PbxExtension records (global)
- **Tenant DB**: Stores PbxExtension records (per-tenant)
- Both are kept in sync during create/update operations

---

### Call Log Creation Flow (Complete Lifecycle)

This section provides a detailed explanation of the complete call log creation and update flow involving multiple systems.

#### Overview

The complete flow involves:
1. **Marian (PBX)** → Calls our API with CDR data (`type: "human"`)
2. **Our System** → Processes CDR, creates call log, calls Voice Bot API
3. **Voice Bot (Michal)** → Processes recording, calls our API with transcript/summary (`type: "voicebot"`)
4. **Our System** → Updates call log, emits real-time events

#### Step 1: PBX (Marian) Calls Our API

**Trigger**: When a call ends, the PBX system (Marian) sends a webhook/CDR notification

**Endpoint**: `POST /api/call-logs/create-log`

**Authentication**: API key (`X-API-Key` header)

**Request from PBX**:
```json
{
  "type": "human",
  "callId": "call-12345",
  "userId": "companyId",
  "cdrData": {
    "call_id": "call-12345",
    "sourcenum": "+1234567890",
    "destinationnum": "+0987654321",
    "direction": "in",
    "disposition": "ANSWERED",
    "duration": 120,
    "calldate": "2024-01-15T10:30:00Z",
    "operator_id": "operatorUserId",
    "group_id": "groupId",
    "mfile": "/var/spool/asterisk/recording-12345.mp3"
  }
}
```

**API Processing**:
1. **API Key Validation**: Verifies `X-API-Key` header
2. **User/Company Resolution**: Resolves operator and company from `cdrData.operator_id` or `userId`
3. **Service Call**: Calls `callLogService.createAndUpdateCallLog()` with `type: "human"`

**Service Processing** (`callLogService.createAndUpdateCallLog` with `type: "human"`):
1. **Recording Processing**: Downloads recording from PBX, uploads to S3
2. **Conversation Handling**: Finds/creates conversation for phone number
3. **Call Log Creation**: Creates CallLog document in Tenant DB
4. **Voice Bot API Call**: Calls Voice Bot API with recording file path and callback URL
5. **Socket Emission**: Emits real-time events to update UI

**Response**:
```json
{
  "success": true,
  "message": "Call Log created successfully",
  "data": {
    "_id": "callLogId",
    "cdrId": "call-12345",
    "type": "human",
    "recordingLink": "https://s3.../recording.mp3",
    ...
  }
}
```

#### Step 2: Voice Bot (Michal) Processes Recording

**Process** (External System - Voice Bot):
1. Voice Bot receives recording file path from our API call
2. Downloads and processes audio with speech-to-text
3. Generates transcript and summary
4. Calls our callback endpoint with results

#### Step 3: Voice Bot Calls Our API Again

**Trigger**: Voice Bot (Michal) completes processing and calls our callback

**Endpoint**: `POST /api/call-logs/create-log` (same endpoint)

**Authentication**: API key (`X-API-Key` header)

**Request from Voice Bot**:
```json
{
  "type": "voicebot",
  "callId": "call-12345",
  "userId": "operatorUserId",
  "transcript": "Hello, how can I help you today? ...",
  "summary": "Customer called to inquire about product pricing. Agent provided detailed information. Customer satisfied.",
  "cdrData": {
    "call_id": "call-12345"
  }
}
```

**API Processing**:
1. **API Key Validation**: Same authentication
2. **User/Company Resolution**: Resolves from `userId` or `cdrData.operator_id`
3. **Service Call**: Calls `callLogService.createAndUpdateCallLog()` with `type: "voicebot"`

**Service Processing** (`callLogService.createAndUpdateCallLog` with `type: "voicebot"`):
1. **Finds Existing Call Log**: Uses `cdrId` to find call log created in Step 1
2. **Updates Call Log**: Updates `transcript` and `summary` fields
3. **Socket Emission**: Emits updated message and conversation update events

**Response**:
```json
{
  "success": true,
  "message": "Call Log updated successfully",
  "data": {
    "_id": "callLogId",
    "cdrId": "call-12345",
    "transcript": "Hello, how can I help you today? ...",
    "summary": "Customer called to inquire about product pricing...",
    ...
  }
}
```

#### Complete Flow Diagram

```
┌─────────────┐
│   PBX       │
│  (Marian)   │
└──────┬──────┘
       │
       │ 1. Call Ends → POST /api/call-logs/create-log
       │    { type: "human", cdrData: {...} }
       ▼
┌──────────────────────┐
│   Our API            │
│  (create-log route)  │
└──────┬───────────────┘
       │
       │ 2. Process CDR
       │    - Download recording
       │    - Upload to S3
       │    - Create call log (type: "human")
       │    - Create/find conversation
       ▼
┌──────────────────────┐
│  CallLogService      │
└──────┬───────────────┘
       │
       │ 3. Call Voice Bot API
       │    POST ${API_URL_CALLLOG}
       │    { callId, userId, mfile, endpoint }
       ▼
┌──────────────────────┐
│  Voice Bot API       │
│    (Michal)          │
└──────┬───────────────┘
       │
       │ 4. Process Recording
       │    - Speech-to-text
       │    - Generate transcript
       │    - Generate summary
       │
       │ 5. Callback → POST /api/call-logs/create-log
       │    { type: "voicebot", transcript, summary }
       ▼
┌──────────────────────┐
│   Our API            │
│  (create-log route)  │
└──────┬───────────────┘
       │
       │ 6. Update Call Log
       │    - Update transcript
       │    - Update summary
       │    - Emit socket events
       ▼
┌──────────────────────┐
│  React Frontend      │
│  (Real-time Update)  │
└──────────────────────┘
```

#### Real-Time Socket Emission

Both steps emit socket events for real-time UI updates:

**Step 1 Emission** (Initial Call Log):
- Event: `newMessage` to conversation room
- Event: `conversationUpdate` 
- UI shows call log immediately (without transcript)

**Step 2 Emission** (Updated Call Log):
- Event: `newMessage` with transcript/summary
- Event: `conversationUpdate`
- UI updates with transcript and summary

**Socket Rooms**:
- Conversation: `conversation:${conversationId}`
- Tenant: `tenant:${companyId}`
- Department: `department:${departmentId}` (if applicable)

#### Error Handling

**Step 1 Errors**:
- Recording download failure: Continues without recording
- S3 upload failure: Logs error, continues
- Voice Bot API failure: Logs error, doesn't block call log creation

**Step 2 Errors**:
- Call log not found: Returns error
- Update failure: Returns error
- Socket emission failures: Logged but don't fail request

**Resilience**:
- Voice Bot API failures don't block initial call log creation
- Call logs can be updated later if Voice Bot processing fails
- Socket events are fire-and-forget

---

### Sentiment Analysis APIs

Sentiment analysis is integrated into the call logs system. When a call log is created, the system automatically sends a request to the sentiment analysis API.

#### Sentiment Analysis Request

**External API**: `POST ${SENTIMENT_ANALYSIS_API_URL}`

**Request Body**:
```json
{
  "id": "callId",
  "company_id": "companyId"
}
```

**Headers**:
```
Authorization: Bearer ${SENTIMENT_ANALYSIS_API_KEY}
Content-Type: application/json
```

**Response**: The sentiment analysis API processes the call and returns sentiment data that is stored in the CallLog document.

#### Call Log Sentiment Data Structure

```javascript
{
  "overallSentiment": {
    "score": 75, // 0-100
    "label": "positive", // "poor" | "neutral" | "positive"
    "description": "Overall sentiment description"
  },
  "talkListenRatio": {
    "agentTalkPercentage": 45,
    "agentListenPercentage": 55
  },
  "detailedSentiment": [
    {
      "startSecond": 0,
      "endSecond": 30,
      "speaker": "agent",
      "sentimentScore": 80,
      "sentimentLabel": "positive",
      "text": "Transcript chunk for this segment"
    }
  ],
  "smartNotes": [
    {
      "title": "Key Point",
      "notes": "Detailed notes",
      "createdBy": "ai"
    }
  ]
}
```

**Processing Status**: The call log includes an `isProcessing` field that tracks sentiment analysis status:
- `pending`: Analysis requested but not started
- `processing`: Analysis in progress
- `completed`: Analysis completed
- `failed`: Analysis failed

---

## Frontend Implementation

### SIP.js Integration

The frontend uses SIP.js library for WebRTC communication with the PBX server.

#### Connection Configuration

Located in `src/hooks/useCallCenter.js`:

```javascript
const CONNECTION_SETTINGS = {
  WEBSOCKET_URL: process.env.NEXT_PUBLIC_PBX_WEBSOCKET_URL,
  DOMAIN: process.env.NEXT_PUBLIC_PBX_DOMAIN,
};

const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302'] },
  { urls: ['stun:stun1.l.google.com:19302'] },
  { urls: ['stun:stun2.l.google.com:19302'] }
];
```

#### User Agent Configuration

Each extension has a UserAgent instance configured with:

- **URI**: `sip:username@domain`
- **Transport**: WebSocket (WSS)
- **Authorization**: SIP username and password
- **Session Description Handler**: WebRTC constraints for audio
- **ICE Servers**: STUN servers for NAT traversal

#### Registration Flow

1. User Agent connects to WebSocket
2. Registerer registers the extension
3. Registration state tracked in store
4. Auto-registration based on user status

**Registration States**:
- `initializing`: UserAgent being created
- `connecting`: WebSocket connecting
- `registering`: Registration in progress
- `registered`: Successfully registered
- `unregistering`: Unregistration in progress
- `unregistered`: Unregistered
- `terminated`: UserAgent terminated

---

### useCallCenter Hook

The `useCallCenter` hook (`src/hooks/useCallCenter.js`) is the main integration point for call center functionality.

#### Hook Overview

**Location**: `src/hooks/useCallCenter.js`

**Dependencies**:
- `@tanstack/react-query`: Data fetching
- `sip.js`: SIP/WebRTC library
- `zustand`: State management (useCallCenterStore)
- `jwt-decode`: Token decoding

#### Main Functions

##### 1. Extension Management

**`initializeAllUserAgents()`**
- Initializes UserAgent instances for all extensions
- Sets up event handlers
- Handles registration based on user status
- Manages connection lifecycle

**`setupUserAgentEventHandlers(userAgent, extension)`**
- Handles WebSocket connection events
- Manages registration state changes
- Handles incoming call invitations

##### 2. Call Operations

**`makeCall({ phoneNumber, customOutboundNumber })`**
- Initiates an outgoing call
- Validates extension registration
- Gets user media (microphone)
- Creates Inviter session
- Sends SIP INVITE
- Sets up audio streams
- Holds all other active calls

**Flow**:
1. Check extension selected and registered
2. Get user media stream
3. Format phone number
4. Create target URI
5. Create Inviter with session description handler options
6. Add session to store
7. Setup event handlers
8. Hold all other calls
9. Send INVITE
10. Setup audio streams

**`answerCall(sessionId)`**
- Answers an incoming call
- Gets user media if not available
- Holds all other calls
- Accepts the invitation
- Sets up audio streams

**Flow**:
1. Validate session is Invitation
2. Get user media
3. Hold all other calls
4. Setup session description handler options
5. Accept invitation
6. Setup audio streams

**`hangupCall(sessionId)`**
- Terminates a call
- Handles both Inviter and Invitation sessions
- Cleans up intervals and state
- Restores previous status if no active calls

**Flow**:
- For Inviter (outgoing):
  - If `Initial` or `Establishing`: Cancel
  - If `Established`: Send BYE
- For Invitation (incoming):
  - If `Initial`: Reject
  - If `Established`: Send BYE
- Cleanup intervals
- Remove session from store
- Restore status if no active calls

##### 3. Call Control Functions

**`toggleMute(sessionId)`**
- Mutes/unmutes audio for a call
- Controls local stream tracks
- Controls peer connection senders
- Updates mute state in store

**Implementation**:
```javascript
// Disable/enable local stream tracks
localStream.getAudioTracks().forEach(track => {
  track.enabled = !newMuteState;
});

// Disable/enable peer connection senders
pc.getSenders().forEach(sender => {
  if (sender.track?.kind === 'audio') {
    sender.track.enabled = !newMuteState;
  }
});
```

**`toggleHold(sessionId)`**
- Puts call on hold or unholds it
- Uses re-INVITE with modified SDP
- When holding: Sets audio constraints to `false`
- When unholding: Re-enables audio and sends re-INVITE
- Automatically holds all other calls when unholding

**Implementation**:
- **Hold**: Send re-INVITE with `audio: false` constraints
- **Unhold**: Use `makeCallActive()` which:
  - Holds all other calls
  - Sends re-INVITE with `audio: true` constraints
  - Re-enables audio tracks

**`transferCall({ sessionId, targetExtension })`**
- Transfers a call to another extension
- Uses SIP REFER method
- Handles transfer acceptance/rejection
- Cleans up session after transfer

**Flow**:
1. Validate session and target extension
2. Create target URI
3. Send REFER request
4. Handle response callbacks (onAccept, onReject, onNotify)
5. Terminate session after successful transfer
6. Cleanup intervals and state

**Implementation**:
```javascript
const referRequest = session.refer(targetUri, {
  requestDelegate: {
    onAccept: async (options) => {
      // Transfer accepted
      await finalizeTransferAndCleanup();
    },
    onReject: async (options) => {
      // Transfer rejected
      await finalizeTransferAndCleanup(..., { markError: true });
    },
    onNotify: async (notification) => {
      // Transfer status updates
      // Parse status code from notification
    }
  }
});
```

##### 4. Audio Stream Management

**`setupAudioStreams(session, sessionId)`**
- Sets up audio elements for local and remote streams
- Handles track events from peer connection
- Sets up existing receivers
- Configures audio playback

**Implementation**:
```javascript
// Setup remote audio
pc.ontrack = (event) => {
  if (event.track.kind === 'audio') {
    const stream = new MediaStream([event.track]);
    remoteAudioRef.current.srcObject = stream;
    remoteAudioRef.current.play();
  }
};

// Setup existing receivers
pc.getReceivers().forEach(receiver => {
  if (receiver.track?.kind === 'audio') {
    const stream = new MediaStream([receiver.track]);
    remoteAudioRef.current.srcObject = stream;
    remoteAudioRef.current.play();
  }
});

// Setup local audio (muted)
if (localStream && localAudioRef.current) {
  localAudioRef.current.srcObject = localStream;
  localAudioRef.current.muted = true;
}
```

**`initializeUserMedia()`**
- Gets user media (microphone) with optimal settings
- Caches the stream for reuse
- Configures audio constraints

**Audio Constraints**:
```javascript
{
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    latency: 0.01,
    sampleRate: 48000,
    channelCount: 1
  },
  video: false
}
```

##### 5. Session Management

**`handleNewRTCSession(session, extension)`**
- Handles new incoming or outgoing sessions
- Generates session ID
- Adds session to store
- Sets up event handlers
- For incoming calls: Creates conversation in real-time

**Session Event Handlers**:
- **State Changes**: Tracks session state (Initial, Establishing, Established, Terminating, Terminated)
- **Outgoing Call Responses**: Handles progress, accept, reject, trying
- **Incoming Call Cancellation**: Handles cancel events
- **BYE Requests**: Handles remote party hangup

**Session States**:
- `Initial`: Session created but not established
- `Establishing`: Connection in progress
- `Established`: Call connected
- `Terminating`: Call ending
- `Terminated`: Call ended

##### 6. Status Management Integration

The hook integrates with user status management:
- Automatically updates status to `occupied` when calls are active
- Restores previous status when calls end
- Handles status changes based on call state
- Updates both call and message status

##### 7. Helper Functions

**`formatPhoneNumber(number)`**
- Formats phone numbers for SIP
- Handles + and 00 prefixes
- Normalizes number format

**`formatDuration(seconds)`**
- Formats call duration as MM:SS

**`generateSessionId(session)`**
- Generates unique session ID from SIP session
- Uses Call-ID header if available
- Falls back to generated ID

#### Hook Return Values

```javascript
{
  // Extension data
  extensions,
  userAgents,
  registrationStatuses,
  selectedExtension,
  setSelectedExtension,
  
  // Outbound numbers
  selectedOutboundNumber,
  setSelectedOutboundNumber,
  availableOutboundNumbers,
  
  // Overall status
  status,
  
  // Call sessions
  sessions: callSessions,
  callStatuses,
  phoneNumbers,
  callDurations,
  mutedStates: isMuted,
  holdStates: isOnHold,
  callErrors,
  incomingCallExtensions,
  activeCallIds,
  showCallModal,
  
  // Call actions
  handleMakeCall: makeCall,
  handleAnswerCall: answerCall,
  handleHangup: hangupCall,
  handleToggleMute: toggleMute,
  handleHoldCall: toggleHold,
  handleTransferCall: transferCall,
  handleMakeCallActive: makeCallActive,
  handleHoldAllOtherCalls: holdAllOtherCalls,
  
  // Audio refs
  remoteAudioRef,
  localAudioRef,
  
  // Utilities
  formatDuration,
  initializeAllUserAgents,
}
```

---

### State Management

#### useCallCenterStore

**Location**: `src/store/useCallCenterStore.js`

Zustand store managing call center state.

**State Structure**:

```javascript
{
  // Extension state
  extensions: [],
  userAgents: Map<extension, UserAgent>,
  registrationStatuses: Map<extension, status>,
  selectedExtension: Extension | null,
  
  // Outbound number state
  availableOutboundNumbers: [],
  selectedOutboundNumber: string | null,
  lastUsedOutboundNumber: string | null,
  isUserInException: boolean,
  
  // Session state
  callSessions: Map<sessionId, Session>,
  callStatuses: Map<sessionId, status>,
  phoneNumbers: Map<sessionId, phoneNumber>,
  callDurations: Map<sessionId, seconds>,
  isMuted: Map<sessionId, boolean>,
  isOnHold: Map<sessionId, boolean>,
  callErrors: Map<sessionId, error>,
  incomingCallExtensions: Map<sessionId, extension>,
  activeCallIds: string[],
  
  // Completed call data (preserved for UI)
  completedCallDurations: Map<sessionId, seconds>,
  completedCallStatuses: Map<sessionId, status>,
  completedCallPhoneNumbers: Map<sessionId, phoneNumber>,
  
  // UI state
  showCallModal: boolean,
  
  // Media refs
  remoteAudioRef: { current: HTMLAudioElement | null },
  localAudioRef: { current: HTMLAudioElement | null },
  localStream: MediaStream | null,
  
  // Client IP
  clientIp: string | null,
  
  // Action methods (set by useCallCenter hook)
  makeCall: Function | null,
  answerCall: Function | null,
  hangupCall: Function | null,
  toggleMute: Function | null,
  toggleHold: Function | null,
  transferCall: Function | null,
  // ... other action methods
}
```

**Key Actions**:

- `setExtensions(extensions)`: Set extension list
- `setUserAgents(userAgents)`: Set UserAgent map
- `setRegistrationStatuses(statuses)`: Update registration statuses
- `setSelectedExtension(extension)`: Set selected extension (persists to localStorage)
- `addSession({ session, status, phoneNumber, extension })`: Add new call session
- `updateSessionStatus({ sessionId, status })`: Update session status
- `removeSession(sessionId)`: Remove session (preserves completed call data)
- `setShowCallModal(show)`: Control call modal visibility
- `setLocalStream(stream)`: Set local media stream
- `getOverallStatus()`: Get overall registration status

---

## Features and Functionality

### Call Management

#### Making Outgoing Calls

1. User selects phone number to call
2. System validates:
   - Extension is selected and registered
   - User agent is connected
   - Outbound number is selected
3. Gets user media (microphone)
4. Formats phone number
5. Creates SIP Inviter session
6. Holds all other active calls
7. Sends SIP INVITE
8. Sets up audio streams when call connects
9. Updates user status to `occupied`

#### Receiving Incoming Calls

1. PBX sends SIP INVITE to UserAgent
2. `onInvite` delegate fires
3. System creates conversation in real-time
4. Session added to store
5. Call modal shown
6. User can answer or reject
7. On answer: Accept invitation, setup audio, hold other calls
8. Status updated to `occupied`

#### Multiple Call Management

- System supports multiple simultaneous calls
- Only one call is active at a time (others on hold)
- When making/answering a call, all others are automatically held
- Users can switch between calls using `makeCallActive()`

---

### Call Transfer

#### Transfer Implementation

Transfer uses SIP REFER method to transfer calls to another extension.

**Process**:
1. User selects target extension
2. System validates session is established
3. Creates target URI
4. Sends REFER request
5. Handles response:
   - **Accepted**: Transfer successful, cleanup session
   - **Rejected**: Show error, keep call active
   - **Notify**: Parse status updates
6. After successful transfer, session is terminated

**Transfer States**:
- `Transferring to {extension}...`: Transfer in progress
- `Transfer completed ({extension})`: Transfer successful
- `Transfer rejected (reason)`: Transfer failed
- `Transfer failed (error)`: Transfer error

---

### Hold/Unhold

#### Hold Implementation

Hold is implemented using SIP re-INVITE with modified session description.

**Hold Process**:
1. Disable local audio tracks
2. Disable peer connection audio senders
3. Send re-INVITE with `audio: false` constraints
4. Update hold state in store

**Unhold Process**:
1. Use `makeCallActive(sessionId)` function
2. Hold all other calls first
3. Re-enable local audio tracks
4. Re-enable peer connection senders
5. Send re-INVITE with `audio: true` constraints
6. Setup audio streams
7. Update hold state in store

**Behavior**:
- Only one call can be active at a time
- When unholding a call, all others are automatically held
- Hold state is tracked per session
- Audio is completely muted when on hold

---

### Mute/Unmute

#### Mute Implementation

Mute controls audio transmission without affecting call state.

**Process**:
1. Toggle mute state
2. Enable/disable local stream audio tracks
3. Enable/disable peer connection audio senders
4. Update mute state in store

**Difference from Hold**:
- **Mute**: Only affects audio transmission, call remains active
- **Hold**: Uses SIP re-INVITE, puts call in hold state

---

### Status Management

#### User Status Integration

The call center integrates with user status management:

**Status Values**:
- `available`: Available for calls
- `outbound`: Only outbound calls allowed
- `occupied`: On a call
- `notavailable`: Not available
- `offline`: Offline

**Status Updates**:
- Automatically set to `occupied` when call connects
- Previous status saved for restoration
- Status restored when all calls end
- Status persists across page reloads

**Registration Behavior**:
- `available`, `outbound`, `occupied`: Extension registered with PBX
- `notavailable`, `offline`: Extension unregistered

---

### Call Logs and Sentiment Analysis

#### Call Log Creation

Call logs are created when calls end, typically via CDR webhooks from the PBX.

**Process**:
1. CDR data received from PBX
2. Call log created/updated in database
3. Recording downloaded if available
4. Recording uploaded to S3
5. Conversation created/updated
6. Sentiment analysis triggered

#### Call Log Data Structure

```javascript
{
  "cdrId": "call-12345",
  "operatorId": "userId",
  "groupId": "groupId",
  "conversationId": "conversationId",
  "callerNumber": "+1234567890",
  "receiverNumber": "+0987654321",
  "callLength": "2:30",
  "direction": "incoming" | "outgoing",
  "status": "answered" | "no_answer" | "busy" | "failed",
  "recordingLink": "https://s3.../recording.mp3",
  "type": "human" | "voicebot",
  "transcript": "...",
  "summary": "...",
  "cdrData": {...},
  "isResolved": true,
  "overallSentiment": {...},
  "talkListenRatio": {...},
  "detailedSentiment": [...],
  "smartNotes": [...],
  "isProcessing": "completed"
}
```

#### Sentiment Analysis Flow

1. Call log created
2. System sends request to sentiment analysis API
3. API processes call recording and transcript
4. Analysis results stored in call log
5. Status updated to `completed`

**Sentiment Data**:
- **Overall Sentiment**: Score (0-100), label (poor/neutral/positive), description
- **Talk/Listen Ratio**: Percentage of time agent talked vs listened
- **Detailed Sentiment**: Timeline of sentiment throughout the call
- **Smart Notes**: AI-generated notes and insights

#### Call Log Retrieval

Call logs can be retrieved with comprehensive filtering:
- By operator/agent
- By date range
- By call direction
- By country
- By group
- By phone number
- With statistics and aggregations

---

## Data Flow

### Call Flow Diagram

```
┌─────────┐
│  User   │
└────┬────┘
     │
     │ makeCall(phoneNumber)
     ▼
┌─────────────────┐
│  useCallCenter  │
│      Hook       │
└────┬────────────┘
     │
     │ 1. Validate extension
     │ 2. Get user media
     │ 3. Create Inviter
     ▼
┌─────────────────┐
│  SIP.js UserAgent│
│     (Inviter)    │
└────┬────────────┘
     │
     │ SIP INVITE (WebSocket)
     ▼
┌─────────────────┐
│   PBX Server    │
└────┬────────────┘
     │
     │ SIP Responses
     │ (180 Ringing, 200 OK)
     ▼
┌─────────────────┐
│  SIP.js Session │
│   (Established) │
└────┬────────────┘
     │
     │ WebRTC Media Stream
     │ (Audio)
     ▼
┌─────────────────┐
│  Audio Elements │
│ (remote/local)  │
└─────────────────┘
```

### Incoming Call Flow

```
┌─────────────────┐
│   PBX Server    │
└────┬────────────┘
     │
     │ SIP INVITE (WebSocket)
     ▼
┌─────────────────┐
│  SIP.js UserAgent│
│   (onInvite)     │
└────┬────────────┘
     │
     │ handleNewRTCSession()
     ▼
┌─────────────────┐
│  useCallCenter  │
│      Hook       │
└────┬────────────┘
     │
     │ 1. Create conversation
     │ 2. Add session to store
     │ 3. Show call modal
     ▼
┌─────────────────┐
│      UI         │
│  (Call Modal)   │
└────┬────────────┘
     │
     │ User clicks Answer
     ▼
┌─────────────────┐
│  answerCall()   │
└────┬────────────┘
     │
     │ session.accept()
     │ Setup audio streams
     ▼
┌─────────────────┐
│  Call Connected │
└─────────────────┘
```

### Call Log Creation Flow

```
┌─────────────────┐
│   PBX Server    │
└────┬────────────┘
     │
     │ CDR Webhook
     │ (POST /api/call-logs)
     ▼
┌─────────────────┐
│  API Route      │
│  /call-logs     │
└────┬────────────┘
     │
     │ createAndUpdateCallLog()
     ▼
┌─────────────────┐
│  CallLogService │
└────┬────────────┘
     │
     ├─► Download recording
     ├─► Upload to S3
     ├─► Create/update conversation
     └─► Trigger sentiment analysis
         │
         │ POST to Sentiment API
         ▼
    ┌─────────────────┐
    │ Sentiment API   │
    └─────────────────┘
         │
         │ Analysis results
         ▼
    ┌─────────────────┐
    │  Update CallLog │
    │  (sentiment data)│
    └─────────────────┘
```

---

## Configuration

### Environment Variables

**Frontend (.env.local)**:
```env
NEXT_PUBLIC_PBX_WEBSOCKET_URL=wss://pbx.example.com/ws
NEXT_PUBLIC_PBX_DOMAIN=pbx.example.com
```

**Backend (.env)**:
```env
SENTIMENT_ANALYSIS_API_URL=https://sentiment-api.example.com/analyze
SENTIMENT_ANALYSIS_API_KEY=your-api-key
```

### PBX Configuration

The system requires:
- WebSocket SIP transport enabled
- CDR (Call Detail Records) enabled
- Recording capability (optional)
- Extension authentication (SIP username/password)

### Browser Requirements

- WebRTC support
- WebSocket support
- MediaDevices API (getUserMedia)
- Modern browser (Chrome, Firefox, Safari, Edge)

### Audio Configuration

**Recommended Audio Settings**:
- Sample Rate: 48000 Hz
- Channel Count: 1 (Mono)
- Echo Cancellation: Enabled
- Noise Suppression: Enabled
- Auto Gain Control: Enabled
- Latency: 0.01 seconds

---

## Error Handling

### Common Errors

1. **Registration Failed**
   - Check SIP credentials
   - Verify WebSocket connection
   - Check network connectivity
   - Verify PBX configuration

2. **Call Failed**
   - Verify extension is registered
   - Check phone number format
   - Verify outbound number selected
   - Check PBX routing rules

3. **Audio Issues**
   - Check microphone permissions
   - Verify audio constraints
   - Check browser audio settings
   - Verify WebRTC connectivity

4. **Transfer Failed**
   - Verify target extension exists
   - Check target extension registration
   - Verify SIP REFER support

### Error States

Errors are stored in `callErrors` Map in the store:
- Key: `sessionId`
- Value: Error message string

Errors are displayed in the UI and logged to console.

---

## Security Considerations

1. **Authentication**: All API endpoints require authentication
2. **Authorization**: Users can only access their own data (unless admin)
3. **SIP Security**: Uses WSS (WebSocket Secure) for SIP transport
4. **Token Management**: JWT tokens for API authentication
5. **Tenant Isolation**: Multi-tenant database isolation
6. **Recording Storage**: Recordings stored securely in S3

---

## Performance Considerations

1. **Session Management**: Sessions are cleaned up properly to prevent memory leaks
2. **Audio Streams**: Streams are reused when possible
3. **State Updates**: Zustand store updates are optimized
4. **Query Caching**: React Query used for API data caching
5. **Connection Pooling**: MongoDB connection pooling
6. **Recording Downloads**: Streaming downloads for large files

---

## Troubleshooting

### Call Not Connecting

1. Check extension registration status
2. Verify WebSocket connection
3. Check browser console for errors
4. Verify PBX routing rules
5. Check network connectivity

### No Audio

1. Check microphone permissions
2. Verify audio elements are set up
3. Check browser audio settings
4. Verify WebRTC connection
5. Check ICE candidates

### Status Not Updating

1. Check API responses
2. Verify status update API calls
3. Check socket connections
4. Verify database updates

---

## Additional Resources

- **SIP.js Documentation**: https://sipjs.com/
- **WebRTC Documentation**: https://webrtc.org/
- **Next.js Documentation**: https://nextjs.org/docs
- **Zustand Documentation**: https://zustand-demo.pmnd.rs/

---

## Appendix

### SIP Messages Reference

**INVITE**: Initiates a call
**ACK**: Confirms final response to INVITE
**BYE**: Terminates a call
**CANCEL**: Cancels a pending INVITE
**REFER**: Transfers a call
**REGISTER**: Registers with SIP server
**200 OK**: Success response
**180 Ringing**: Call is ringing
**486 Busy**: User is busy
**487 Request Terminated**: Request cancelled

### Call Status Values

- `Connecting...`: Call being initiated
- `Trying...`: INVITE sent, waiting for response
- `Ringing...`: Remote party is ringing
- `Call connected`: Call established
- `Call accepted`: Call accepted
- `Call ended`: Call terminated
- `Call cancelled`: Call cancelled
- `Call failed`: Call failed

### Registration Status Values

- `initializing`: UserAgent being created
- `connecting`: WebSocket connecting
- `registering`: Registration in progress
- `registered`: Successfully registered
- `unregistering`: Unregistration in progress
- `unregistered`: Unregistered
- `terminated`: UserAgent terminated
- `failed: {reason}`: Registration failed

---

*Last Updated: 2024*
*Documentation Version: 1.0*
