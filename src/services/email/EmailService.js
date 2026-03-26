// src/services/email/EmailService.js
import nodemailer from 'nodemailer';

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    try {
      // Configure email transporter
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });

      console.log('✅ Email transporter initialized');
    } catch (error) {
      console.error('❌ Failed to initialize email transporter:', error.message);
    }
  }

  /**
   * Send OTP email
   */
  async sendOTPEmail(email, otp, userName = 'User') {
    try {
      if (!this.transporter) {
        throw new Error('Email service not configured');
      }

      const mailOptions = {
        from: `"Omni Ai Flow" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Password Reset - Verification Code',
        html: this.getOTPEmailTemplate(otp, userName),
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ OTP email sent to ${email}:`, info.messageId);
      return info;
    } catch (error) {
      console.error('❌ Error sending OTP email:', error.message);
      throw error;
    }
  }

  /**
   * Email template for OTP
   */
  getOTPEmailTemplate(otp, userName) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px;">
          <tr>
            <td align="center">
              <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <tr>
                  <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Password Reset</h1>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">Hello ${userName}!</h2>
                    
                    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      You requested to reset your password for your Omni Ai Flow account. Use the verification code below to proceed:
                    </p>
                    
                    <!-- OTP Box -->
                    <div style="background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border: 2px dashed #6366f1; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0;">
                      <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Your Verification Code</p>
                      <h1 style="margin: 0; color: #6366f1; font-size: 48px; font-weight: 700; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</h1>
                    </div>
                    
                    <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      This code will expire in <strong style="color: #6366f1;">1 hour</strong>. If you didn't request this password reset, please ignore this email.
                    </p>
                    
                    <div style="margin: 30px 0; padding: 20px; background-color: #fef3c7; border-left: 4px solid #fbbf24; border-radius: 6px;">
                      <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                        <strong>⛔ Security Notice:</strong> Never share this code with anyone. Our team will never ask for your verification code.
                      </p>
                    </div>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 12px 12px; text-align: center;">
                    <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">
                      Need help? Contact our support team at 
                      <a href="mailto:support@omniaiflow.com" style="color: #6366f1; text-decoration: none;">support@omniaiflow.com</a>
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                      © ${new Date().getFullYear()} Omni Ai Flow. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  /**
   * Send password reset success email
   */
  async sendPasswordResetSuccessEmail(email, userName) {
    try {
      if (!this.transporter) {
        throw new Error('Email service not configured');
      }

      const mailOptions = {
        from: `"Omni Ai Flow" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Password Successfully Reset',
        html: this.getPasswordResetSuccessTemplate(userName),
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Password reset success email sent to ${email}`);
      return info;
    } catch (error) {
      console.error('❌ Error sending success email:', error.message);
      throw error;
    }
  }

  getPasswordResetSuccessTemplate(userName) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Password Reset Successful</title>
      </head>
      <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
        <table style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
              <h1 style="color: #ffffff; margin: 0;">Password Reset Successful!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <h2 style="color: #1f2937;">Hello ${userName}!</h2>
              <p style="color: #4b5563; line-height: 1.6;">Your password has been successfully reset.</p>
              <div style="margin: 20px 0; padding: 15px; background-color: #d1fae5; border-radius: 6px;">
                <p style="margin: 0; color: #065f46; font-size: 14px;">
                  ✅ Your password was reset on ${new Date().toLocaleString()}
                </p>
              </div>
              <p style="color: #4b5563;">
                If you didn't make this change, please contact our support team immediately.
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }
}

export default new EmailService();

