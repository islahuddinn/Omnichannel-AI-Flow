// src/lib/encryption.js
/**
 * Encryption utilities for sensitive data
 * Uses AES-256-CBC encryption
 */
import crypto from 'crypto';

// Encryption key from environment (32 bytes for AES-256)
// If ENCRYPTION_KEY is set in env as hex string (64 chars), use it, otherwise generate one
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY 
  ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  : crypto.randomBytes(32);
const ALGORITHM = 'aes-256-cbc';

// Log encryption key info on module load (for debugging)
const keyHash = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest('hex').substring(0, 16);
console.log('🔐 Encryption module loaded:', {
  hasEnvKey: !!process.env.ENCRYPTION_KEY,
  keyHash: keyHash,
  algorithm: ALGORITHM
});

/**
 * Get encryption key as Buffer (32 bytes for AES-256)
 */
function getEncryptionKey() {
  if (Buffer.isBuffer(ENCRYPTION_KEY) && ENCRYPTION_KEY.length === 32) {
    return ENCRYPTION_KEY;
  }
  // If ENCRYPTION_KEY is a string, derive a proper 32-byte key using SHA-256
  return crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
}

/**
 * Encrypt sensitive data
 * @param {string} text - Text to encrypt
 * @returns {string} Encrypted text in format: iv:encryptedData
 */
export function encrypt(text) {
  if (!text) return '';
  try {
    const iv = crypto.randomBytes(16);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt sensitive data
 * @param {string} text - Encrypted text in format: iv:encryptedData
 * @returns {string} Decrypted text
 */
export function decrypt(text) {
  if (!text) return '';
  try {
    // Validate format (should have at least one ':' separator)
    if (!text.includes(':')) {
      throw new Error('Invalid encrypted data format (missing IV separator)');
    }
    
    const parts = text.split(':');
    if (parts.length < 2) {
      throw new Error('Invalid encrypted data format (not enough parts)');
    }
    
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const key = getEncryptionKey();
    
    console.log('🔓 Decryption attempt:', {
      ivLength: iv.length,
      encryptedLength: encryptedText.length,
      keyLength: key.length,
      algorithm: ALGORITHM
    });
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption error:', error);
    console.error('🔍 Decryption debug info:', {
      textLength: text?.length,
      textPreview: text ? `${text.substring(0, 30)}...` : 'empty',
      hasSeparator: text?.includes(':'),
      errorCode: error.code,
      errorMessage: error.message
    });
    throw new Error('Failed to decrypt data');
  }
}

export default {
  encrypt,
  decrypt
};


