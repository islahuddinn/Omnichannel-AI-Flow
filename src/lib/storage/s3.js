// src/lib/storage/s3.js
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Verify AWS credentials are loaded
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.warn('⚠️ AWS credentials not found in environment variables!');
  console.warn('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'SET' : 'MISSING');
  console.warn('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? 'SET' : 'MISSING');
}

console.log('🔧 Initializing S3 Client with:', {
  region: process.env.AWS_REGION || 'eu-north-1',
  bucket: process.env.AWS_BUCKET_NAME || 'omnichannel-attachments',
  hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
  hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME || 'omnichannel-attachments';

/**
 * Upload file buffer to S3
 * @param {Buffer} buffer - File buffer
 * @param {string} key - S3 key (path)
 * @param {string} contentType - MIME type
 * @returns {Promise<{url: string, key: string}>}
 */
export async function uploadToS3(buffer, key, contentType) {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read', // Make publicly accessible
    });

    await s3Client.send(command);

    // Construct public URL
    const url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    console.log('✅ Uploaded to S3:', { key, url });

    return { url, key };
  } catch (error) {
    console.error('❌ S3 upload failed:', error);
    throw new Error(`Failed to upload to S3: ${error.message}`);
  }
}

/**
 * Generate a signed URL for private files
 * @param {string} key - S3 key
 * @param {number} expiresIn - Expiration in seconds (default: 1 hour)
 * @returns {Promise<string>}
 */
export async function getSignedS3Url(key, expiresIn = 3600) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    console.error('❌ Failed to generate signed URL:', error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
}

/**
 * Generate S3 key for media files
 * @param {string} tenantId - Tenant ID
 * @param {string} conversationId - Conversation ID
 * @param {string} filename - Original filename
 * @returns {string}
 */
export function generateS3Key(tenantId, conversationId, filename) {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(7);
  const extension = filename.split('.').pop();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  
  return `media/${tenantId}/${conversationId}/${timestamp}-${randomString}-${sanitizedFilename}`;
}

/**
 * Generate S3 key for mobile app uploads (job photos, protocol)
 * Path: mobile/{companyId}/{dealId}/{type}/{timestamp}-{random}-{filename}
 * @param {string} companyId - Tenant/company ID
 * @param {string} dealId - Deal ID (Mongo _id or SF deal_id)
 * @param {'before'|'after'|'protocol'} type - before = diagnostic, after = repair, protocol = signed paper
 * @param {string} filename - Original filename
 * @returns {string}
 */
export function generateMobileJobS3Key(companyId, dealId, type, filename) {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(7);
  const ext = (filename && filename.split('.').pop()) || 'jpg';
  const safe = (filename || `upload.${ext}`).replace(/[^a-zA-Z0-9.-]/g, '_');
  return `mobile/${companyId}/${dealId}/${type}/${timestamp}-${randomString}-${safe}`;
}

/**
 * Upload WhatsApp media to S3
 * @param {Buffer} buffer - Media buffer from WhatsApp
 * @param {string} mimeType - MIME type
 * @param {string} tenantId - Tenant ID
 * @param {string} conversationId - Conversation ID
 * @param {string} originalFilename - Original filename
 * @returns {Promise<{url: string, key: string}>}
 */
export async function uploadWhatsAppMediaToS3(buffer, mimeType, tenantId, conversationId, originalFilename) {
  const extension = getExtensionFromMimeType(mimeType) || 'bin';
  const filename = originalFilename || `media-${Date.now()}.${extension}`;
  const key = generateS3Key(tenantId, conversationId, filename);
  
  return await uploadToS3(buffer, key, mimeType);
}

/**
 * Get file extension from MIME type
 * @param {string} mimeType - MIME type
 * @returns {string}
 */
function getExtensionFromMimeType(mimeType) {
  const mimeMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/mpeg': 'mpeg',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  };
  
  return mimeMap[mimeType] || 'bin';
}

export default {
  uploadToS3,
  getSignedS3Url,
  generateS3Key,
  generateMobileJobS3Key,
  uploadWhatsAppMediaToS3,
};

