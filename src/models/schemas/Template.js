// // src/models/schemas/Template.js
// import mongoose from 'mongoose';

// const TemplateSchema = new mongoose.Schema({
//   name: {
//     type: String,
//     required: true
//   },
  
//   // For WhatsApp only
//   templateLanguage: String,
  
//   // For other platforms
//   body: String,
//   subject: String, // For email
  
//   channel: {
//     type: String,
//     enum: ['whatsapp', 'sms', 'email', 'webchat'],
//     required: true
//   },
  
//   companyAccounts: [{
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'CompanyAccount'
//   }],
  
//   category: String,
  
//   // Template parameters
//   parameters: [{
//     name: String,
//     type: { type: String, enum: ['text', 'number', 'date'] },
//     required: { type: Boolean, default: false }
//   }],
  
//   isActive: { type: Boolean, default: true },
  
//   usageCount: { type: Number, default: 0 },
  
//   createdBy: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User'
//   },
  
//   createdAt: {
//     type: Date,
//     default: Date.now
//   },
//   updatedAt: {
//     type: Date,
//     default: Date.now
//   }
// });

// TemplateSchema.pre('save', function(next) {
//   this.updatedAt = Date.now();
//   next();
// });

// TemplateSchema.index({ channel: 1, isActive: 1 });
// TemplateSchema.index({ companyAccounts: 1 });
// TemplateSchema.index({ name: 'text' });

// export default TemplateSchema;



// src/models/schemas/Template.js
import mongoose from 'mongoose';

const TemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  // Channel type
  channel: {
    type: String,
    enum: ['whatsapp', 'sms', 'email', 'webchat'],
    required: true
  },
  
  // Linked company accounts (many-to-many)
  companyAccounts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanyAccount',
    required: true
  }],
  
  // WhatsApp specific fields
  templateLanguage: {
    type: String,
    required: function() { return this.channel === 'whatsapp'; }
  },
  
  // Other channels fields
  body: {
    type: String,
    required: function() { return this.channel !== 'whatsapp'; }
  },
  
  // Email specific
  subject: {
    type: String,
    required: function() { return this.channel === 'email'; }
  },
  
  // Categorization
  category: String,
  
  // Template parameters for dynamic content
  parameters: [{
    name: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['text', 'number', 'date'],
      default: 'text'
    },
    required: {
      type: Boolean,
      default: false
    }
  }],
  
  // Status and usage tracking
  isActive: {
    type: Boolean,
    default: true
  },
  
  usageCount: {
    type: Number,
    default: 0
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

TemplateSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for performance
TemplateSchema.index({ channel: 1, isActive: 1 });
TemplateSchema.index({ companyAccounts: 1 });
TemplateSchema.index({ name: 'text', body: 'text' });
TemplateSchema.index({ tenantId: 1 });
TemplateSchema.index({ createdBy: 1 });

export default TemplateSchema;