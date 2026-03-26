// src/models/schemas/OTP.js
import mongoose from 'mongoose';

const OTPSchema = new mongoose.Schema({
  email: {
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
    enum: ['password_reset', 'email_verification'],
    default: 'password_reset'
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
OTPSchema.index({ email: 1, type: 1 });

// TTL Index - Auto-delete expired documents (1 hour)
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default OTPSchema;

