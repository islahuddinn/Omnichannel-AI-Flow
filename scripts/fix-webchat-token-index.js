// scripts/fix-webchat-token-index.js
/**
 * Fix WebChatSession token index
 * Drops the old non-sparse token index and recreates it as sparse
 * Run this once: node scripts/fix-webchat-token-index.js
 */

import mongoose from 'mongoose';
import { getMasterDB, getTenantDB } from '../src/config/database.js';

async function fixTokenIndex() {
  try {
    console.log('🔧 Fixing WebChatSession token index...');

    // Get all companies
    const masterDB = await getMasterDB();
    const Company = masterDB.models.Company || masterDB.model('Company', (await import('../src/models/schemas/Company.js')).default);
    const companies = await Company.find({ status: 'active' }).lean();

    console.log(`Found ${companies.length} active companies`);

    for (const company of companies) {
      const tenantId = company._id.toString();
      console.log(`\n📦 Processing tenant: ${tenantId}`);

      try {
        const tenantDB = await getTenantDB(tenantId);
        const WebChatSession = tenantDB.models.WebChatSession || 
          tenantDB.model('WebChatSession', (await import('../src/models/schemas/WebChatSession.js')).default);

        // Drop existing token index if it exists
        try {
          await WebChatSession.collection.dropIndex('token_1');
          console.log(`  ✅ Dropped old token_1 index`);
        } catch (err) {
          if (err.code === 27 || err.codeName === 'IndexNotFound') {
            console.log(`  ℹ️  token_1 index not found (may not exist)`);
          } else {
            console.log(`  ⚠️  Error dropping index: ${err.message}`);
          }
        }

        // Recreate as sparse index
        await WebChatSession.collection.createIndex({ token: 1 }, { sparse: true, background: true });
        console.log(`  ✅ Created sparse token index`);

        // Ensure all other indexes are created (suppress duplicate index warnings)
        try {
          await WebChatSession.ensureIndexes();
          console.log(`  ✅ Ensured all indexes`);
        } catch (err) {
          // Ignore duplicate index warnings - they're harmless
          if (!err.message.includes('Duplicate schema index')) {
            console.log(`  ⚠️  Index warning: ${err.message}`);
          }
        }

      } catch (error) {
        console.error(`  ❌ Error processing tenant ${tenantId}:`, error.message);
        continue;
      }
    }

    console.log('\n✅ Token index fix completed!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error fixing token index:', error);
    process.exit(1);
  }
}

fixTokenIndex();

