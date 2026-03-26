// src/models/schemas/OWMOutcomeMatch.js
import mongoose from 'mongoose';

const OWMOutcomeMatchSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },

  contactId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    index: true
  },

  automationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Automation',
    required: true,
    index: true
  },

  owmOutcomeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OWMOutcome',
    required: true,
    index: true
  },

  // Denormalized names for fast display without joins
  automationName: { type: String, default: '' },
  outcomeName: { type: String, default: '' },

  // Status: 0 = pending, 1 = matched
  status: {
    type: Number,
    enum: [0, 1],
    default: 0,
    index: true
  },

  // Stage lifecycle: pending → matched → action_taken
  stage: {
    type: String,
    enum: ['pending', 'matched', 'action_taken', 'ignored'],
    default: 'pending',
    index: true
  },

  // Which channel the customer responded on
  channelType: {
    type: String,
    enum: ['whatsapp', 'email', 'sms', 'webchat', 'facebook', 'instagram'],
  },

  // ── Match details ──
  confidenceScore: { type: Number, min: 0, max: 1, default: null },
  matchSource: {
    type: String,
    enum: ['ai', 'manual'],
    default: null
  },
  matchedMessageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  matchedAt: { type: Date, default: null },
  matchedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // The actual text the customer sent (for easy reporting)
  customerMessage: { type: String, default: '' },

  // AI reasoning for why this outcome was matched
  aiReasoning: { type: String, default: '' },

  // How long AI took to match (ms)
  matchDurationMs: { type: Number, default: null },

  // ── Follow-up action details ──
  followUpSent: { type: Boolean, default: false },
  followUpMessageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  followUpSentAt: { type: Date, default: null },

  // When follow-up action was acknowledged/completed
  actionTakenAt: { type: Date, default: null },
  actionTakenBy: {
    type: String, // 'ai_bot' for auto, userId for manual
    default: null
  },

  // ── Salesforce update tracking ──
  salesforceUpdates: [{
    object: { type: String, enum: ['Deal__c', 'Contact'] },
    recordId: String,
    status: { type: String, enum: ['success', 'failed', 'skipped'] },
    fieldsUpdated: [String],
    payload: mongoose.Schema.Types.Mixed,
    error: String,
    reason: String,
    updatedAt: { type: Date, default: Date.now },
  }],

  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  tenantId: {
    type: String,
    required: true,
    index: true
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

OWMOutcomeMatchSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Unique compound index
OWMOutcomeMatchSchema.index(
  { tenantId: 1, conversationId: 1, automationId: 1, owmOutcomeId: 1 },
  { unique: true }
);

OWMOutcomeMatchSchema.index({ tenantId: 1, automationId: 1, status: 1 });
OWMOutcomeMatchSchema.index({ tenantId: 1, owmOutcomeId: 1, status: 1 });
OWMOutcomeMatchSchema.index({ tenantId: 1, contactId: 1, status: 1 });
OWMOutcomeMatchSchema.index({ tenantId: 1, stage: 1, status: 1 });
OWMOutcomeMatchSchema.index({ tenantId: 1, conversationId: 1, status: 1 });
OWMOutcomeMatchSchema.index({ matchedAt: -1 });
OWMOutcomeMatchSchema.index({ createdAt: -1 });

export default OWMOutcomeMatchSchema;
