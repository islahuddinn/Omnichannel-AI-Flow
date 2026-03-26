// src/services/webchat/WebChatOTPService.js
/**
 * WebChat OTP Service (Tenant-specific)
 * Handles OTP generation and verification for WebChat PIN reset
 * Uses tenant database, not main database
 *
 * NOTE: All methods resolve tenant models per-call to avoid cross-tenant data leaks
 */
import crypto from 'crypto';
import { getTenantDB } from '../../config/database.js';
import WebChatOTPSchema from '../../models/schemas/WebChatOTP.js';
import ContactSchema from '../../models/schemas/Contact.js';
import WebChatSessionSchema from '../../models/schemas/WebChatSession.js';

class WebChatOTPService {
  /**
   * Get tenant-specific models (resolved per-call, not cached on the singleton)
   */
  async _getModels(tenantId) {
    const tenantDB = await getTenantDB(tenantId);
    const OTP = tenantDB.models.WebChatOTP || tenantDB.model('WebChatOTP', WebChatOTPSchema);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const WebChatSession = tenantDB.models.WebChatSession || tenantDB.model('WebChatSession', WebChatSessionSchema);
    return { OTP, Contact, WebChatSession };
  }

  /**
   * Generate a 6-digit OTP
   */
  generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Check if contact exists by email or phone
   */
  async checkContactExists(tenantId, identifier) {
    const { Contact } = await this._getModels(tenantId);

    // Try email first
    let contact = await Contact.findOne({ email: identifier.toLowerCase() });
    if (contact) return { exists: true, contact, type: 'email' };

    // Try phone
    contact = await Contact.findOne({ phone: identifier });
    if (contact) return { exists: true, contact, type: 'phone' };

    return { exists: false, contact: null, type: null };
  }

  /**
   * Create and save OTP to tenant database
   */
  async createOTP(tenantId, identifier, type = 'pin_reset') {
    try {
      const { OTP } = await this._getModels(tenantId);

      // Check if contact exists
      const { exists, contact } = await this.checkContactExists(tenantId, identifier);
      if (!exists || !contact) {
        throw new Error('Contact not found with this email or phone');
      }

      // Delete any existing unused OTPs for this identifier
      await OTP.deleteMany({ identifier: identifier.toLowerCase(), type, isUsed: false });

      // Generate new OTP
      const otp = this.generateOTP();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // Save to tenant database
      const otpDoc = new OTP({
        identifier: identifier.toLowerCase(),
        otp,
        type,
        expiresAt
      });

      await otpDoc.save();

      console.log(`✅ WebChat OTP created for ${identifier} in tenant ${tenantId}`);

      return { otp, contact };
    } catch (error) {
      console.error('❌ Error creating WebChat OTP:', error.message);
      throw error;
    }
  }

  /**
   * Verify OTP (DOES NOT MARK AS USED - that happens during PIN reset)
   */
  async verifyOTP(tenantId, identifier, otp, type = 'pin_reset') {
    try {
      const { OTP } = await this._getModels(tenantId);

      const identifierLower = identifier.toLowerCase();

      // Find OTP record
      const otpDoc = await OTP.findOne({
        identifier: identifierLower,
        otp,
        type,
        isUsed: false
      });

      if (!otpDoc) {
        // Increment attempts for existing OTP (brute force protection)
        await OTP.updateOne(
          { identifier: identifierLower, type, isUsed: false },
          { $inc: { attempts: 1 } }
        );
        throw new Error('Invalid or expired OTP');
      }

      // Check if OTP has expired
      if (new Date() > otpDoc.expiresAt) {
        // Mark expired OTP as used
        await OTP.updateOne(
          { _id: otpDoc._id },
          { $set: { isUsed: true } }
        );
        throw new Error('OTP has expired');
      }

      // Check attempts limit
      if (otpDoc.attempts >= 3) {
        throw new Error('Too many failed attempts. Please request a new OTP');
      }

      // Get contact
      const { contact } = await this.checkContactExists(tenantId, identifier);
      if (!contact) {
        throw new Error('Contact not found');
      }

      // NOTE: We DON'T mark as used here - that happens during PIN reset
      // This allows user to verify OTP and then reset PIN with the same OTP

      return {
        valid: true,
        identifier: identifierLower,
        contact
      };
    } catch (error) {
      console.error('❌ Error verifying WebChat OTP:', error.message);
      throw error;
    }
  }

  /**
   * Get contact by email or phone
   */
  async getContactByIdentifier(tenantId, identifier) {
    const { contact } = await this.checkContactExists(tenantId, identifier);
    return contact;
  }
}

export default new WebChatOTPService();
