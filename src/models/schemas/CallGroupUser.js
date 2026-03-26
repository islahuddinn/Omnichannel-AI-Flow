// src/models/schemas/CallGroupUser.js
import mongoose from 'mongoose';

const CallGroupUserSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CallGroup',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Compound unique index to prevent duplicate group-user associations
CallGroupUserSchema.index({ groupId: 1, userId: 1 }, { unique: true });
CallGroupUserSchema.index({ groupId: 1 });
CallGroupUserSchema.index({ userId: 1 });

export default CallGroupUserSchema;
