// src/models/schemas/PbxExtension.js
import mongoose from 'mongoose';

const PbxExtensionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  extension_hash: {
    type: String,
    required: true
  },
  internal_extension: {
    type: Number,
    required: true
  },
  sip_username: {
    type: String,
    required: true,
    unique: true
  },
  sip_password: {
    type: String,
    required: true
  },
  extension_plan: {
    type: String,
    required: true
  },
  outroute: {
    type: String,
    required: true
  },
  codec_priority: {
    type: String
  },
  nat: {
    type: Number,
    default: 1
  },
  webrtc: {
    type: Number,
    default: 1
  },
  // Newly added fields from PBX API update payload
  inbound_calls: {
    type: String,
    default: "yes"
  },
  outgoing_calls: {
    type: String,
    default: "allowed"
  },
  waiting_in_line: {
    type: String,
    default: "yes"
  },
  playback_during_paused: {
    type: String,
    default: "yes"
  },
  playback: {
    type: String,
    default: "yes"
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

// Update the updatedAt field before saving
PbxExtensionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

PbxExtensionSchema.index({ internal_extension: 1 });

export default PbxExtensionSchema;
