// // src/models/schemas/Company.js
// import mongoose from 'mongoose';
// import { COMPANY_STATUS } from '../../config/constants.js';

// const CompanySchema = new mongoose.Schema({
//   name: {
//     type: String,
//     required: true,
//     trim: true
//   },
//   slug: {
//     type: String,
//     unique: true,
//     lowercase: true
//   },
//   email: {
//     type: String,
//     required: true,
//     lowercase: true
//   },
//   phone: {
//     type: String,
//     required: true
//   },
//   address: {
//     street: String,
//     city: String,
//     state: String,
//     country: String,
//     zipCode: String
//   },
//   status: {
//     type: String,
//     enum: Object.values(COMPANY_STATUS),
//     default: COMPANY_STATUS.TRIAL
//   },
//   subscription: {
//     plan: {
//       type: String,
//       default: 'trial'
//     },
//     startDate: {
//       type: Date,
//       default: Date.now
//     },
//     endDate: Date,
//     limits: {
//       users: { type: Number, default: 5 },
//       conversations: { type: Number, default: 1000 },
//       messages: { type: Number, default: 10000 },
//       channels: { type: Number, default: 3 }
//     }
//   },
//   branding: {
//     logo: String,
//     primaryColor: { type: String, default: '#4f46e5' },
//     secondaryColor: { type: String, default: '#6366f1' }
//   },
//   settings: {
//     timezone: { type: String, default: 'UTC' },
//     language: { type: String, default: 'en' },
//     dateFormat: { type: String, default: 'MM/DD/YYYY' },
//     timeFormat: { type: String, default: '12h' }
//   },
//   metadata: {
//     totalUsers: { type: Number, default: 0 },
//     totalConversations: { type: Number, default: 0 },
//     totalMessages: { type: Number, default: 0 },
//     lastActivity: Date
//   },
//   createdBy: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true
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

// CompanySchema.pre('save', function(next) {
//   this.updatedAt = Date.now();
//   if (!this.slug) {
//     this.slug = this.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
//   }
//   next();
// });

// // ✅ FIXED: Removed duplicate index({ slug: 1 }); since unique: true already creates it
// CompanySchema.index({ status: 1 });
// CompanySchema.index({ 'subscription.endDate': 1 });

// export default CompanySchema;


// src/models/schemas/Company.js
import mongoose from 'mongoose';

const CompanySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  
  // Tenant Database Name - stored for quick access
  tenantDatabaseName: {
    type: String,
    unique: true
    // Format: tenant_<companyId>
  },
  
  // ✅ Flag to track if tenant database has been initialized
  // Prevents duplicate initialization if initializeTenantDatabase() is called multiple times
  tenantDatabaseInitialized: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // Company Owner (the user with role 'company_admin')
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
   
  },
  
  // Company Settings
  settings: {
    timezone: { type: String, default: 'UTC' },
    dateFormat: { type: String, default: 'YYYY-MM-DD' },
    language: { type: String, default: 'en' },
    currency: { type: String, default: 'USD' }
  },
  
  // Company Features & Automation
  features: {
    aiBot: {
      enabled: { type: Boolean, default: false },
      // AI provider configuration (Vercel AI SDK direct integration)
      provider: { type: String, default: '' },   // 'openai', 'google', 'anthropic'
      model: { type: String, default: '' },       // e.g. 'gpt-4o-mini', 'gemini-2.0-flash'
      apiKey: { type: String, default: '' },       // Provider API key (encrypted at rest)
      systemPrompt: { type: String, default: '' }, // System instructions for the AI
      temperature: { type: Number, default: 0.7, min: 0, max: 2 },
      maxTokens: { type: Number, default: 1024 },
      // Conversation context — how many recent messages to include
      contextMessageCount: { type: Number, default: 20, min: 1, max: 50 },
      // Legacy fields (kept for backward compatibility during migration)
      baseUrl: { type: String, default: '' },
      apiSecret: { type: String, default: '' },
    }
  },
  
  // Email Settings (company-level defaults for outbound emails)
  emailSettings: {
    fromName: { type: String, default: '', trim: true },       // Sender display name for outbound emails
    replyToEmail: { type: String, default: '', trim: true },   // Reply-to email address
    emailSignature: { type: String, default: '' },             // HTML email signature appended to outbound emails
    emailSignatureEnabled: { type: Boolean, default: false },  // Toggle to enable/disable signature
  },

  // Branding
  branding: {
    logo: String,
    primaryColor: { type: String, default: '#4f46e5' },
    accentColor: { type: String, default: '#6366f1' }
  },
  
  // Subscription
  subscription: {
    plan: { 
      type: String, 
      enum: ['trial', 'starter', 'professional', 'enterprise'], 
      default: 'trial' 
    },
    status: { 
      type: String, 
      enum: ['active', 'suspended', 'cancelled'], 
      default: 'active' 
    },
    startDate: Date,
    endDate: Date,
    limits: {
      maxUsers: { type: Number, default: 5 },
      maxConversations: { type: Number, default: 1000 },
      maxChannels: { type: Number, default: 3 }
    }
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'suspended', 'inactive'],
    default: 'active'
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

// Indexes
// CompanySchema.index({ slug: 1 }); // ❌ Removed: unique: true already creates index
CompanySchema.index({ ownerId: 1 });
CompanySchema.index({ status: 1 });
// CompanySchema.index({ tenantDatabaseName: 1 }); // ❌ Removed: unique: true already creates index

// Update timestamp on save
CompanySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default CompanySchema;