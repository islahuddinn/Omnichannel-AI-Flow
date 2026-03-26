// src/services/auth/OTPService.js
import crypto from 'crypto';
import { getMasterDB } from '../../config/database.js';
import OTPSchema from '../../models/schemas/OTP.js';
import UserSchema from '../../models/schemas/User.js';

class OTPService {
  constructor() {
    this.initialized = false;
    this.OTP = null;
    this.User = null;
  }

  async initModels() {
    if (this.initialized) return;

    const masterDB = await getMasterDB();
    this.OTP = masterDB.models.OTP || masterDB.model('OTP', OTPSchema);
    this.User = masterDB.models.User || masterDB.model('User', UserSchema);

    this.initialized = true;
  }

  /**
   * Generate a 6-digit OTP
   */
  generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Check if email exists in database
   */
  async checkEmailExists(email) {
    await this.initModels();
    const user = await this.User.findOne({ email: email.toLowerCase() });
    return !!user;
  }

  /**
   * Create and save OTP to database
   */
  async createOTP(email, type = 'password_reset') {
    try {
      await this.initModels();

      // Check if email exists
      const emailExists = await this.checkEmailExists(email);
      if (!emailExists) {
        throw new Error('User not found with this email address');
      }

      // Delete any existing unused OTPs for this email
      await this.OTP.deleteMany({ email: email.toLowerCase(), type, isUsed: false });

      // Generate new OTP
      const otp = this.generateOTP();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // Save to database
      const otpDoc = new this.OTP({
        email: email.toLowerCase(),
        otp,
        type,
        expiresAt
      });

      await otpDoc.save();

      console.log(`✅ OTP created for ${email}`);

      return otp;
    } catch (error) {
      console.error('❌ Error creating OTP:', error.message);
      throw error;
    }
  }

  /**
   * Verify OTP (DOES NOT MARK AS USED - that happens during password reset)
   */
  async verifyOTP(email, otp, type = 'password_reset') {
    try {
      await this.initModels();

      const emailLower = email.toLowerCase();

      // Find OTP record
      const otpDoc = await this.OTP.findOne({
        email: emailLower,
        otp,
        type,
        isUsed: false
      });

      if (!otpDoc) {
        // Increment attempts for existing OTP (brute force protection)
        await this.OTP.updateOne(
          { email: emailLower, type, isUsed: false },
          { $inc: { attempts: 1 } }
        );
        throw new Error('Invalid or expired OTP');
      }

      // Check if OTP has expired
      if (new Date() > otpDoc.expiresAt) {
        // Mark expired OTP as used
        await this.OTP.updateOne(
          { _id: otpDoc._id },
          { $set: { isUsed: true } }
        );
        throw new Error('OTP has expired');
      }

      // Check attempts limit
      if (otpDoc.attempts >= 3) {
        throw new Error('Too many failed attempts. Please request a new OTP');
      }

      // NOTE: We DON'T mark as used here - that happens during password reset
      // This allows user to verify OTP and then reset password with the same OTP

      return {
        valid: true,
        email: emailLower
      };
    } catch (error) {
      console.error('❌ Error verifying OTP:', error.message);
      throw error;
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email) {
    await this.initModels();
    return await this.User.findOne({ email: email.toLowerCase() });
  }
}

export default new OTPService();

