// src/models/schemas/AIPrompt.js
import mongoose from 'mongoose';

const AIPromptSchema = new mongoose.Schema({
  // Module ID - references the module (e.g., automation ID for OWM)
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  
  // Module ID Description - describes what module this prompt belongs to
  // Examples: 'OWM' (One Way Messages), 'Conversation', 'Contact', etc.
  // For channels: 'whatsapp-customer-prompt', 'whatsapp-handyman-prompt', 'sms-customer-prompt', etc.
  moduleIdDescription: {
    type: String,
    required: true,
    index: true
  },
  
  // The actual AI prompt text
  prompt: {
    type: String,
    required: true,
    trim: true,
    default: ''
  },
  
  // Optional: Prompt name/title for better organization
  name: {
    type: String,
    trim: true,
    default: ''
  },
  
  // Optional: Prompt description
  description: {
    type: String,
    trim: true,
    default: ''
  },
  
  // Optional: Prompt version for tracking changes
  version: {
    type: Number,
    default: 1
  },
  
  // Optional: Is this prompt active?
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Optional: Prompt metadata (for future extensibility)
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Tenant ID for multi-tenancy
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  
  // User who created this prompt
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // User who last updated this prompt
  updatedBy: {
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

// Pre-save hook to update updatedAt
AIPromptSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
AIPromptSchema.index({ tenantId: 1, moduleId: 1, moduleIdDescription: 1 });
AIPromptSchema.index({ tenantId: 1, moduleIdDescription: 1, isActive: 1 });
AIPromptSchema.index({ createdAt: -1 });

export default AIPromptSchema;

