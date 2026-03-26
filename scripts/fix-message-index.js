// Script to fix the emailData.messageId index
// Run this with: node scripts/fix-message-index.js

import mongoose from 'mongoose';
import { getTenantDB } from '../src/config/database.js';

const TENANT_ID = '695be4a60ac39ebd88e1158b'; // Replace with your tenant ID if needed

async function fixIndex() {
  try {
    console.log('🔧 Fixing message index...');
    
    const tenantDB = await getTenantDB(TENANT_ID);
    const collection = tenantDB.collection('messages');
    
    // Get all indexes
    const indexes = await collection.indexes();
    console.log('📋 Current indexes:', indexes.map(idx => idx.name));
    
    // Drop the old index if it exists
    try {
      await collection.dropIndex('emailData.messageId_1_channelAccount_1');
      console.log('✅ Dropped old index');
    } catch (error) {
      if (error.code === 27 || error.message.includes('index not found')) {
        console.log('ℹ️  Old index does not exist, skipping drop');
      } else {
        throw error;
      }
    }
    
    // Create new partial index
    try {
      await collection.createIndex(
        { 'emailData.messageId': 1, channelAccount: 1 },
        {
          unique: true,
          partialFilterExpression: { 'emailData.messageId': { $ne: null } },
          name: 'emailData.messageId_1_channelAccount_1'
        }
      );
      console.log('✅ Created new partial index');
    } catch (error) {
      console.error('❌ Error creating index:', error.message);
      throw error;
    }
    
    // Verify the new index
    const newIndexes = await collection.indexes();
    const newIndex = newIndexes.find(idx => idx.name === 'emailData.messageId_1_channelAccount_1');
    if (newIndex) {
      console.log('✅ Index verified:', {
        name: newIndex.name,
        unique: newIndex.unique,
        partialFilterExpression: newIndex.partialFilterExpression
      });
    }
    
    console.log('✅ Index fix completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing index:', error);
    process.exit(1);
  }
}

fixIndex();
