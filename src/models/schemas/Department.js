
// src/models/schemas/Department.js
import mongoose from 'mongoose';

const DepartmentSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  code: {
    type: String,
    trim: true,
    uppercase: true,
    sparse: true // ✅ Allow null values and make sparse index work correctly
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  agents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  assignedChannels: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanyAccount'
  }],
  metadata: {
    totalConversations: { type: Number, default: 0 },
    activeConversations: { type: Number, default: 0 },
    averageResponseTime: { type: Number, default: 0 }
  },
  // AI Bot configuration for this department
  aiBotEnabled: {
    type: Boolean,
    default: false, // Disabled by default
    index: true
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

DepartmentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

DepartmentSchema.index({ name: 1 });
DepartmentSchema.index({ status: 1 });
// ✅ Sparse index: allows multiple null values, but ensures uniqueness for non-null values
DepartmentSchema.index({ code: 1, companyId: 1 }, { unique: true, sparse: true });

export default DepartmentSchema;