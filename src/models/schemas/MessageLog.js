// src/models/schemas/MessageLog.js
import mongoose from 'mongoose';

const MessageLogSchema = new mongoose.Schema({
  // Message reference (if this log is for a specific message)
  messageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    sparse: true,
    index: true,
  },
  
  // Automation reference (if this log is for automation execution)
  automationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Automation',
    sparse: true,
    index: true,
  },
  
  // Log type: 'message' (regular message), 'automation' (OWM automation execution)
  logType: {
    type: String,
    enum: ['message', 'automation'],
    required: true,
    default: 'message',
    index: true,
  },
  
  // Event type: 'sent', 'delivered', 'read', 'failed', 'executed', 'queued', etc.
  eventType: {
    type: String,
    required: true,
    index: true,
  },
  
  // Channel type (for filtering)
  channel: {
    type: String,
    enum: ['whatsapp', 'facebook', 'instagram', 'sms', 'email', 'webchat'],
    sparse: true,
    index: true,
  },
  
  // Contact reference
  contactId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    sparse: true,
    index: true,
  },
  
  // Conversation reference
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    sparse: true,
    index: true,
  },
  
  // Log message/description
  message: {
    type: String,
    required: true,
  },
  
  // Additional data (error details, metadata, etc.)
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  
  // Status: 'success', 'error', 'warning', 'info'
  status: {
    type: String,
    enum: ['success', 'error', 'warning', 'info'],
    default: 'info',
    index: true,
  },
  
  // Tenant ID
  tenantId: {
    type: String,
    required: true,
    index: true,
  },
  
  // User who triggered (for automation, this is the automation creator)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    sparse: true,
  },
  
  // Timestamp
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Indexes for efficient querying
MessageLogSchema.index({ tenantId: 1, logType: 1, createdAt: -1 });
MessageLogSchema.index({ automationId: 1, createdAt: -1 });
MessageLogSchema.index({ messageId: 1, createdAt: -1 });
MessageLogSchema.index({ contactId: 1, createdAt: -1 });
MessageLogSchema.index({ eventType: 1, createdAt: -1 });

MessageLogSchema.pre('save', function (next) {
  if (this.isNew) {
    this.createdAt = new Date();
  }
  next();
});

export default MessageLogSchema;
