// src/models/schemas/Queue.js
import mongoose from 'mongoose';

const QueueSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      index: true
    },
    action: {
      type: String,
      required: true,
      index: true
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: {}
    },
    perform_at: {
      type: String,
      required: true,
      index: true
    },
    status: {
      type: String,
      index: true
    },
    result: {
      type: String,
      default: null
    },
    created_at: {
      type: String,
      default: null
    },
    updated_at: {
      type: String,
      default: null
    },
    tenantId: {
      type: String,
      index: true
    },
    completedBy: {
      type: String,
      default: null,
      index: true
    }
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// Indexes for efficient querying
QueueSchema.index({ action: 1, status: 1, perform_at: 1 });
QueueSchema.index({ status: 1, perform_at: 1 }); // For efficient pending queue queries
QueueSchema.index({ createdAt: -1 });
QueueSchema.index({ status: 1, createdAt: 1 }); // For polling pending items

export default QueueSchema;


