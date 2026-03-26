// src/models/schemas/StatusHistory.js
import mongoose from 'mongoose';

const StatusHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  statusType: {
    type: String,
    enum: ['call', 'chat'],
    required: true
  },
  previousStatus: {
    type: String
  },
  newStatus: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
StatusHistorySchema.index({ userId: 1 });
StatusHistorySchema.index({ statusType: 1 });
StatusHistorySchema.index({ timestamp: -1 }); // For recent status changes first
StatusHistorySchema.index({ userId: 1, statusType: 1, timestamp: -1 }); // Compound index for user status history

export default StatusHistorySchema;
