/**
 * Fix Email Deduplication Index
 *
 * Drops the old unique index { emailData.messageId, channelAccount }
 * and lets Mongoose create the new one { emailData.messageId, channelAccount, contact }
 * on next server start.
 *
 * The old index incorrectly blocked different contacts from having the same
 * Message-ID, causing emails to be silently dropped.
 *
 * Usage: node scripts/fix-email-dedup-index.js
 */

import { getMasterDB, getTenantDB } from '../src/config/database.js';
import CompanySchema from '../src/models/schemas/Company.js';

async function fixEmailDedupIndex() {
  try {
    console.log('Starting email dedup index fix...\n');

    const masterDB = await getMasterDB();
    const Company = masterDB.models.Company || masterDB.model('Company', CompanySchema);
    const companies = await Company.find({ isActive: { $ne: false } }).select('_id tenantDatabaseName name').lean();

    console.log(`Found ${companies.length} active companies\n`);

    let fixed = 0;

    for (const company of companies) {
      const tenantId = company.tenantDatabaseName
        ? company.tenantDatabaseName.replace('tenant_', '')
        : company._id.toString();

      try {
        const tenantDB = await getTenantDB(tenantId);
        const messagesCollection = tenantDB.collection('messages');

        // List existing indexes
        const indexes = await messagesCollection.indexes();
        const oldIndex = indexes.find(idx =>
          idx.key?.['emailData.messageId'] === 1 &&
          idx.key?.channelAccount === 1 &&
          !idx.key?.contact && // Old index doesn't have contact
          idx.unique === true
        );

        if (oldIndex) {
          console.log(`[${company.name}] Dropping old index: ${oldIndex.name}`);
          await messagesCollection.dropIndex(oldIndex.name);
          fixed++;
          console.log(`[${company.name}] Old index dropped. New index will be created on next server start.\n`);
        } else {
          console.log(`[${company.name}] Old index not found (already fixed or never existed)`);
        }
      } catch (err) {
        console.error(`[${company.name}] Error: ${err.message}`);
      }
    }

    console.log(`\nDone. Fixed ${fixed} tenant database(s).`);
    console.log('Restart the server to create the new index with contact field.');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

fixEmailDedupIndex();
