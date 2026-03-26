# CSV Contact Import Approach

## Overview
Import millions of contacts from Salesforce CRM CSV files with dynamic field mapping, automatic WebChat link generation, and minimal server load.

## Architecture

### 1. **Streaming CSV Parser**
- Use `csv-parse` or `fast-csv` for streaming large files
- Process in chunks (e.g., 1000 records at a time)
- Avoid loading entire file into memory

### 2. **Dynamic Field Mapping**
- Auto-detect CSV column names
- Map to Contact schema fields:
  - **Standard fields**: name, firstName, lastName, email, phone
  - **Custom fields**: Store in `customFields` Map
  - **Identifiers**: Map to `identifiers` object (whatsapp, facebook, instagram, sms, email, webchat)
- Smart field detection:
  - Email: columns containing "email", "e-mail", "mail"
  - Phone: columns containing "phone", "mobile", "tel", "cell"
  - Name: columns containing "name", "fullname", "full_name"
  - First/Last: "first", "last", "fname", "lname"

### 3. **Queue-Based Batch Processing**
- Use BullMQ for background job processing
- Queue structure:
  - **Import Job**: Main job that processes CSV file
  - **Batch Jobs**: Sub-jobs for each batch (1000 contacts)
- Benefits:
  - Non-blocking server
  - Retry on failure
  - Progress tracking
  - Scalable

### 4. **WebChat Link Generation**
- Generate unique link for each contact during import
- Use same logic as `contact-link/route.js`:
  - Generate `linkId` using `crypto.randomBytes(16).toString('hex')`
  - Create WebChat session
  - Update contact with `webchatLink` and `identifiers.webchat`

### 5. **Progress Tracking**
- Store import status in database:
  - Total records
  - Processed records
  - Successful imports
  - Failed imports
  - Errors
- Real-time updates via Socket.IO

### 6. **Error Handling**
- Validation per record
- Skip invalid records, continue processing
- Log errors with row numbers
- Generate error report

## Implementation Plan

### Phase 1: Core Services
1. **CSVImportService**: Main import logic
2. **FieldMapperService**: Dynamic field mapping
3. **ContactImportWorker**: BullMQ worker for batch processing

### Phase 2: API Endpoints
1. **POST /api/contacts/import**: Upload CSV and start import
2. **GET /api/contacts/import/:jobId**: Get import status
3. **GET /api/contacts/import/:jobId/errors**: Get error report

### Phase 3: UI Component
1. **CSVImportModal**: Upload and monitor import
2. **ImportProgress**: Real-time progress display
3. **ErrorReport**: View and download errors

## Database Schema

### ImportJob Collection
```javascript
{
  _id: ObjectId,
  companyId: ObjectId,
  tenantId: ObjectId,
  fileName: String,
  totalRecords: Number,
  processedRecords: Number,
  successfulImports: Number,
  failedImports: Number,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  errors: [{
    row: Number,
    field: String,
    error: String
  }],
  createdAt: Date,
  updatedAt: Date
}
```

## Performance Optimizations

1. **Batch Inserts**: Use `insertMany` with `ordered: false`
2. **Indexes**: Ensure indexes on email, phone, identifiers
3. **Connection Pooling**: Reuse database connections
4. **Memory Management**: Stream processing, no full file load
5. **Concurrent Processing**: Process multiple batches in parallel

## Security

1. **File Validation**: Check file type, size limits
2. **Rate Limiting**: Prevent abuse
3. **Authentication**: Only company admins can import
4. **Data Sanitization**: Validate and sanitize all fields

