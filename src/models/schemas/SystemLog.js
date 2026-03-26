// // src/models/schemas/SystemLog.js
// import mongoose from 'mongoose';

// const SystemLogSchema = new mongoose.Schema({
//   level: {
//     type: String,
//     enum: ['info', 'warning', 'error', 'critical'],
//     required: true
//   },
//   category: {
//     type: String,
//     enum: ['auth', 'api', 'database', 'system', 'security', 'billing'],
//     required: true
//   },
//   message: {
//     type: String,
//     required: true
//   },
//   userId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User'
//   },
//   companyId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Company'
//   },
//   metadata: mongoose.Schema.Types.Mixed,
//   stack: String,
//   ip: String,
//   userAgent: String,
//   timestamp: {
//     type: Date,
//     default: Date.now,
//     index: true
//   }
// });

// SystemLogSchema.index({ level: 1, timestamp: -1 });
// SystemLogSchema.index({ category: 1, timestamp: -1 });
// SystemLogSchema.index({ userId: 1, timestamp: -1 });

// export default SystemLogSchema;



// src/models/schemas/SystemLog.js
import mongoose from 'mongoose';

const SystemLogSchema = new mongoose.Schema({
  level: {
    type: String,
    enum: ['info', 'warn', 'error', 'debug', 'critical'],
    required: true
  },
  service: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  context: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  error: {
    message: String,
    stack: String,
    code: String
  },
  requestId: String,
  userId: mongoose.Schema.Types.ObjectId,
  tenantId: String,
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

SystemLogSchema.index({ level: 1, timestamp: -1 });
SystemLogSchema.index({ service: 1, timestamp: -1 });
SystemLogSchema.index({ requestId: 1 });
SystemLogSchema.index({ tenantId: 1, timestamp: -1 });

// Auto-delete logs older than 90 days
SystemLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

export default SystemLogSchema;