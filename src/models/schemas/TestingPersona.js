// src/models/schemas/TestingPersona.js
import mongoose from 'mongoose';

const TestingPersonaSchema = new mongoose.Schema({
  // Reference to the automation
  automationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Automation',
    required: true,
    index: true
  },
  
  // Reference to existing contact (if added from contacts)
  contactId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    default: null,
    index: true
  },
  
  // Persona details (if created manually)
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: null
  },
  
  phone: {
    type: String,
    trim: true,
    default: null
  },
  
  // Additional fields
  customFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Statistics
  statistics: {
    messagesSent: { type: Number, default: 0 },
    messagesDelivered: { type: Number, default: 0 },
    messagesRead: { type: Number, default: 0 },
    messagesFailed: { type: Number, default: 0 },
    lastMessageSentAt: Date,
    outcomesMatched: [{
      outcomeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OWMOutcome'
      },
      matchedAt: Date,
      confidenceScore: Number
    }]
  },
  
  // Tenant ID for multi-tenancy
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  
  // User who created this persona
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
TestingPersonaSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
TestingPersonaSchema.index({ tenantId: 1, automationId: 1 });
TestingPersonaSchema.index({ tenantId: 1, contactId: 1 });
TestingPersonaSchema.index({ createdAt: -1 });

// ✅ Unique indexes to prevent duplicate email/phone per automation (only when non-null)
TestingPersonaSchema.index(
  { tenantId: 1, automationId: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
);
TestingPersonaSchema.index(
  { tenantId: 1, automationId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string' } } }
);

export default TestingPersonaSchema;

