// src/models/schemas/WebChatOTP.js
/**
 * WebChat OTP Schema (Tenant-specific)
 * Used for PIN reset in WebChat - stored in tenant database, not main database
 */
import mongoose from 'mongoose';

const WebChatOTPSchema = new mongoose.Schema({
  // Contact email or phone (identifier)
  identifier: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  otp: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['pin_reset'],
    default: 'pin_reset'
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    required: true
  },
  attempts: {
    type: Number,
    default: 0,
    max: 3
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster lookups
WebChatOTPSchema.index({ identifier: 1, type: 1 });

// TTL Index - Auto-delete expired documents (1 hour)
WebChatOTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default WebChatOTPSchema;

