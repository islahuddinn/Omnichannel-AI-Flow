// src/models/schemas/PendingLoad.js
import mongoose from 'mongoose';

const PendingLoadSchema = new mongoose.Schema({
  // Data field - flexible storage for any structure
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Type of entity being loaded
  type: {
    type: String,
    enum: ['deals', 'contacts'],
    required: true,
    index: true
  },

  // Action to perform — stored at top level for reliable coalescing and sweep recovery
  action: {
    type: String,
    enum: ['new', 'update', 'delete'],
    required: true,
    index: true,
  },

  // Multi-tenant and ownership - set by create-auto / bulk-upsert
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'queued_failed'],
    default: 'pending',
    index: true
  },

  /** Set when status is 'failed' or 'queued_failed'; dynamic message from the actual error/response */
  failureReason: {
    type: String,
    required: false,
    default: null,
    maxlength: 2000,
  },

  /** Tracks how many times the sweep has re-queued this record (prevents infinite re-queue loops) */
  sweepCount: {
    type: Number,
    default: 0,
  },

  /** Set when worker picks up the record — used by sweep to avoid re-queuing active records */
  processingStartedAt: {
    type: Date,
    default: null,
  },

  tenantId: {
    type: String,
    required: false,
    index: true
  },
  companyId: {
    type: String,
    required: false,
    index: true
  },

  // Metadata
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  // Scheduled processing time - data will be processed after this time
  scheduledAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 60000);
    },
    index: true,
  },

  // Completion/failure timestamps for audit trail
  completedAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
});

// Indexes for performance
PendingLoadSchema.index({ type: 1, createdAt: -1 });
PendingLoadSchema.index({ createdAt: -1 });
PendingLoadSchema.index({ scheduledAt: 1, status: 1 });
// Index for coalescing lookups — find pending actions for the same SF_id or deal_id
PendingLoadSchema.index({ status: 1, type: 1, action: 1 });

// Update updatedAt on save
PendingLoadSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default PendingLoadSchema;
