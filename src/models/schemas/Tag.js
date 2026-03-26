// src/models/schemas/Tag.js
import mongoose from 'mongoose';

const TagSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  color: {
    type: String,
    default: '#6366f1'
  },
  description: String,
  type: {
    type: String,
    enum: ['contact', 'conversation', 'general'],
    default: 'general'
  },
  usageCount: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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

TagSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

TagSchema.index({ name: 1 });
TagSchema.index({ type: 1 });

export default TagSchema;