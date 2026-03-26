// src/models/schemas/WebChatSession.js
/**
 * WebChatSession Model
 * Tracks visitor sessions for WebChat widget with dedicated contact links
 */

import mongoose from 'mongoose';

const WebChatSessionSchema = new mongoose.Schema({
  // Unique session identifier
  sessionId: {
    type: String,
    required: true,
    unique: true,
  },

  // Visitor identifier
  visitorId: {
    type: String,
    required: true,
  },

  // Widget identifier
  widgetId: {
    type: String,
    required: true,
  },

  // Channel account reference
  channelAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanyAccount',
    required: true,
  },

  // ✅ NEW: Contact association (permanent link)
  contactId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    sparse: true, // Allow null for first-time visitors
    index: true, // ✅ Single index definition
  },

  // ✅ NEW: 4-digit PIN code (hashed)
  pinHash: {
    type: String,
    sparse: true,
    index: true, // ✅ Single index definition
  },

  // ✅ NEW: Dedicated contact link (unique per contact)
  // Note: unique: true automatically creates an index, so we don't need schema.index()
  contactLink: {
    type: String,
    unique: true,
    sparse: true,
  },

  // ✅ NEW: Contact information (collected on first access)
  contactInfo: {
    name: String,
    email: String,
    phone: String,
    collectedAt: Date,
  },

  // ✅ NEW: Department routing
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true,
  },

  // Associated conversation (created on first message)
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
  },

  // Session status
  status: {
    type: String,
    enum: ['active', 'idle', 'disconnected', 'closed', 'authenticated', 'pending_auth'],
    default: 'pending_auth', // ✅ NEW: Start with pending_auth
  },

  // ✅ NEW: Authentication status
  isAuthenticated: {
    type: Boolean,
    default: false,
  },

  // ✅ NEW: JWT token (optional, stored for session management)
  token: {
    type: String,
    sparse: true, // Allow multiple nulls
    // Note: index is defined below, not here to avoid duplicate
  },

  // ✅ NEW: First-time visitor flag
  isFirstTime: {
    type: Boolean,
    default: true,
  },

  // Visitor metadata
  metadata: {
    ip: String,
    userAgent: String,
    referrer: String,
    page: String,
    language: String,
    timezone: String,
    customData: mongoose.Schema.Types.Mixed,
  },

  // Session tracking
  createdAt: {
    type: Date,
    default: Date.now,
  },

  lastActivityAt: {
    type: Date,
    default: Date.now,
  },

  authenticatedAt: {
    type: Date,
  },

  disconnectedAt: {
    type: Date,
  },

  closedAt: {
    type: Date,
  },

  // Session duration (calculated on close)
  durationSeconds: {
    type: Number,
  },

  // Message count
  messageCount: {
    type: Number,
    default: 0,
  },

  // ✅ NEW: Created by (agent/admin who generated the link)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
});

// Indexes for efficient queries (contactId, pinHash, and contactLink already indexed in schema definition above)
WebChatSessionSchema.index({ widgetId: 1, createdAt: -1 });
WebChatSessionSchema.index({ status: 1, lastActivityAt: -1 });
WebChatSessionSchema.index({ conversationId: 1 });
WebChatSessionSchema.index({ token: 1 }, { sparse: true }); // ✅ Sparse index to allow multiple nulls

// Auto-update lastActivityAt
WebChatSessionSchema.pre('save', function(next) {
  this.lastActivityAt = new Date();
  next();
});

// Calculate duration on close
WebChatSessionSchema.methods.close = function() {
  this.status = 'closed';
  this.closedAt = new Date();
  this.durationSeconds = Math.floor(
    (this.closedAt - this.createdAt) / 1000
  );
  return this.save();
};

// ✅ NEW: Verify PIN code (using bcrypt for secure comparison)
WebChatSessionSchema.methods.verifyPin = async function(pin) {
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(pin, this.pinHash);
};

// ✅ NEW: Set PIN code (using bcrypt with salt)
WebChatSessionSchema.methods.setPin = async function(pin) {
  const bcrypt = await import('bcryptjs');
  this.pinHash = await bcrypt.hash(pin, 10);
  return this.save();
};

// Export model getter function
export function getWebChatSessionModel(connection) {
  if (connection.models.WebChatSession) {
    return connection.models.WebChatSession;
  }
  return connection.model('WebChatSession', WebChatSessionSchema);
}

export default WebChatSessionSchema;
