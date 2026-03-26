// src/utils/pbxHelpers.js

/**
 * Generate secure random password
 */
export const generateSecurePassword = (length = 12) => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+[]';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

/**
 * Generate SIP credentials from email
 */
export const generateSipCredentials = (email, password) => {
  const emailPrefix = email.split('@')[0];
  const randomDigits = Math.floor(10000 + Math.random() * 90000);
  const sipUsername = `${emailPrefix}${randomDigits}`;
  const sipPassword = password || generateSecurePassword();
  return { sip_username: sipUsername, sip_password: sipPassword };
};

/**
 * Normalize call setting values (handles string, number, boolean)
 */
export const normalizeCallSetting = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value === 1 ? 'yes' : 'no';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value).toLowerCase();
};

/**
 * Determine call status based on inbound/outbound settings
 */
export const determineCallStatus = (inboundCalls, outboundCalls, callCenter) => {
  if (callCenter !== 'on') return 'available';
  
  const inbound = normalizeCallSetting(inboundCalls);
  const outbound = normalizeCallSetting(outboundCalls);
  
  if (inbound === 'no' && outbound === 'no') {
    return 'available';
  } else if (inbound === 'no' && outbound === 'yes') {
    return 'outbound';
  } else if (inbound === 'yes' && outbound === 'no') {
    return 'available';
  }
  
  return 'available';
};
