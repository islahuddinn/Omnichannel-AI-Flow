// src/app/api/contacts/[contactId]/deals/route.js
/**
 * Get deals for a contact based on SF_id and Contact_Type
 * GET /api/contacts/[contactId]/deals
 */

import { NextResponse } from 'next/server';
import { verifyAuth } from '@/middleware/auth';
import { getTenantContext } from '@/middleware/tenant';
import { getTenantDB } from '@/config/database';
import ContactSchema from '@/models/schemas/Contact';
import DealSchema from '@/models/schemas/Deal';

export async function GET(request, { params }) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { contactId } = await params;

    if (!contactId) {
      return NextResponse.json(
        { success: false, error: 'Contact ID is required' },
        { status: 400 }
      );
    }

    const context = await getTenantContext(request);
    const tenantId = context.tenantId;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant context required' },
        { status: 400 }
      );
    }

    const tenantDB = await getTenantDB(tenantId);
    const Contact = tenantDB.models.Contact || tenantDB.model('Contact', ContactSchema);
    const Deal = tenantDB.models.Deal || tenantDB.model('Deal', DealSchema);

    // Get contact to retrieve SF_id and Contact_Type
    // ✅ Get ALL fields first to see what we have, then extract SF_id and Contact_Type
    const contact = await Contact.findById(contactId).lean();

    if (!contact) {
      return NextResponse.json(
        { success: false, error: 'Contact not found' },
        { status: 404 }
      );
    }

    // ✅ Get SF_id from top-level (it's a direct field in contacts table, NOT in details object)
    const sfId = contact.SF_id;
    // ✅ Get Contact_Type from top-level (it's a direct field in contacts table, NOT in details object)
    // Contact_Type can be "Handyman" or "Customer"
    const contactTypeRaw = contact.Contact_Type || '';
    const contactType = contactTypeRaw.toLowerCase().trim();

    console.log('\n' + '='.repeat(80));
    console.log('🔍 FETCHING DEALS FOR CONTACT');
    console.log('='.repeat(80));
    console.log('📋 Contact Info:');
    console.log('   Contact ID:', contactId);
    console.log('   All contact keys:', Object.keys(contact).join(', '));
    console.log('   SF_id (from contact table, top-level):', JSON.stringify(contact.SF_id));
    console.log('   SF_id (final, to match):', JSON.stringify(sfId));
    console.log('   SF_id type:', typeof sfId);
    console.log('   SF_id length:', sfId?.length);
    console.log('   Contact_Type (from contact table, top-level):', JSON.stringify(contact.Contact_Type));
    console.log('   Contact_Type (raw):', JSON.stringify(contactTypeRaw));
    console.log('   Contact_Type (final, lowercased):', contactType);
    console.log('='.repeat(80));

    if (!sfId) {
      // No SF_id, return empty deals array
      console.log('⚠️ No SF_id found for contact');
      console.log('   Available contact keys:', Object.keys(contact).join(', '));
      console.log('   Contact object sample:', JSON.stringify(Object.fromEntries(Object.entries(contact).slice(0, 10)), null, 2));
      console.log('='.repeat(80) + '\n');
      return NextResponse.json({
        success: true,
        data: [],
        count: 0,
        debug: { message: 'No SF_id found', contactId, contactKeys: Object.keys(contact) }
      });
    }

    // ✅ Build query based on Contact_Type
    // If Contact_Type = "Handyman" → match contact.SF_id with deals.details.Handyman
    // If Contact_Type = "Customer" → match contact.SF_id with deals.details.Customer
    let query = {};

    if (contactType === 'handyman') {
      // ✅ Match contact.SF_id with deals.details.Handyman
      query = {
        'details.Handyman': sfId
      };
      console.log('🔍 Query Type: Handyman');
      console.log('   Matching: contact.SF_id = deals.details.Handyman');
    } else if (contactType === 'customer') {
      // ✅ Match contact.SF_id with deals.details.Customer
      query = {
        'details.Customer': sfId
      };
      console.log('🔍 Query Type: Customer');
      console.log('   Matching: contact.SF_id = deals.details.Customer');
    } else {
      // If Contact_Type is unknown/empty, try both Handyman and Customer
      query = {
        $or: [
          { 'details.Handyman': sfId },
          { 'details.Customer': sfId }
        ]
      };
      console.log('🔍 Query Type: Unknown (trying both Handyman and Customer)');
      console.log('   Matching: contact.SF_id = deals.details.Handyman OR deals.details.Customer');
    }

    console.log('🔍 Query Details:');
    console.log('   Contact SF_id to match:', JSON.stringify(sfId));
    console.log('   Contact Type:', contactType);
    console.log('   Query fields:', query.$or?.map(q => Object.keys(q)[0]).join(', ') || 'N/A');
    console.log('   Full query:', JSON.stringify(query, null, 2));
    console.log('='.repeat(80));

    // Fetch deals matching the query
    const deals = await Deal.find(query)
      .sort({ createdAt: -1 })
      .limit(50) // Limit to 50 most recent deals
      .lean();

    console.log('✅ Query Results:');
    console.log('   Deals found:', deals.length);
    if (deals.length > 0) {
      console.log('   First deal ID:', deals[0]._id?.toString());
      console.log('   First deal name:', deals[0].name);
      console.log('   First deal Handyman value:', JSON.stringify(deals[0].details?.Handyman));
      console.log('   First deal Customer value:', JSON.stringify(deals[0].details?.Customer));
    }
    console.log('='.repeat(80));
    
    // ✅ Additional debug: Check if any deals exist with this SF_id in any field
    if (deals.length === 0) {
      console.log('⚠️ NO DEALS FOUND - Running diagnostic checks...');
      console.log('='.repeat(80));
      
      // Get a sample deal to see structure
      const sampleDeal = await Deal.findOne().lean();
      if (sampleDeal) {
        console.log('📊 Sample Deal Structure:');
        console.log('   Deal ID:', sampleDeal._id?.toString());
        console.log('   Deal name:', sampleDeal.name);
        console.log('   Has details:', !!sampleDeal.details);
        if (sampleDeal.details) {
          const handymanKeys = Object.keys(sampleDeal.details).filter(k => 
            k.toLowerCase().includes('handyman')
          );
          const customerKeys = Object.keys(sampleDeal.details).filter(k => 
            k.toLowerCase().includes('customer')
          );
          console.log('   Handyman-related keys:', handymanKeys.join(', '));
          console.log('   Customer-related keys:', customerKeys.join(', '));
          console.log('   Handyman value:', JSON.stringify(sampleDeal.details?.Handyman));
          console.log('   Handyman value length:', sampleDeal.details?.Handyman?.length);
          console.log('   Handyman value char-by-char:', sampleDeal.details?.Handyman ? 
            Array.from(sampleDeal.details.Handyman).map((c, i) => `${i}:${c}(${c.charCodeAt(0)})`).join(' ') : 'N/A');
          console.log('   Customer value:', JSON.stringify(sampleDeal.details?.Customer));
        }
      } else {
        console.log('   ⚠️ No deals exist in database at all!');
      }
      
      // Try exact match based on Contact_Type
      console.log('\n🔍 Testing Exact Match:');
      if (contactType === 'handyman') {
        const exactMatch = await Deal.findOne({ 'details.Handyman': sfId }).lean();
        console.log('   Exact match (details.Handyman = contact SF_id):', exactMatch ? 'FOUND ✅' : 'NOT FOUND ❌');
        if (exactMatch) {
          console.log('   Matched deal ID:', exactMatch._id?.toString());
          console.log('   Matched deal name:', exactMatch.name);
        }
      } else if (contactType === 'customer') {
        const exactMatch = await Deal.findOne({ 'details.Customer': sfId }).lean();
        console.log('   Exact match (details.Customer = contact SF_id):', exactMatch ? 'FOUND ✅' : 'NOT FOUND ❌');
        if (exactMatch) {
          console.log('   Matched deal ID:', exactMatch._id?.toString());
          console.log('   Matched deal name:', exactMatch.name);
        }
      } else {
        // Try both
        const handymanMatch = await Deal.findOne({ 'details.Handyman': sfId }).lean();
        const customerMatch = await Deal.findOne({ 'details.Customer': sfId }).lean();
        console.log('   Handyman match:', handymanMatch ? 'FOUND ✅' : 'NOT FOUND ❌');
        console.log('   Customer match:', customerMatch ? 'FOUND ✅' : 'NOT FOUND ❌');
      }
      
      // Try with trimmed values
      console.log('\n🔍 Testing with Trimmed Values:');
      const trimmedSfId = sfId?.trim();
      if (contactType === 'handyman') {
        const trimmedMatch = await Deal.findOne({ 'details.Handyman': trimmedSfId }).lean();
        console.log('   Trimmed Handyman match:', trimmedMatch ? 'FOUND ✅' : 'NOT FOUND ❌');
      } else if (contactType === 'customer') {
        const trimmedMatch = await Deal.findOne({ 'details.Customer': trimmedSfId }).lean();
        console.log('   Trimmed Customer match:', trimmedMatch ? 'FOUND ✅' : 'NOT FOUND ❌');
      }
      
      // Check total deals count
      const totalDeals = await Deal.countDocuments();
      console.log('\n📊 Database Statistics:');
      console.log('   Total deals in database:', totalDeals);
      
      // Get a few deals with Handyman field to see what values exist
      const dealsWithHandyman = await Deal.find({ 'details.Handyman': { $exists: true } })
        .limit(5)
        .lean();
      console.log('\n📋 Sample Handyman Values from Database:');
      dealsWithHandyman.forEach((deal, idx) => {
        const handymanVal = deal.details?.Handyman;
        console.log(`   Deal ${idx + 1}:`, JSON.stringify(handymanVal));
        console.log(`      Length: ${handymanVal?.length}`);
        console.log(`      Matches contact SF_id: ${handymanVal === sfId ? 'YES ✅' : 'NO ❌'}`);
        if (handymanVal && handymanVal !== sfId) {
          // Show character differences
          const maxLen = Math.max(handymanVal.length, sfId.length);
          const differences = [];
          for (let i = 0; i < maxLen; i++) {
            const dealChar = handymanVal[i];
            const contactChar = sfId[i];
            if (dealChar !== contactChar) {
              differences.push(`Pos ${i}: deal='${dealChar}'(${dealChar?.charCodeAt(0)}) vs contact='${contactChar}'(${contactChar?.charCodeAt(0)})`);
            }
          }
          if (differences.length > 0) {
            console.log(`      Differences: ${differences.join(', ')}`);
          }
        }
      });
      
      console.log('='.repeat(80) + '\n');
    }

    // Convert deals to plain objects - only return name, stage, and status
    const dealsWithDetails = deals.map(deal => {
      return {
        _id: deal._id?.toString() || deal._id,
        name: deal.name || null,
        stage: deal.stage || null,
        status: deal.status || null,
      };
    });

    return NextResponse.json({
      success: true,
      data: dealsWithDetails,
      count: dealsWithDetails.length,
      debug: {
        contactId,
        sfId,
        contactType,
        queryUsed: query,
        dealsFound: dealsWithDetails.length
      }
    });
  } catch (error) {
    console.error('❌ Error fetching contact deals:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch deals',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

