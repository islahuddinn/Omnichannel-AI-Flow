// src/workers/imapEmailWorker.js
/**
 * IMAP Email IDLE Worker (Real-time)
 * Uses IMAP IDLE for real-time email fetching (no polling)
 * Listens for new emails and processes them immediately when they arrive
 */

import * as IMAPIdleManagerModule from '../services/channel/imap/IMAPIdleManager.js';
import { IMAPEmailService } from '../services/email/IMAPEmailService.js';
import { getMasterDB, getTenantDB } from '../config/database.js';
import CompanySchema from '../models/schemas/Company.js';
import CompanyAccountSchema from '../models/schemas/CompanyAccount.js';

let idleManager = null;

/**
 * Start IDLE for all active email accounts
 */
async function startIdleForAllAccounts() {
  try {
    console.log('📧 Starting IMAP IDLE for all email accounts...');

    // ✅ Get all active companies (tenants)
    const masterDB = await getMasterDB();
    const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
    
    const companies = await Company.find({ status: 'active' })
      .select('_id tenantDatabaseName')
      .lean();

    console.log(`📧 Found ${companies.length} active tenant(s) to setup IDLE for`);

    let totalAccounts = 0;

    for (const company of companies) {
      try {
        const tenantId = company._id.toString();
        
        // Get all email accounts for this tenant
        const tenantDB = await getTenantDB(tenantId);
        const CompanyAccount = tenantDB.models.CompanyAccount || tenantDB.model('CompanyAccount', CompanyAccountSchema);

        // ✅ Get all active email accounts (with either IMAP or SMTP credentials)
        const emailAccounts = await CompanyAccount.find({
          type: 'email',
          isActive: true,
          $or: [
            { 'credentials.imapHost': { $exists: true, $ne: null } },
            { 'credentials.smtpHost': { $exists: true, $ne: null } }
          ]
        });

        console.log(`📧 Found ${emailAccounts.length} email account(s) for tenant ${tenantId}`);

        for (const account of emailAccounts) {
          try {
            // Decrypt credentials
            let credentials;
            if (account.getDecryptedCredentials) {
              credentials = account.getDecryptedCredentials();
            } else if (account.credentials && account.credentials.encrypted) {
              try {
                const crypto = require('crypto');
                const algorithm = account.credentials.algorithm || 'aes-256-gcm';
                const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-32-char-encryption-key!!', 'utf8');
                const iv = Buffer.from(process.env.ENCRYPTION_IV || 'default-16chars!', 'utf8').slice(0, 16);
                
                const decipher = crypto.createDecipheriv(algorithm, key, iv);
                decipher.setAuthTag(Buffer.from(account.credentials.authTag, 'hex'));
                
                let decrypted = decipher.update(account.credentials.encrypted, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                credentials = JSON.parse(decrypted);
              } catch (decryptError) {
                console.error('❌ Failed to decrypt credentials:', decryptError.message);
                credentials = account.credentials;
              }
            } else {
              credentials = account.credentials;
            }

            // Verify credentials are available
            const imapHost = credentials.imapHost || credentials.smtpHost;
            const imapUser = credentials.imapUser || credentials.smtpUser;
            const imapPass = credentials.imapPass || credentials.smtpPass;

            if (!imapHost || !imapUser || !imapPass) {
              console.warn(`⚠️ Skipping account ${account.name} - missing IMAP credentials`);
              continue;
            }

            // Start IDLE for this account
            await idleManager.startIdleForAccount(tenantId, account._id.toString(), credentials);
            totalAccounts++;
          } catch (error) {
            console.error(`❌ Error starting IDLE for account ${account.name}:`, error.message);
          }
        }
      } catch (error) {
        console.error(`❌ Error processing tenant ${company._id}:`, error.message);
      }
    }

    console.log(`✅ IMAP IDLE started for ${totalAccounts} email account(s)`);
    
    // ✅ Also do initial fetch for all accounts (fetch today's emails once)
    console.log('📧 Performing initial fetch for all accounts...');
    for (const company of companies) {
      try {
        const tenantId = company._id.toString();
        await IMAPEmailService.fetchEmailsForTenant(tenantId);
      } catch (error) {
        console.error(`❌ Error in initial fetch for tenant ${company._id}:`, error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Error starting IDLE for all accounts:', error.message);
    console.error('Stack:', error.stack);
  }
}

// ✅ Singleton guard - prevent multiple initializations
let isIMAPWorkerInitialized = false;

/**
 * Start IMAP email IDLE worker (real-time)
 */
export async function startIMAPEmailWorker() {
  // ✅ CRITICAL: Prevent multiple initializations
  if (isIMAPWorkerInitialized && idleManager) {
    console.log('✅ IMAP Email IDLE Worker already initialized, reusing existing instance');
    return {
      stop: () => {
        if (idleManager) {
          idleManager.stopAll();
          idleManager = null;
          isIMAPWorkerInitialized = false;
          console.log('🛑 IMAP Email IDLE Worker stopped');
        }
      },
      refresh: async () => {
        if (idleManager) {
          idleManager.stopAll();
          await startIdleForAllAccounts();
        }
      }
    };
  }

  try {
    console.log('📧 Starting IMAP Email IDLE Worker (Real-time)...');
    
    // ✅ Initialize IDLE Manager
    const { getIMAPIdleManager } = IMAPIdleManagerModule;
    
    if (!getIMAPIdleManager || typeof getIMAPIdleManager !== 'function') {
      console.error('❌ getIMAPIdleManager not found in module. Available exports:', Object.keys(IMAPIdleManagerModule));
      throw new Error('getIMAPIdleManager function not found');
    }
    
    idleManager = getIMAPIdleManager();

    // ✅ Start IDLE for all email accounts
    await startIdleForAllAccounts();

    console.log('✅ IMAP Email IDLE Worker started - listening for emails in real-time');
    isIMAPWorkerInitialized = true;
    return {
      stop: () => {
        if (idleManager) {
          idleManager.stopAll();
          idleManager = null;
          isIMAPWorkerInitialized = false;
          console.log('🛑 IMAP Email IDLE Worker stopped');
        }
      },
      refresh: async () => {
        // Manually refresh all accounts (reconnect IDLE)
        if (idleManager) {
          idleManager.stopAll();
          await startIdleForAllAccounts();
        }
      }
    };
  } catch (error) {
    console.error('❌ Failed to start IMAP Email IDLE Worker:', error);
    isIMAPWorkerInitialized = false;
    throw error;
  }
}

/**
 * Stop IMAP email IDLE worker
 */
export async function stopIMAPEmailWorker() {
  if (idleManager) {
    idleManager.stopAll();
    idleManager = null;
    isIMAPWorkerInitialized = false;
    console.log('🛑 IMAP Email IDLE Worker stopped');
  }
}

