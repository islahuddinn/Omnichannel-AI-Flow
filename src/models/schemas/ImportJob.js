// src/models/schemas/ImportJob.js
/**
 * Import Job Schema
 * Tracks CSV contact import progress and status
 */

import mongoose from 'mongoose';

const ImportJobSchema = new mongoose.Schema({
  // Job identification
  jobId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  
  // Tenant and company
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
    ref: 'Company',
  },
  
  // User who initiated import
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  
  // File information
  fileName: {
    type: String,
    required: true,
  },
  filePath: {
    type: String,
    required: true,
  },
  fileSize: {
    type: Number,
  },
  
  // Import options
  options: {
    batchSize: { type: Number, default: 1000 },
    departmentId: mongoose.Schema.Types.ObjectId,
    channelAccountId: mongoose.Schema.Types.ObjectId,
  },
  
  // Field mapping (detected from CSV headers)
  headers: [String],
  fieldMapping: {
    standard: Map,
    custom: [{
      name: String,
      index: Number,
    }],
    identifiers: Map,
  },
  
  // Progress tracking
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true,
  },
  totalRecords: {
    type: Number,
    default: 0,
  },
  processedRecords: {
    type: Number,
    default: 0,
  },
  successfulImports: {
    type: Number,
    default: 0,
  },
  failedImports: {
    type: Number,
    default: 0,
  },
  skippedImports: {
    type: Number,
    default: 0,
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  
  // Errors (using importErrors to avoid Mongoose reserved keyword warning)
  importErrors: [{
    row: Number,
    field: String,
    error: String,
  }],
  error: String,
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  startedAt: Date,
  completedAt: Date,
  failedAt: Date,
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: false, // We handle timestamps manually
});

// Indexes
ImportJobSchema.index({ tenantId: 1, status: 1 });
ImportJobSchema.index({ companyId: 1, createdAt: -1 });
ImportJobSchema.index({ userId: 1, createdAt: -1 });

// Update updatedAt on save
ImportJobSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default ImportJobSchema;

