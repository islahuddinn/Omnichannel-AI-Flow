// src/models/schemas/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { ROLES } from "../../config/constants.js";

const UserSchema = new mongoose.Schema({
  // Core Identity
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
  },

  // Personal Info
  firstName: {
    type: String,
    required: true,
    trim: true,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
  },
  phone: {
    type: String,
    trim: true,
  },
  avatar: String,

  // Role: super_admin, company_admin, or agent
  role: {
    type: String,
    enum: Object.values(ROLES), // ['super_admin', 'company_admin', 'agent']
    required: true,
  },

  // Company Reference (null for super_admin only)
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: function () {
      return this.role !== ROLES.SUPER_ADMIN;
    },
  },

  // Tenant Database Name (cached from Company for quick access)
  // null for super_admin, required for company_admin and agent
  tenantDatabaseName: {
    type: String,
    required: function () {
      return this.role !== ROLES.SUPER_ADMIN;
    },
  },

  // Departments (only for agents)
  departments: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    },
  ],

  // Permissions
  permissions: {
    canCreateUsers: { type: Boolean, default: false },
    canDeleteUsers: { type: Boolean, default: false },
    canManageChannels: { type: Boolean, default: false },
    canManageDepartments: { type: Boolean, default: false },
    canDeleteConversations: { type: Boolean, default: false },
    canTransferConversations: { type: Boolean, default: false },
    canMergeConversations: { type: Boolean, default: false },
    canUnmergeConversations: { type: Boolean, default: false },
    canExportData: { type: Boolean, default: false },
    canViewAnalytics: { type: Boolean, default: false },
  },

  // Status
  status: {
    type: String,
    enum: ["active", "inactive", "suspended"],
    default: "active",
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },

  // Preferences
  preferences: {
    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "system",
    },
    notifications: {
      email: { type: Boolean, default: true },
      desktop: { type: Boolean, default: true },
      sound: { type: Boolean, default: true },
    },
    language: { type: String, default: "en" },
    accentColor: { type: String, default: "ocean-blue" },
    selectedNotificationTune: { type: String, default: "message.mp3" },
    notificationTunes: [
      {
        name: { type: String },
        url: { type: String },
        uploadedAt: { type: String },
      },
    ],
  },

  // Activity
  lastLogin: Date,
  lastActivity: Date,
  // Security
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  refreshToken: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
  emailVerificationToken: String,

  chat: {
    chat_feature: { type: String },
    role_in_chat_feature: { type: String }, // Added field
    chat_status: {
      type: String,
      default: "offline",
    },
  },

  // Call Center fields
  callCenter: {
    call_center: { type: String },
    role_in_call_center: { type: String },

    inbound_calls: { type: String },
    outbound_calls: { type: String },
    outbound_phone_number: { type: mongoose.Schema.Types.Mixed },
    primary_outbound_phone_number: { type: String },
    call_access: { type: String },
    recording_downloads: { type: String },
    waiting_in_line: { type: String },
    playback_during_paused: { type: String },
    playback: { type: String },
    call_status: {
      type: String,
      default: "offline",
    },
  },

  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
});

// Hash password before saving
UserSchema.pre("save", async function (next) {
  this.updatedAt = Date.now();

  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if account is locked
UserSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Increment login attempts
UserSchema.methods.incLoginAttempts = async function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000; // 2 hours

  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + lockTime };
  }

  return this.updateOne(updates);
};

// Reset login attempts
UserSchema.methods.resetLoginAttempts = async function () {
  return this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 },
  });
};

// Indexes
// UserSchema.index({ email: 1 });
UserSchema.index({ companyId: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ status: 1 });
UserSchema.index({ tenantDatabaseName: 1 });
UserSchema.index({ companyId: 1, role: 1 });

export default UserSchema;
