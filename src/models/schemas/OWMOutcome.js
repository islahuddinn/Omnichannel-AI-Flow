// src/models/schemas/OWMOutcome.js
import mongoose from 'mongoose';

const OWMOutcomeSchema = new mongoose.Schema({
  outcomeName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  possibleOutcome: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },

  // Reference to Automation
  automationId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Automation',
    index: true
  },

  // Order/position in the flow
  order: {
    type: Number,
    default: 0
  },

  tenantId: {
    type: String,
    required: true,
    index: true
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

OWMOutcomeSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

OWMOutcomeSchema.index({ tenantId: 1, automationId: 1 });
OWMOutcomeSchema.index({ tenantId: 1, automationId: 1, order: 1 });
OWMOutcomeSchema.index({ createdAt: -1 });

export default OWMOutcomeSchema;
