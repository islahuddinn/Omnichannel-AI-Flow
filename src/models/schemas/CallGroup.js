// src/models/schemas/CallGroup.js
import mongoose from 'mongoose';

const CallGroupSchema = new mongoose.Schema({
  groupName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  incomingRoutingStrategy: {
    type: String
  },
  timeToRingOperator: {
    type: String
  },
  allowCallsWaitingInLine: {
    type: Boolean,
    default: false
  },
  musicOnHold: {
    type: Boolean,
    default: false
  },
  incomingCallsWaitingOptions: {
    type: String
  },
  redirectToOccupiedOperators: {
    type: Boolean,
    default: false
  },
  outboundPhoneNumbers: {
    type: mongoose.Schema.Types.Mixed, // JSON array
    default: []
  },
  primaryOutboundNumber: {
    type: String
  },
  exceptionOutboundNumbers: {
    type: mongoose.Schema.Types.Mixed, // JSON array
    default: []
  },
  pbxHash: {
    type: String
  },
  // Music file selection
  musicFileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AudioFile'
  },
  musicFileUrl: {
    type: String
  },
  departmentIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  }]
}, {
  timestamps: true
});

// Indexes
CallGroupSchema.index({ groupName: 1 });
CallGroupSchema.index({ pbxHash: 1 });

export default CallGroupSchema;
