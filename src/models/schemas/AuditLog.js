// src/models/schemas/AuditLog.js
import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
  // Action type
  action: {
    type: String,
    required: true,
    index: true,
    enum: [
      // User actions
      'user.created', 'user.updated', 'user.deleted', 'user.suspended', 'user.activated',
      'user.login', 'user.logout', 'user.login_failed', 'user.password_reset',
      // Conversation actions
      'conversation.created', 'conversation.assigned', 'conversation.transferred', 
      'conversation.closed', 'conversation.merged', 'conversation.unmerged',
      // Message actions
      'message.sent', 'message.deleted', 'message.edited',
      // Department actions
      'department.created', 'department.updated', 'department.deleted',
      // Channel actions
      'channel.created', 'channel.updated', 'channel.deleted', 
      'channel.connected', 'channel.disconnected',
      // Contact actions
      'contact.created', 'contact.updated', 'contact.deleted', 'contact.merged',
      // Company actions
      'company.created', 'company.updated', 'company.suspended', 'company.activated',
      // Settings actions
      'settings.updated', 'permission.changed',
      // API actions
      'api.access', 'api.error',
      // System actions
      'system.backup', 'system.restore', 'system.maintenance'
    ]
  },
  
  // Actor (user who performed the action)
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  
  // Actor details (cached for performance)
  actorDetails: {
    email: String,
    firstName: String,
    lastName: String,
    role: String
  },
  
  // Company/Tenant context
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    index: true
  },
  
  companyName: {
    type: String,
    index: true
  },
  
  // Resource information
  resourceType: {
    type: String,
    enum: ['user', 'conversation', 'message', 'department', 'channel', 'contact', 'company', 'settings', 'api', 'system'],
    required: true,
    index: true
  },
  
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  
  // Changes made (before/after for updates)
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },
  
  // Additional metadata
  metadata: {
    ipAddress: String,
    userAgent: String,
    location: String,
    endpoint: String, // API endpoint
    method: String, // HTTP method
    statusCode: Number, // HTTP status code
    responseTime: Number, // Response time in ms
    details: mongoose.Schema.Types.Mixed
  },
  
  // Status of the action
  status: {
    type: String,
    enum: ['success', 'failure', 'warning'],
    default: 'success',
    index: true
  },
  
  // Error information (if status is failure)
  errorMessage: String,
  errorStack: String,
  
  // Timestamp
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false // We use timestamp field instead
});

// Compound indexes for common queries
AuditLogSchema.index({ companyId: 1, timestamp: -1 });
AuditLogSchema.index({ actor: 1, timestamp: -1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ status: 1, timestamp: -1 });
AuditLogSchema.index({ timestamp: -1 }); // For date range queries
AuditLogSchema.index({ 'metadata.ipAddress': 1, timestamp: -1 }); // For IP tracking

// TTL index - automatically delete logs older than 1 year (optional, can be adjusted)
// AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 });

export default AuditLogSchema;
