/**
 * Test script for auto-merge functionality
 * Tests merging conversations with same phone number across different channels
 */

import mongoose from 'mongoose';
import { getTenantDB } from './src/config/database.js';
import { findMergeableConversation } from './src/services/conversation/MergeService.js';
import ContactSchema from './src/models/schemas/Contact.js';
import ConversationSchema from './src/models/schemas/Conversation.js';

// Test configuration
const TEST_TENANT_ID = 'test_tenant_auto_merge';
const TEST_PHONE = '+923353514100';
const TEST_PHONE_VARIATIONS = [
  '+923353514100',
  '923353514100',
  '00923353514100',
  '923353514100' // digits only
];

async function testAutoMerge() {
  try {
    console.log('🧪 Starting auto-merge tests...\n');
    
    // Get tenant DB
    const tenantDB = await getTenantDB(TEST_TENANT_ID);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Conversation = tenantDB.models.Conversation || tenantDB.model('Conversation', ConversationSchema);
    
    // Clean up any existing test data
    await Conversation.deleteMany({ tenantId: TEST_TENANT_ID });
    await Contact.deleteMany({ tenantId: TEST_TENANT_ID });
    
    console.log('✅ Test data cleaned up\n');
    
    // Test 1: Create WhatsApp contact and conversation
    console.log('📱 Test 1: Creating WhatsApp contact and conversation...');
    const whatsappContact = await Contact.create({
      name: 'Test User',
      phone: '+923353514100',
      normalizedPhone: '+923353514100',
      identifiers: {
        whatsapp: '+923353514100',
        sms: '+923353514100'
      },
      tenantId: TEST_TENANT_ID,
      Contact_Type: 'Customer'
    });
    console.log(`✅ Created WhatsApp contact: ${whatsappContact._id}`);
    console.log(`   Phone: ${whatsappContact.phone}`);
    console.log(`   Normalized: ${whatsappContact.normalizedPhone}`);
    console.log(`   Identifiers: ${JSON.stringify(whatsappContact.identifiers)}\n`);
    
    const whatsappConversation = await Conversation.create({
      contact: whatsappContact._id,
      channel: 'whatsapp',
      channelAccount: new mongoose.Types.ObjectId(),
      department: new mongoose.Types.ObjectId(),
      status: 'active',
      mode: 'auto',
      tenantId: TEST_TENANT_ID
    });
    console.log(`✅ Created WhatsApp conversation: ${whatsappConversation._id}\n`);
    
    // Test 2: Create WebChat contact with same phone (different format)
    console.log('💬 Test 2: Creating WebChat contact with same phone number...');
    const webchatContact = await Contact.create({
      name: 'Test User',
      phone: '923353514100', // Without + prefix
      normalizedPhone: '+923353514100',
      identifiers: {
        webchat: 'test-session-123',
        whatsapp: '923353514100'
      },
      tenantId: TEST_TENANT_ID,
      Contact_Type: 'Customer'
    });
    console.log(`✅ Created WebChat contact: ${webchatContact._id}`);
    console.log(`   Phone: ${webchatContact.phone}`);
    console.log(`   Normalized: ${webchatContact.normalizedPhone}`);
    console.log(`   Identifiers: ${JSON.stringify(webchatContact.identifiers)}\n`);
    
    const webchatConversation = await Conversation.create({
      contact: webchatContact._id,
      channel: 'webchat',
      channelAccount: new mongoose.Types.ObjectId(),
      department: new mongoose.Types.ObjectId(),
      status: 'active',
      mode: 'auto',
      tenantId: TEST_TENANT_ID
    });
    console.log(`✅ Created WebChat conversation: ${webchatConversation._id}\n`);
    
    // Test 3: Try to find mergeable conversation
    console.log('🔍 Test 3: Testing findMergeableConversation...');
    console.log(`   Looking for conversations to merge with WebChat conversation...`);
    console.log(`   WebChat contact phone: ${webchatContact.phone}`);
    console.log(`   WebChat contact normalized: ${webchatContact.normalizedPhone}`);
    
    const mergeableConv = await findMergeableConversation(
      TEST_TENANT_ID,
      webchatConversation,
      webchatContact
    );
    
    if (mergeableConv) {
      console.log(`✅ Found mergeable conversation: ${mergeableConv._id}`);
      console.log(`   Channel: ${mergeableConv.channel}`);
      console.log(`   Contact: ${mergeableConv.contact}`);
      console.log(`   Status: ${mergeableConv.status}\n`);
    } else {
      console.log(`❌ No mergeable conversation found!\n`);
      
      // Debug: Check what contacts exist
      console.log('🔍 Debug: Checking existing contacts...');
      const allContacts = await Contact.find({ tenantId: TEST_TENANT_ID });
      for (const c of allContacts) {
        console.log(`   Contact ${c._id}:`);
        console.log(`     Phone: ${c.phone}`);
        console.log(`     Normalized: ${c.normalizedPhone}`);
        console.log(`     Identifiers: ${JSON.stringify(c.identifiers)}`);
      }
      
      // Debug: Check what conversations exist
      console.log('\n🔍 Debug: Checking existing conversations...');
      const allConversations = await Conversation.find({ tenantId: TEST_TENANT_ID });
      for (const conv of allConversations) {
        console.log(`   Conversation ${conv._id}:`);
        console.log(`     Channel: ${conv.channel}`);
        console.log(`     Contact: ${conv.contact}`);
        console.log(`     Status: ${conv.status}`);
      }
    }
    
    // Test 4: Test with different phone formats
    console.log('\n📞 Test 4: Testing phone number normalization...');
    const { normalizePhoneNumber } = await import('./src/utils/normalizers.js');
    
    for (const phone of TEST_PHONE_VARIATIONS) {
      const normalized = normalizePhoneNumber(phone);
      console.log(`   ${phone} → ${normalized}`);
    }
    
    console.log('\n✅ Tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
  } finally {
    // Don't close connection - let it stay open for inspection
    console.log('\n💡 Test data remains in database for inspection');
  }
}

// Run tests
testAutoMerge().catch(console.error);

