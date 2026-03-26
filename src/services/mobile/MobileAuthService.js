// src/services/mobile/MobileAuthService.js
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getTenantDB } from '../../config/database.js';
import ContactSchema from '../../models/schemas/Contact.js';
import { TOKEN_EXPIRY } from '../../config/constants.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const MOBILE_TOKEN_EXPIRY = {
  ACCESS: '7d',
  REFRESH: '30d'
};

class MobileAuthService {
  constructor() {
    this.initialized = false;
  }

  async initModels(companyId) {
    if (this.initialized && this.companyId === companyId) return;

    const tenantDB = await getTenantDB(companyId);
    this.Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    this.companyId = companyId;
    this.initialized = true;
  }

  /**
   * Generate temporary password (8 characters, alphanumeric)
   */
  generateTempPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Hash password
   */
  async hashPassword(password) {
    return await bcrypt.hash(password, 10);
  }

  /**
   * Compare password
   */
  async comparePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Generate access token
   */
  generateAccessToken(contact, companyId) {
    return jwt.sign(
      {
        sfId: contact.SF_id,
        email: contact.email,
        companyId: contact.companyId?.toString() || companyId || this.companyId,
        type: 'mobile_access'
      },
      JWT_SECRET,
      { expiresIn: MOBILE_TOKEN_EXPIRY.ACCESS }
    );
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(contact, companyId) {
    return jwt.sign(
      {
        sfId: contact.SF_id,
        email: contact.email,
        companyId: contact.companyId?.toString() || companyId || this.companyId,
        type: 'mobile_refresh'
      },
      JWT_SECRET,
      { expiresIn: MOBILE_TOKEN_EXPIRY.REFRESH }
    );
  }

  /**
   * Verify token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Find companyId from contact email
   * Searches through all companies to find which company has this contact
   */
  async findCompanyIdByEmail(email) {
    try {
      const { getMasterDB, getTenantDB } = await import('../../config/database.js');
      const masterDB = await getMasterDB();
      const CompanySchema = (await import('../../models/schemas/Company.js')).default;
      const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);

      const lowerEmail = email.toLowerCase().trim();

      // Get all active companies
      const companies = await Company.find({ status: { $ne: 'deleted' } })
        .select('_id tenantDatabaseName')
        .lean();

      // Search through each company's tenant database
      for (const company of companies) {
        try {
          const tenantDB = await getTenantDB(company._id.toString());
          const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);

          const contact = await Contact.findOne({
            email: lowerEmail,
            Contact_Type: 'Handyman',
            mobileAppEnabled: true
          }).lean();

          if (contact) {
            // Found the contact, return the companyId
            return company._id.toString();
          }
        } catch (error) {
          // Skip this company if there's an error (database doesn't exist, etc.)
          continue;
        }
      }

      return null;
    } catch (error) {
      console.error('❌ Error finding companyId by email:', error.message);
      throw error;
    }
  }

  /**
   * Login with email and password
   * If companyId is not provided, it will be automatically found from the contact's email
   */
  async login(email, password, companyId = null) {
    try {
      // If companyId is not provided, find it from email
      if (!companyId) {
        companyId = await this.findCompanyIdByEmail(email);
        if (!companyId) {
          throw new Error('Invalid credentials or mobile app not enabled');
        }
      }

      await this.initModels(companyId);

      const lowerEmail = email.toLowerCase().trim();
      const contact = await this.Contact.findOne({
        email: lowerEmail,
        Contact_Type: 'Handyman',
        mobileAppEnabled: true
      }).select('+mobilePassword');

      if (!contact) {
        throw new Error('Invalid credentials or mobile app not enabled');
      }

      if (!contact.mobilePassword) {
        throw new Error('Account not activated. Please contact administrator.');
      }

      // Check if password expired (30 days for temp password)
      if (contact.mobilePasswordExpiresAt && new Date() > contact.mobilePasswordExpiresAt) {
        throw new Error('Temporary password expired. Please request a new one.');
      }

      const isValid = await this.comparePassword(password, contact.mobilePassword);
      if (!isValid) {
        throw new Error('Invalid credentials');
      }

      // Check if first time login (password not changed)
      const isFirstLogin = !contact.mobilePasswordChanged;

      // Get actual companyId from contact if available (more reliable)
      const actualCompanyId = contact.companyId?.toString() || companyId;

      const accessToken = this.generateAccessToken(contact, actualCompanyId);
      const refreshToken = this.generateRefreshToken(contact, actualCompanyId);

      // Update contact
      contact.mobileRefreshToken = refreshToken;
      contact.mobileLastLogin = new Date();
      await contact.save();

      return {
        contact: {
          sfId: contact.SF_id,
          email: contact.email,
          name: contact.name || contact.displayName,
          firstName: contact.firstName,
          lastName: contact.lastName,
          companyId: actualCompanyId,
        },
        accessToken,
        refreshToken,
        requiresPasswordChange: isFirstLogin
      };
    } catch (error) {
      console.error('❌ Mobile login error:', error.message);
      throw error;
    }
  }

  /**
   * Change password (first time or reset)
   */
  async changePassword(sfId, oldPassword, newPassword, companyId) {
    try {
      await this.initModels(companyId);

      const contact = await this.Contact.findOne({ SF_id: sfId }).select('+mobilePassword');
      if (!contact) {
        throw new Error('Contact not found');
      }

      if (!contact.mobileAppEnabled) {
        throw new Error('Mobile app not enabled for this contact');
      }

      // If password was changed before, verify old password
      if (contact.mobilePasswordChanged) {
        if (!oldPassword) {
          throw new Error('Old password is required');
        }
        const isValid = await this.comparePassword(oldPassword, contact.mobilePassword);
        if (!isValid) {
          throw new Error('Invalid old password');
        }
      } else {
        // First time change from temporary password
        // If oldPassword is provided, verify it. If not, allow change (user already authenticated with temp password)
        if (oldPassword) {
          const isValid = await this.comparePassword(oldPassword, contact.mobilePassword);
          if (!isValid) {
            throw new Error('Invalid temporary password');
          }
        }
        // If oldPassword is null/undefined, skip verification (user is already authenticated with temp password via token)
      }

      // Validate new password
      if (!newPassword || newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }

      // Hash and save new password
      contact.mobilePassword = await this.hashPassword(newPassword);
      contact.mobilePasswordChanged = true;
      contact.mobilePasswordExpiresAt = null; // Remove expiration
      await contact.save();

      return { success: true, message: 'Password changed successfully' };
    } catch (error) {
      console.error('❌ Change password error:', error.message);
      throw error;
    }
  }

  /**
   * Reset password - generate new temp password
   */
  async resetPassword(sfId, companyId) {
    try {
      await this.initModels(companyId);

      const contact = await this.Contact.findOne({ SF_id: sfId });
      if (!contact) {
        throw new Error('Contact not found');
      }

      if (!contact.mobileAppEnabled) {
        throw new Error('Mobile app not enabled for this contact');
      }

      const tempPassword = this.generateTempPassword();
      const hashedPassword = await this.hashPassword(tempPassword);

      // Set password expiration (30 days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      contact.mobilePassword = hashedPassword;
      contact.mobilePasswordChanged = false; // Reset flag
      contact.mobilePasswordExpiresAt = expiresAt;
      await contact.save();

      return {
        success: true,
        tempPassword, // Return plain password to send via email
        expiresAt
      };
    } catch (error) {
      console.error('❌ Reset password error:', error.message);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken, companyId) {
    try {
      await this.initModels(companyId);

      const decoded = this.verifyToken(refreshToken);
      if (decoded.type !== 'mobile_refresh') {
        throw new Error('Invalid token type');
      }

      const contact = await this.Contact.findOne({ SF_id: decoded.sfId });
      if (!contact) {
        throw new Error('Contact not found');
      }

      if (!contact.mobileAppEnabled) {
        throw new Error('Mobile app not enabled');
      }

      if (contact.mobileRefreshToken !== refreshToken) {
        throw new Error('Invalid refresh token');
      }

      const actualCompanyId = contact.companyId?.toString() || companyId;
      const newAccessToken = this.generateAccessToken(contact, actualCompanyId);
      const newRefreshToken = this.generateRefreshToken(contact, actualCompanyId);

      contact.mobileRefreshToken = newRefreshToken;
      await contact.save();

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      };
    } catch (error) {
      console.error('❌ Refresh token error:', error.message);
      throw error;
    }
  }

  /**
   * Logout
   */
  async logout(sfId, companyId) {
    try {
      await this.initModels(companyId);

      await this.Contact.findOneAndUpdate(
        { SF_id: sfId },
        { $unset: { mobileRefreshToken: 1 } }
      );

      return { success: true };
    } catch (error) {
      console.error('❌ Logout error:', error.message);
      throw error;
    }
  }

  /**
   * Verify token and get contact
   */
  async verifyTokenAndGetContact(token, companyId) {
    try {
      await this.initModels(companyId);

      const decoded = this.verifyToken(token);
      if (decoded.type !== 'mobile_access') {
        throw new Error('Invalid token type');
      }

      const contact = await this.Contact.findOne({ SF_id: decoded.sfId });
      if (!contact) {
        throw new Error('Contact not found');
      }

      if (!contact.mobileAppEnabled) {
        throw new Error('Mobile app not enabled');
      }

      return {
        contact,
        sfId: contact.SF_id,
        email: contact.email,
        companyId: companyId
      };
    } catch (error) {
      console.error('❌ Verify token error:', error.message);
      throw error;
    }
  }
}

export default new MobileAuthService();

