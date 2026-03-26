# CSV Contact Import Implementation

## Overview
Complete implementation of CSV contact import system with dynamic field mapping, automatic WebChat link generation, and queue-based batch processing.

## Files Created/Modified

### 1. **Core Service**
- `src/services/contact/CSVImportService.js`
  - Streaming CSV parser for large files
  - Dynamic field mapping (auto-detects CSV columns)
  - Batch processing (1000 contacts per batch)
  - Automatic WebChat link generation for each contact
  - Stores unknown fields in `details` Map field

### 2. **Database Schema**
- `src/models/schemas/ImportJob.js`
  - Tracks import progress and status
  - Stores field mapping, errors, and statistics

- `src/models/schemas/Contact.js` (Updated)
  - Added `details` field (Map) for storing dynamic CSV fields
  - Replaced `customFields` with `details`

### 3. **Queue Worker**
- `src/workers/contactImportWorker.js`
  - BullMQ worker for background processing
  - Processes CSV imports asynchronously
  - Updates progress in real-time
  - Handles errors gracefully

### 4. **API Endpoints**
- `src/app/api/contacts/import/route.js`
  - `POST /api/contacts/import` - Upload CSV and start import
  - `GET /api/contacts/import` - Get all import jobs
  - `GET /api/contacts/import?jobId=xxx` - Get specific job status

- `src/app/api/contacts/import/[jobId]/route.js`
  - `GET /api/contacts/import/:jobId` - Get job status
  - `GET /api/contacts/import/:jobId?errors=true` - Get errors only

### 5. **UI Components**
- `src/components/modals/CSVImportModal.jsx`
  - File upload interface
  - Real-time progress tracking
  - Error display and download
  - Professional UI with animations

- `src/app/c/contacts/page.js` (Updated)
  - Added "Import CSV" button
  - Integrated CSV import modal

### 6. **Queue Configuration**
- `src/lib/queue/bullmq.js` (Updated)
  - Added `CONTACT_IMPORT` queue
  - Added `getContactImportQueue()` function

- `src/workers/index.js` (Updated)
  - Added contact import worker initialization

## How It Works

### 1. **File Upload**
- User uploads CSV file via UI
- File is saved to `uploads/csv-imports/{tenantId}/`
- Import job is created in database
- Job is queued in BullMQ

### 2. **Field Mapping**
- CSV headers are auto-detected
- Standard fields (name, email, phone) are mapped automatically
- Unknown fields are stored in `details` Map
- Field mapping is saved in ImportJob

### 3. **Batch Processing**
- CSV is processed in streaming mode (no full file load)
- Contacts are processed in batches of 1000
- Each batch is inserted using `insertMany` with `ordered: false`
- Progress is updated after each batch

### 4. **WebChat Link Generation**
- For each successfully imported contact:
  - Generate unique link ID
  - Create WebChat session
  - Update contact with `webchatLink` and `identifiers.webchat`

### 5. **Progress Tracking**
- Real-time progress updates via polling (every 2 seconds)
- Progress percentage calculated
- Statistics: total, processed, successful, failed
- Errors are logged with row numbers

### 6. **Error Handling**
- Invalid records are skipped (don't stop import)
- Errors are logged with row numbers
- Error report can be downloaded as CSV
- Failed imports don't affect successful ones

## Storage Strategy

### Standard Fields
- `name`, `firstName`, `lastName`, `displayName`
- `email`, `phone`
- `identifiers` (whatsapp, facebook, instagram, sms, email, webchat)

### Dynamic Fields (Details)
All unknown CSV columns are stored in `details` Map:
```javascript
{
  name: "John",
  email: "john@example.com",
  details: {
    "Salesforce_ID": "SF001",
    "Account_Name": "ABC Corp",
    "Industry": "Tech",
    // ... hundreds more fields
  }
}
```

## Performance Optimizations

1. **Streaming**: CSV is processed in streams, not loaded entirely into memory
2. **Batch Inserts**: Uses `insertMany` with `ordered: false` for speed
3. **Parallel WebChat Links**: WebChat links generated in parallel using `Promise.allSettled`
4. **Queue Processing**: Background processing prevents server blocking
5. **Progress Polling**: Efficient 2-second polling for status updates

## Installation

### Required Package
```bash
npm install csv-parse
```

## Usage

1. Navigate to Contacts page
2. Click "Import CSV" button
3. Select CSV file (max 500MB)
4. Click "Start Import"
5. Monitor progress in real-time
6. Download error report if needed

## Features

✅ Streaming CSV parser (handles millions of records)
✅ Dynamic field mapping (no schema changes needed)
✅ Automatic WebChat link generation
✅ Real-time progress tracking
✅ Error handling and reporting
✅ Batch processing (1000 contacts per batch)
✅ Professional UI with animations
✅ Queue-based background processing
✅ Efficient storage using MongoDB Map

## Next Steps

1. Install `csv-parse` package: `npm install csv-parse`
2. Start workers: `npm run workers` or `npm run dev:workers`
3. Test with a sample CSV file
4. Monitor import progress in UI

