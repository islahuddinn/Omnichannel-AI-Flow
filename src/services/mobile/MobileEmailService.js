// src/services/mobile/MobileEmailService.js
import nodemailer from 'nodemailer';

class MobileEmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });

      console.log('✅ Mobile Email Service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize email transporter:', error.message);
    }
  }

  /**
   * Send mobile app activation email with credentials
   */
  async sendActivationEmail(email, tempPassword, contactName, language = 'en') {
    try {
      if (!this.transporter) {
        throw new Error('Email service not configured');
      }

      const appDownloadLink = process.env.MOBILE_APP_DOWNLOAD_LINK || '#';
      const loginLink = process.env.MOBILE_APP_LOGIN_LINK || '#';

      const mailOptions = {
        from: `"Handyman Mobile App" <${process.env.SMTP_USER}>`,
        to: email,
        subject: this.getSubject(language),
        html: this.getActivationEmailTemplate(tempPassword, contactName, appDownloadLink, loginLink, language, email),
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Mobile activation email sent to ${email}:`, info.messageId);
      return info;
    } catch (error) {
      console.error('❌ Error sending activation email:', error.message);
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email, tempPassword, contactName, language = 'en') {
    try {
      if (!this.transporter) {
        throw new Error('Email service not configured');
      }

      const mailOptions = {
        from: `"Handyman Mobile App" <${process.env.SMTP_USER}>`,
        to: email,
        subject: this.getResetSubject(language),
        html: this.getPasswordResetTemplate(tempPassword, contactName, language, email),
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Password reset email sent to ${email}:`, info.messageId);
      return info;
    } catch (error) {
      console.error('❌ Error sending password reset email:', error.message);
      throw error;
    }
  }

  getSubject(language) {
    const subjects = {
      en: 'Welcome to Handyman Mobile App - Your Login Credentials',
      sk: 'Vitajte v mobilnej aplikácii Handyman - Vaše prihlasovacie údaje',
      cz: 'Vítejte v mobilní aplikaci Handyman - Vaše přihlašovací údaje',
      pl: 'Witamy w aplikacji mobilnej Handyman - Twoje dane logowania'
    };
    return subjects[language] || subjects.en;
  }

  getResetSubject(language) {
    const subjects = {
      en: 'Handyman Mobile App - Password Reset',
      sk: 'Mobilná aplikácia Handyman - Obnovenie hesla',
      cz: 'Mobilní aplikace Handyman - Obnovení hesla',
      pl: 'Aplikacja mobilna Handyman - Resetowanie hasła'
    };
    return subjects[language] || subjects.en;
  }

  getActivationEmailTemplate(tempPassword, contactName, appDownloadLink, loginLink, language, email) {
    const templates = {
      en: this.getEnglishTemplate(tempPassword, contactName, appDownloadLink, loginLink, email),
      sk: this.getSlovakTemplate(tempPassword, contactName, appDownloadLink, loginLink, email),
      cz: this.getCzechTemplate(tempPassword, contactName, appDownloadLink, loginLink, email),
      pl: this.getPolishTemplate(tempPassword, contactName, appDownloadLink, loginLink, email)
    };
    return templates[language] || templates.en;
  }

  getPasswordResetTemplate(tempPassword, contactName, language, email) {
    const templates = {
      en: this.getEnglishResetTemplate(tempPassword, contactName, email),
      sk: this.getSlovakResetTemplate(tempPassword, contactName, email),
      cz: this.getCzechResetTemplate(tempPassword, contactName, email),
      pl: this.getPolishResetTemplate(tempPassword, contactName, email)
    };
    return templates[language] || templates.en;
  }

  getEnglishTemplate(tempPassword, contactName, appDownloadLink, loginLink, email) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Handyman Mobile App</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px;">
          <tr>
            <td align="center">
              <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <tr>
                  <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Welcome to Handyman Mobile App</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">Hello ${contactName || 'Handyman'}!</h2>
                    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Your mobile app access has been activated. Use the credentials below to log in:
                    </p>
                    <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                      <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; font-weight: 600;">Your Email (Username):</p>
                      <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; font-weight: 600;">${email}</p>
                      <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; font-weight: 600;">Your Temporary Password:</p>
                      <p style="margin: 0; color: #6366f1; font-size: 24px; font-weight: 700; font-family: 'Courier New', monospace; letter-spacing: 2px;">${tempPassword}</p>
                    </div>
                    <div style="margin: 30px 0; padding: 20px; background-color: #fef3c7; border-left: 4px solid #fbbf24; border-radius: 6px;">
                      <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                        <strong>⚠️ Important:</strong> You must change this password on your first login. This temporary password will expire in 30 days.
                      </p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${appDownloadLink}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">Download Mobile App</a>
                    </div>
                    <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      Need help? Contact support at <a href="mailto:support@omniaiflow.com" style="color: #6366f1;">support@omniaiflow.com</a>
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

  getSlovakTemplate(tempPassword, contactName, appDownloadLink, loginLink, email) {
    return `
      <!DOCTYPE html>
      <html lang="sk">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vitajte v mobilnej aplikácii Handyman</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px;">
          <tr>
            <td align="center">
              <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <tr>
                  <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Vitajte v mobilnej aplikácii Handyman</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">Dobrý deň ${contactName || 'Handyman'}!</h2>
                    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Váš prístup k mobilnej aplikácii bol aktivovaný. Použite nižšie uvedené prihlasovacie údaje:
                    </p>
                    <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                      <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; font-weight: 600;">Váš e-mail (používateľské meno):</p>
                      <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; font-weight: 600;">${email}</p>
                      <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; font-weight: 600;">Vaše dočasné heslo:</p>
                      <p style="margin: 0; color: #6366f1; font-size: 24px; font-weight: 700; font-family: 'Courier New', monospace; letter-spacing: 2px;">${tempPassword}</p>
                    </div>
                    <div style="margin: 30px 0; padding: 20px; background-color: #fef3c7; border-left: 4px solid #fbbf24; border-radius: 6px;">
                      <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                        <strong>⚠️ Dôležité:</strong> Pri prvom prihlásení musíte zmeniť toto heslo. Toto dočasné heslo vyprší za 30 dní.
                      </p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${appDownloadLink}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">Stiahnuť mobilnú aplikáciu</a>
                    </div>
                    <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      Potrebujete pomoc? Kontaktujte podporu na <a href="mailto:support@omniaiflow.com" style="color: #6366f1;">support@omniaiflow.com</a>
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

  getCzechTemplate(tempPassword, contactName, appDownloadLink, loginLink, email) {
    return `
      <!DOCTYPE html>
      <html lang="cs">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vítejte v mobilní aplikaci Handyman</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px;">
          <tr>
            <td align="center">
              <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <tr>
                  <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Vítejte v mobilní aplikaci Handyman</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">Dobrý den ${contactName || 'Handyman'}!</h2>
                    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Váš přístup k mobilní aplikaci byl aktivován. Použijte níže uvedené přihlašovací údaje:
                    </p>
                    <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                      <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; font-weight: 600;">Váš e-mail (uživatelské jméno):</p>
                      <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; font-weight: 600;">${email}</p>
                      <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; font-weight: 600;">Vaše dočasné heslo:</p>
                      <p style="margin: 0; color: #6366f1; font-size: 24px; font-weight: 700; font-family: 'Courier New', monospace; letter-spacing: 2px;">${tempPassword}</p>
                    </div>
                    <div style="margin: 30px 0; padding: 20px; background-color: #fef3c7; border-left: 4px solid #fbbf24; border-radius: 6px;">
                      <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                        <strong>⚠️ Důležité:</strong> Při prvním přihlášení musíte změnit toto heslo. Toto dočasné heslo vyprší za 30 dní.
                      </p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${appDownloadLink}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">Stáhnout mobilní aplikaci</a>
                    </div>
                    <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      Potřebujete pomoc? Kontaktujte podporu na <a href="mailto:support@omniaiflow.com" style="color: #6366f1;">support@omniaiflow.com</a>
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

  getPolishTemplate(tempPassword, contactName, appDownloadLink, loginLink, email) {
    return `
      <!DOCTYPE html>
      <html lang="pl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Witamy w aplikacji mobilnej Handyman</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px;">
          <tr>
            <td align="center">
              <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <tr>
                  <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Witamy w aplikacji mobilnej Handyman</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px;">Witaj ${contactName || 'Handyman'}!</h2>
                    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Twój dostęp do aplikacji mobilnej został aktywowany. Użyj poniższych danych logowania:
                    </p>
                    <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                      <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; font-weight: 600;">Twój e-mail (nazwa użytkownika):</p>
                      <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; font-weight: 600;">${email}</p>
                      <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; font-weight: 600;">Twoje tymczasowe hasło:</p>
                      <p style="margin: 0; color: #6366f1; font-size: 24px; font-weight: 700; font-family: 'Courier New', monospace; letter-spacing: 2px;">${tempPassword}</p>
                    </div>
                    <div style="margin: 30px 0; padding: 20px; background-color: #fef3c7; border-left: 4px solid #fbbf24; border-radius: 6px;">
                      <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                        <strong>⚠️ Ważne:</strong> Przy pierwszym logowaniu musisz zmienić to hasło. To tymczasowe hasło wygaśnie za 30 dni.
                      </p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${appDownloadLink}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">Pobierz aplikację mobilną</a>
                    </div>
                    <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      Potrzebujesz pomocy? Skontaktuj się z pomocą techniczną pod adresem <a href="mailto:support@omniaiflow.com" style="color: #6366f1;">support@omniaiflow.com</a>
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

  getEnglishResetTemplate(tempPassword, contactName, email) {
    return this.getEnglishTemplate(tempPassword, contactName, '#', '#', email).replace(
      'Welcome to Handyman Mobile App',
      'Handyman Mobile App - Password Reset'
    );
  }

  getSlovakResetTemplate(tempPassword, contactName, email) {
    return this.getSlovakTemplate(tempPassword, contactName, '#', '#', email).replace(
      'Vitajte v mobilnej aplikácii Handyman',
      'Mobilná aplikácia Handyman - Obnovenie hesla'
    );
  }

  getCzechResetTemplate(tempPassword, contactName, email) {
    return this.getCzechTemplate(tempPassword, contactName, '#', '#', email).replace(
      'Vítejte v mobilní aplikaci Handyman',
      'Mobilní aplikace Handyman - Obnovení hesla'
    );
  }

  getPolishResetTemplate(tempPassword, contactName, email) {
    return this.getPolishTemplate(tempPassword, contactName, '#', '#', email).replace(
      'Witamy w aplikacji mobilnej Handyman',
      'Aplikacja mobilna Handyman - Resetowanie hasła'
    );
  }

  // Email will be passed directly in template calls
}

export default new MobileEmailService();

