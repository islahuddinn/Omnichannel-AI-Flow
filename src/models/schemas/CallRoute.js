// src/models/schemas/CallRoute.js
import mongoose from 'mongoose';

const CallRouteSchema = new mongoose.Schema({
  phoneNumberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanyAccount',
    required: true
  },
  flowData: {
    type: mongoose.Schema.Types.Mixed, // JSON object
    required: true
  },
  isLoop: {
    type: Number,
    default: 0
  },
  pbxRoutingHash: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes
CallRouteSchema.index({ phoneNumberId: 1 });
CallRouteSchema.index({ pbxRoutingHash: 1 });

export default CallRouteSchema;
