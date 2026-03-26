# Postman – Mobile App Simple Job Flow

Import **Mobile-App-Simple-Job-Flow.postman_collection.json** into Postman.

## Collection variables

| Variable | Description |
|----------|-------------|
| `baseUrl` | API base URL (e.g. `http://localhost:3000`) |
| `companyId` | Tenant/company ID |
| `dealId` | Job ID – Mongo `_id` or Salesforce `deal_id` |
| `mobileToken` | `Bearer <JWT>` from mobile login |

## How Salesforce updates reach the mobile app

Salesforce does **not** call dedicated price/work-summary webhooks. Instead:

1. Salesforce calls **bulk-upsert** (`POST /api/deals/bulk-upsert`) with deal data (including price, work summary, status, etc.).
2. The API writes to **PendingLoad** and publishes to the queue.
3. The **pending load worker** processes the job and inserts/updates the **Deal** in the tenant DB.
4. For **B2A** deals, the worker emits **`job:deal_updated`** to the room `mobile:handyman:{handymanSFId}` (and `mobile:job:deal_updated` to `company:{companyId}`).
5. The mobile app subscribes to `mobile:handyman:{handymanSFId}` and listens for **`job:deal_updated`** to refresh the job.

## Environment variables (backend)

- **Salesforce (outbound PATCH):** `SALESFORCE_INSTANCE_URL`, `SALESFORCE_ACCESS_TOKEN` (or `SALESFORCE_AUTH_TOKEN`)
- **S3 (all job images):** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BUCKET_NAME`

## Images and S3

All job images are stored on S3:

- **Before photos:** `POST .../upload` with `type: "before"` (or send base64 in `photosBefore` when submitting diagnostic).
- **After photos:** `POST .../upload` with `type: "after"` (or pass URLs in `afterPhotoUrls` when calling repair-complete).
- **Protocol (paper):** `POST .../upload` with `type: "protocol"` then use returned URL in protocol `upload` action; or send base64 in `protocolData.file` in one call.

## WebSocket events (mobile app)

Subscribe to room **`mobile:handyman:{handymanSFId}`** for:

- **`job:deal_updated`** – when a B2A deal is created/updated from Salesforce (bulk-upsert → worker). Payload includes `job` and `source: 'salesforce_sync'`.
- `job:started`, `job:diagnostic_submitted`, `job:status_changed`, `job:protocol_updated`, `job:invoice_updated` – from mobile actions.
