// src/models/MergeHistory.js
/**
 * MergeHistory Model
 * Tracks all conversation merge and unmerge operations
 */

import mongoose from 'mongoose';

const MergeHistorySchema = new mongoose.Schema({
  // Contact reference
  contactId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    required: true,
  },

  // Primary conversation (the one kept after merge)
  primaryConversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  },

  // Conversations that were merged
  mergedConversationIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
  }],

  // Channels involved in the merge
  channels: [{
    type: String,
    enum: ['whatsapp', 'facebook', 'instagram', 'sms', 'email', 'webchat'],
  }],

  // Action type
  action: {
    type: String,
    enum: ['merge', 'unmerge'],
    default: 'merge',
  },

  // Whether this was automatic or manual
  automatic: {
    type: Boolean,
    default: false,
  },

  // User who performed the action (userId or 'system')
  performedBy: {
    type: String,
    required: true,
  },

  // When the action was performed
  performedAt: {
    type: Date,
    default: Date.now,
  },

  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
});

// Indexes for efficient queries
MergeHistorySchema.index({ contactId: 1, performedAt: -1 });
MergeHistorySchema.index({ primaryConversationId: 1, performedAt: -1 });
MergeHistorySchema.index({ mergedConversationIds: 1 });

// Export model getter function
export function getMergeHistoryModel(connection) {
  if (connection.models.MergeHistory) {
    return connection.models.MergeHistory;
  }
  return connection.model('MergeHistory', MergeHistorySchema);
}

export default MergeHistorySchema;