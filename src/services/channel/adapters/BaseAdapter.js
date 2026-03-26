

// src/services/channel/adapters/BaseAdapter.js
/**
 * Base Channel Adapter - All channel adapters extend this
 */

export class BaseAdapter {
  constructor(credentials, options = {}) {
    this.credentials = credentials;
    this.options = options;
    this.channelType = 'base';
    this.supportedTypes = ['text'];
  }

  /**
   * Send message via channel
   */
  async sendMessage(data) {
    throw new Error('sendMessage() must be implemented by child class');
  }

  /**
   * Validate webhook signature
   */
  async validateWebhook(signature, payload) {
    throw new Error('validateWebhook() must be implemented by child class');
  }

  /**
   * Parse incoming webhook
   */
  async parseWebhook(payload) {
    throw new Error('parseWebhook() must be implemented by child class');
  }

  /**
   * Send media message
   */
  async sendMedia(data) {
    throw new Error('sendMedia() must be implemented by child class');
  }

  /**
   * Get message status
   */
  async getMessageStatus(messageId) {
    throw new Error('getMessageStatus() must be implemented by child class');
  }

  /**
   * Validate credentials format
   */
  validateCredentials() {
    if (!this.credentials) {
      throw new Error('Credentials are required');
    }
    return true;
  }

  /**
   * Format success response
   */
  formatSuccess(data) {
    return {
      success: true,
      channel: this.channelType,
      timestamp: new Date().toISOString(),
      ...data
    };
  }

  /**
   * Format error response
   */
  formatError(error, context = {}) {
    return {
      success: false,
      channel: this.channelType,
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      timestamp: new Date().toISOString(),
      context
    };
  }

  /**
   * Make HTTP request with retry logic
   */
  async makeRequest(url, options, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          timeout: 30000,
          ...options
        });

        // Always try to parse JSON, even if response is not ok
        let responseData;
        try {
          responseData = await response.json();
        } catch (parseError) {
          // If JSON parsing fails, create a basic error object
          responseData = {
            error: {
              message: `Failed to parse response: ${response.statusText || response.status}`,
              status: response.status,
              statusText: response.statusText
            }
          };
        }

        // Check if response is ok
        if (!response.ok) {
          const error = new Error(responseData.error?.message || responseData.err_desc || `HTTP ${response.status}`);
          error.response = {
            status: response.status,
            statusText: response.statusText,
            data: responseData
          };
          throw error;
        }

        // Return parsed JSON (may still contain error codes in body)
        return responseData;
      } catch (error) {
        // If error already has response data, attach it
        if (!error.response && error.message) {
          error.response = {
            status: null,
            statusText: null,
            data: null
          };
        }
        
        if (attempt === retries) throw error;
        
        // Exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
  }

  /**
   * Log adapter activity
   */
  log(level, message, data = {}) {
    const logEntry = {
      level,
      channel: this.channelType,
      message,
      data,
      timestamp: new Date().toISOString()
    };
    
    console.log(JSON.stringify(logEntry));
  }

  /**
   * Check if message type is supported
   */
  supportsMessageType(type) {
    return this.supportedTypes.includes(type);
  }

  /**
   * Validate message content
   */
  validateContent(content) {
    if (!content || typeof content !== 'object') {
      throw new Error('Message content is required');
    }

    if (!content.type) {
      throw new Error('Message type is required');
    }

    if (!this.supportsMessageType(content.type)) {
      throw new Error(`Message type '${content.type}' not supported for ${this.channelType}`);
    }

    return true;
  }
}