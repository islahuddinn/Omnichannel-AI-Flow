// src/services/channel/eurosms/EuroSMSStatusService.js
/**
 * EuroSMS Status Checking Service
 * Periodically checks delivery status for pending SMS messages
 */

import { getTenantDB } from '@/config/database.js';
import MessageSchema from '@/models/schemas/Message.js';
import CompanyAccountSchema from '@/models/schemas/CompanyAccount.js';
import { SMSAdapter } from '../adapters/SMSAdapter.js';
import SocketEmitter from '@/services/socket/SocketEmitter.js';

export class EuroSMSStatusService {
  constructor() {
    this.checkInterval = 30000; // Check every 30 seconds
    this.maxRetries = 10; // Max 10 status checks (5 minutes)
    this.intervalId = null;
  }

  /**
   * Start status checking service
   */
  start() {
    if (this.intervalId) {
      console.log('⚠️ EuroSMS status service already running');
      return;
    }

    console.log('🚀 Starting EuroSMS Status Checking Service...');
    
    this.intervalId = setInterval(async () => {
      await this.checkPendingMessages();
    }, this.checkInterval);

    // Run immediately on start
    this.checkPendingMessages();
  }

  /**
   * Stop status checking service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 EuroSMS Status Checking Service stopped');
    }
  }

  /**
   * Check status for all pending EuroSMS messages
   */
  async checkPendingMessages() {
    try {
      // Get all tenants from master DB
      const { connectToMaster } = await import('@/lib/db/connection.js');
      const masterDB = await connectToMaster();
      
      // Get all companies with active tenants
      const Company = masterDB.models.Company || masterDB.model('Company', (await import('@/models/schemas/Company.js')).default);
      const companies = await Company.find({ isActive: true }).select('tenantId').lean();

      for (const company of companies) {
        if (!company.tenantId) continue;
        try {
          await this.checkTenantMessages(company.tenantId);
        } catch (error) {
          console.error(`❌ Error checking messages for tenant ${company.tenantId}:`, error.message);
        }
      }
    } catch (error) {
      console.error('❌ Error in checkPendingMessages:', error.message);
    }
  }

  /**
   * Check pending messages for a specific tenant
   */
  async checkTenantMessages(tenantId) {
    const tenantDB = await getTenantDB(tenantId);
    
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);

    // Find pending/sent SMS messages with EuroSMS UUID
    const pendingMessages = await Message.find({
      channel: 'sms',
      status: { $in: ['pending', 'sending', 'sent'] },
      $or: [
        { 'metadata.eurosmsUuid': { $exists: true } },
        { 'metadata.providerMessageId': { $exists: true } },
        { providerMessageId: { $exists: true } }
      ],
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Only check last 24 hours
    })
    .populate('channelAccount')
    .limit(50); // Limit to 50 messages per check

    if (pendingMessages.length === 0) {
      return;
    }

    console.log(`🔍 Checking ${pendingMessages.length} pending SMS messages for tenant ${tenantId}`);

    for (const message of pendingMessages) {
      try {
        // Skip if too many retries
        const retryCount = message.metadata?.statusCheckRetries || 0;
        if (retryCount >= this.maxRetries) {
          continue;
        }

        const channelAccount = message.channelAccount;
        if (!channelAccount || channelAccount.type !== 'sms') {
          continue;
        }
        // ✅ FIX: Check provider more flexibly - it may not be set in credentials
        // EuroSMS is the default provider when no provider is specified
        const provider = channelAccount.credentials?.provider;
        if (provider && provider !== 'eurosms') {
          continue; // Skip non-EuroSMS accounts
        }

        const uuid = message.metadata?.eurosmsUuid || message.metadata?.providerMessageId || message.providerMessageId;
        if (!uuid) {
          continue;
        }

        // Create adapter and check status
        const adapter = new SMSAdapter(channelAccount.credentials);
        const statusResult = await adapter.getMessageStatus(uuid);

        if (statusResult.status !== message.status) {
          await this.updateMessageStatus(tenantId, message, statusResult);
        }

        // Increment retry count
        await Message.findByIdAndUpdate(message._id, {
          $inc: { 'metadata.statusCheckRetries': 1 },
          'metadata.lastStatusCheck': new Date()
        });

      } catch (error) {
        console.error(`❌ Error checking status for message ${message._id}:`, error.message);
        // Increment retry count on error
        await Message.findByIdAndUpdate(message._id, {
          $inc: { 'metadata.statusCheckRetries': 1 },
          'metadata.lastStatusCheck': new Date(),
          'metadata.lastStatusCheckError': error.message
        });
      }
    }
  }

  /**
   * Update message status based on status check result
   */
  async updateMessageStatus(tenantId, message, statusResult) {
    const tenantDB = await getTenantDB(tenantId);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);

    const updateData = {
      status: statusResult.status,
      'metadata.lastStatusUpdate': new Date(),
      'metadata.statusDetails': statusResult
    };

    if (statusResult.status === 'delivered' && statusResult.deliveredAt) {
      updateData.deliveredAt = statusResult.deliveredAt;
    } else if (statusResult.status === 'sent') {
      updateData.sentAt = new Date();
    } else if (statusResult.status === 'failed') {
      updateData.failedAt = new Date();
      // ✅ FIX: Provide meaningful error message based on EuroSMS status codes
      const euroSmsErrorMessages = {
        'EXPIRED': 'Message expired - recipient phone may be off or out of coverage',
        'UNDELIV': 'Message undeliverable - phone number may be invalid or disconnected',
        'REJECTD': 'Message rejected by carrier',
        'UNKNOWN': 'Delivery status unknown - message may not have been delivered',
      };
      const dlrStatus = statusResult.rawStatus || statusResult.carrier;
      updateData.errorMessage = euroSmsErrorMessages[dlrStatus] || statusResult.errorCode || 'SMS delivery failed';
    }

    await Message.findByIdAndUpdate(message._id, updateData);

    console.log(`✅ Updated message ${message._id} status: ${message.status} -> ${statusResult.status}`);

    // Emit socket event for real-time status update - include error details for failed
    const emitData = {
      providerMessageId: statusResult.messageId,
      deliveredAt: statusResult.deliveredAt,
      errorCode: statusResult.errorCode,
    };
    // ✅ FIX: Include error message for frontend display
    if (statusResult.status === 'failed') {
      emitData.error = updateData.errorMessage || 'SMS delivery failed';
    }

    await SocketEmitter.emitMessageStatus(
      message.conversation,
      message._id,
      statusResult.status,
      tenantId,
      emitData,
      message.departmentId // ✅ CRITICAL: Pass departmentId for proper department-scoped socket routing
    );
  }

  /**
   * Check status for a specific message (manual check)
   */
  async checkMessageStatus(tenantId, messageId) {
    const tenantDB = await getTenantDB(tenantId);
    const Message = tenantDB.models.Message || tenantDB.model('Message', MessageSchema);
    const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);

    const message = await Message.findById(messageId).populate('channelAccount');
    if (!message || message.channel !== 'sms') {
      throw new Error('Message not found or not an SMS message');
    }

    const channelAccount = message.channelAccount;
    if (!channelAccount || channelAccount.credentials?.provider !== 'eurosms') {
      throw new Error('Invalid channel account for EuroSMS');
    }

    const uuid = message.metadata?.eurosmsUuid || message.metadata?.providerMessageId || message.providerMessageId;
    if (!uuid) {
      throw new Error('No UUID found for message');
    }

    const adapter = new SMSAdapter(channelAccount.credentials);
    const statusResult = await adapter.getMessageStatus(uuid);

    await this.updateMessageStatus(tenantId, message, statusResult);

    return statusResult;
  }
}

// Singleton instance
let statusServiceInstance = null;

export function getEuroSMSStatusService() {
  if (!statusServiceInstance) {
    statusServiceInstance = new EuroSMSStatusService();
  }
  return statusServiceInstance;
}

