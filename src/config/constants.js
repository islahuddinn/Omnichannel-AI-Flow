// src/config/constants.js
export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  COMPANY_ADMIN: 'company_admin',
  AGENT: 'agent'
};

export const COMPANY_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  TRIAL: 'trial',
  EXPIRED: 'expired'
};

export const CHANNEL_TYPES = {
  WHATSAPP: 'whatsapp',
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  SMS: 'sms',
  EMAIL: 'email',
  WEBCHAT: 'webchat',
  CALL: 'call'
};

export const TOKEN_EXPIRY = {
  ACCESS: '7d',
  REFRESH: '30d'
};

export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100
};