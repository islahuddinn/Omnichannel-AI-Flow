// src/models/schemas/Deal.js
import mongoose from 'mongoose';

const DealSchema = new mongoose.Schema({
  // Deal ID from CSV (primary identifier for duplicates)
  deal_id: {
    type: String,
    sparse: true,
    index: true,
  },
  
  // Basic deal info (only essential fields)
  name: String,
  stage: String,
  status: String,
  
  // Deal details - all dynamic fields from Salesforce CSV
  // Using Mixed type to store any structure without casting issues
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Metadata
  metadata: {
    source: String,
    importedAt: Date,
    rowIndex: Number,
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Activity tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  strict: false, // Allow fields not in schema (like tenantId/companyId if added elsewhere)
});

// Indexes for performance
DealSchema.index({ deal_id: 1 });
DealSchema.index({ createdAt: -1 });
// ✅ Compound index on deal_id + companyId for optimized queries (similar to contacts)
DealSchema.index({ deal_id: 1, companyId: 1 }, { unique: true, sparse: true });

// Update updatedAt on save
DealSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default DealSchema;

