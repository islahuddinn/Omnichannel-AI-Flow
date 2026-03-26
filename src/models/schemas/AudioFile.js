// src/models/schemas/AudioFile.js
import mongoose from 'mongoose';

const AudioFileSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  isDefault: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
AudioFileSchema.index({ fileName: 1 });
AudioFileSchema.index({ isDefault: 1 });

export default AudioFileSchema;
