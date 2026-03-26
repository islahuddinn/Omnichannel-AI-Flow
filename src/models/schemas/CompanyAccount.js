// // src/models/schemas/CompanyAccount.js
// import mongoose from 'mongoose';
// import { CHANNEL_TYPES } from '../../config/constants.js';
// import crypto from 'crypto';

// const CompanyAccountSchema = new mongoose.Schema({
//   companyId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Company',
//     required: true
//   },
//   type: {
//     type: String,
//     enum: Object.values(CHANNEL_TYPES),
//     required: true
//   },
//   name: {
//     type: String,
//     required: true,
//     trim: true
//   },
//   departmentId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Department'
//   },
//   identifier: {
//     type: String,
//     required: true,
//     index: true
//   },
//   credentials: {
//     type: mongoose.Schema.Types.Mixed,
//     required: true
//   },
//   settings: {
//     type: mongoose.Schema.Types.Mixed,
//     default: {}
//   },
//   metadata: {
//     type: mongoose.Schema.Types.Mixed,
//     default: {}
//   },
//   status: {
//     type: String,
//     enum: ['active', 'inactive', 'error', 'pending'],
//     default: 'pending'
//   },
//   lastSync: Date,
//   lastError: {
//     message: String,
//     code: String,
//     timestamp: Date
//   },
//   statistics: {
//     totalMessages: { type: Number, default: 0 },
//     totalConversations: { type: Number, default: 0 },
//     lastMessageAt: Date
//   },
//   isActive: { type: Boolean, default: true },
//   createdAt: { type: Date, default: Date.now },
//   updatedAt: { type: Date, default: Date.now }
// });

// // Encrypt credentials before saving
// CompanyAccountSchema.pre('save', function(next) {
//   if (this.isModified('credentials')) {
//     const algorithm = 'aes-256-gcm';
//     const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-32-char-encryption-key!!', 'utf8');
//     const iv = Buffer.from(process.env.ENCRYPTION_IV || 'default-16chars!', 'utf8').slice(0, 16);
    
//     const cipher = crypto.createCipheriv(algorithm, key, iv);
    
//     let encrypted = cipher.update(JSON.stringify(this.credentials), 'utf8', 'hex');
//     encrypted += cipher.final('hex');
    
//     const authTag = cipher.getAuthTag();
    
//     this.credentials = {
//       encrypted,
//       authTag: authTag.toString('hex'),
//       algorithm
//     };
//   }
  
//   this.updatedAt = Date.now();
//   next();
// });

// // Decrypt credentials when retrieving
// CompanyAccountSchema.methods.getDecryptedCredentials = function() {
//   if (!this.credentials.encrypted) {
//     return this.credentials;
//   }
  
//   try {
//     const algorithm = 'aes-256-gcm';
//     const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-32-char-encryption-key!!', 'utf8');
//     const iv = Buffer.from(process.env.ENCRYPTION_IV || 'default-16chars!', 'utf8').slice(0, 16);
    
//     const decipher = crypto.createDecipheriv(algorithm, key, iv);
//     decipher.setAuthTag(Buffer.from(this.credentials.authTag, 'hex'));
    
//     let decrypted = decipher.update(this.credentials.encrypted, 'hex', 'utf8');
//     decrypted += decipher.final('utf8');
    
//     return JSON.parse(decrypted);
//   } catch (error) {
//     console.error('Failed to decrypt credentials:', error);
//     return {};
//   }
// };

// // Set identifier based on channel type
// CompanyAccountSchema.pre('save', function(next) {
//   if (!this.identifier && this.credentials) {
//     const creds = this.getDecryptedCredentials();
    
//     switch (this.type) {
//       case CHANNEL_TYPES.WHATSAPP:
//         this.identifier = creds.phoneNumber || creds.phoneNumberId;
//         break;
//       case CHANNEL_TYPES.FACEBOOK:
//       case CHANNEL_TYPES.INSTAGRAM:
//         this.identifier = creds.pageId;
//         break;
//       case CHANNEL_TYPES.SMS:
//         this.identifier = creds.senderId || creds.phoneNumber;
//         break;
//       case CHANNEL_TYPES.EMAIL:
//         this.identifier = creds.fromEmail || creds.smtpUser;
//         break;
//       case CHANNEL_TYPES.WEBCHAT:
//         this.identifier = creds.widgetId || this._id.toString();
//         break;
//     }
//   }
//   next();
// });

// CompanyAccountSchema.index({ companyId: 1, type: 1 });
// CompanyAccountSchema.index({ identifier: 1, type: 1 }, { unique: true });

// export default CompanyAccountSchema;




// import mongoose from 'mongoose';
// import { CHANNEL_TYPES } from '../../config/constants.js';

// const CompanyAccountSchema = new mongoose.Schema({
//   companyId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Company',
//     required: true
//   },
//   type: {
//     type: String,
//     enum: Object.values(CHANNEL_TYPES),
//     required: true
//   },
//   name: {
//     type: String,
//     required: true,
//     trim: true
//   },
//   departmentId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Department'
//   },
//   identifier: {
//     type: String,
//     required: true,
//     index: true
//   },
//   credentials: {
//     type: mongoose.Schema.Types.Mixed,
//     required: true
//   },
//   settings: {
//     type: mongoose.Schema.Types.Mixed,
//     default: {}
//   },
//   metadata: {
//     type: mongoose.Schema.Types.Mixed,
//     default: {}
//   },
//   status: {
//     type: String,
//     enum: ['active', 'inactive', 'error', 'pending'],
//     default: 'pending'
//   },
//   lastSync: Date,
//   lastError: {
//     message: String,
//     code: String,
//     timestamp: Date
//   },
//   statistics: {
//     totalMessages: { type: Number, default: 0 },
//     totalConversations: { type: Number, default: 0 },
//     lastMessageAt: Date
//   },
//   isActive: { type: Boolean, default: true },
//   createdAt: { type: Date, default: Date.now },
//   updatedAt: { type: Date, default: Date.now }
// });

// // Update timestamp before save
// CompanyAccountSchema.pre('save', function (next) {
//   this.updatedAt = Date.now();
//   next();
// });

// // Get plain credentials (no encryption)
// CompanyAccountSchema.methods.getDecryptedCredentials = function () {
//   return this.credentials;
// };

// // Set identifier based on channel type
// CompanyAccountSchema.pre('save', function (next) {
//   if (!this.identifier && this.credentials) {
//     const creds = this.credentials;

//     switch (this.type) {
//       case CHANNEL_TYPES.WHATSAPP:
//         this.identifier = creds.phoneNumber || creds.phoneNumberId;
//         break;
//       case CHANNEL_TYPES.FACEBOOK:
//       case CHANNEL_TYPES.INSTAGRAM:
//         this.identifier = creds.pageId;
//         break;
//       case CHANNEL_TYPES.SMS:
//         this.identifier = creds.senderId || creds.phoneNumber;
//         break;
//       case CHANNEL_TYPES.EMAIL:
//         this.identifier = creds.fromEmail || creds.smtpUser;
//         break;
//       case CHANNEL_TYPES.WEBCHAT:
//         this.identifier = creds.widgetId || this._id.toString();
//         break;
//     }
//   }
//   next();
// });

// CompanyAccountSchema.index({ companyId: 1, type: 1 });
// CompanyAccountSchema.index({ identifier: 1, type: 1 }, { unique: true });

// export default CompanyAccountSchema;















// src/models/schemas/CompanyAccount.js
import mongoose from 'mongoose';
import { CHANNEL_TYPES } from '../../config/constants.js';

const CompanyAccountSchema = new mongoose.Schema({
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  type: {
    type: String,
    enum: Object.values(CHANNEL_TYPES),
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  departmentIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  }],
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  identifier: {
    type: String,
    required: true
  },
  credentials: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  settings: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'error', 'pending'],
    default: 'pending'
  },
  lastSync: Date,
  lastError: {
    message: String,
    code: String,
    timestamp: Date
  },
  statistics: {
    totalMessages: { type: Number, default: 0 },
    totalConversations: { type: Number, default: 0 },
    lastMessageAt: Date
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

CompanyAccountSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  
  if ((!this.departmentIds || this.departmentIds.length === 0) && !this.departmentId) {
    return next(new Error('At least one department must be assigned to the account'));
  }
  
  if (this.departmentIds && this.departmentIds.length > 0 && !this.departmentId) {
    this.departmentId = this.departmentIds[0];
  }
  
  next();
});

CompanyAccountSchema.methods.getDecryptedCredentials = function () {
  return this.credentials;
};

CompanyAccountSchema.pre('save', function (next) {
  if (!this.identifier && this.credentials) {
    const creds = this.credentials;

    switch (this.type) {
      case CHANNEL_TYPES.WHATSAPP:
        this.identifier = creds.phoneNumber || creds.phoneNumberId;
        break;
      case CHANNEL_TYPES.FACEBOOK:
      case CHANNEL_TYPES.INSTAGRAM:
        this.identifier = creds.pageId;
        break;
      case CHANNEL_TYPES.SMS:
        this.identifier = creds.senderId || creds.phoneNumber || creds.identifier;
        break;
      case CHANNEL_TYPES.EMAIL:
        this.identifier = creds.fromEmail || creds.smtpUser;
        break;
      case CHANNEL_TYPES.WEBCHAT:
        this.identifier = creds.widgetId || this._id.toString();
        break;
      case CHANNEL_TYPES.CALL:
        this.identifier = creds.phoneNumber || creds.identifier;
        break;
    }
  }
  next();
});

CompanyAccountSchema.index({ companyId: 1, type: 1 });
CompanyAccountSchema.index({ identifier: 1, type: 1 }, { unique: true });

export default CompanyAccountSchema;