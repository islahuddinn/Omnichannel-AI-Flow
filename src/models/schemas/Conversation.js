



// src/models/schemas/Conversation.js
import mongoose from 'mongoose';

const ConversationSchema = new mongoose.Schema({
  contact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    required: true
  },
  channel: {
    type: String,
    enum: ['whatsapp', 'facebook', 'instagram', 'sms', 'email', 'webchat', 'call'],
    required: true
  },
  channelAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanyAccount',
    required: true
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['active', 'pending', 'closed', 'archived', 'deleted'], // ✅ Removed 'merged' - use isMerged flag instead
    default: 'active'
  },
  mode: {
    type: String,
    enum: ['manual', 'auto'],
    default: 'auto', // ✅ Default to 'auto' (Hybrid mode)
    lowercase: true // ✅ Normalize case variants
  },

  // Bot failure tracking — populated when AI bot fails to respond in auto mode
  botFailure: {
    failed: { type: Boolean, default: false },
    reason: {
      type: String,
      enum: ['timeout', 'api_error', 'empty_response', 'circuit_breaker_open'],
    },
    failedAt: Date,
    escalatedAt: Date,
    failureCount: { type: Number, default: 0 },
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  tags: [String],
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  lastMessageContent: String, // User-friendly preview for UI
  lastMessageType: String, // text, image, video, audio, document, etc.
  lastMessageDirection: { type: String, enum: ['inbound', 'outbound'] },
  lastMessageAt: Date,
  messageCount: { type: Number, default: 0 },
  unreadCount: { type: Number, default: 0 },

  // WhatsApp session tracking
  whatsappSessionActive: { type: Boolean, default: false },
  whatsappSessionExpiry: Date,
  lastInboundMessageAt: Date,

  // Merge functionality
  isMerged: { type: Boolean, default: false },
  mergedConversations: [{
    conversationId: mongoose.Schema.Types.ObjectId,
    channel: String,
    channelAccount: mongoose.Schema.Types.ObjectId
  }],
  primaryConversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation'
  },
  autoMergeDisabled: { type: Boolean, default: false },

  mergeHistory: [{
    action: { type: String, enum: ['merge', 'unmerge'] },
    conversations: [mongoose.Schema.Types.ObjectId],
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    performedAt: { type: Date, default: Date.now },
    reason: String
  }],

  // Transfer functionality
  transferHistory: [{
    fromDepartment: mongoose.Schema.Types.ObjectId,
    fromAgent: mongoose.Schema.Types.ObjectId,
    toDepartment: mongoose.Schema.Types.ObjectId,
    toAgent: mongoose.Schema.Types.ObjectId,
    reason: String,
    transferredBy: mongoose.Schema.Types.ObjectId,
    transferredAt: { type: Date, default: Date.now }
  }],

  // 🔹 New fields matching actions route
  isPinned: { type: Boolean, default: false },
  pinnedAt: Date,
  pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  isMuted: { type: Boolean, default: false },
  mutedAt: Date,
  mutedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  mutedUntil: Date,

  isSnoozed: { type: Boolean, default: false },
  snoozedAt: Date,
  snoozedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  snoozedUntil: Date,

  isStarred: { type: Boolean, default: false },
  starredAt: Date,
  starredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  archivedAt: Date,
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  deletedAt: Date,
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  closedAt: Date,
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  closeReason: String,

  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Testing Persona fields (for OWM automation testing) - REMOVED: Use same conversations as normal messages
  // isTestingPersona: { type: Boolean, default: false },
  // testingPersonaId: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: 'TestingPersona',
  //   default: null
  // },
  // testingAutomationId: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: 'Automation',
  //   default: null
  // },
  identifier: {
    type: String,
    default: null,
    index: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

ConversationSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

ConversationSchema.index({ contact: 1, channel: 1 });
ConversationSchema.index({ status: 1, assignedTo: 1 });
ConversationSchema.index({ department: 1, status: 1 });
ConversationSchema.index({ lastMessageAt: -1 });
ConversationSchema.index({ primaryConversation: 1 });
ConversationSchema.index({ channelAccount: 1, status: 1 });
// Composite indexes for common query patterns
ConversationSchema.index({ department: 1, status: 1, lastMessageAt: -1 });
ConversationSchema.index({ contact: 1, status: 1, channel: 1 });

export default ConversationSchema;
