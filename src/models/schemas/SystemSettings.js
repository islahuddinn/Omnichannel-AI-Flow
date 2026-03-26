// src/models/schemas/SystemSettings.js
import mongoose from 'mongoose';

const SystemSettingsSchema = new mongoose.Schema({
  maintenance: {
    enabled: { type: Boolean, default: false },
    message: String,
    startTime: Date,
    endTime: Date
  },
  limits: {
    maxCompanies: { type: Number, default: 1000 },
    maxUsersPerCompany: { type: Number, default: 100 },
    maxChannelsPerCompany: { type: Number, default: 10 },
    maxMessagesPerDay: { type: Number, default: 1000000 },
    maxFileSize: { type: Number, default: 10485760 }, // 10MB
    maxConversationsPerAgent: { type: Number, default: 50 }
  },
  email: {
    fromName: String,
    fromEmail: String,
    replyTo: String,
    supportEmail: String
  },
  security: {
    passwordMinLength: { type: Number, default: 8 },
    passwordRequireUppercase: { type: Boolean, default: true },
    passwordRequireLowercase: { type: Boolean, default: true },
    passwordRequireNumbers: { type: Boolean, default: true },
    passwordRequireSpecialChars: { type: Boolean, default: false },
    sessionTimeout: { type: Number, default: 86400000 }, // 24 hours
    maxLoginAttempts: { type: Number, default: 5 },
    lockoutDuration: { type: Number, default: 1800000 }, // 30 minutes
    allowedDomains: [String],
    blockedDomains: [String]
  },
  features: {
    enableSignup: { type: Boolean, default: false },
    enableGoogleAuth: { type: Boolean, default: false },
    enableTwoFactor: { type: Boolean, default: false },
    enableAPIAccess: { type: Boolean, default: true },
    enableWebhooks: { type: Boolean, default: true },
    enableFileUploads: { type: Boolean, default: true }
  },
  billing: {
    currency: { type: String, default: 'USD' },
    taxRate: { type: Number, default: 0 },
    trialDays: { type: Number, default: 14 },
    defaultPlan: { type: String, default: 'trial' }
  },
  integrations: {
    stripe: {
      enabled: { type: Boolean, default: false },
      publicKey: String,
      webhookSecret: String
    },
    sendgrid: {
      enabled: { type: Boolean, default: false },
      apiKey: String
    },
    twilio: {
      enabled: { type: Boolean, default: false },
      accountSid: String,
      authToken: String
    }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default SystemSettingsSchema;