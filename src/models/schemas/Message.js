
// src/models/schemas/Message.js
import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'document', 'location', 'contact', 'contacts', 'interactive', 'reaction', 'template', 'sticker', 'button', 'list'],
    default: 'text'
  },
  content: {
    type: String,
  },
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    required: true
  },
  channel: {
    type: String,
    enum: ['whatsapp', 'facebook', 'instagram', 'sms', 'email', 'webchat'],
    required: true
  },
  channelAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanyAccount',
    required: true
  },
  // ✅ CRITICAL: Store department ID for message segregation
  // This allows messages from the same conversation to be associated with different departments
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  contact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact'
  },
  // Module that sent this message (e.g., 'owm' for automation, 'manual' for user-sent)
  sendingModule: {
    type: String,
    enum: ['owm', 'manual', 'bot', 'other'],
    default: 'manual',
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'retrying'],
    default: 'pending'
  },

  // Template message specific
  templateName: String,
  templateLanguage: String,
  templateParams: [String],

  // 🔹 Added for markRead functionality
  readBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Timestamps for each status
  sentAt: Date,
  deliveredAt: Date,
  readAt: Date,
  failedAt: Date,
  errorMessage: String,

  // Enhanced attachments with proper structure
  attachments: [{
    type: {
      type: String,
      enum: ['image', 'video', 'audio', 'document', 'sticker']
    },
    url: String,
    name: String,
    size: Number,
    mimeType: String,
    duration: Number, // For audio/video
    thumbnail: String, // For video
    width: Number, // For images
    height: Number, // For images
  }],

  // Reactions (max 50 per message)
  reactions: {
    type: [{
    emoji: {
      type: String,
      required: true
    },
    // Outbound reactions from agents/users
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    // Inbound reactions from contacts/customers
    contact: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
      required: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
    validate: [arr => arr.length <= 50, 'Reactions cannot exceed 50 per message'],
  },

  // Reply functionality
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },

  // Forward functionality
  forwardedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },

  // Edit functionality
  edited: { type: Boolean, default: false },
  editedAt: Date,
  editHistory: [{
    content: String,
    editedAt: Date,
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],

  // Delete functionality
  deleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Contact message data (for type: 'contact' or 'contacts')
  contactData: {
    name: String,
    phoneNumber: String,
    displayPhoneNumber: String,
    vcard: String,
    addresses: [{
      type: String, // 'HOME', 'WORK', etc.
      street: String,
      city: String,
      state: String,
      zip: String,
      country: String,
    }],
    emails: [{
      type: String, // 'HOME', 'WORK', etc.
      email: String,
    }],
    org: {
      company: String,
      department: String, // Legacy field - kept for backward compatibility
      // ✅ CRITICAL: Store department ID for message segregation
      departmentId: mongoose.Schema.Types.ObjectId,
      title: String,
    },
    birthday: String,
    urls: [String],
  },

  // Location message data (for type: 'location')
  locationData: {
    latitude: Number,
    longitude: Number,
    name: String,
    address: String,
    url: String, // Google Maps link
  },

  // Email-specific data (for channel: 'email')
  emailData: {
    subject: String,
    from: String,
    to: [String], // Array of recipients
    cc: [String],
    bcc: [String],
    replyTo: String,
    inReplyTo: String, // Message-ID for threading
    references: [String], // References header for threading
    messageId: String, // Unique message ID for threading
  },

  // Bot satisfaction rating (thumbs up/down for AI bot responses)
  botSatisfaction: {
    rating: {
      type: String,
      enum: ['up', 'down'],
    },
    ratedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    ratedAt: Date,
    feedback: String, // Optional text feedback
  },

  // Enhanced metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Provider message IDs
  externalId: String,
  whatsappMessageId: String,
  providerMessageId: String,

  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

MessageSchema.index({ conversation: 1, createdAt: -1 });
MessageSchema.index({ status: 1 });
MessageSchema.index({ sender: 1, createdAt: -1 });
MessageSchema.index({ externalId: 1 });
MessageSchema.index({ providerMessageId: 1 });
MessageSchema.index({ channel: 1, direction: 1, createdAt: -1 });
MessageSchema.index({ replyTo: 1 });
// Unique sparse index on whatsappMessageId + channelAccount to prevent duplicate messages
// from webhook retries. Sparse so null values are excluded (outbound messages may not have whatsappMessageId).
MessageSchema.index(
  { whatsappMessageId: 1, channelAccount: 1, direction: 1 },
  {
    unique: true,
    partialFilterExpression: { whatsappMessageId: { $ne: null } }
  }
);
// Unique index to prevent duplicate emails from the SAME sender.
// Includes `contact` so different contacts with the same Message-ID
// (forwarded emails, templates, same email server) are each saved separately.
MessageSchema.index(
  { 'emailData.messageId': 1, channelAccount: 1, contact: 1 },
  {
    unique: true,
    partialFilterExpression: { 'emailData.messageId': { $ne: null } }
  }
);

MessageSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

export default MessageSchema;
