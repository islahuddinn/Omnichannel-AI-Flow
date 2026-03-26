

// src/models/schemas/Contact.js
import mongoose from 'mongoose';

const ContactSchema = new mongoose.Schema({
  // Basic info
  name: String,
  firstName: String,
  lastName: String,
  displayName: String,
  
  // Primary contact methods
  email: {
    type: String,
    sparse: true,
    lowercase: true,
    index: true // ✅ Single index definition
  },
  phone: {
    type: String,
    sparse: true,
    index: true // ✅ Single index definition
  },
  
  avatar: String,
  
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  
  tags: [String],
  
  // Channel identifiers
  identifiers: {
    whatsapp: String,
    facebook: String,
    instagram: String,
    sms: String,
    email: String,
    webchat: String,
    call: String
  },
  
  // ✅ WebChat link (full URL)
  webchatLink: {
    type: String,
    sparse: true,
  },
  
  // ✅ WebChat profile settings
  webchatSettings: {
    // Selected notification tune
    selectedNotificationTune: {
      type: String,
      default: 'default', // 'default' or custom tune URL
    },
    // Custom notification tunes (array of URLs)
    notificationTunes: [{
      name: String,
      url: String,
      uploadedAt: Date,
    }],
  },
  
  // Additional info
  company: String,
  jobTitle: String,
  timezone: String,
  language: String,
  
  // ✅ Salesforce/CRM fields (using underscore naming convention)
  SF_id: {
    type: String,
    sparse: true,
    index: true,
  },
  Salutation: {
    type: String,
    sparse: true,
  },
  Contact_Type: {
    type: String,
    sparse: true,
    index: true,
  },
  
  // ✅ Status field (using underscore naming convention)
  Is_Active: {
    type: Boolean,
    default: true,
    index: true,
  },
  
  // ✅ Mobile App fields for Handyman
  mobileAppEnabled: {
    type: Boolean,
    default: false,
    index: true,
  },
  mobilePassword: {
    type: String,
    select: false, // Don't return password by default
  },
  mobilePasswordChanged: {
    type: Boolean,
    default: false,
  },
  mobilePasswordExpiresAt: {
    type: Date,
  },
  mobileLastLogin: {
    type: Date,
  },
  mobileRefreshToken: {
    type: String,
    select: false,
  },
  
  // ✅ Details: Store all dynamic/unknown fields from CSV/CRM imports
  // Using Mixed type instead of Map to avoid casting issues with plain objects
  // MongoDB will store this as a nested document, allowing hundreds of fields efficiently
  // Example: { "Salesforce_ID": "123", "Account_Name": "ABC Corp", "Industry": "Tech", ... }
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // ✅ Custom Fields: User-defined custom fields for contacts
  // Structure: { fieldId: { name, type, value, options, defaultValue } }
  // type: 'text' | 'dropdown'
  // options: [{ label, value }] (only for dropdown type)
  // value: string (for text) or string (selected option value for dropdown)
  customFields: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  metadata: {
    source: String,
    referrer: String,
    userAgent: String,
    ipAddress: String,
    // Additional metadata fields - using Mixed type instead of Map to avoid casting issues
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Activity tracking
  lastInteraction: Date,
  conversationCount: { type: Number, default: 0 },
  messageCount: { type: Number, default: 0 },
  
  // Merge tracking
  mergedFrom: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact'
  }],
  
  // Block functionality
  blocked: { type: Boolean, default: false },
  blockedAt: Date,
  blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
    // ========== AUTO-MERGE FEATURE ==========
  autoMergeDisabled: {
    type: Boolean,
    default: false,
    // When true, conversations won't auto-merge for this contact
  },
  
  // Testing Persona fields (for OWM automation testing)
  isTestingPersona: { type: Boolean, default: false },
  testingPersonaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestingPersona',
    default: null
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

// Pre-save hook
ContactSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Generate displayName if not provided
  if (!this.displayName) {
    if (this.firstName || this.lastName) {
      this.displayName = `${this.firstName || ''} ${this.lastName || ''}`.trim();
    } else if (this.name) {
      this.displayName = this.name;
    } else if (this.phone) {
      this.displayName = this.phone;
    } else if (this.email) {
      this.displayName = this.email;
    } else if (this.identifiers?.call) {
      this.displayName = this.identifiers.call;
    }
  }
  
  // Sync identifiers with main fields
  if (this.phone && !this.identifiers?.whatsapp) {
    if (!this.identifiers) this.identifiers = {};
    this.identifiers.whatsapp = this.phone;
    this.identifiers.sms = this.phone;
  }
  
  if (this.email && !this.identifiers?.email) {
    if (!this.identifiers) this.identifiers = {};
    this.identifiers.email = this.email;
  }
  if (this.phone && !this.identifiers?.call) {
    if (!this.identifiers) this.identifiers = {};
    this.identifiers.call = this.phone;
  }
  next();
});

// Indexes (email and phone already indexed in schema definition above)
ContactSchema.index({ tags: 1 });
ContactSchema.index({ department: 1 });
ContactSchema.index({ lastInteraction: -1 });
ContactSchema.index({ 'identifiers.whatsapp': 1 });
ContactSchema.index({ 'identifiers.facebook': 1 });
ContactSchema.index({ 'identifiers.instagram': 1 });
ContactSchema.index({ 'identifiers.email': 1 });
ContactSchema.index({ 'identifiers.webchat': 1 });
ContactSchema.index({ 'identifiers.call': 1 });

// ✅ Unique compound index on SF_id + companyId to prevent duplicates
// Using sparse: true allows multiple null SF_id values
ContactSchema.index({ SF_id: 1, companyId: 1 }, { unique: true, sparse: true });
ContactSchema.index({ displayName: 'text', name: 'text' });

export default ContactSchema;