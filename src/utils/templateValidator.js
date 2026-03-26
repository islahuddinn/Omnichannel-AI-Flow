// src/utils/templateValidator.js
import ChannelServiceFactory from '@/services/channel/ChannelServiceFactory.js';

export class TemplateValidator {
  /**
   * Validate if WhatsApp template exists and is ready to use
   */
  static async validateWhatsAppTemplate(template, account) {
    const issues = [];

    // Check template name
    if (!template.name) {
      issues.push('Template name is required');
    }

    // Check language
    if (!template.templateLanguage) {
      issues.push('Template language is required for WhatsApp templates');
    }

    // Check if template exists in WhatsApp Business
    if (template.name && account) {
      try {
        const templateExists = await ChannelServiceFactory.validateWhatsAppTemplate(
          account.credentials,
          template.name
        );
        
        if (!templateExists) {
          issues.push(`Template "${template.name}" does not exist in your WhatsApp Business account. Please create it in Meta Business Manager.`);
        }
      } catch (error) {
        issues.push(`Unable to validate template: ${error.message}`);
      }
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * Get available templates for an account
   */
  static async getAvailableTemplates(account) {
    try {
      return await ChannelServiceFactory.getAvailableWhatsAppTemplates(account.credentials);
    } catch (error) {
      console.error('Failed to get available templates:', error.message);
      return [];
    }
  }

  /**
   * Validate template before sending message
   */
  static async validateBeforeSend(templateId, accountId, tenantId) {
    try {
      const tenantDB = await getTenantDB(tenantId);
      const Template = tenantDB.model('Template', TemplateSchema);
      const CompanyAccount = tenantDB.model('CompanyAccount', CompanyAccountSchema);

      const template = await Template.findById(templateId);
      if (!template) {
        return { isValid: false, error: 'Template not found' };
      }

      const account = await CompanyAccount.findById(accountId);
      if (!account) {
        return { isValid: false, error: 'Account not found' };
      }

      return await this.validateWhatsAppTemplate(template, account);
    } catch (error) {
      return { isValid: false, error: error.message };
    }
  }
}