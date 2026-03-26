// src/models/schemas/CallLog.js
import mongoose from 'mongoose';

const CallLogSchema = new mongoose.Schema({
  cdrId: {
    type: String,
    index: true
  },
  operatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation'
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CallGroup'
  },
  callerNumber: {
    type: String,
    required: true
  },
  receiverNumber: {
    type: String,
    required: true
  },
  callLength: {
    type: String,
    required: true
  },
  direction: {
    type: String,
    enum: ['incoming', 'outgoing'],
    required: true
  },
  status: {
    type: String
  },
  recordingLink: {
    type: String
  },
  type: {
    type: String,
    default: 'human'
  },
  transcript: {
    type: String
  },
  summary: {
    type: String
  },

  cdrData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isResolved: {
    type: Boolean,
    default: false
  },

  overallSentiment: {
    score: { type: Number }, // 0–100
    label: { type: String, enum: ['poor', 'neutral', 'positive'] },
    description: { type: String } 
  },
  

  // Talk / Listen Ratio
  talkListenRatio: {
    agentTalkPercentage: { type: Number },
    agentListenPercentage: { type: Number }
  },

  // Detailed sentiment timeline
  detailedSentiment: [{
    startSecond: Number,
    endSecond: Number,
    speaker: { type: String, enum: ['agent', 'customer'] },
    sentimentScore: Number,  // 0-100
    sentimentLabel: { type: String, enum: ['poor', 'neutral', 'positive'] },
    text: String             // transcript chunk for this segment
  }],

  // AI Smart Notes
  smartNotes: [{
    title: String,
    notes: String,
    createdBy: { type: String, default: 'ai' }
  }],
  
  isProcessing: {
    type: String,
    enum: ['processing', 'success', 'failure'],
    default: null
  },
  

}, {
  timestamps: true
});

// Indexes
CallLogSchema.index({ cdrId: 1 });
CallLogSchema.index({ operatorId: 1 });
CallLogSchema.index({ conversationId: 1 });
CallLogSchema.index({ groupId: 1 });
CallLogSchema.index({ callerNumber: 1 });
CallLogSchema.index({ receiverNumber: 1 });
CallLogSchema.index({ direction: 1 });
CallLogSchema.index({ status: 1 });
CallLogSchema.index({ createdAt: -1 }); // For recent calls first
CallLogSchema.index({ operatorId: 1, createdAt: -1 }); // For operator's call history

export default CallLogSchema;
