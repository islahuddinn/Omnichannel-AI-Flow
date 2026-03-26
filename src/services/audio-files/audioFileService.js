// src/services/audio-files/audioFileService.js
import { getTenantDB } from '../../config/database.js';
import AudioFileSchema from '../../models/schemas/AudioFile.js';
import { uploadToS3 } from '../../lib/storage/s3.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Upload audio file to S3 and save metadata to database
 */
export const uploadAudioFile = async (file, companyId, isDefault = false) => {
  if (!file) {
    throw new Error('No file provided');
  }

  const tenantDB = await getTenantDB(companyId);
  const AudioFile = tenantDB.models.AudioFile || tenantDB.model('AudioFile', AudioFileSchema);

  // Validate file type (audio files only)
  const allowedAudioTypes = [
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'audio/x-wav',
    'audio/wave',
    'audio/x-m4a',
    'audio/aac'
  ];

  const fileType = file.type || file.mimeType || '';
  if (fileType && !allowedAudioTypes.includes(fileType.toLowerCase()) && !fileType.toLowerCase().startsWith('audio/')) {
    throw new Error('Invalid file type. Only audio files are allowed.');
  }

  // If this is set as default, unset other defaults
  if (isDefault) {
    await AudioFile.updateMany(
      { isDefault: true },
      { $set: { isDefault: false } }
    );
  }

  try {
    // Convert file to buffer if it's a File object
    let buffer;
    if (file.arrayBuffer) {
      // Next.js File object
      buffer = Buffer.from(await file.arrayBuffer());
    } else if (file.buffer) {
      // Already a buffer
      buffer = file.buffer;
    } else if (Buffer.isBuffer(file)) {
      buffer = file;
    } else {
      throw new Error('Invalid file format');
    }

    // Generate unique filename
    const fileExtension = (file.name || file.originalname || 'audio').split('.').pop() || 'mp3';
    const filename = `${uuidv4()}.${fileExtension}`;
    const key = `audio-files/${companyId}/${filename}`;

    // Upload to S3
    const contentType = fileType || 'audio/mpeg';
    const { url, key: s3Key } = await uploadToS3(buffer, key, contentType);

    // Save metadata to database
    const audioFile = await AudioFile.create({
      fileName: file.name || file.originalname || filename,
      fileUrl: url,
      isDefault
    });

    return audioFile;
  } catch (error) {
    console.error('Error uploading audio file to S3:', error);
    if (error.message.includes('Failed to upload to S3')) {
      throw new Error(`Failed to upload file to S3 storage: ${error.message}`);
    }
    throw error;
  }
};

/**
 * Get all audio files
 */
export const getAllAudioFiles = async (companyId) => {
  const tenantDB = await getTenantDB(companyId);
  const AudioFile = tenantDB.models.AudioFile || tenantDB.model('AudioFile', AudioFileSchema);

  const audioFiles = await AudioFile.find({})
    .sort('-createdAt')
    .lean();

  return audioFiles;
};

/**
 * Edit/Update an audio file
 */
export const editAudioFile = async (audioFileId, companyId, updateData) => {
  const tenantDB = await getTenantDB(companyId);
  const AudioFile = tenantDB.models.AudioFile || tenantDB.model('AudioFile', AudioFileSchema);

  const audioFile = await AudioFile.findById(audioFileId);
  if (!audioFile) {
    throw new Error('Audio file not found');
  }

  // If setting as default, unset other defaults
  if (updateData.isDefault === true) {
    await AudioFile.updateMany(
      { _id: { $ne: audioFileId }, isDefault: true },
      { $set: { isDefault: false } }
    );
  }

  // Update the audio file
  const updatedAudioFile = await AudioFile.findByIdAndUpdate(
    audioFileId,
    { $set: updateData },
    { new: true, runValidators: true }
  );

  return updatedAudioFile;
};

/**
 * Delete an audio file
 */
export const deleteAudioFile = async (audioFileId, companyId) => {
  const tenantDB = await getTenantDB(companyId);
  const AudioFile = tenantDB.models.AudioFile || tenantDB.model('AudioFile', AudioFileSchema);

  const audioFile = await AudioFile.findById(audioFileId);
  if (!audioFile) {
    throw new Error('Audio file not found');
  }
  await AudioFile.findByIdAndDelete(audioFileId);

  return { success: true, message: 'Audio file deleted successfully' };
};
