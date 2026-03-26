// src/models/schemas/CallStatusTab.js
import mongoose from 'mongoose';

const CallStatusTabSchema = new mongoose.Schema({
  status: {
    type: String
  },
  phoneNumber: {
    type: String
  },
  direction: {
    type: String
  },
  time: {
    type: Date
  },
  duration: {
    type: Number // Duration in seconds
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
});

// Indexes for efficient queries
CallStatusTabSchema.index({ userId: 1 });
CallStatusTabSchema.index({ status: 1 });
CallStatusTabSchema.index({ phoneNumber: 1 });
CallStatusTabSchema.index({ direction: 1 });
CallStatusTabSchema.index({ time: -1 }); // Descending for recent calls first
CallStatusTabSchema.index({ userId: 1, time: -1 }); // Compound index for user's recent calls

export default CallStatusTabSchema;
