// src/models/schemas/AutomationExecution.js
import mongoose from 'mongoose';

const AutomationExecutionSchema = new mongoose.Schema({
  automationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Automation',
    required: true,
    index: true,
  },

  // Execution status
  status: {
    type: String,
    enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
    default: 'queued',
    index: true,
  },

  // Timing info
  executionType: {
    type: String,
    enum: ['immediate', 'delayed', 'schedule'],
    required: true,
  },
  scheduledFor: Date,
  startedAt: Date,
  completedAt: Date,

  // Results
  totalContacts: { type: Number, default: 0 },
  totalSent: { type: Number, default: 0 },
  totalFailed: { type: Number, default: 0 },

  // Snapshot of trigger conditions at execution time (for audit)
  triggerConditionsSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },

  // Snapshot of channels used
  channelsSnapshot: [{
    channel: String,
    channelAccountId: mongoose.Schema.Types.ObjectId,
    templateId: mongoose.Schema.Types.ObjectId,
  }],

  // Error details (if failed)
  error: {
    message: String,
    code: String,
    stack: String,
  },

  // Who triggered this execution
  triggeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  tenantId: {
    type: String,
    required: true,
    index: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

AutomationExecutionSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes
AutomationExecutionSchema.index({ tenantId: 1, automationId: 1, createdAt: -1 });
AutomationExecutionSchema.index({ tenantId: 1, status: 1 });
AutomationExecutionSchema.index({ automationId: 1, status: 1 });

export default AutomationExecutionSchema;
