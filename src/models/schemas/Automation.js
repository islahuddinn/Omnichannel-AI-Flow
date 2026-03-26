// src/models/schemas/Automation.js
import mongoose from 'mongoose';

const AutomationSchema = new mongoose.Schema({
  // Basic Info
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  // Automation Type
  type: {
    type: String,
    enum: ['owm'], // One Way Messages - can be extended later
    required: true,
    default: 'owm'
  },
  
  // Status
  isPublished: {
    type: Boolean,
    default: false
  },
  
  // Departments (many-to-many)
  departments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  }],
  
  // Channel Configuration (fallback chain)
  // Order matters - first is primary, others are fallbacks
  channels: [{
    channel: {
      type: String,
      enum: ['whatsapp', 'email', 'sms', 'webchat'],
      required: true
    },
    channelAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompanyAccount',
      required: true
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Template',
      required: true
    },
    // Custom content for this automation (overrides template content)
    // For WhatsApp: content is not editable/viewable
    customContent: {
      body: String, // For SMS, Email, WebChat
      subject: String, // For Email only
      // WhatsApp uses template only, no custom content
    }
  }],
  
  // Trigger Conditions
  triggerConditions: {
    contactType: {
      type: String,
      enum: ['handyman', 'customer', 'both'],
      required: true
    },
    conditions: [{
      entity: {
        type: String,
        enum: ['contact', 'deal'],
        required: true
      },
      field: {
        type: String,
        required: true
      },
      selectedValue: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
      },
      logicalOperator: {
        type: String,
        enum: ['AND', 'OR'],
        default: 'AND'
      }
    }]
  },
  
  // Timing Configuration
  timing: {
    type: {
      type: String,
      enum: ['immediate', 'delayed', 'schedule'],
      required: true
    },
    // For delayed
    delay: {
      days: { type: Number, default: 0 },
      hours: { type: Number, default: 0 },
      minutes: { type: Number, default: 0 }
    },
    // For schedule
    scheduledAt: Date
  },
  
  // Statistics
  statistics: {
    totalSent: { type: Number, default: 0 },
    totalFailed: { type: Number, default: 0 },
    lastExecutedAt: Date
  },
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  tenantId: {
    type: String,
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

AutomationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes
AutomationSchema.index({ tenantId: 1, isPublished: 1 });
AutomationSchema.index({ tenantId: 1, type: 1 });
AutomationSchema.index({ 'departments': 1 });
AutomationSchema.index({ createdAt: -1 });
// Enforce unique automation names per tenant at DB level
AutomationSchema.index({ tenantId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export default AutomationSchema;

