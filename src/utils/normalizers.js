// src/utils/normalizers.js
/**
 * Utility functions for normalizing identifiers
 */

/**
 * Normalize phone number to E.164 format
 * Always returns phone number with + prefix for consistency
 * Handles: + prefix, 00 prefix, or no prefix
 * @param {string} phone - Phone number (with or without + prefix, or 00 prefix)
 * @returns {string} - Normalized phone number with + prefix
 */
export function normalizePhoneNumber(phone) {
  if (!phone) return '';

  // Convert to string if not already
  phone = String(phone).trim();

  // Remove all non-digit characters (including any existing + sign)
  let normalized = phone.replace(/\D/g, '');

  // Handle 00 prefix (international format without +)
  // 00 is equivalent to +, so remove it
  if (normalized.startsWith('00')) {
    normalized = normalized.substring(2);
  }

  // Always add + prefix to ensure consistency
  // This ensures all numbers are stored with + regardless of input format
  return '+' + normalized;
}

/**
 * Normalize email address
 * @param {string} email - Email address
 * @returns {string} - Normalized email (lowercase, trimmed)
 */
export function normalizeEmail(email) {
  if (!email) return '';

  return email.trim().toLowerCase();
}

/**
 * Validate phone number format
 * @param {string} phone - Phone number
 * @returns {boolean} - True if valid E.164 format
 */
export function isValidPhoneNumber(phone) {
  const normalized = normalizePhoneNumber(phone);
  
  // E.164 format: +[country code][number]
  // Length: 8-15 digits (including country code)
  const e164Regex = /^\+[1-9]\d{7,14}$/;
  
  return e164Regex.test(normalized);
}

/**
 * Validate email format
 * @param {string} email - Email address
 * @returns {boolean} - True if valid email format
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Format phone number for display
 * @param {string} phone - Phone number in E.164 format
 * @returns {string} - Formatted phone number
 */
export function formatPhoneNumber(phone) {
  const normalized = normalizePhoneNumber(phone);
  
  // Remove + prefix for formatting
  const digits = normalized.substring(1);
  
  // Basic formatting (can be enhanced based on country codes)
  if (digits.length === 11) {
    // US format: +1 (234) 567-8900
    return `+${digits[0]} (${digits.substring(1, 4)}) ${digits.substring(4, 7)}-${digits.substring(7)}`;
  }
  
  // Default format: +XX XXXXXXXXX
  return `+${digits.substring(0, 2)} ${digits.substring(2)}`;
}

/**
 * Detect channel type from identifier
 * @param {string} identifier - Contact identifier
 * @returns {string} - Channel type (phone, email, unknown)
 */
export function detectChannelType(identifier) {
  if (!identifier) return 'unknown';

  if (isValidPhoneNumber(identifier)) {
    return 'phone';
  }
  
  if (isValidEmail(identifier)) {
    return 'email';
  }
  
  return 'unknown';
}

/**
 * Extract country code from phone number
 * @param {string} phone - Phone number in E.164 format
 * @returns {string} - Country code
 */
export function extractCountryCode(phone) {
  const normalized = normalizePhoneNumber(phone);
  
  // Common country codes (1-3 digits)
  const countryCodeMatch = normalized.match(/^\+(\d{1,3})/);
  
  return countryCodeMatch ? countryCodeMatch[1] : '';
}

/**
 * Sanitize message content
 * @param {string} content - Message content
 * @returns {string} - Sanitized content
 */
export function sanitizeMessageContent(content) {
  if (!content) return '';

  // Remove potentially harmful HTML/scripts
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .trim();
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
export function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  
  return text.substring(0, maxLength - 3) + '...';
}